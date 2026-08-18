import { PluginSettingTab, TFile } from "obsidian";
import type MOCPlugin from "./main";
import Settings from "./svelte/Settings.svelte";
import { devLog } from "./utils";
import type { CentralNoteMode, LinkTraversalMode, MOCProfile, SortMode } from "./types";

export interface MOCSettings {
  CN_path: string;
  exluded_folders: string[];
  exluded_filename_components: string[];
  settings_version: string;
  do_show_update_notice: boolean;
  auto_update_on_file_change: boolean;
  do_remember_expanded: boolean;
  MOC_path_starts_at_CN: boolean;
  file_descendants_expanded: Record<string, boolean>;
  do_show_paths_to_note: boolean;
  central_note_mode: CentralNoteMode;
  central_note_presets: string[];
  auto_expand_depth: number;
  link_traversal_mode: LinkTraversalMode;
  max_shortest_paths: number;
  sort_mode: SortMode;
  included_tags: string[];
  excluded_tags: string[];
  enable_tag_filter: boolean;
  enable_smart_sort: boolean;
  moc_profiles: MOCProfile[];
  active_profile_name: string;
  map_scope: "full" | "local";
  local_depth: number;
  exclude_generated_moc_notes: boolean;
}

export const DEFAULT_SETTINGS: MOCSettings = {
  CN_path: "Central Note.md",
  exluded_folders: [],
  exluded_filename_components: [],
  settings_version: "1.7.0",
  do_show_update_notice: false,
  auto_update_on_file_change: true,
  do_remember_expanded: false,
  MOC_path_starts_at_CN: false,
  file_descendants_expanded: {},
  do_show_paths_to_note: true,
  central_note_mode: "fixed",
  central_note_presets: [],
  auto_expand_depth: 3,
  link_traversal_mode: "both",
  max_shortest_paths: 500,
  sort_mode: "alpha",
  included_tags: [],
  excluded_tags: [],
  enable_tag_filter: false,
  enable_smart_sort: false,
  moc_profiles: [],
  active_profile_name: "",
  map_scope: "full",
  local_depth: 4,
  exclude_generated_moc_notes: true,
};

const GRAPH_AFFECTING_SETTINGS = new Set<keyof MOCSettings>([
  "CN_path",
  "central_note_mode",
  "exluded_folders",
  "exluded_filename_components",
  "link_traversal_mode",
  "included_tags",
  "excluded_tags",
  "enable_tag_filter",
  "map_scope",
  "local_depth",
]);

export class SettingsManager {
  settings: MOCSettings;
  plugin: MOCPlugin;
  genericUpdateVersions = [
    "0.1.10",
    "0.1.12",
    "0.1.14",
    "1.2.0",
    "1.3.0",
    "1.5.0",
    "1.7.0",
  ];
  silentGenericUpdateVersions = [
    "0.1.15",
    "0.1.16",
    "0.1.17",
    "0.1.18",
    "1.0.0",
    "1.1.0",
    "1.4.1",
  ];
  private savePromise: Promise<void> = Promise.resolve();

  constructor(plugin: MOCPlugin) {
    this.plugin = plugin;
  }

  async loadSettings(): Promise<void> {
    const data = await this.plugin.loadData();
    const upgraded = this.upgradeSettingsVersion(data);
    this.settings = this.sanitizeSettings({ ...DEFAULT_SETTINGS, ...upgraded });
    await this.saveSettings();
  }

  async saveSettings(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.settings));
    this.savePromise = this.savePromise.then(() => this.plugin.saveData(snapshot));
    await this.savePromise;
  }

  async set(updates: Partial<MOCSettings>): Promise<void> {
    const changedKeys = Object.keys(updates) as Array<keyof MOCSettings>;
    Object.assign(this.settings, updates);
    this.settings = this.sanitizeSettings(this.settings);
    await this.saveSettings();

    if (this.plugin.db && changedKeys.some((key) => GRAPH_AFFECTING_SETTINGS.has(key))) {
      void this.plugin.db.update(true);
    } else if (changedKeys.some((key) => key === "auto_expand_depth" || key === "do_remember_expanded")) {
      this.plugin.rerender();
    }
  }

  get<K extends keyof MOCSettings>(setting: K): MOCSettings[K] {
    return this.settings[setting];
  }

  getCentralNotePath(): string | undefined {
    if (this.get("central_note_mode") === "current" || this.get("central_note_mode") === "automatic") {
      if (this.get("central_note_mode") === "automatic") return this.getAutoCentralNotePath();
      const activeFile = this.plugin.app.workspace.getActiveFile();
      if (activeFile && activeFile.extension === "md" && !this.isExcludedFile(activeFile)) {
        return activeFile.path;
      }
      return undefined;
    }
    return this.get("CN_path") || undefined;
  }

  isCurrentNoteCentral(): boolean {
    return this.get("central_note_mode") === "current" || this.get("central_note_mode") === "automatic";
  }

  getAutoCentralNotePath(): string | undefined {
    const active = this.plugin.app.workspace.getActiveFile();
    if (!active || active.extension !== "md" || this.isExcludedFile(active)) return undefined;
    const candidates = this.get("central_note_presets")
      .filter((path) => this.isValidCentralNotePath(path))
      .map((path) => this.plugin.db.getNoteFromPath(path));
    if (!candidates.length) return active.path;
    const activeLinks = this.plugin.db.getValidatedLinksFromNote(active.path, active.path);
    let bestPath = active.path;
    let bestScore = -1;
    for (const candidate of candidates) {
      if (!candidate) continue;
      let score = candidate.linksTo.has(active.path) || activeLinks.has(candidate.path) ? 2 : 0;
      score += candidate.linkedFrom.has(active.path) ? 1 : 0;
      if (score > bestScore) {
        bestScore = score;
        bestPath = candidate.path;
      }
    }
    return bestPath;
  }

  isValidCentralNotePath(path: string | undefined): path is string {
    if (!path) return false;
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && file.extension === "md" && !this.isExcludedFile(file);
  }

  async setFixedCentralNote(path: string, addToPresets = true): Promise<boolean> {
    if (!this.isValidCentralNotePath(path)) return false;
    const presets = [...this.get("central_note_presets")];
    if (addToPresets && !presets.includes(path)) presets.unshift(path);
    await this.set({ CN_path: path, central_note_mode: "fixed", central_note_presets: presets });
    return true;
  }

  async useCurrentNoteAsCentralNote(): Promise<boolean> {
    const activeFile = this.plugin.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md" || this.isExcludedFile(activeFile)) return false;
    const presets = [...this.get("central_note_presets")];
    if (!presets.includes(activeFile.path)) presets.unshift(activeFile.path);
    await this.set({ central_note_mode: "current", central_note_presets: presets });
    return true;
  }

  async useFixedCentralNote(): Promise<boolean> {
    if (!this.isValidCentralNotePath(this.get("CN_path"))) return false;
    await this.set({ central_note_mode: "fixed" });
    return true;
  }

  async addCentralNotePreset(path: string): Promise<boolean> {
    if (!this.isValidCentralNotePath(path)) return false;
    if (this.get("central_note_presets").includes(path)) return true;
    await this.set({ central_note_presets: [path, ...this.get("central_note_presets")] });
    return true;
  }

  async removeCentralNotePreset(path: string): Promise<void> {
    await this.set({
      central_note_presets: this.get("central_note_presets").filter((preset) => preset !== path),
    });
  }

  async handleFileRename(oldPath: string, newPath: string): Promise<void> {
    let changed = false;
    const updates: Partial<MOCSettings> = {};
    const renamePath = (path: string): string => {
      if (path === oldPath) return newPath;
      if (path.startsWith(`${oldPath}/`)) return `${newPath}${path.slice(oldPath.length)}`;
      return path;
    };

    if (this.get("CN_path") === oldPath) {
      updates.CN_path = newPath;
      changed = true;
    }

    const nextPresets = this.get("central_note_presets").map(renamePath);
    if (JSON.stringify(nextPresets) !== JSON.stringify(this.get("central_note_presets"))) {
      updates.central_note_presets = Array.from(new Set(nextPresets));
      changed = true;
    }

    const expansionState = this.get("file_descendants_expanded");
    const nextState: Record<string, boolean> = {};
    for (const [path, expanded] of Object.entries(expansionState)) nextState[renamePath(path)] = expanded;
    if (JSON.stringify(nextState) !== JSON.stringify(expansionState)) {
      updates.file_descendants_expanded = nextState;
      changed = true;
    }

    const nextProfiles = this.get("moc_profiles").map((profile) => ({ ...profile, centralNotePath: renamePath(profile.centralNotePath) }));
    if (JSON.stringify(nextProfiles) !== JSON.stringify(this.get("moc_profiles"))) {
      updates.moc_profiles = nextProfiles;
      changed = true;
    }

    const nextExcludedFolders = this.get("exluded_folders").map(renamePath);
    if (JSON.stringify(nextExcludedFolders) !== JSON.stringify(this.get("exluded_folders"))) {
      updates.exluded_folders = Array.from(new Set(nextExcludedFolders));
      changed = true;
    }

    if (changed) await this.set(updates);
  }

  async handleFileDelete(path: string): Promise<void> {
    const updates: Partial<MOCSettings> = {};
    let changed = false;
    if (this.get("central_note_presets").includes(path)) {
      updates.central_note_presets = this.get("central_note_presets").filter((preset) => preset !== path);
      changed = true;
    }

    const expansionState = this.get("file_descendants_expanded");
    if (Object.prototype.hasOwnProperty.call(expansionState, path)) {
      const nextState = { ...expansionState };
      delete nextState[path];
      updates.file_descendants_expanded = nextState;
      changed = true;
    }

    const remainingProfiles = this.get("moc_profiles").filter((profile) => profile.centralNotePath !== path);
    if (remainingProfiles.length !== this.get("moc_profiles").length) {
      updates.moc_profiles = remainingProfiles;
      if (this.get("active_profile_name") && !remainingProfiles.some((profile) => profile.name === this.get("active_profile_name"))) updates.active_profile_name = "";
      changed = true;
    }

    if (this.get("CN_path") === path) {
      updates.CN_path = "";
      changed = true;
    }

    if (changed) await this.set(updates);
  }

  isExcludedFile(file: TFile): boolean {
    const normalizedFolders = this.get("exluded_folders");
    if (normalizedFolders.some((path) => path && (file.path === path || file.path.startsWith(`${path}/`)))) {
      return true;
    }
    if (this.get("exclude_generated_moc_notes")) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.moc_generated === true || cache?.frontmatter?.moc_generated === "true") return true;
    }
    const filename = `${file.basename}.${file.extension}`;
    return this.get("exluded_filename_components").some((phrase) => phrase && filename.includes(phrase));
  }

  isExpanded(path: string): boolean {
    if (!this.get("do_remember_expanded")) return true;
    return this.get("file_descendants_expanded")[path] ?? true;
  }

  async setExpanded(path: string, newIsExpanded: boolean): Promise<void> {
    if (!this.get("do_remember_expanded")) return;
    await this.set({
      file_descendants_expanded: {
        ...this.get("file_descendants_expanded"),
        [path]: newIsExpanded,
      },
    });
  }

  async setAllExpanded(paths: Iterable<string>, expanded: boolean): Promise<void> {
    if (!this.get("do_remember_expanded")) return;
    const nextState = { ...this.get("file_descendants_expanded") };
    for (const path of paths) nextState[path] = expanded;
    await this.set({ file_descendants_expanded: nextState });
  }

  pruneExpansionState(validPaths: Set<string>): void {
    const current = this.get("file_descendants_expanded");
    const pruned: Record<string, boolean> = {};
    for (const [path, expanded] of Object.entries(current)) {
      if (validPaths.has(path)) pruned[path] = expanded;
    }
    if (Object.keys(current).length !== Object.keys(pruned).length) {
      this.settings.file_descendants_expanded = pruned;
      void this.saveSettings();
    }
  }

  async saveCurrentProfile(name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed || !this.getCentralNotePath()) return false;
    const profile: MOCProfile = {
      name: trimmed,
      centralNotePath: this.getCentralNotePath() ?? this.get("CN_path"),
      centralNoteMode: this.get("central_note_mode"),
      linkTraversalMode: this.get("link_traversal_mode"),
      autoExpandDepth: this.get("auto_expand_depth"),
      sortMode: this.get("sort_mode"),
      includedTags: [...this.get("included_tags")],
      excludedTags: [...this.get("excluded_tags")],
    };
    const profiles = this.get("moc_profiles").filter((p) => p.name !== trimmed);
    await this.set({ moc_profiles: [profile, ...profiles], active_profile_name: trimmed });
    return true;
  }

  async applyProfile(name: string): Promise<boolean> {
    const profile = this.get("moc_profiles").find((p) => p.name === name);
    if (!profile || !this.isValidCentralNotePath(profile.centralNotePath)) return false;
    await this.set({
      CN_path: profile.centralNotePath,
      central_note_mode: profile.centralNoteMode,
      link_traversal_mode: profile.linkTraversalMode,
      auto_expand_depth: profile.autoExpandDepth,
      sort_mode: profile.sortMode,
      included_tags: [...profile.includedTags],
      excluded_tags: [...profile.excludedTags],
      active_profile_name: profile.name,
    });
    return true;
  }

  async removeProfile(name: string): Promise<void> {
    await this.set({ moc_profiles: this.get("moc_profiles").filter((p) => p.name !== name), active_profile_name: this.get("active_profile_name") === name ? "" : this.get("active_profile_name") });
  }

  private sanitizeSettings(settings: MOCSettings): MOCSettings {
    settings.CN_path = typeof settings.CN_path === "string" ? settings.CN_path : "";
    settings.exluded_folders = Array.isArray(settings.exluded_folders)
      ? Array.from(new Set(settings.exluded_folders
          .filter((value): value is string => typeof value === "string" && value.trim() !== "")
          .map((value) => value.replace(/\/+$/, ""))))
      : [];
    settings.exluded_filename_components = Array.isArray(settings.exluded_filename_components)
      ? Array.from(new Set(settings.exluded_filename_components.filter((value): value is string => typeof value === "string" && value !== "")))
      : [];
    settings.file_descendants_expanded =
      settings.file_descendants_expanded && typeof settings.file_descendants_expanded === "object"
        ? Object.fromEntries(
            Object.entries(settings.file_descendants_expanded).filter(
              ([, value]) => typeof value === "boolean"
            )
          )
        : {};
    settings.central_note_mode = settings.central_note_mode === "current" || settings.central_note_mode === "automatic" ? settings.central_note_mode : "fixed";
    settings.central_note_presets = Array.isArray(settings.central_note_presets)
      ? Array.from(new Set(settings.central_note_presets.filter((value): value is string => typeof value === "string" && value.length > 0)))
      : [];
    settings.do_show_update_notice = typeof settings.do_show_update_notice === "boolean" ? settings.do_show_update_notice : DEFAULT_SETTINGS.do_show_update_notice;
    settings.auto_update_on_file_change = typeof settings.auto_update_on_file_change === "boolean" ? settings.auto_update_on_file_change : DEFAULT_SETTINGS.auto_update_on_file_change;
    settings.do_remember_expanded = typeof settings.do_remember_expanded === "boolean" ? settings.do_remember_expanded : DEFAULT_SETTINGS.do_remember_expanded;
    settings.MOC_path_starts_at_CN = typeof settings.MOC_path_starts_at_CN === "boolean" ? settings.MOC_path_starts_at_CN : DEFAULT_SETTINGS.MOC_path_starts_at_CN;
    settings.do_show_paths_to_note = typeof settings.do_show_paths_to_note === "boolean" ? settings.do_show_paths_to_note : DEFAULT_SETTINGS.do_show_paths_to_note;
    settings.auto_expand_depth = Number.isFinite(settings.auto_expand_depth)
      ? Math.max(0, Math.min(50, Math.floor(settings.auto_expand_depth)))
      : DEFAULT_SETTINGS.auto_expand_depth;
    settings.max_shortest_paths = Number.isFinite(settings.max_shortest_paths)
      ? Math.max(1, Math.min(5000, Math.floor(settings.max_shortest_paths)))
      : DEFAULT_SETTINGS.max_shortest_paths;
    settings.sort_mode = settings.sort_mode === "links" || settings.sort_mode === "modified" || settings.sort_mode === "path" ? settings.sort_mode : "alpha";
    settings.included_tags = Array.isArray(settings.included_tags) ? Array.from(new Set(settings.included_tags.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim().replace(/^#/, "")))) : [];
    settings.excluded_tags = Array.isArray(settings.excluded_tags) ? Array.from(new Set(settings.excluded_tags.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim().replace(/^#/, "")))) : [];
    settings.enable_tag_filter = typeof settings.enable_tag_filter === "boolean" ? settings.enable_tag_filter : false;
    settings.enable_smart_sort = typeof settings.enable_smart_sort === "boolean" ? settings.enable_smart_sort : false;
    settings.moc_profiles = Array.isArray(settings.moc_profiles)
      ? settings.moc_profiles
          .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === "object"))
          .filter((p) => typeof p.name === "string" && typeof p.centralNotePath === "string")
          .map((p) => ({
            name: String(p.name),
            centralNotePath: String(p.centralNotePath),
            centralNoteMode: p.centralNoteMode === "current" || p.centralNoteMode === "automatic" ? p.centralNoteMode : "fixed",
            linkTraversalMode: p.linkTraversalMode === "outgoing" || p.linkTraversalMode === "incoming" ? p.linkTraversalMode : "both",
            autoExpandDepth: Number.isFinite(p.autoExpandDepth) ? Math.max(0, Math.min(50, Math.floor(Number(p.autoExpandDepth)))) : DEFAULT_SETTINGS.auto_expand_depth,
            sortMode: p.sortMode === "links" || p.sortMode === "modified" || p.sortMode === "path" ? p.sortMode : "alpha",
            includedTags: Array.isArray(p.includedTags) ? p.includedTags.filter((v): v is string => typeof v === "string") : [],
            excludedTags: Array.isArray(p.excludedTags) ? p.excludedTags.filter((v): v is string => typeof v === "string") : [],
          } as MOCProfile))
      : [];
    settings.active_profile_name = typeof settings.active_profile_name === "string" ? settings.active_profile_name : "";
    settings.map_scope = settings.map_scope === "local" ? "local" : "full";
    settings.local_depth = Number.isFinite(settings.local_depth) ? Math.max(1, Math.min(50, Math.floor(settings.local_depth))) : DEFAULT_SETTINGS.local_depth;
    settings.exclude_generated_moc_notes = typeof settings.exclude_generated_moc_notes === "boolean" ? settings.exclude_generated_moc_notes : DEFAULT_SETTINGS.exclude_generated_moc_notes;
    if (settings.active_profile_name && !settings.moc_profiles.some((p) => p.name === settings.active_profile_name)) settings.active_profile_name = "";
    settings.link_traversal_mode =
      settings.link_traversal_mode === "outgoing" || settings.link_traversal_mode === "incoming"
        ? settings.link_traversal_mode
        : "both";
    return settings;
  }

  private isNewerVersion(candidate: string, current: string): boolean {
    const parse = (value: string): number[] | undefined => {
      const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
      return match ? match.slice(1).map(Number) : undefined;
    };
    const candidateParts = parse(candidate);
    const currentParts = parse(current);
    if (!candidateParts || !currentParts) return false;
    for (let i = 0; i < 3; i++) {
      if (candidateParts[i] !== currentParts[i]) return candidateParts[i] > currentParts[i];
    }
    return false;
  }

  private upgradeSettingsVersion(object: unknown): Partial<MOCSettings> {
    if (!object || typeof object !== "object") return {};

    try {
      const cloned = JSON.parse(JSON.stringify(object));
      const oldVersion = typeof cloned.settings_version === "string" ? cloned.settings_version : "pre-0.1.10";
      if (oldVersion === DEFAULT_SETTINGS.settings_version) return cloned;
      if (this.isNewerVersion(oldVersion, DEFAULT_SETTINGS.settings_version)) return cloned;

      if (this.genericUpdateVersions.includes(oldVersion)) cloned.do_show_update_notice = true;
      if (oldVersion === "pre-0.1.10") {
        const entries = Array.isArray(cloned.CN_path_per_vault) ? cloned.CN_path_per_vault : [];
        const vaultName = this.plugin.app.vault.getName();
        const entry = entries.find(
          (value: unknown): value is [string, string] =>
            Array.isArray(value) && value.length >= 2 && value[0] === vaultName && typeof value[1] === "string"
        );
        if (entry) cloned.CN_path = entry[1];
        delete cloned.CN_path_per_vault;
      }

      if (this.silentGenericUpdateVersions.includes(oldVersion)) cloned.settings_version = DEFAULT_SETTINGS.settings_version;
      else cloned.settings_version = DEFAULT_SETTINGS.settings_version;
      return cloned;
    } catch (error) {
      console.error("[Map of Content] Error while transforming settings", error);
      return {
        CN_path: "",
        central_note_mode: "fixed",
        central_note_presets: [],
      };
    }
  }
}

export class MOCSettingTab extends PluginSettingTab {
  plugin: MOCPlugin;
  _app: Settings;

  constructor(plugin: MOCPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this._app?.$destroy();
    this._app = new Settings({
      target: this.containerEl,
      props: { app: this.app, plugin: this.plugin },
    });
  }

  hide(): void {
    this._app?.$destroy();
    this._app = undefined;
    this.plugin.rerender();
  }
}
