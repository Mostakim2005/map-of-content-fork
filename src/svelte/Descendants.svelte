<script lang="ts">
  import { onDestroy } from "svelte";
  import type { App } from "obsidian";
  import type { DBManager } from "../db";
  import type MOCView from "../view";
  import { getDisplayName, NavigateToFile } from "../utils";
  import type { ExpandManager } from "./helpers/expandManager";

  export let notePath: string;
  export let db: DBManager;
  export let indentation: number;
  export let view: MOCView;
  export let app: App;
  export let expandManager: ExpandManager;
  export let filterText = "";
  export let visiblePaths: Set<string> = new Set();

  $: children = db.getSortedDescendants(notePath);
  $: normalizedFilter = filterText.trim().toLowerCase();
  $: currentMatches = normalizedFilter === "" || visiblePaths.has(notePath);
  $: isExpanded = normalizedFilter !== "" ? true : initialExpanded();

  function initialExpanded(): boolean {
    if (indentation === 0) return true;
    if (!view.plugin.mocSettings.isExpanded(notePath)) return false;
    return indentation < expandManager.initialMaxIndent;
  }

  const unregisterRedraw = expandManager.registerRedrawDescendantCallback((maxIndent) => {
    if (indentation === 0) isExpanded = true;
    else if (normalizedFilter !== "") isExpanded = true;
    else isExpanded = view.plugin.mocSettings.isExpanded(notePath) && indentation < maxIndent;
  });

  onDestroy(unregisterRedraw);

  function toggleExpanded(): void {
    if (normalizedFilter !== "") return;
    isExpanded = !isExpanded;
    void view.plugin.mocSettings.setExpanded(notePath, isExpanded);
    if (isExpanded) {
      expandManager.onManualExpand();
    }
  }
</script>

{#if currentMatches && (indentation === 0 || children.length > 0)}
  <div class="moc-tree-node" class:is-root={indentation === 0}>
    <div class="tree-row">
      {#if indentation > 0 && children.length > 0}
        <button
          class="expand-button"
          type="button"
          aria-label={isExpanded ? "Collapse descendants" : "Expand descendants"}
          on:click={toggleExpanded}
        >
          {isExpanded ? "▾" : "▸"}
        </button>
      {:else if indentation > 0}
        <span class="expand-spacer"></span>
      {/if}

      {#if indentation === 0}
        <strong title={notePath}>{getDisplayName(notePath, db)}</strong>
      {:else}
        <a class="link" href={encodeURI(notePath)} title={notePath} on:click|preventDefault={(event) => void NavigateToFile(app, notePath, event)}>
          {getDisplayName(notePath, db)}
        </a>
      {/if}
    </div>

    {#if children.length > 0 && isExpanded}
      <div class="children">
        {#each children as child}
          <svelte:self
            {db}
            {app}
            {view}
            {expandManager}
            {filterText}
            {visiblePaths}
            notePath={child}
            indentation={indentation + 1}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .moc-tree-node { margin: 0; }
  .tree-row { display: flex; align-items: center; min-height: 28px; overflow-wrap: anywhere; }
  .tree-row + .children { margin-left: 1rem; }
  .expand-button { width: 28px; height: 28px; padding: 0; }
  .expand-spacer { width: 28px; flex: 0 0 28px; }
  .children { border-left: 1px solid var(--background-modifier-border); padding-left: 0.5rem; }
  .link { cursor: pointer; }
  .is-root > .tree-row { font-weight: 600; }
</style>
