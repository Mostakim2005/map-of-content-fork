import { devLog } from "../../utils";

export type RedrawCallback = (newMaxIndent: number) => void;

export class ExpandManager {
  initialMaxIndent: number;
  redrawCallbacks: RedrawCallback[] = [];
  isManuallyExpanded = false;

  constructor(initialMaxIndent = 3) {
    this.initialMaxIndent = Math.max(0, initialMaxIndent);
    devLog(`expandManager created with depth ${this.initialMaxIndent}`);
  }

  expand(): void {
    this.initialMaxIndent += 1;
    this.isManuallyExpanded = true;
    this.rerenderDescendants(this.initialMaxIndent);
  }

  contract(): void {
    if (this.initialMaxIndent === 0) return;
    this.initialMaxIndent -= 1;
    this.rerenderDescendants(this.initialMaxIndent);
  }

  expandAll(): void {
    this.initialMaxIndent = Number.MAX_SAFE_INTEGER;
    this.isManuallyExpanded = true;
    this.rerenderDescendants(this.initialMaxIndent);
  }

  collapseAll(): void {
    this.initialMaxIndent = 0;
    this.isManuallyExpanded = true;
    this.rerenderDescendants(0);
  }

  rerenderDescendants(newMaxIndent: number): void {
    devLog(`redrawing, new maxIndent ${newMaxIndent}`);
    for (const callback of this.redrawCallbacks) callback(newMaxIndent);
  }

  registerRedrawDescendantCallback(redraw: RedrawCallback): () => void {
    this.redrawCallbacks.push(redraw);
    return () => {
      const index = this.redrawCallbacks.indexOf(redraw);
      if (index !== -1) this.redrawCallbacks.splice(index, 1);
    };
  }

  registerIndentation(indent: number): void {
    if (!this.isManuallyExpanded && indent > this.initialMaxIndent) {
      this.initialMaxIndent = indent;
    }
  }

  onManualExpand(): void {
    this.isManuallyExpanded = true;
  }
}
