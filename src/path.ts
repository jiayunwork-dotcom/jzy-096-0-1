import { Graph } from "./graph";

/**
 * 路径展开：把状态空间搜索得到的「边序列」铺回调度员要看的节点序列。
 * 边 e1..ek 依次首尾相接，节点序列就是 [source, e1.to, e2.to, ..., ek.to]。
 * 注意节点可能重复出现（禁转迫使路径绕圈时），这是正常且必要的——
 * 也正因如此不能靠「节点去重」来还原路径。
 */
export function expandNodePath(graph: Graph, source: string, edgePath: readonly number[]): string[] {
  const nodes = [source];
  for (const edgeIndex of edgePath) {
    const edge = graph.edges[edgeIndex];
    if (!edge) throw new Error(`unknown edge index ${edgeIndex}`);
    nodes.push(edge.to);
  }
  return nodes;
}
