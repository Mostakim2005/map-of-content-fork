<script lang="ts">
  import type MOCPlugin from "../main";
  import type MOCView from "../view";

  export let view: MOCView;
  export let plugin: MOCPlugin;

  async function dismiss(): Promise<void> {
    await plugin.settings.set({ do_show_update_notice: false });
    view.rerender();
  }
</script>

<div class="update-notice">
  <h3>This plugin has been updated</h3>
  <p>
    Map of Content now includes stronger graph/update handling, configurable path limits,
    safer settings and lifecycle management, quicker Central Node switching, diagnostics,
    search, and improved large-vault behavior.
  </p>
  <button type="button" on:click={() => void dismiss()}>Okay</button>
</div>

<style>
  .update-notice { padding: 1rem; text-align: center; }
</style>
