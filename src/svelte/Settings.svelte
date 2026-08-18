<script lang="ts">
  import { App, Notice } from "obsidian";
  import type MOCPlugin from "../main";
  import type { CentralNoteMode } from "../types";
  import ExcludedFolders from "./settings/ExcludedFolders.svelte";
  import ExcludedFilenames from "./settings/ExcludedFilenames.svelte";
  import { getFileNameFromPath } from "../utils";
  import ProfileModal from "../profile-modal";
  import type { SortMode } from "../types";

  export let app: App;
  export let plugin: MOCPlugin;

  let cnPathInputValue = plugin.mocSettings.get("CN_path");
  let centralMode: CentralNoteMode = plugin.mocSettings.get("central_note_mode");
  let centralPresets = [...plugin.mocSettings.get("central_note_presets")];
  let autoExpandDepth = plugin.mocSettings.get("auto_expand_depth");
  let traversalMode = plugin.mocSettings.get("link_traversal_mode");
  let maxShortestPaths = plugin.mocSettings.get("max_shortest_paths");
  let showPaths = plugin.mocSettings.get("do_show_paths_to_note");
  let pathStartsAtCN = plugin.mocSettings.get("MOC_path_starts_at_CN");
  let rememberExpanded = plugin.mocSettings.get("do_remember_expanded");
  let autoUpdate = plugin.mocSettings.get("auto_update_on_file_change");
  let sortMode: SortMode = plugin.mocSettings.get("sort_mode");
  let tagFilter = plugin.mocSettings.get("enable_tag_filter");
  let smartSort = plugin.mocSettings.get("enable_smart_sort");
  let includedTags = plugin.mocSettings.get("included_tags").join(", ");
  let excludedTags = plugin.mocSettings.get("excluded_tags").join(", ");
  let profiles = [...plugin.mocSettings.get("moc_profiles")];
  let mapScope = plugin.mocSettings.get("map_scope");
  let localDepth = plugin.mocSettings.get("local_depth");
  let excludeGenerated = plugin.mocSettings.get("exclude_generated_moc_notes");

  const refresh = () => {
    centralPresets = [...plugin.mocSettings.get("central_note_presets")];
    profiles = [...plugin.mocSettings.get("moc_profiles")];
  };

  const updateCNPath = async () => {
    const path = cnPathInputValue.trim();
    if (!path || !(await plugin.mocSettings.setFixedCentralNote(path, true))) {
      new Notice("Choose a valid non-excluded Markdown note.");
      return;
    }
    centralMode = "fixed";
    cnPathInputValue = path;
    refresh();
  };

  const setCentralMode = async (mode: CentralNoteMode) => {
    const ok = mode === "current"
      ? await plugin.mocSettings.useCurrentNoteAsCentralNote()
      : mode === "automatic"
        ? (await plugin.mocSettings.set({ central_note_mode: "automatic" }), true)
        : await plugin.mocSettings.useFixedCentralNote();
    if (!ok) {
      centralMode = plugin.mocSettings.get("central_note_mode");
      new Notice(mode === "current" ? "Open a non-excluded Markdown note first." : "Choose a valid fixed Central Node first.");
      return;
    }
    centralMode = mode;
  };

  const addCurrentAsFavorite = async () => {
    const file = app.workspace.getActiveFile();
    if (!file || file.extension !== "md" || plugin.mocSettings.isExcludedFile(file)) {
      new Notice("Open a non-excluded Markdown note first.");
      return;
    }
    await plugin.mocSettings.addCentralNotePreset(file.path);
    refresh();
  };

  const removeFavorite = async (path: string) => {
    await plugin.mocSettings.removeCentralNotePreset(path);
    refresh();
  };

  const useFavorite = async (path: string) => {
    if (await plugin.mocSettings.setFixedCentralNote(path, false)) {
      centralMode = "fixed";
      cnPathInputValue = path;
    } else {
      await removeFavorite(path);
      new Notice("That favorite no longer exists and was removed.");
    }
  };

  const saveBoolean = async (key: "do_show_paths_to_note" | "MOC_path_starts_at_CN" | "do_remember_expanded" | "auto_update_on_file_change", value: boolean) => {
    await plugin.mocSettings.set({ [key]: value });
  };

  const saveTags = async () => {
    const parse = (value: string) => Array.from(new Set(value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean)));
    await plugin.mocSettings.set({ included_tags: parse(includedTags), excluded_tags: parse(excludedTags) });
    includedTags = plugin.mocSettings.get("included_tags").join(", ");
    excludedTags = plugin.mocSettings.get("excluded_tags").join(", ");
  };
</script>

<div id="settings-container">
  <div class="hero">
    <div>
      <h1>Map of Content</h1>
      <p>Keep the core MOC simple. Enable only the perspectives and tools you actually use.</p>
    </div>
  </div>

  <div class="section-card">
    <h2>Central Node</h2>
    <p class="muted">Choose one stable perspective, follow the current note, or let the plugin pick the nearest saved topic.</p>
    <label for="central-node-mode">Mode</label>
    <select id="central-node-mode" bind:value={centralMode} on:change={() => void setCentralMode(centralMode)}>
      <option value="fixed">Fixed Central Node</option>
      <option value="current">Current Note</option>
      <option value="automatic">Automatic from favorites</option>
    </select>

    {#if centralMode === "fixed"}
      <div class="row">
        <input class="grow" id="CN-select" bind:value={cnPathInputValue} type="text" placeholder="Vault/path/to/note.md" />
        <button type="button" on:click={updateCNPath}>Save</button>
      </div>
    {/if}
    <div class="row">
      <button type="button" on:click={() => plugin.chooseCentralNote()}>Choose note…</button>
      <button type="button" on:click={addCurrentAsFavorite}>Add current to favorites</button>
    </div>

    {#if centralPresets.length > 0}
      <h3>Favorites</h3>
      <ul class="favorites">
        {#each centralPresets as preset}
          <li>
            <span title={preset}>{getFileNameFromPath(preset)}</span>
            <button type="button" on:click={() => void useFavorite(preset)}>Use</button>
            <button type="button" class="quiet" on:click={() => void removeFavorite(preset)}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="row profile-actions">
      <button type="button" on:click={() => new ProfileModal(plugin, "save", refresh).open()}>Save current profile</button>
      <button type="button" on:click={() => new ProfileModal(plugin, "choose", refresh).open()} disabled={profiles.length === 0}>Choose profile</button>
    </div>
  </div>

  <div class="section-card">
    <h2>Graph perspective</h2>
    <div class="grid">
      <label>Map scope
        <select bind:value={mapScope} on:change={() => void plugin.mocSettings.set({ map_scope: mapScope })}>
          <option value="full">Full reachable MOC</option>
          <option value="local">Local neighborhood</option>
        </select>
      </label>
      <label>Local depth
        <input type="number" min="1" max="50" bind:value={localDepth} disabled={mapScope !== "local"} on:change={() => void plugin.mocSettings.set({ local_depth: Number(localDepth) })} />
      </label>
      <label>Link traversal
        <select bind:value={traversalMode} on:change={() => void plugin.mocSettings.set({ link_traversal_mode: traversalMode })}>
          <option value="both">Both directions</option>
          <option value="outgoing">Outgoing links only</option>
          <option value="incoming">Incoming links only</option>
        </select>
      </label>
      <label>Sort descendants
        <select bind:value={sortMode} on:change={() => void plugin.mocSettings.set({ sort_mode: sortMode })}>
          <option value="alpha">Alphabetical</option>
          <option value="links">Most connected</option>
          <option value="modified">Recently modified</option>
          <option value="path">Full path</option>
        </select>
      </label>
      <label>Automatic expansion depth
        <input type="number" min="0" max="50" bind:value={autoExpandDepth} on:change={() => void plugin.mocSettings.set({ auto_expand_depth: Number(autoExpandDepth) })} />
      </label>
      <label>Maximum shortest paths
        <input type="number" min="1" max="5000" bind:value={maxShortestPaths} on:change={() => void plugin.mocSettings.set({ max_shortest_paths: Number(maxShortestPaths) })} />
      </label>
    </div>
    <label class="toggle"><input type="checkbox" bind:checked={smartSort} on:change={() => void plugin.mocSettings.set({ enable_smart_sort: smartSort })} /> Smart-sort connected notes to the top</label>
    <p class="muted">Local neighborhood is an optional compact view around the active Central Node. It does not modify notes or links.</p>
    <label class="toggle"><input type="checkbox" bind:checked={excludeGenerated} on:change={() => void plugin.mocSettings.set({ exclude_generated_moc_notes: excludeGenerated })} /> Keep generated MOC notes out of the graph</label>
    <p class="muted">Smart sorting is optional and only changes ordering; it never changes the underlying graph.</p>
  </div>

  <div class="section-card">
    <h2>Optional tag perspective</h2>
    <label class="toggle"><input type="checkbox" bind:checked={tagFilter} on:change={() => void plugin.mocSettings.set({ enable_tag_filter: tagFilter })} /> Enable tag filtering</label>
    {#if tagFilter}
      <div class="grid">
        <label>Include tags
          <input bind:value={includedTags} placeholder="#physics, #engineering" on:change={() => void saveTags()} />
        </label>
        <label>Exclude tags
          <input bind:value={excludedTags} placeholder="#archive, #private" on:change={() => void saveTags()} />
        </label>
      </div>
      <p class="muted">Filtering changes the graph perspective, not your notes or links. The active Central Node is always retained.</p>
    {/if}
  </div>

  <div class="section-card">
    <h2>Display and updates</h2>
    <label class="toggle"><input type="checkbox" bind:checked={autoUpdate} on:change={() => void saveBoolean("auto_update_on_file_change", autoUpdate)} /> Update when notes change</label>
    <label class="toggle"><input type="checkbox" bind:checked={showPaths} on:change={() => void saveBoolean("do_show_paths_to_note", showPaths)} /> Show shortest paths to the current note</label>
    <label class="toggle"><input type="checkbox" bind:checked={pathStartsAtCN} on:change={() => void saveBoolean("MOC_path_starts_at_CN", pathStartsAtCN)} /> Display paths from the Central Node</label>
    <label class="toggle"><input type="checkbox" bind:checked={rememberExpanded} on:change={() => void saveBoolean("do_remember_expanded", rememberExpanded)} /> Remember expanded/collapsed descendants</label>
  </div>

  <div class="section-card compact">
    <h2>Vault boundaries</h2>
    <ExcludedFolders {app} {plugin} />
    <ExcludedFilenames {app} {plugin} />
  </div>

  <div class="hint">
    <strong>Quick controls</strong>
    <span>Central Node, diagnostics, path explanation, sorting, tag filtering, profiles, and MOC-note generation are also available from commands or the MOC toolbar.</span>
  </div>
</div>

<style>
  #settings-container { max-width: 880px; padding: 0.25rem 0.25rem 2rem; }
  .hero { padding: 0.25rem 0 1rem; }
  h1 { margin: 0 0 0.25rem; font-size: 1.6rem; letter-spacing: -0.02em; }
  h2 { margin: 0 0 0.6rem; font-size: 1.05rem; }
  h3 { margin: 1rem 0 0.5rem; font-size: 0.9rem; }
  .section-card { border: 1px solid var(--background-modifier-border); background: var(--background-primary-alt); border-radius: 12px; padding: 1rem; margin: 0 0 0.8rem; }
  .compact { padding-bottom: 0.4rem; }
  .row, .profile-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.65rem 0; }
  .grow { flex: 1 1 260px; min-width: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.75rem; }
  label { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.6rem 0; font-weight: 500; }
  .toggle { display: block; font-weight: 400; }
  .toggle input { margin-right: 0.4rem; }
  select, input { min-width: 0; }
  .favorites { margin: 0; padding-left: 0; list-style: none; }
  .favorites li { display: flex; align-items: center; gap: 0.5rem; border-top: 1px solid var(--background-modifier-border); padding: 0.55rem 0; }
  .favorites span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .quiet { opacity: 0.75; }
  .muted { opacity: 0.72; }
  .hint { display: flex; gap: 0.55rem; align-items: flex-start; padding: 0.8rem 0.9rem; border-radius: 10px; background: var(--background-secondary); color: var(--text-muted); }
  @media (max-width: 520px) { .section-card { border-radius: 10px; padding: 0.8rem; } .profile-actions button { flex: 1 1 100%; } }
</style>
