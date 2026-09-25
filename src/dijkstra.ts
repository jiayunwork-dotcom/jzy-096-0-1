import { Graph, START_STATE, incomingEdgeOf, stateFromIncomingEdge } from "./graph";
import { MinHeap } from "./priorityQueue";
import { TurnRestrictions } from "./restrictions";

export interface StateSearchResult {
  reachable: boolean;
  /** 不可达时为 null；起点即终点时为 0。 */
  distance: number | null;
  /** 依次经过的边的下标（状态路径），起点即终点时为空数组。 */
  edgePath: number[];
}

/**
 * 在「节点 + 进入边」的扩展状态空间上跑 Dijkstra。
 *
 * 为什么不能在朴素节点状态上搜：禁转 (from, via, to) 是否触发，取决于
 * 「从哪条边进入 via」。同一个节点带着不同的进入边，后续能走的边不同、
 * 累计代价也不同，必须当作不同状态。只在节点上搜会漏掉来向信息，
 * 被禁的转向照样会被走通——这正是本服务要杜绝的错误。
 *
 * 所有边权为正，Dijkstra 适用；任一 target 状态第一次出堆即为最优。
 */
export function shortestPathRespectingRestrictions(
  graph: Graph,
  restrictions: TurnRestrictions,
  source: string,
  target: string,
): StateSearchResult {
  if (source === target) {
    return { reachable: true, distance: 0, edgePath: [] };
  }

  const dist = new Map<number, number>();
  const prev = new Map<number, { state: number; viaEdge: number }>();
  const heap = new MinHeap<number>();

  dist.set(START_STATE, 0);
  heap.push(0, START_STATE);

  let bestTargetState = -1;

  while (heap.size > 0) {
    const { priority: d, value: state } = heap.pop()!;
    if (d !== dist.get(state)) continue; // 堆里的过期条目

    const node = graph.nodeOfState(state, source);
    if (node === target) {
      bestTargetState = state;
      break;
    }

    const inEdge = incomingEdgeOf(state);
    for (const edge of graph.outEdges(node)) {
      // 起点状态没有进入边，不构成任何转向，永不触发禁转
      if (inEdge >= 0 && restrictions.isBanned(inEdge, edge.index)) continue;

      const next = stateFromIncomingEdge(edge.index);
      const nd = d + edge.weight;
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        prev.set(next, { state, viaEdge: edge.index });
        heap.push(nd, next);
      }
    }
  }

  if (bestTargetState < 0) {
    return { reachable: false, distance: null, edgePath: [] };
  }

  const edgePath: number[] = [];
  let cur = bestTargetState;
  while (cur !== START_STATE) {
    const p = prev.get(cur);
    if (!p) throw new Error("broken predecessor chain"); // 不会发生，防御性检查
    edgePath.push(p.viaEdge);
    cur = p.state;
  }
  edgePath.reverse();

  return { reachable: true, distance: dist.get(bestTargetState)!, edgePath };
}

export interface NaiveSearchResult {
  reachable: boolean;
  distance: number | null;
  nodePath: string[];
}

/**
 * 朴素 Dijkstra：只看节点、完全无视禁转。
 * 用途是对照基准——「无禁转时，状态空间搜索的结果必须和它一模一样」
 * 这条不变量由测试锁死。
 */
export function naiveDijkstra(graph: Graph, source: string, target: string): NaiveSearchResult {
  if (source === target) {
    return { reachable: true, distance: 0, nodePath: [source] };
  }

  const dist = new Map<string, number>([[source, 0]]);
  const prev = new Map<string, string>();
  const heap = new MinHeap<string>();
  heap.push(0, source);

  while (heap.size > 0) {
    const { priority: d, value: node } = heap.pop()!;
    if (d !== dist.get(node)) continue;
    if (node === target) break;

    for (const edge of graph.outEdges(node)) {
      const nd = d + edge.weight;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, node);
        heap.push(nd, edge.to);
      }
    }
  }

  const distance = dist.get(target);
  if (distance === undefined) {
    return { reachable: false, distance: null, nodePath: [] };
  }

  const nodePath = [target];
  let cur = target;
  while (cur !== source) {
    cur = prev.get(cur)!;
    nodePath.push(cur);
  }
  nodePath.reverse();

  return { reachable: true, distance, nodePath };
}
