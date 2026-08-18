import { FuzzySuggestModal } from "obsidian";
import type MOCPlugin from "./main";
import { getFileNameFromPath } from "./utils";

type CentralNoteChoice =
  | { type: "current" }
  | { type: "note"; path: string };

export default class CentralNoteModal extends FuzzySuggestModal<CentralNoteChoice> {
  private plugin: MOCPlugin;

  constructor(plugin: MOCPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.setPlaceholder("Choose a Central Note...");
  }

  getItems(): CentralNoteChoice[] {
    const items: CentralNoteChoice[] = [];
    const activeFile = this.plugin.app.workspace.getActiveFile();

    if (
      activeFile &&
      activeFile.extension === "md" &&
      !this.plugin.mocSettings.isExcludedFile(activeFile)
    ) {
      items.push({ type: "current" });
    }

    const seen = new Set<string>();
    for (const path of this.plugin.mocSettings.get("central_note_presets")) {
      if (seen.has(path)) continue;
      if (this.plugin.mocSettings.isValidCentralNotePath(path)) {
        items.push({ type: "note", path });
        seen.add(path);
      }
    }

    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      if (this.plugin.mocSettings.isExcludedFile(file) || seen.has(file.path)) {
        continue;
      }
      items.push({ type: "note", path: file.path });
      seen.add(file.path);
    }

    return items;
  }

  getItemText(item: CentralNoteChoice): string {
    if (item.type === "current") {
      const activeFile = this.plugin.app.workspace.getActiveFile();
      return activeFile ? `Use current note: ${activeFile.path}` : "Use current note";
    }

    const isFavorite = this.plugin.mocSettings
      .get("central_note_presets")
      .includes(item.path);
    return `${isFavorite ? "★ " : ""}${getFileNameFromPath(item.path)} — ${item.path}`;
  }

  onChooseItem(item: CentralNoteChoice): void {
    const promise =
      item.type === "current"
        ? this.plugin.useCurrentNoteAsCentralNote()
        : this.plugin.setFixedCentralNote(item.path, true);

    void promise;
  }
}
