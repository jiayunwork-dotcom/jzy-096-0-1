import { GraphInput } from "./graph";
import { TurnRestriction } from "./restrictions";

/**
 * 预置算例：2 行 × 3 列的小路网，全部边双向。
 *
 *     D —— E —— F      北侧路
 *     |     |     |
 *     A —— B —— C      南侧路
 *
 * 横边与 C—F 竖边权为 1；A—D、B—E 两条竖边权为 5（绕远路）。
 *
 * 从 C 到 D：
 *  - 不禁转时最短走 C→F→E→D，长度 3。在 F 处是「由南向北再向西」，
 *    即一个左转。
 *  - 禁掉左转 (C, F, E) 后，只能绕竖向重边，最短变成 7
 *    （C→B→A→D 或 C→B→E→D）。
 * 启动服务后 GET /sample 即可直接核对：delta 应为 4。
 */
export const SAMPLE_GRAPH: GraphInput = {
  nodes: ["A", "B", "C", "D", "E", "F"],
  edges: [
    { from: "A", to: "B", weight: 1 },
    { from: "B", to: "A", weight: 1 },
    { from: "B", to: "C", weight: 1 },
    { from: "C", to: "B", weight: 1 },
    { from: "D", to: "E", weight: 1 },
    { from: "E", to: "D", weight: 1 },
    { from: "E", to: "F", weight: 1 },
    { from: "F", to: "E", weight: 1 },
    { from: "A", to: "D", weight: 5 },
    { from: "D", to: "A", weight: 5 },
    { from: "B", to: "E", weight: 5 },
    { from: "E", to: "B", weight: 5 },
    { from: "C", to: "F", weight: 1 },
    { from: "F", to: "C", weight: 1 },
  ],
};

export const SAMPLE_SOURCE = "C";
export const SAMPLE_TARGET = "D";

/** 在 F 路口禁止「C→F 之后左转去 E」。 */
export const SAMPLE_RESTRICTIONS: readonly TurnRestriction[] = [
  { from: "C", via: "F", to: "E" },
];
