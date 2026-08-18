import "svelte";

import { ItemView, WorkspaceLeaf } from "obsidian";
import { devLog } from "./utils";
import { MOC_VIEW_TYPE } from "./constants";
import type MOCPlugin from "./main";
import type { Path, PathItem } from "./types";
import type { DBManager } from "./db";
import View from "./svelte/View.svelte";
import type { SettingsManager } from "./settings";

export default class MOCView extends ItemView {
  db: DBManager;
  _app?: View;
  plugin: MOCPlugin;
  settings: SettingsManager;
  leaf: WorkspaceLeaf;
  openFilePath = "";
  isPinned = false;
  noteBeingMonitored = "";
  linksOfNoteBeingMonitored: string[] = [];
  pathsTruncated = false;

  constructor(leaf: WorkspaceLeaf, plugin: MOCPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.leaf = leaf;
    this.db = plugin.db;
    this.settings = plugin.mocSettings;
    this.plugin.registerViewInstance(this);

    this.registerEvent(this.app.workspace.on("css-change", () => this.rerender()));
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        if (!this.isPinned) {
          void this.monitorNote();
          this.rerender();
        }
      })
    );
  }

  async onOpen(): Promise<void> {
    await this.monitorNote();
    this.rerender();
  }

  rerender(): void {
    if (!this.contentEl) return;
    this.destroyApp();

    const error = this.getRerenderError();
    if (error) {
      this._app = new View({
        target: this.contentEl,
        props: { view: this, paths: [], error },
      });
      return;
    }

    const pathResult = this.db.findPathsDetailed(this.openFilePath);
    this.pathsTruncated = pathResult.truncated;
    const pathItems: PathItem[][] = pathResult.paths.map((path: Path) => path.items.map((item) => [...item] as PathItem));
    this._app = new View({
      target: this.contentEl,
      props: { view: this, paths: pathItems, error },
    });
  }

  getRerenderError(): string | undefined {
    if (this.db.isDatabaseUpdating) return "Updating the Map of Content…";
    if (!this.db.isDatabaseComplete) {
      if (this.settings.isCurrentNoteCentral()) {
        return "Your Map of Content is waiting for a valid current Markdown note. Open a non-excluded Markdown note to use it as the Central Node.";
      }
      const central = this.settings.get("CN_path");
      return `Your Map of Content could not be created. Choose a valid Central Node${central ? ` (currently: <code>${this.escapeHtml(central)}</code>)` : ""}.`;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return "No file is open.";
    if (this.settings.isExcludedFile(activeFile)) return "This file has been excluded from the Map of Content.";

    this.openFilePath = activeFile.path;
    if (!this.db.getNoteFromPath(this.openFilePath)) {
      void this.db.update(true);
      return "Updating the Map of Content…";
    }
    return undefined;
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  destroyApp(): void {
    this._app?.$destroy();
    this._app = undefined;
  }

  async onClose(): Promise<void> {
    devLog("View closing");
    this.destroyApp();
    this.plugin.unregisterViewInstance(this);
  }

  async monitorNote(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md" || this.settings.isExcludedFile(activeFile)) return;

    let doUpdateDb = false;
    if (this.noteBeingMonitored) {
      const previousMetadata = this.app.metadataCache.getCache(this.noteBeingMonitored);
      if (!previousMetadata) {
        doUpdateDb = true;
      } else if (activeFile.path !== this.noteBeingMonitored && this.settings.get("auto_update_on_file_change")) {
        const currentLinks = [...this.db.getValidatedLinksFromNote(this.noteBeingMonitored, this.noteBeingMonitored)].sort();
        const previousLinks = [...this.linksOfNoteBeingMonitored].sort();
        doUpdateDb = currentLinks.length !== previousLinks.length || currentLinks.some((link, index) => link !== previousLinks[index]);
      }
    }

    this.noteBeingMonitored = activeFile.path;
    this.linksOfNoteBeingMonitored = [...this.db.getValidatedLinksFromNote(activeFile.path, activeFile.path)].sort();

    if (doUpdateDb || this.settings.isCurrentNoteCentral()) await this.db.update(true);
  }

  getViewType(): string {
    return MOC_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Map of Content";
  }

  getIcon(): string {
    return "stacked-levels";
  }
}
