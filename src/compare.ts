import { Graph } from "./graph";
import { shortestPathRespectingRestrictions } from "./dijkstra";
import { expandNodePath } from "./path";
import { TurnRestriction, TurnRestrictions } from "./restrictions";

export interface ScenarioOutcome {
  reachable: boolean;
  distance: number | null;
  path: string[];
}

export interface CompareOutcome {
  withRestrictions: ScenarioOutcome;
  withoutRestrictions: ScenarioOutcome;
  /** 禁转带来的绕行代价 = 开启 - 关闭；任一情形不可达时为 null。 */
  delta: number | null;
}

/** 在同一图上按给定禁转集合跑一次最短路，并展开成节点序列。 */
export function runScenario(
  graph: Graph,
  source: string,
  target: string,
  restrictions: TurnRestrictions,
): ScenarioOutcome {
  const result = shortestPathRespectingRestrictions(graph, restrictions, source, target);
  return {
    reachable: result.reachable,
    distance: result.distance,
    path: result.reachable ? expandNodePath(graph, source, result.edgePath) : [],
  };
}

/**
 * 两情形对比：同一图、同一起终点，分别计算「开启这组禁转」与
 * 「完全关闭禁转」的最短路，返回两个长度及差值，
 * 让调度员一眼看清这组禁转规则的绕行代价。
 */
export function compareRestrictionImpact(
  graph: Graph,
  source: string,
  target: string,
  restrictions: readonly TurnRestriction[],
): CompareOutcome {
  const withRestrictions = runScenario(graph, source, target, TurnRestrictions.build(graph, restrictions));
  const withoutRestrictions = runScenario(graph, source, target, TurnRestrictions.empty());

  const delta =
    withRestrictions.reachable && withoutRestrictions.reachable
      ? withRestrictions.distance! - withoutRestrictions.distance!
      : null;

  return { withRestrictions, withoutRestrictions, delta };
}
