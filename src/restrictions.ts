import { Graph } from "./graph";

/**
 * 禁转规则：(from, via, to) 表示「在 via 节点上，不允许从 from→via 这条边
 * 直接拐上 via→to 这条边」。
 */
export interface TurnRestriction {
  from: string;
  via: string;
  to: string;
}

/**
 * 禁转索引。三元组 (from, via, to) 在图上唯一对应一对边：
 *   进入边 inEdge  = from→via
 *   离开边 outEdge = via→to
 * 因此禁转可以编译成「进入边下标 → 禁止的离开边下标集合」的 O(1) 查询表，
 * 状态空间 Dijkstra 每扩展一条边查一次。
 *
 * 注意：规则引用的边必须真实存在。存在性校验属于输入校验的职责
 * （见 validation.ts）；这里假定规则已经过校验，若仍发现缺失边则抛错，
 * 属于调用方 bug。
 */
export class TurnRestrictions {
  private readonly bannedByIncoming: Map<number, Set<number>>;

  private constructor(bannedByIncoming: Map<number, Set<number>>, readonly list: readonly TurnRestriction[]) {
    this.bannedByIncoming = bannedByIncoming;
    this.list = list;
  }

  static empty(): TurnRestrictions {
    return new TurnRestrictions(new Map(), []);
  }

  static build(graph: Graph, restrictions: readonly TurnRestriction[]): TurnRestrictions {
    const banned = new Map<number, Set<number>>();
    for (const r of restrictions) {
      const inEdge = graph.edgeBetween(r.from, r.via);
      const outEdge = graph.edgeBetween(r.via, r.to);
      if (!inEdge || !outEdge) {
        throw new Error(
          `turn restriction (${r.from}, ${r.via}, ${r.to}) references an edge that does not exist`,
        );
      }
      let set = banned.get(inEdge.index);
      if (!set) {
        set = new Set<number>();
        banned.set(inEdge.index, set);
      }
      set.add(outEdge.index);
    }
    return new TurnRestrictions(banned, restrictions);
  }

  /** 从 incomingEdge 进入当前节点后，是否禁止拐上 outgoingEdge。 */
  isBanned(incomingEdge: number, outgoingEdge: number): boolean {
    return this.bannedByIncoming.get(incomingEdge)?.has(outgoingEdge) ?? false;
  }
}
