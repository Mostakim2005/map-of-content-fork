import type { LINKED_BOTH, LINKED_CN, LINKED_FROM, LINKED_TO } from "./constants";

export type LinkDirection =
  | typeof LINKED_TO
  | typeof LINKED_FROM
  | typeof LINKED_BOTH
  | typeof LINKED_CN;

export interface FileItem {
  path: string;
  extension: string;
  linksTo: Set<string>;
  linkedFrom: Set<string>;
  distanceFromCn: number | null;
}

export interface DB {
  [index: string]: FileItem;
}

export type PathItem = [string, LinkDirection];

export interface Path {
  items: PathItem[];
  allMembers: string[];
}

export type LinkTraversalMode = "both" | "outgoing" | "incoming";
export type SortMode = "alpha" | "links" | "modified" | "path";
export type CentralNoteMode = "fixed" | "current" | "automatic";

export interface MOCProfile {
  name: string;
  centralNotePath: string;
  centralNoteMode: CentralNoteMode;
  linkTraversalMode: LinkTraversalMode;
  autoExpandDepth: number;
  sortMode: SortMode;
  includedTags: string[];
  excludedTags: string[];
  enableTagFilter: boolean;
  enableSmartSort: boolean;
  mapScope: "full" | "local";
  localDepth: number;
  maxShortestPaths: number;
}

export interface LinkCacheEntry {
  mtime: number;
  size: number;
  links: string[];
  brokenCount: number;
}

export interface PathSearchResult {
  paths: Path[];
  truncated: boolean;
}

export interface MOCDiagnostics {
  totalIncludedFiles: number;
  reachableFiles: number;
  unreachableFiles: number;
  orphanFiles: number;
  brokenLinks: number;
  linkCount: number;
  cachedNotes: number;
  lastUpdateMs: number;
  lastPathCount: number;
  lastPathSearchTruncated: boolean;
  centralNotePath?: string;
  mapScope: "full" | "local";
  localDepth?: number;
  traversalMode: LinkTraversalMode;
}
