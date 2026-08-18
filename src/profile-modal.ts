import { Modal, Setting } from "obsidian";
import type MOCPlugin from "./main";

export default class ProfileModal extends Modal {
  private plugin: MOCPlugin;
  private mode: "save" | "choose";
  private value = "";
  private onSaved?: () => void;

  constructor(plugin: MOCPlugin, mode: "save" | "choose", onSaved?: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.mode = mode;
    this.onSaved = onSaved;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.mode === "save" ? "Save MOC profile" : "Choose MOC profile" });
    if (this.mode === "save") {
      new Setting(contentEl)
        .setName("Profile name")
        .addText((text) => {
          text.setPlaceholder("e.g. Electrical Engineering");
          text.onChange((value) => (this.value = value));
          text.inputEl.focus();
        });
      new Setting(contentEl).addButton((button) =>
        button.setButtonText("Save").setCta().onClick(() => {
          void this.save();
        })
      );
    } else {
      const profiles = this.plugin.settings.get("moc_profiles");
      if (!profiles.length) {
        contentEl.createEl("p", { text: "No saved profiles yet." });
        return;
      }
      for (const profile of profiles) {
        new Setting(contentEl)
          .setName(profile.name)
          .setDesc(`${profile.centralNotePath} · ${profile.centralNoteMode}`)
          .addButton((button) => button.setButtonText("Use").onClick(() => void this.apply(profile.name)))
          .addExtraButton((button) => button.setIcon("trash").setTooltip("Delete profile").onClick(() => void this.remove(profile.name)));
      }
    }
  }

  private async save(): Promise<void> {
    if (!(await this.plugin.settings.saveCurrentProfile(this.value))) return;
    this.plugin.rerender();
    this.onSaved?.();
    this.close();
  }

  private async apply(name: string): Promise<void> {
    if (!(await this.plugin.settings.applyProfile(name))) {
      this.close();
      return;
    }
    this.plugin.rerender();
    this.close();
  }

  private async remove(name: string): Promise<void> {
    await this.plugin.settings.removeProfile(name);
    this.onOpen();
  }
}
