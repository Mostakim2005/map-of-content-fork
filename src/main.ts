import { Menu, Modal, Notice, Plugin, Setting, TFile } from "obsidian";
import { MOC_VIEW_TYPE } from "./constants";
import { DBManager } from "./db";
import MOCView from "./view";
import { MOCSettingTab, SettingsManager } from "./settings";
import { devLog } from "./utils";
import CentralNoteModal from "./central-note-modal";
import DiagnosticsModal from "./diagnostics-modal";
import WhyNoteModal from "./why-note-modal";
import ProfileModal from "./profile-modal";

export default class MOCPlugin extends Plugin {
  db: DBManager;
  view?: MOCView;
  mocSettings: SettingsManager;
  private autoUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  async onload(): Promise<void> {
    this.mocSettings = new SettingsManager(this);
    await this.mocSettings.loadSettings();
    this.db = new DBManager(this);
    this.register(() => this.clearAutoUpdateTimer());

    this.registerView(
      MOC_VIEW_TYPE,
      (leaf) => new MOCView(leaf, this)
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (this.mocSettings.isCurrentNoteCentral() && file) {
          this.scheduleAutoUpdate();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void (async () => {
          this.db.invalidateLinkCache();
          await this.mocSettings.handleFileRename(oldPath, file.path);
          this.scheduleAutoUpdate();
        })();
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        void (async () => {
          this.db.invalidateLinkCache();
          await this.mocSettings.handleFileDelete(file.path);
          this.scheduleAutoUpdate();
        })();
      })
    );

    this.registerEvent(
      this.app.vault.on("create", () => {
        this.db.invalidateLinkCache();
        if (this.mocSettings.get("auto_update_on_file_change")) this.scheduleAutoUpdate();
      })
    );

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.extension === "md") this.db.invalidateLinkCache(file.path);
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md" && this.mocSettings.get("auto_update_on_file_change")) {
          this.db.invalidateLinkCache(file.path);
          this.scheduleAutoUpdate();
        }
      })
    );

    this.app.workspace.onLayoutReady(() => this.initializePlugin());
  }

  private scheduleAutoUpdate(delay = 250): void {
    if (!this.mocSettings.get("auto_update_on_file_change") && !this.mocSettings.isCurrentNoteCentral() && !this.mocSettings.isTemporaryLocalExploration()) return;
    if (this.autoUpdateTimer !== null) clearTimeout(this.autoUpdateTimer);
    this.autoUpdateTimer = setTimeout(() => {
      this.autoUpdateTimer = null;
      void this.db.update(true);
    }, delay);
  }

  private clearAutoUpdateTimer(): void {
    if (this.autoUpdateTimer !== null) clearTimeout(this.autoUpdateTimer);
    this.autoUpdateTimer = null;
  }

  async initializePlugin(): Promise<void> {
    this.addSettingTab(new MOCSettingTab(this));
    this.initLeaf();
    void this.db.update(true);

    this.addRibbonIcon("git-branch", "Show Map of Content", () => {
      this.initLeaf();
    });

    this.addRibbonIcon("refresh-cw", "Update Map of Content", () => {
      void this.db.update();
    });

    this.addCommand({
      id: "rebuild-map-of-content",
      name: "Update Map of Content",
      callback: () => void this.db.update(),
    });

    this.addCommand({
      id: "show-map-of-content-pane",
      name: "Show Map of Content pane",
      callback: () => this.initLeaf(),
    });

    this.addCommand({
      id: "choose-central-node",
      name: "Choose Central Node",
      callback: () => this.chooseCentralNote(),
    });

    this.addCommand({
      id: "use-current-note-as-central-node",
      name: "Use current note as Central Node",
      callback: () => void this.useCurrentNoteAsCentralNote(),
    });

    this.addCommand({
      id: "set-current-note-as-fixed-central-node",
      name: "Set current note as fixed Central Node",
      callback: () => void this.setActiveFileAsFixedCentralNote(),
    });

    // Preserve the pre-1.4.1 command ID so existing hotkeys continue to work.
    this.addCommand({
      id: "open-note-as-central-note",
      name: "Set current note as Central Node",
      callback: () => void this.setActiveFileAsFixedCentralNote(),
    });

    this.addCommand({
      id: "use-fixed-central-node",
      name: "Use fixed Central Node",
      callback: () => void this.useFixedCentralNote(),
    });

    this.addCommand({
      id: "use-automatic-central-node",
      name: "Use automatic Central Node",
      callback: () => void this.useAutomaticCentralNote(),
    });

    this.addCommand({
      id: "save-moc-profile",
      name: "Save current Map of Content profile",
      callback: () => new ProfileModal(this, "save").open(),
    });

    this.addCommand({
      id: "choose-moc-profile",
      name: "Choose Map of Content profile",
      callback: () => new ProfileModal(this, "choose").open(),
    });

    this.addCommand({
      id: "toggle-tag-filter",
      name: "Toggle Map of Content tag filter",
      callback: () => void this.toggleSetting("enable_tag_filter"),
    });

    this.addCommand({
      id: "toggle-smart-sorting",
      name: "Toggle Map of Content smart sorting",
      callback: () => void this.toggleSetting("enable_smart_sort"),
    });

    this.addCommand({
      id: "generate-moc-note",
      name: "Generate a Map of Content note",
      callback: () => void this.generateMOCNote(),
    });

    this.addCommand({
      id: "show-moc-diagnostics",
      name: "Show Map of Content diagnostics",
      callback: () => this.showDiagnostics(),
    });

    this.addCommand({
      id: "why-is-current-note-in-moc",
      name: "Why is the current note in the Map of Content?",
      callback: () => this.showWhyCurrentNote(),
    });

    this.addCommand({
      id: "why-is-current-note-not-in-moc",
      name: "Why is the current note not in the Map of Content?",
      callback: () => this.showWhyCurrentNoteNotConnected(),
    });

    this.addCommand({
      id: "explore-current-note-locally",
      name: "Explore current note locally (temporary)",
      callback: () => void this.startTemporaryLocalExploration(),
    });

    this.addCommand({
      id: "exit-temporary-local-exploration",
      name: "Exit temporary local exploration",
      callback: () => this.stopTemporaryLocalExploration(),
    });

    this.addCommand({
      id: "add-current-note-to-central-node-favorites",
      name: "Add current note to Central Node favorites",
      callback: () => void this.addActiveFileToCentralNodePresets(),
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (
          !(file instanceof TFile) ||
          file.extension !== "md" ||
          this.mocSettings.isExcludedFile(file)
        ) {
          return;
        }

        menu.addItem((item) => {
          item
            .setTitle("Set as fixed Central Node")
            .setIcon("target")
            .onClick(() => void this.setFixedCentralNote(file.path));
        });
        menu.addItem((item) => {
          item
            .setTitle("Add to Central Node favorites")
            .setIcon("star")
            .onClick(() => void this.addCentralNodePreset(file.path));
        });
      })
    );
  }


  openCentralNodeMenu(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("Choose Central Node...")
        .setIcon("search")
        .onClick(() => this.chooseCentralNote())
    );
    menu.addItem((item) =>
      item
        .setTitle("Use current note")
        .setIcon("file-text")
        .onClick(() => void this.useCurrentNoteAsCentralNote())
    );
    menu.addItem((item) =>
      item
        .setTitle("Use automatic Central Node")
        .setIcon("shuffle")
        .onClick(() => void this.useAutomaticCentralNote())
    );
    menu.addItem((item) =>
      item
        .setTitle("Use fixed Central Node")
        .setIcon("target")
        .onClick(() => void this.useFixedCentralNote())
    );
    const favorites = this.mocSettings.get("central_note_presets").filter((path) =>
      this.mocSettings.isValidCentralNotePath(path)
    );
    if (favorites.length) {
      menu.addSeparator();
      for (const path of favorites.slice(0, 25)) {
        menu.addItem((item) =>
          item
            .setTitle(path)
            .setIcon(path === this.mocSettings.getCentralNotePath() ? "check" : "star")
            .onClick(() => void this.setFixedCentralNote(path, false))
        );
      }
    }
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle("Explore current note locally (temporary)")
      .setIcon("focus")
      .onClick(() => void this.startTemporaryLocalExploration()));
    if (this.mocSettings.isTemporaryLocalExploration()) {
      menu.addItem((item) => item
        .setTitle("Exit temporary local exploration")
        .setIcon("x")
        .onClick(() => this.stopTemporaryLocalExploration()));
    }

    if (this.mocSettings.get("moc_profiles").length) {
      menu.addSeparator();
      menu.addItem((item) => item.setTitle("Choose MOC profile...").setIcon("layers").onClick(() => new ProfileModal(this, "choose").open()));
    }
    menu.addItem((item) => item.setTitle("Save current MOC profile").setIcon("save").onClick(() => new ProfileModal(this, "save").open()));
    menu.addItem((item) => item.setTitle("Generate MOC note").setIcon("file-plus").onClick(() => void this.generateMOCNote()));
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Choose Central Node…")
        .setIcon("target")
        .onClick(() => new CentralNoteModal(this).open())
    );
    menu.showAtMouseEvent(event);
  }

  showDiagnostics(): void {
    new DiagnosticsModal(this).open();
  }

  showWhyCurrentNote(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md" || this.mocSettings.isExcludedFile(file)) {
      new Notice("Open a non-excluded Markdown note first.");
      return;
    }
    new WhyNoteModal(this, file.path).open();
  }

  showWhyCurrentNoteNotConnected(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("Open a Markdown note first.");
      return;
    }
    const explanation = this.db.getConnectionExplanation(file.path);
    if (explanation.connected) {
      new Notice("This note is already connected to the current Central Node.");
      return;
    }
    const modal = new Modal(this.app);
    modal.contentEl.empty();
    modal.contentEl.createEl("h2", { text: "Why isn't this note connected?" });
    modal.contentEl.createEl("p", { text: explanation.reason });
    if (explanation.suggestedPath?.length) {
      modal.contentEl.createEl("h3", { text: "Possible connection" });
      modal.contentEl.createEl("p", { text: explanation.suggestedPath.join(" → ") });
    }
    new Setting(modal.contentEl).addButton((button) => button.setButtonText("Close").setCta().onClick(() => modal.close()));
    modal.open();
  }

  async startTemporaryLocalExploration(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md" || this.mocSettings.isExcludedFile(file)) {
      new Notice("Open a non-excluded Markdown note first.");
      return;
    }
    if (await this.mocSettings.startTemporaryLocalExploration(file.path, this.mocSettings.get("local_depth"))) {
      new Notice(`Temporary local exploration: ${file.path}`);
    }
  }

  stopTemporaryLocalExploration(): void {
    if (!this.mocSettings.isTemporaryLocalExploration()) return;
    this.mocSettings.stopTemporaryLocalExploration();
    new Notice("Returned to the saved Map of Content view.");
  }

  async useAutomaticCentralNote(): Promise<void> {
    await this.mocSettings.set({ central_note_mode: "automatic" });
    new Notice("Automatic Central Node mode enabled.");
  }

  async toggleSetting(key: "enable_tag_filter" | "enable_smart_sort"): Promise<void> {
    if (key === "enable_tag_filter") {
      const next = !this.mocSettings.get("enable_tag_filter");
      await this.mocSettings.set({ enable_tag_filter: next });
      new Notice(`Tag filtering ${next ? "enabled" : "disabled"}.`);
      return;
    }
    const next = !this.mocSettings.get("enable_smart_sort");
    await this.mocSettings.set({ enable_smart_sort: next });
    new Notice(`Smart sorting ${next ? "enabled" : "disabled"}.`);
  }

  async generateMOCNote(): Promise<void> {
    const central = this.mocSettings.getCentralNotePath();
    if (!central || !this.db.getNoteFromPath(central)) {
      new Notice("Choose a valid Central Node first.");
      return;
    }
    const modal = new Modal(this.app);
    const content = modal.contentEl;
    content.empty();
    content.createEl("h2", { text: "Generate Map of Content note" });
    let path = `${central.replace(/\.md$/i, "")} MOC.md`;
    new Setting(content).setName("Note path").addText((text) => {
      text.setValue(path);
      text.onChange((value) => (path = value));
    });
    new Setting(content).addButton((button) => button.setButtonText("Generate").setCta().onClick(async () => {
      const normalized = path.trim().endsWith(".md") ? path.trim() : `${path.trim()}.md`;
      const lines = ["---", "moc_generated: true", `moc_source: ${central}`, "---", `# ${central.replace(/\.md$/i, "")}`, "", "<!-- Generated by Map of Content. Content outside this block is preserved on future updates. -->", "<!-- MOC:START -->"];
      const stack: Array<{ note: string; depth: number }> = this.db.getSortedDescendants(central).map((note) => ({ note, depth: 0 })).reverse();
      const rendered = new Set<string>();
      while (stack.length) {
        const current = stack.pop();
        if (!current || rendered.has(current.note)) continue;
        rendered.add(current.note);
        lines.push(`${"  ".repeat(current.depth)}- [[${current.note.replace(/\.md$/i, "")}]]`);
        const children = this.db.getSortedDescendants(current.note);
        for (let i = children.length - 1; i >= 0; i--) stack.push({ note: children[i], depth: current.depth + 1 });
      }
      lines.push("<!-- MOC:END -->");
      const text = `${lines.join("\n")}\n`;
      const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
      if (parent) await this.app.vault.createFolder(parent).catch(() => undefined);
      const existing = this.app.vault.getAbstractFileByPath(normalized);
      if (existing instanceof TFile) {
        const original = await this.app.vault.read(existing);
        const start = original.indexOf("<!-- MOC:START -->");
        const end = original.indexOf("<!-- MOC:END -->");
        if (start >= 0 && end > start) {
          const replacement = text.slice(text.indexOf("<!-- MOC:START -->"));
          const before = original.slice(0, start);
          const after = original.slice(end + "<!-- MOC:END -->".length);
          await this.app.vault.modify(existing, `${before}${replacement}${after}`);
        } else {
          await this.app.vault.append(existing, `\n\n${text}`);
        }
      } else {
        await this.app.vault.create(normalized, text);
      }
      modal.close();
      new Notice(`Generated ${normalized}`);
    }));
    modal.open();
  }

  chooseCentralNote(): void {
    new CentralNoteModal(this).open();
  }

  async setFixedCentralNote(path: string, addToPresets = true): Promise<void> {
    if (!(await this.mocSettings.setFixedCentralNote(path, addToPresets))) {
      new Notice("That note cannot be used as a Central Node.");
      return;
    }
    new Notice(`Central Node set to ${path}`);
  }

  async useCurrentNoteAsCentralNote(): Promise<void> {
    if (!(await this.mocSettings.useCurrentNoteAsCentralNote())) {
      new Notice("Open a non-excluded Markdown note first.");
      return;
    }
    new Notice("Current note is now the Central Node.");
  }

  async useFixedCentralNote(): Promise<void> {
    if (!(await this.mocSettings.useFixedCentralNote())) {
      new Notice("Your fixed Central Node is not a valid Markdown note.");
      this.chooseCentralNote();
      return;
    }
    new Notice("Using the fixed Central Node.");
  }

  async setActiveFileAsFixedCentralNote(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No file is open.");
      return;
    }
    await this.setFixedCentralNote(activeFile.path);
  }

  async addActiveFileToCentralNodePresets(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (
      !activeFile ||
      activeFile.extension !== "md" ||
      this.mocSettings.isExcludedFile(activeFile)
    ) {
      new Notice("Open a non-excluded Markdown note first.");
      return;
    }
    await this.addCentralNodePreset(activeFile.path);
  }

  async addCentralNodePreset(path: string): Promise<void> {
    if (!(await this.mocSettings.addCentralNotePreset(path))) {
      new Notice("That note cannot be added as a Central Node favorite.");
      return;
    }
    new Notice("Central Node favorite saved.");
  }

  initLeaf(): void {
    if (this.app.workspace.getLeavesOfType(MOC_VIEW_TYPE).length) {
      devLog("View already attached");
      return;
    }

    this.app.workspace.getRightLeaf(true).setViewState({
      type: MOC_VIEW_TYPE,
      active: true,
    });
  }

  rerender(): void {
    devLog("rerender on plugin called");
    this.view?.rerender();
  }

  onunload(): void {
    devLog("Unloading plugin");
    this.app.workspace.detachLeavesOfType(MOC_VIEW_TYPE);
    this.view = undefined;
  }



  registerViewInstance(view: MOCView): void {
    devLog("View registered");
    this.view = view;
  }

  unregisterViewInstance(view: MOCView): void {
    if (this.view === view) {
      this.view = undefined;
    }
  }
}
