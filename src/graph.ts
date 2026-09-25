/**
 * 图与搜索状态建模。
 *
 * 图是有向图：边 (from, to, weight)，端点必须是 nodes 里声明的节点，
 * 同一对端点之间至多一条边（重复边在校验阶段直接拒绝）。
 *
 * 关键约定：要正确表达禁转，搜索不能只停在「节点」上。这里的扩展搜索状态是
 * 「当前节点 + 由哪条边进入」。实现上用「进入边的下标 + 1」作为状态 id：
 *   - id === START_STATE(=0)：起点状态，没有进入边（在 via 处不构成任何转向）；
 *   - id >= 1：经由 graph.edges[id - 1] 到达其 to 节点。
 * 进入边唯一定位当前节点（edge.to），所以不需要再单独存 node。
 */

export interface EdgeInput {
  from: string;
  to: string;
  weight: number;
}

export interface GraphInput {
  nodes: string[];
  edges: EdgeInput[];
}

export interface Edge {
  readonly index: number;
  readonly from: string;
  readonly to: string;
  readonly weight: number;
}

/** 起点状态：没有任何进入边。 */
export const START_STATE = 0;

/** 把边下标转成扩展状态 id。 */
export function stateFromIncomingEdge(edgeIndex: number): number {
  return edgeIndex + 1;
}

/** 取出扩展状态对应的进入边下标；START_STATE 返回 -1。 */
export function incomingEdgeOf(state: number): number {
  return state - 1;
}

/** \u0001 不会出现在正常节点 id 里，用作 key 分隔符避免碰撞。 */
const KEY_SEP = "\u0001";

export class Graph {
  readonly edges: readonly Edge[];
  private readonly nodeSet: Set<string>;
  private readonly adjacency: Map<string, Edge[]>;
  private readonly byEndpoints: Map<string, Edge>;

  constructor(input: GraphInput) {
    this.nodeSet = new Set(input.nodes);
    this.edges = input.edges.map((e, index) =>
      Object.freeze({ index, from: e.from, to: e.to, weight: e.weight }),
    );

    this.adjacency = new Map<string, Edge[]>();
    for (const node of input.nodes) this.adjacency.set(node, []);

    this.byEndpoints = new Map<string, Edge>();
    for (const edge of this.edges) {
      this.adjacency.get(edge.from)?.push(edge);
      this.byEndpoints.set(edgeKey(edge.from, edge.to), edge);
    }
  }

  hasNode(id: string): boolean {
    return this.nodeSet.has(id);
  }

  outEdges(node: string): readonly Edge[] {
    return this.adjacency.get(node) ?? EMPTY;
  }

  edgeBetween(from: string, to: string): Edge | undefined {
    return this.byEndpoints.get(edgeKey(from, to));
  }

  /** 扩展状态当前停在哪个节点上。 */
  nodeOfState(state: number, source: string): string {
    if (state === START_STATE) return source;
    const edge = this.edges[state - 1];
    if (!edge) throw new Error(`unknown search state ${state}`);
    return edge.to;
  }
}

const EMPTY: readonly Edge[] = Object.freeze([]);

function edgeKey(from: string, to: string): string {
  return from + KEY_SEP + to;
}
