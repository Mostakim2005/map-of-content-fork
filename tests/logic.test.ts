import {
  buildShortestPathGraph,
  chooseAutomaticCentralNode,
  enumerateShortestPaths,
  isPathWithinFolder,
} from "../src/core/logic";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertArrayEqual(actual: string[], expected: string[], message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assert(isPathWithinFolder("Projects/Note.md", "Projects"), "folder boundary should match");
assert(!isPathWithinFolder("ProjectsOld/Note.md", "Projects"), "folder prefix should not match sibling folder");

const edges = new Map<string, string[]>([
  ["A", ["B", "C"]],
  ["B", ["D"]],
  ["C", ["D"]],
  ["D", ["E"]],
  ["E", []],
]);
const graph = buildShortestPathGraph("A", (node) => edges.get(node) ?? []);
assertArrayEqual([...graph.parents.get("D") ?? []].sort(), ["B", "C"], "equal-shortest parents should be preserved");
assertEqual(graph.distances.get("E"), 3, "shortest distance should be correct");

const branchEdges = new Map<string, string[]>([
  ["A", ["B", "C", "D"]],
  ["B", ["E"]],
  ["C", ["E"]],
  ["D", ["E"]],
  ["E", []],
]);
const branchGraph = buildShortestPathGraph("A", (node) => branchEdges.get(node) ?? []);
const limited = enumerateShortestPaths("A", "E", branchGraph.parents, 2);
assertEqual(limited.paths.length, 2, "path limit should cap generated paths");
assertEqual(limited.truncated, true, "path limit should report truncation");

const automatic = chooseAutomaticCentralNode("Current.md", [
  { path: "Far.md", directOutgoing: false, directIncoming: false, degree: 100 },
  { path: "Topic.md", directOutgoing: true, directIncoming: false, degree: 2 },
]);
assertEqual(automatic, "Topic.md", "automatic Central Node should prefer a directly connected favorite");

console.log("All Map of Content regression tests passed.");
