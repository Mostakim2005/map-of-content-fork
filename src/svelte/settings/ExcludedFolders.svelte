<script lang="ts">
  import type { App } from "obsidian";
  import type MOCPlugin from "../../main";
  import { GetAllFolders } from "../../utils";

  export let app: App;
  export let plugin: MOCPlugin;

  let excludedFolders = [...plugin.settings.get("exluded_folders")];
  let input = "";
  let showAllHidden = false;
  const allFolders = GetAllFolders(app);

  $: excludedFiles = app.vault.getFiles().filter((file) =>
    excludedFolders.some((path) => file.path === path || file.path.startsWith(`${path}/`))
  );

  async function addValue() {
    const value = input.trim().replace(/\/+$/, "");
    if (!value) return;
    if (!allFolders.includes(value)) return;
    if (!excludedFolders.includes(value)) {
      excludedFolders = [...excludedFolders, value];
      await plugin.settings.set({ exluded_folders: excludedFolders });
    }
    input = "";
  }

  async function deleteSelected(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const selected = Array.from(select.selectedOptions).map((option) => option.value);
    if (!selected.length) return;
    excludedFolders = excludedFolders.filter((folder) => !selected.includes(folder));
    await plugin.settings.set({ exluded_folders: excludedFolders });
  }
</script>

<h2>Excluded folders</h2>
<div class="controls">
  <input bind:value={input} list="exclude-folder-options" placeholder="Folder path" />
  <datalist id="exclude-folder-options">
    {#each allFolders as folder}<option value={folder} />{/each}
  </datalist>
  <button type="button" on:click={() => void addValue()}>Add</button>
</div>
<select multiple size="5" aria-label="Excluded folders" on:change={deleteSelected}>
  {#each excludedFolders as folder}<option value={folder}>{folder}</option>{/each}
</select>
<p>Currently excluded files: {excludedFiles.length}</p>
<button type="button" on:click={() => (showAllHidden = !showAllHidden)}>{showAllHidden ? "Hide" : "Show"} excluded files</button>
{#if showAllHidden}
  <ul>{#each excludedFiles as file}<li>{file.path}</li>{/each}</ul>
{/if}

<style>
  .controls { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .controls input { flex: 1 1 240px; min-width: 0; }
  select { max-width: 100%; width: 420px; }
  ul { max-height: 240px; overflow: auto; }
</style>
