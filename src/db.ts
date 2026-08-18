import {
  LINKED_BOTH,
  LINKED_CN,
  LINKED_FROM,
  LINKED_TO,
} from "./constants";
import { TFile, Notice } from "obsidian";
import type { App, Vault } from "obsidian";
import type { LinkDirection } from "./types";
import type {
  DB,
  FileItem,
  LinkCacheEntry,
  LinkTraversalMode,
  MOCDiagnostics,
  Path,
  PathSearchResult,
} from "./types";
import { getFileNameFromPath, devLog } from "./utils";
import type MOCPlugin from "./main";
import type { SettingsManager } from "./settings";
import { buildShortestPathGraph, enumerateShortestPaths } from "./core/logic";

const nextFrame = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

export class DBManager {
  db: DB = {};
  settings: SettingsManager;
  dbEntries: [string, FileItem][] = [];
  dbKeys: string[] = [];
  app: App;
  plugin: MOCPlugin;
  vault: Vault;
  descendants: Map<string, Set<string>> = new Map();
  shortestPathParents: Map<string, Set<string>> = new Map();
  centralNotePath: string | undefined;
  fileHasDuplicatedName: Map<string, boolean> = new Map();
  diagnostics: MOCDiagnostics = {
    totalIncludedFiles: 0,
    reachableFiles: 0,
    unreachableFiles: 0,
    orphanFiles: 0,
    brokenLinks: 0,
    linkCount: 0,
    cachedNotes: 0,
    lastUpdateMs: 0,
    lastPathCount: 0,
    lastPathSearchTruncated: false,
    mapScope: "full",
    traversalMode: "both",
  };
  isDatabaseComplete = false;
  isDatabaseUpdating = false;
  lastPathSearchTruncated = false;
  lastPathCount = 0;
  lastUpdateMs = 0;

  private updatePromise: Promise<void> | null = null;
  private updateQueued = false;
  private queuedSilent = true;
  private linkCache = new Map<string, LinkCacheEntry>();
  private brokenLinksByNote = new Map<string, number>();

  invalidateLinkCache(path?: string): void {
    if (path) this.linkCache.delete(path);
    else this.linkCache.clear();
  }

  constructor(plugin: MOCPlugin) {
    this.app = plugin.app;
    this.plugin = plugin;
    this.settings = plugin.mocSettings;
    this.vault = this.app.vault;
    this.dbEntries = Object.entries(this.db);
  }

  async update(silent = false): Promise<void> {
    if (this.updatePromise) {
      this.updateQueued = true;
      this.queuedSilent = this.queuedSilent && silent;
      return this.updatePromise;
    }

    this.queuedSilent = silent;
    this.updatePromise = (async () => {
      do {
        this.updateQueued = false;
        const runSilent = this.queuedSilent;
        this.queuedSilent = true;
        await this.performUpdate(runSilent);
      } while (this.updateQueued);
    })().finally(() => {
      this.updatePromise = null;
      this.queuedSilent = true;
    });

    return this.updatePromise;
  }

  private async performUpdate(silent: boolean): Promise<void> {
    this.isDatabaseComplete = false;
    this.isDatabaseUpdating = true;
    const centralNotePath = this.settings.getCentralNotePath();

    try {
      if (!centralNotePath || !this.settings.isValidCentralNotePath(centralNotePath)) {
        this.resetGraphState();
        if (!silent) {
          new Notice("Choose a valid Markdown note as the Central Node.");
        }
        return;
      }

      const startTime = Date.now();
      if (!silent) new Notice("Updating the Map of Content...");
      devLog(`Updating the Map of Content from ${centralNotePath}...`);

      await this.updateDB();
      await nextFrame();

      this.centralNotePath = centralNotePath;
      this.shortestPathParents = new Map();
      this.descendants = new Map();
      this.updateDepthInformation(centralNotePath);
      await nextFrame();
      this.updateDiagnostics();

      this.isDatabaseComplete = true;
      this.lastUpdateMs = Date.now() - startTime;
      this.updateDiagnostics();
      if (!silent) new Notice("Map of Content updated");
      devLog(`Update complete, took ${this.lastUpdateMs / 1000} seconds`);
    } catch (error) {
      console.error("[Map of Content] Failed to update Map of Content", error);
      if (!silent) {
        new Notice("Map of Content update failed. Check the developer console for details.");
      }
    } finally {
      this.isDatabaseUpdating = false;
      this.plugin.rerender();
    }
  }

  private resetGraphState(): void {
    this.descendants = new Map();
    this.shortestPathParents = new Map();
    this.centralNotePath = undefined;
    this.diagnostics = {
      totalIncludedFiles: this.dbKeys.length,
      reachableFiles: 0,
      unreachableFiles: this.dbKeys.length,
      orphanFiles: 0,
      brokenLinks: 0,
      linkCount: 0,
      cachedNotes: this.linkCache.size,
      lastUpdateMs: this.lastUpdateMs,
      lastPathCount: this.lastPathCount,
      lastPathSearchTruncated: this.lastPathSearchTruncated,
      centralNotePath: undefined,
      mapScope: this.settings.getEffectiveMapScope(),
      localDepth: this.settings.getEffectiveMapScope() === "local" ? this.settings.getEffectiveLocalDepth() : undefined,
      traversalMode: this.settings.get("link_traversal_mode"),
    };
    this.isDatabaseComplete = false;
  }

  getNoteFromPath(path: string): FileItem | undefined {
    return this.db[path];
  }

  findPaths(path: string): Path[] {
    return this.findPathsDetailed(path).paths;
  }

  findPathsDetailed(path: string): PathSearchResult {
    this.lastPathSearchTruncated = false;
    if (!this.centralNotePath || !this.db[path]) return { paths: [], truncated: false };

    const result = enumerateShortestPaths(
      this.centralNotePath,
      path,
      this.shortestPathParents,
      this.settings.get("max_shortest_paths"),
    );
    this.lastPathSearchTruncated = result.truncated;
    this.lastPathCount = result.paths.length;

    const paths = result.paths.map((members) => ({
      allMembers: members,
      items: members.map((member, index) => {
        if (index === 0) return [member, LINKED_CN] as [string, LinkDirection];
        return [member, this.getLinkDirection(members[index - 1], member)] as [string, LinkDirection];
      }),
    }));
    return { paths, truncated: result.truncated };
  }

  getLinkDirection(fromPath: string, toPath: string): LinkDirection {
    const from = this.db[fromPath];
    const to = this.db[toPath];
    if (!from || !to) return LINKED_TO;

    const linkedTo = from.linksTo.has(toPath);
    const linkedFrom = to.linksTo.has(fromPath);
    if (linkedTo && linkedFrom) return LINKED_BOTH;
    if (linkedTo) return LINKED_TO;
    return LINKED_FROM;
  }

  allNotes(): FileItem[] {
    return this.dbEntries.map(([, value]) => value);
  }

  async updateDB(): Promise<void> {
    devLog("Updating the library...");
    const nextDb: DB = {};
    const vaultFiles = this.app.vault.getFiles();
    const currentPaths = new Set(vaultFiles.map((file) => file.path));
    const currentCentral = this.settings.getCentralNotePath();
    this.linkCache = new Map(
      [...this.linkCache.entries()].filter(([path]) => currentPaths.has(path))
    );

    let entriesCreatedCount = 0;
    for (const file of vaultFiles) {
      if (this.settings.isExcludedFile(file) || (this.settings.get("enable_tag_filter") && file.path !== currentCentral && !this.matchesTagFilter(file))) continue;
      entriesCreatedCount++;
      nextDb[file.path] = {
        path: file.path,
        extension: file.extension,
        linksTo: new Set<string>(),
        linkedFrom: new Set<string>(),
        distanceFromCn: null,
      };
      if (entriesCreatedCount % 250 === 0) await nextFrame();
    }

    this.db = nextDb;
    this.dbEntries = Object.entries(this.db);
    this.dbKeys = Object.keys(this.db);
    this.fileHasDuplicatedName = new Map<string, boolean>();

    const nameCounts = new Map<string, number>();
    for (const note of this.allNotes()) {
      const fileName = getFileNameFromPath(note.path);
      nameCounts.set(fileName, (nameCounts.get(fileName) ?? 0) + 1);
    }
    for (const [fileName, count] of nameCounts) {
      this.fileHasDuplicatedName.set(fileName, count > 1);
    }

    this.brokenLinksByNote = new Map();
    const markdownNotes = this.allNotes().filter((note) => note.extension === "md");

    for (let i = 0; i < markdownNotes.length; i++) {
      const note = markdownNotes[i];
      const file = this.app.vault.getAbstractFileByPath(note.path);
      if (!(file instanceof TFile)) continue;

      const cached = this.linkCache.get(note.path);
      const metadataReady = Boolean(this.app.metadataCache.getCache(note.path));
      const cacheMatches =
        metadataReady && cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size;

      let validatedLinks: Set<string>;
      let brokenCount = 0;
      if (cacheMatches) {
        validatedLinks = new Set(cached.links.filter((path) => Boolean(this.db[path])));
        brokenCount = cached.brokenCount;
      } else {
        const result = this.getValidatedLinksFromNoteDetailed(note.path, note.path);
        validatedLinks = result.links;
        brokenCount = result.brokenCount;
        if (metadataReady) {
          this.linkCache.set(note.path, {
            mtime: file.stat.mtime,
            size: file.stat.size,
            links: [...validatedLinks],
            brokenCount,
          });
        } else {
          this.linkCache.delete(note.path);
        }
      }

      this.db[note.path].linksTo = validatedLinks;
      this.brokenLinksByNote.set(note.path, brokenCount);
      for (const link of validatedLinks) {
        this.db[link]?.linkedFrom.add(note.path);
      }

      if (i % 100 === 0) await nextFrame();
    }

    this.settings.pruneExpansionState(new Set(this.dbKeys));
    devLog(`Created ${entriesCreatedCount} db entries`);
  }

  updateDepthInformation(centralNotePath: string): void {
    for (const note of this.allNotes()) note.distanceFromCn = null;

    const centralNote = this.getNoteFromPath(centralNotePath);
    if (!centralNote) return;

    const mode = this.settings.get("link_traversal_mode");
    const localDepth = this.settings.getEffectiveMapScope() === "local" ? this.settings.getEffectiveLocalDepth() : Number.POSITIVE_INFINITY;
    const graph = buildShortestPathGraph(
      centralNotePath,
      (path) => {
        const note = this.getNoteFromPath(path);
        return note ? this.getTraversalNeighbours(note, mode) : [];
      },
      localDepth,
    );

    this.shortestPathParents = graph.parents;
    this.descendants = graph.children;
    for (const [path, distance] of graph.distances) {
      const note = this.getNoteFromPath(path);
      if (note) note.distanceFromCn = distance + 1;
    }
  }

  private getTraversalNeighbours(note: FileItem, mode: LinkTraversalMode): Set<string> {
    if (mode === "outgoing") return new Set(note.linksTo);
    if (mode === "incoming") return new Set(note.linkedFrom);
    return new Set([...note.linksTo, ...note.linkedFrom]);
  }

  matchesTagFilter(file: TFile): boolean {
    if (!this.settings.get("enable_tag_filter")) return true;
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = new Set<string>();
    for (const tag of cache?.tags ?? []) tags.add(tag.tag.replace(/^#/, "").toLowerCase());
    const frontmatterTags: unknown = cache?.frontmatter?.tags;
    if (Array.isArray(frontmatterTags)) {
      for (const tag of frontmatterTags) {
        if (typeof tag === "string") tags.add(tag.replace(/^#/, "").toLowerCase());
      }
    } else if (typeof frontmatterTags === "string") {
      for (const tag of frontmatterTags.split(",")) {
        tags.add(tag.trim().replace(/^#/, "").toLowerCase());
      }
    }
    const included = this.settings.get("included_tags").map((tag) => tag.toLowerCase());
    const excluded = this.settings.get("excluded_tags").map((tag) => tag.toLowerCase());
    if (excluded.some((tag) => tags.has(tag))) return false;
    return included.length === 0 || included.some((tag) => tags.has(tag));
  }

  getSortedDescendants(path: string): string[] {
    const children = [...(this.descendants.get(path) ?? [])];
    const mode = this.settings.get("sort_mode");
    const smart = this.settings.get("enable_smart_sort");
    children.sort((a, b) => {
      const left = this.db[a];
      const right = this.db[b];
      if (mode === "links" || smart) {
        const degreeA = (left?.linksTo.size ?? 0) + (left?.linkedFrom.size ?? 0);
        const degreeB = (right?.linksTo.size ?? 0) + (right?.linkedFrom.size ?? 0);
        if (degreeA !== degreeB) return degreeB - degreeA;
      }
      if (mode === "modified") {
        const fileA = this.app.vault.getAbstractFileByPath(a);
        const fileB = this.app.vault.getAbstractFileByPath(b);
        if (fileA instanceof TFile && fileB instanceof TFile && fileA.stat.mtime !== fileB.stat.mtime) return fileB.stat.mtime - fileA.stat.mtime;
      }
      if (mode === "path") return a.localeCompare(b);
      return getFileNameFromPath(a).localeCompare(getFileNameFromPath(b), undefined, { sensitivity: "base" });
    });
    return children;
  }

  getValidatedLinkPath(link: string, notePath: string): string | undefined {
    const linkWithoutAnchor = link.split("#")[0].split("^")[0];
    if (!linkWithoutAnchor) return undefined;
    const linkDestination = this.app.metadataCache.getFirstLinkpathDest(
      linkWithoutAnchor,
      notePath
    );
    if (!linkDestination || !this.db[linkDestination.path]) return undefined;
    return linkDestination.path;
  }

  getValidatedLinksFromNote(notePath: string, sourcePath: string): Set<string> {
    return this.getValidatedLinksFromNoteDetailed(notePath, sourcePath).links;
  }

  getValidatedLinksFromNoteDetailed(
    notePath: string,
    sourcePath: string
  ): { links: Set<string>; brokenCount: number } {
    const cachedMetadata = this.app.metadataCache.getCache(notePath);
    if (!cachedMetadata) return { links: new Set<string>(), brokenCount: 0 };

    const linkCaches = [
      ...(cachedMetadata.links ?? []),
      ...(cachedMetadata.embeds ?? []),
      ...(cachedMetadata.frontmatterLinks ?? []),
    ];

    const validatedLinks = new Set<string>();
    let brokenCount = 0;
    for (const linkCache of linkCaches) {
      const validatedLink = this.getValidatedLinkPath(linkCache.link, sourcePath);
      if (validatedLink) validatedLinks.add(validatedLink);
      else brokenCount++;
    }

    return { links: validatedLinks, brokenCount };
  }

  getDiagnostics(): MOCDiagnostics {
    return { ...this.diagnostics };
  }

  getConnectionExplanation(path: string): {
    connected: boolean;
    reason: string;
    suggestedPath?: string[];
  } {
    if (!this.db[path]) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile && this.settings.isExcludedFile(file)) {
        return { connected: false, reason: "This note is excluded by the current Map of Content filters." };
      }
      return { connected: false, reason: "This note is not included in the current Map of Content graph." };
    }
    if (!this.centralNotePath) return { connected: false, reason: "No valid Central Node is currently selected." };
    if (this.db[path].distanceFromCn !== null) return { connected: true, reason: "This note is already connected to the current Central Node." };

    if (this.settings.getEffectiveMapScope() === "local") {
      const full = this.findConnectionIgnoringLocalDepth(path);
      if (full.length > 0) {
        return { connected: false, reason: `A connection exists, but it is outside the temporary/local depth of ${this.settings.getEffectiveLocalDepth()}.`, suggestedPath: full };
      }
    }

    const full = this.findConnectionIgnoringLocalDepth(path);
    if (full.length > 0) return { connected: false, reason: "No path is currently included under the selected traversal/filter settings. A path exists outside at least one active graph constraint.", suggestedPath: full };
    return { connected: false, reason: "No link path exists from the current Central Node under the selected traversal direction." };
  }

  private findConnectionIgnoringLocalDepth(target: string): string[] {
    if (!this.centralNotePath || !this.db[target]) return [];
    const queue = [this.centralNotePath];
    const parents = new Map<string, string | undefined>([[this.centralNotePath, undefined]]);
    let index = 0;
    while (index < queue.length && queue.length < 20000) {
      const current = queue[index++];
      if (current === target) break;
      const note = this.db[current];
      if (!note) continue;
      for (const next of this.getTraversalNeighbours(note, this.settings.get("link_traversal_mode"))) {
        if (parents.has(next) || !this.db[next]) continue;
        parents.set(next, current);
        queue.push(next);
      }
    }
    if (!parents.has(target)) return [];
    const result: string[] = [];
    let current: string | undefined = target;
    while (current) {
      result.push(current);
      current = parents.get(current);
    }
    return result.reverse();
  }

  private updateDiagnostics(): void {
    const total = this.dbKeys.length;
    const reachable = this.allNotes().filter((note) => note.distanceFromCn !== null).length;
    let orphanFiles = 0;
    for (const note of this.allNotes()) {
      if (
        note.path !== this.centralNotePath &&
        note.linksTo.size === 0 &&
        note.linkedFrom.size === 0
      ) {
        orphanFiles++;
      }
    }

    let brokenLinks = 0;
    for (const count of this.brokenLinksByNote.values()) brokenLinks += count;

    let linkCount = 0;
    for (const note of this.allNotes()) linkCount += note.linksTo.size;
    this.diagnostics = {
      totalIncludedFiles: total,
      reachableFiles: reachable,
      unreachableFiles: Math.max(0, total - reachable),
      orphanFiles,
      brokenLinks,
      linkCount,
      cachedNotes: this.linkCache.size,
      lastUpdateMs: this.lastUpdateMs,
      lastPathCount: this.lastPathCount,
      lastPathSearchTruncated: this.lastPathSearchTruncated,
      centralNotePath: this.centralNotePath,
      mapScope: this.settings.getEffectiveMapScope(),
      localDepth: this.settings.getEffectiveMapScope() === "local" ? this.settings.getEffectiveLocalDepth() : undefined,
      traversalMode: this.settings.get("link_traversal_mode"),
    };
  }

  getSearchVisiblePaths(query: string, rootPath?: string): Set<string> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return new Set(this.dbKeys);

    const matching = this.dbKeys.filter((path) => {
      const name = getFileNameFromPath(path).toLowerCase();
      return path.toLowerCase().includes(normalized) || name.includes(normalized);
    });

    if (!rootPath || !this.db[rootPath]) return new Set(matching);

    const branchNodes = new Set<string>();
    const queue = [rootPath];
    while (queue.length) {
      const current = queue.pop();
      if (!current || branchNodes.has(current)) continue;
      branchNodes.add(current);
      for (const child of this.descendants.get(current) ?? []) queue.push(child);
    }

    const visible = new Set<string>();
    for (const match of matching) {
      if (!branchNodes.has(match)) continue;
      const stack = [match];
      const visited = new Set<string>();
      while (stack.length) {
        const current = stack.pop();
        if (!current || visited.has(current) || !branchNodes.has(current)) continue;
        visited.add(current);
        visible.add(current);
        if (current === rootPath) continue;
        for (const parent of this.shortestPathParents.get(current) ?? []) {
          if (branchNodes.has(parent)) stack.push(parent);
        }
      }
    }
    return visible;
  }

  getBrokenLinks(): Array<{ notePath: string; count: number }> {
    return [...this.brokenLinksByNote.entries()]
      .filter(([, count]) => count > 0)
      .map(([notePath, count]) => ({ notePath, count }));
  }
}
