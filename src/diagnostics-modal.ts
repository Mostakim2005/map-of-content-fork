import { Modal, Notice, Setting } from "obsidian";
import type MOCPlugin from "./main";

export default class DiagnosticsModal extends Modal {
  private plugin: MOCPlugin;

  constructor(plugin: MOCPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Map of Content diagnostics" });

    const diagnostics = this.plugin.db.getDiagnostics();
    const rows: Array<[string, string]> = [
      ["Included files", String(diagnostics.totalIncludedFiles)],
      ["Reachable from Central Node", String(diagnostics.reachableFiles)],
      ["Unreachable", String(diagnostics.unreachableFiles)],
      ["Orphan files", String(diagnostics.orphanFiles)],
      ["Broken links", String(diagnostics.brokenLinks)],
      ["Links", String(diagnostics.linkCount)],
      ["Cached notes", String(diagnostics.cachedNotes)],
      ["Last update", `${diagnostics.lastUpdateMs} ms`],
      ["Last path search", `${diagnostics.lastPathCount}${diagnostics.lastPathSearchTruncated ? " (truncated)" : ""}`],
      ["Central Node", diagnostics.centralNotePath ?? "None"],
      ["Scope", diagnostics.mapScope === "local" ? `Local · ${diagnostics.localDepth}` : "Full"],
      ["Traversal", diagnostics.traversalMode],
    ];

    for (const [label, value] of rows) new Setting(contentEl).setName(label).setDesc(value);

    const actions = new Setting(contentEl);
    actions.addButton((button) => button.setButtonText("Rebuild graph").onClick(() => void this.plugin.db.update()));
    actions.addButton((button) => button.setButtonText("Copy diagnostics").onClick(async () => {
      const text = JSON.stringify(diagnostics, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        new Notice("Diagnostics copied to clipboard.");
      } catch {
        new Notice("Could not copy diagnostics to the clipboard.");
      }
    }));

    if (diagnostics.brokenLinks > 0) {
      contentEl.createEl("h3", { text: "Broken links" });
      const broken = this.plugin.db.getBrokenLinks();
      const list = contentEl.createEl("ul");
      for (const item of broken.slice(0, 100)) list.createEl("li", { text: `${item.notePath} — ${item.count}` });
      if (broken.length > 100) contentEl.createEl("p", { text: `Showing the first 100 notes with broken links (${broken.length} total).` });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
