<script lang="ts">
  import { LINKED_BOTH, LINKED_CN, LINKED_TO, LINKED_FROM } from "../constants";
  import type MOCView from "../view";
  import type { PathItem } from "../types";
  import { getDisplayName, NavigateToFile } from "../utils";
  import NoLinkImage from "./NoLinkImage.svelte";
  import Descendants from "./Descendants.svelte";
  import UpdateNotice from "./UpdateNotice.svelte";
  import { ExpandManager } from "./helpers/expandManager";

  export let view: MOCView;
  export let paths: PathItem[][];
  export let error: string | undefined;

  const plugin = view.plugin;
  const expandManager = new ExpandManager(plugin.settings.get("auto_expand_depth"));
  let mainDiv: HTMLDivElement;
  let searchText = "";
  let currentNoteIsPinned = view.isPinned;

  $: centralNotePath = plugin.settings.getCentralNotePath();
  $: centralNoteLabel = centralNotePath ? getDisplayName(centralNotePath, plugin.db) : "None";
  $: profileLabel = plugin.settings.get("active_profile_name");
  $: scopeLabel = plugin.settings.get("map_scope") === "local" ? `Local · ${plugin.settings.get("local_depth")}` : "Full";
  $: searchVisiblePaths = plugin.db.getSearchVisiblePaths(searchText, view.openFilePath);
  $: pathStartsAtCN = plugin.settings.get("MOC_path_starts_at_CN");
  $: displayPaths = paths.map((path) => {
    const members = path.map((item) => item[0]);
    const ordered = pathStartsAtCN ? members : [...members].reverse();
    return ordered.map((member, index) => [
      member,
      index === 0 ? LINKED_CN : plugin.db.getLinkDirection(ordered[index - 1], member),
    ] as PathItem);
  });
  $: hasSearchMatches = searchText.trim() === "" || searchVisiblePaths.has(view.openFilePath);

  function linkArrow(direction: string): string {
    if (direction === LINKED_BOTH) return "↔";
    if (direction === LINKED_TO) return "→";
    if (direction === LINKED_FROM) return "←";
    return "";
  }
</script>

<div id="all-container">
  <div id="top-bar">
    <button
      class="icon-button"
      aria-label={currentNoteIsPinned ? "Unpin current note" : "Pin current note"}
      title={currentNoteIsPinned ? "Unpin this file" : "Pin this file"}
      type="button"
      on:click={() => {
        currentNoteIsPinned = !currentNoteIsPinned;
        view.isPinned = currentNoteIsPinned;
      }}
    >
      {currentNoteIsPinned ? "📌" : "📍"}
    </button>

    <div class="context-chip" title="Current MOC scope">{scopeLabel}</div>
    {#if profileLabel}<div class="context-chip" title="Active MOC profile">{profileLabel}</div>{/if}

    <button
      id="central-node-action"
      class="action-label"
      type="button"
      title="Choose or switch the Central Node"
      on:click={(event) => plugin.openCentralNodeMenu(event)}
    >
      Central: {centralNoteLabel}
    </button>

    <button class="icon-button" type="button" title="Update Map of Content" aria-label="Update Map of Content" on:click={() => void plugin.db.update()}>
      ↻
    </button>
    <button class="icon-button" type="button" title="Show diagnostics" aria-label="Show diagnostics" on:click={() => plugin.showDiagnostics()}>
      ⓘ
    </button>
    <button class="icon-button" type="button" title="Why is this note here?" aria-label="Why is this note here" on:click={() => plugin.showWhyCurrentNote()}>
      ?
    </button>
    <button class="icon-button" type="button" title="Collapse one level" aria-label="Collapse one level" on:click={() => expandManager.contract()}>
      −
    </button>
    <button class="icon-button" type="button" title="Collapse all descendants" aria-label="Collapse all descendants" on:click={() => expandManager.collapseAll()}>
      ×
    </button>
    <button class="icon-button" type="button" title="Expand one level" aria-label="Expand one level" on:click={() => expandManager.expand()}>
      +
    </button>
    <button class="icon-button" type="button" title="Expand all descendants" aria-label="Expand all descendants" on:click={() => expandManager.expandAll()}>
      ⇱
    </button>
  </div>

  <div class="search-row">
    <input bind:value={searchText} type="search" aria-label="Search Map of Content" placeholder="Search notes in this Map of Content…" />
    {#if searchText}
      <button type="button" on:click={() => (searchText = "")}>Clear</button>
    {/if}
  </div>

  <div id="main-moc-div">
    {#if plugin.settings.get("do_show_update_notice")}
      <UpdateNotice {view} {plugin} />
    {:else if error}
      <div class="error">{@html error}</div>
    {:else if paths.length === 0}
      <div class="empty-state">
        <p>This note doesn't currently have a shortest path to the Central Node.</p>
        <button type="button" on:click={() => plugin.chooseCentralNote()}>Choose Central Node</button>
        <button type="button" on:click={() => void plugin.useCurrentNoteAsCentralNote()}>Use current note</button>
        <NoLinkImage />
      </div>
    {:else}
      {#if plugin.settings.get("do_show_paths_to_note")}
        <section aria-label="Shortest paths">
          <h4>Shortest path{paths.length === 1 ? "" : "s"}</h4>
          {#if view.pathsTruncated}
            <p class="path-limit" role="status">Showing the first {plugin.settings.get("max_shortest_paths")} shortest paths to keep this view responsive.</p>
          {/if}
          {#each displayPaths as path}
            <div class="path">
              {#each path as pathitem, i}
                {#if i > 0}<span class="path-arrow" aria-hidden="true">{linkArrow(pathitem[1])}</span>{/if}
                {#if (pathStartsAtCN && i === path.length - 1) || (!pathStartsAtCN && i === 0)}
                  <span title={pathitem[0]}>{getDisplayName(pathitem[0], plugin.db)}</span>
                {:else}
                  <a class="link" title={pathitem[0]} on:click={(event) => void NavigateToFile(plugin.app, pathitem[0], event)}>{getDisplayName(pathitem[0], plugin.db)}</a>
                {/if}
              {/each}
            </div>
          {/each}
        </section>
      {/if}

      {#if searchText && !hasSearchMatches}
        <p class="empty-search">No matching notes.</p>
      {:else}
        <section aria-label="Descendants">
          <Descendants
            db={plugin.db}
            app={plugin.app}
            {view}
            notePath={view.openFilePath}
            indentation={0}
            {expandManager}
            filterText={searchText}
            visiblePaths={searchVisiblePaths}
          />
        </section>
      {/if}
    {/if}
  </div>
</div>

<style>
  #all-container { display: flex; flex-direction: column; height: 100%; padding: 0.35rem; box-sizing: border-box; }
  #top-bar { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; min-height: 36px; margin-bottom: 0.55rem; }
  .icon-button, .action-label { cursor: pointer; border-radius: 8px; transition: background 120ms ease, transform 120ms ease; }
  .icon-button { min-width: 32px; min-height: 32px; padding: 0.2rem 0.45rem; }
  .icon-button:hover, .action-label:hover { background: var(--background-modifier-hover); }
  .icon-button:active, .action-label:active { transform: translateY(1px); }
  .action-label { flex: 1 1 180px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
  .context-chip { border: 1px solid var(--background-modifier-border); border-radius: 999px; padding: 0.18rem 0.48rem; font-size: 0.72rem; color: var(--text-muted); background: var(--background-secondary); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-row { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
  .search-row input { min-width: 0; flex: 1; }
  #main-moc-div { overflow: auto; flex: 1; }
  .path { margin: 0.25rem 0; overflow-wrap: anywhere; }
  .path-limit { margin: 0.5rem 0; opacity: 0.75; }
  .path-arrow { margin: 0 0.35rem; opacity: 0.7; }
  .link { cursor: pointer; }
  .empty-state { text-align: center; padding: 1rem; }
  .empty-state button { margin: 0.25rem; }
  .empty-search, .error { padding: 1rem; }
  h4 { margin-bottom: 0.35rem; }
</style>
