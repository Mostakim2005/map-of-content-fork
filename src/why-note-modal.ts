import { Modal } from "obsidian";
import type MOCPlugin from "./main";
import { getDisplayName, NavigateToFile } from "./utils";

export default class WhyNoteModal extends Modal {
  private plugin: MOCPlugin;
  private notePath: string;

  constructor(plugin: MOCPlugin, notePath: string) {
    super(plugin.app);
    this.plugin = plugin;
    this.notePath = notePath;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Why is this note in the Map of Content?" });
    contentEl.createEl("p", { text: this.notePath });

    const result = this.plugin.db.findPathsDetailed(this.notePath);
    const paths = result.paths;
    if (paths.length === 0) {
      contentEl.createEl("p", {
        text: "This note is currently unreachable from the Central Node under the selected traversal mode.",
      });
      return;
    }

    contentEl.createEl("p", {
      text: `${paths.length} shortest path${paths.length === 1 ? "" : "s"}${result.truncated ? " shown (output limit reached)" : " found"}.`,
    });

    const list = contentEl.createEl("ol");
    const startsAtCN = this.plugin.mocSettings.get("MOC_path_starts_at_CN");
    for (const path of paths.slice(0, 100)) {
      const item = list.createEl("li");
      const members = startsAtCN ? path.allMembers : [...path.allMembers].reverse();
      members.forEach((member, index) => {
        if (index > 0) item.appendText(" → ");
        const link = item.createEl("a", {
          text: getDisplayName(member, this.plugin.db),
          attr: { title: member },
        });
        link.addEventListener("click", (event) => {
          event.preventDefault();
          void NavigateToFile(this.plugin.app, member, event);
        });
      });
    }
    if (result.truncated || paths.length > 100) {
      contentEl.createEl("p", {
        text: result.truncated
          ? `Showing the first 100 of at most ${this.plugin.mocSettings.get("max_shortest_paths")} shortest paths.`
          : "Showing the first 100 shortest paths.",
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
