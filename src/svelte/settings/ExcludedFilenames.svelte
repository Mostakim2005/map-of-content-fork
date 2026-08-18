<script lang="ts">
  import type { App } from "obsidian";
  import type MOCPlugin from "../../main";

  export let app: App;
  export let plugin: MOCPlugin;

  let excludedPhrases = [...plugin.mocSettings.get("exluded_filename_components")];
  let input = "";
  let showAllHidden = false;

  $: allFiles = app.vault.getFiles();
  $: excludedFiles = allFiles.filter((file) => {
    const filename = `${file.basename}.${file.extension}`;
    return excludedPhrases.some((phrase) => phrase && filename.includes(phrase));
  });

  async function addValue() {
    const value = input.trim();
    if (!value || excludedPhrases.includes(value)) return;
    excludedPhrases = [...excludedPhrases, value];
    input = "";
    await plugin.mocSettings.set({ exluded_filename_components: excludedPhrases });
  }

  async function deleteSelected(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const selected = Array.from(select.selectedOptions).map((option) => option.value);
    if (!selected.length) return;
    excludedPhrases = excludedPhrases.filter((phrase) => !selected.includes(phrase));
    await plugin.mocSettings.set({ exluded_filename_components: excludedPhrases });
  }
</script>

<h2>Excluded filenames</h2>
<p>Files whose filename (including extension) contains one of these phrases are excluded.</p>
<div class="controls">
  <input bind:value={input} placeholder="Filename phrase" on:keydown={(event) => event.key === "Enter" && void addValue()} />
  <button type="button" on:click={() => void addValue()}>Add</button>
</div>
<select multiple size="5" aria-label="Excluded filename phrases" on:change={deleteSelected}>
  {#each excludedPhrases as phrase}<option value={phrase}>{phrase}</option>{/each}
</select>
<p>Currently excluded files: {excludedFiles.length}</p>
<button type="button" on:click={() => (showAllHidden = !showAllHidden)}>{showAllHidden ? "Hide" : "Show"} excluded files</button>
{#if showAllHidden}
  <ul>{#each excludedFiles as file}<li>{file.path}</li>{/each}</ul>
{/if}

<style>
  .controls { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .controls input { flex: 1 1 240px; min-width: 0; }
  select { max-width: 100%; width: 420px; }
  ul { max-height: 240px; overflow: auto; }
</style>
