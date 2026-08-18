export type TraversalMode = "both" | "outgoing" | "incoming";

export interface ShortestPathGraph {
  distances: Map<string, number>;
  parents: Map<string, Set<string>>;
  children: Map<string, Set<string>>;
}

export function isPathWithinFolder(filePath: string, folderPath: string): boolean {
  const folder = folderPath.replace(/\/+$/, "");
  return Boolean(folder) && (filePath === folder || filePath.startsWith(`${folder}/`));
}

export function buildShortestPathGraph(
  central: string,
  neighbours: (node: string) => Iterable<string>,
  maxDepth = Number.POSITIVE_INFINITY,
): ShortestPathGraph {
  const distances = new Map<string, number>([[central, 0]]);
  const parents = new Map<string, Set<string>>([[central, new Set<string>()]]);
  const children = new Map<string, Set<string>>();
  const queue = [central];
  let index = 0;

  while (index < queue.length) {
    const node = queue[index++];
    const distance = distances.get(node) ?? 0;
    if (distance >= maxDepth) continue;

    for (const next of neighbours(node)) {
      if (next === node) continue;
      const nextDistance = distance + 1;
      const existing = distances.get(next);
      if (existing === undefined) {
        distances.set(next, nextDistance);
        parents.set(next, new Set([node]));
        const set = children.get(node) ?? new Set<string>();
        set.add(next);
        children.set(node, set);
        queue.push(next);
      } else if (existing === nextDistance) {
        parents.get(next)?.add(node);
        const set = children.get(node) ?? new Set<string>();
        set.add(next);
        children.set(node, set);
      }
    }
  }

  return { distances, parents, children };
}

export function enumerateShortestPaths(
  central: string,
  target: string,
  parents: Map<string, Set<string>>,
  maxPaths: number,
): { paths: string[][]; truncated: boolean } {
  if (central === target) return { paths: [[central]], truncated: false };
  if (!parents.has(target)) return { paths: [], truncated: false };

  const paths: string[][] = [];
  const current = [target];
  const stack: Array<{ node: string; parents: string[]; index: number }> = [
    { node: target, parents: [...(parents.get(target) ?? [])], index: 0 },
  ];

  while (stack.length && paths.length < maxPaths) {
    const frame = stack[stack.length - 1];
    if (frame.node === central) {
      paths.push([...current].reverse());
      stack.pop();
      current.pop();
      continue;
    }
    if (frame.index >= frame.parents.length) {
      stack.pop();
      current.pop();
      continue;
    }
    const parent = frame.parents[frame.index++];
    current.push(parent);
    stack.push({ node: parent, parents: [...(parents.get(parent) ?? [])], index: 0 });
  }

  return {
    paths,
    truncated: paths.length >= maxPaths && stack.length > 0,
  };
}

export interface CentralNodeCandidate {
  path: string;
  directOutgoing: boolean;
  directIncoming: boolean;
  degree: number;
}

export function chooseAutomaticCentralNode(
  activePath: string,
  candidates: CentralNodeCandidate[],
): string {
  let bestPath = activePath;
  let bestScore = -1;
  for (const candidate of candidates) {
    let score = 0;
    if (candidate.directOutgoing || candidate.directIncoming) score += 3;
    if (candidate.directOutgoing && candidate.directIncoming) score += 1;
    score += Math.min(candidate.degree, 20) / 100;
    if (score > bestScore) {
      bestScore = score;
      bestPath = candidate.path;
    }
  }
  return bestPath;
}
