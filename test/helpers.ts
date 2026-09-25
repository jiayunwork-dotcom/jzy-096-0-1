import { Graph, GraphInput } from "../src/graph";
import { TurnRestriction, TurnRestrictions } from "../src/restrictions";
import { shortestPathRespectingRestrictions } from "../src/dijkstra";
import { expandNodePath } from "../src/path";

/** 确定性伪随机数（LCG），让随机图测试可复现。 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * 生成随机强连通有向图：先铺一个随机有向环保证强连通，再加随机边。
 * 边权为 1..maxWeight 的整数（整数便于精确比较距离）。
 */
export function randomConnectedGraph(
  rng: () => number,
  nodeCount: number,
  extraEdgeCount: number,
  maxWeight: number,
): GraphInput {
  const nodes = Array.from({ length: nodeCount }, (_, i) => `n${i}`);
  const edges: GraphInput["edges"] = [];
  const used = new Set<string>();

  const tryAdd = (from: string, to: string): void => {
    const key = from + "\u0001" + to;
    if (from === to || used.has(key)) return;
    used.add(key);
    edges.push({ from, to, weight: randInt(rng, 1, maxWeight) });
  };

  // 随机排列连成有向环 → 强连通
  const perm = [...nodes];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [perm[i], perm[j]] = [perm[j]!, perm[i]!];
  }
  for (let i = 0; i < perm.length; i++) {
    tryAdd(perm[i]!, perm[(i + 1) % perm.length]!);
  }

  for (let k = 0; k < extraEdgeCount; k++) {
    tryAdd(nodes[randInt(rng, 0, nodeCount - 1)]!, nodes[randInt(rng, 0, nodeCount - 1)]!);
  }

  return { nodes, edges };
}

export interface EngineOutcome {
  reachable: boolean;
  distance: number | null;
  nodePath: string[];
}

/** 走一遍完整管线：建图 → 状态空间搜索 → 展开节点序列。 */
export function runEngine(
  input: GraphInput,
  source: string,
  target: string,
  restrictions: TurnRestriction[] = [],
): EngineOutcome {
  const graph = new Graph(input);
  const result = shortestPathRespectingRestrictions(
    graph,
    TurnRestrictions.build(graph, restrictions),
    source,
    target,
  );
  return {
    reachable: result.reachable,
    distance: result.distance,
    nodePath: result.reachable ? expandNodePath(graph, source, result.edgePath) : [],
  };
}

/** 校验节点序列确实是一条合法路径，并返回其总权值。 */
export function pathWeight(graph: Graph, nodePath: string[]): number {
  let total = 0;
  for (let i = 0; i + 1 < nodePath.length; i++) {
    const edge = graph.edgeBetween(nodePath[i]!, nodePath[i + 1]!);
    if (!edge) throw new Error(`path uses missing edge ${nodePath[i]}->${nodePath[i + 1]}`);
    total += edge.weight;
  }
  return total;
}

/** 检查节点序列里没有出现任何被禁的转向。 */
export function respectsRestrictions(nodePath: string[], restrictions: TurnRestriction[]): boolean {
  const banned = new Set(restrictions.map((r) => `${r.from}\u0001${r.via}\u0001${r.to}`));
  for (let i = 0; i + 2 < nodePath.length; i++) {
    if (banned.has(`${nodePath[i]}\u0001${nodePath[i + 1]}\u0001${nodePath[i + 2]}`)) return false;
  }
  return true;
}

/** 距离比较用的数值化：不可达视为 Infinity。 */
export function distOrInf(outcome: { reachable: boolean; distance: number | null }): number {
  return outcome.reachable ? outcome.distance! : Infinity;
}
