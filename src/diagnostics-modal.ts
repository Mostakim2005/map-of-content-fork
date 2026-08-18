import { Modal, Setting } from "obsidian";
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
    ];

    for (const [label, value] of rows) {
      new Setting(contentEl).setName(label).setDesc(value);
    }

    if (diagnostics.brokenLinks > 0) {
      const broken = this.plugin.db.getBrokenLinks();
      const list = contentEl.createEl("ul");
      for (const item of broken.slice(0, 100)) {
        list.createEl("li", { text: `${item.notePath} — ${item.count}` });
      }
      if (broken.length > 100) {
        contentEl.createEl("p", {
          text: `Showing the first 100 notes with broken links (${broken.length} total).`,
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
