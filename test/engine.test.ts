import { test } from "node:test";
import assert from "node:assert/strict";
import { Graph } from "../src/graph";
import { TurnRestrictions } from "../src/restrictions";
import { shortestPathRespectingRestrictions } from "../src/dijkstra";
import { expandNodePath } from "../src/path";
import { SAMPLE_GRAPH, SAMPLE_RESTRICTIONS, SAMPLE_SOURCE, SAMPLE_TARGET } from "../src/sampleData";
import { compareRestrictionImpact } from "../src/compare";
import { respectsRestrictions, runEngine } from "./helpers";

test("预置算例：禁掉左转后绕行变长（3 → 7，delta 4）", () => {
  const graph = new Graph(SAMPLE_GRAPH);
  const outcome = compareRestrictionImpact(graph, SAMPLE_SOURCE, SAMPLE_TARGET, [...SAMPLE_RESTRICTIONS]);

  assert.equal(outcome.withoutRestrictions.reachable, true);
  assert.equal(outcome.withoutRestrictions.distance, 3);
  assert.deepEqual(outcome.withoutRestrictions.path, ["C", "F", "E", "D"]);

  assert.equal(outcome.withRestrictions.reachable, true);
  assert.equal(outcome.withRestrictions.distance, 7);
  assert.ok(respectsRestrictions(outcome.withRestrictions.path, [...SAMPLE_RESTRICTIONS]));

  assert.equal(outcome.delta, 4);
  assert.ok(outcome.withRestrictions.distance! > outcome.withoutRestrictions.distance!);
});

test("禁转可以迫使最短路重复经过同一节点（朴素节点状态搜不出的情形）", () => {
  // S→V→T 的转向被禁后，唯一走法是 S→V→A→V→T，节点 V 出现两次。
  // 只在节点状态上搜的算法无法表达这条路径。
  const input = {
    nodes: ["S", "V", "A", "T"],
    edges: [
      { from: "S", to: "V", weight: 1 },
      { from: "V", to: "T", weight: 10 },
      { from: "V", to: "A", weight: 1 },
      { from: "A", to: "V", weight: 1 },
    ],
  };
  const restriction = [{ from: "S", via: "V", to: "T" }];

  const open = runEngine(input, "S", "T");
  assert.equal(open.distance, 11);

  const restricted = runEngine(input, "S", "T", restriction);
  assert.equal(restricted.reachable, true);
  assert.equal(restricted.distance, 13);
  assert.deepEqual(restricted.nodePath, ["S", "V", "A", "V", "T"]);
  assert.ok(respectsRestrictions(restricted.nodePath, restriction));
});

test("被禁的转向不会出现在结果路径里（直接验证状态空间约束生效）", () => {
  const graph = new Graph(SAMPLE_GRAPH);
  const rules = TurnRestrictions.build(graph, [...SAMPLE_RESTRICTIONS]);
  const result = shortestPathRespectingRestrictions(graph, rules, SAMPLE_SOURCE, SAMPLE_TARGET);
  const nodePath = expandNodePath(graph, SAMPLE_SOURCE, result.edgePath);

  // 路径里不允许出现连续的 C→F→E
  for (let i = 0; i + 2 < nodePath.length; i++) {
    const triple = [nodePath[i], nodePath[i + 1], nodePath[i + 2]].join("->");
    assert.notEqual(triple, "C->F->E");
  }
});

test("不可达：返回明确的不可达标记", () => {
  const input = {
    nodes: ["A", "B", "C", "D"],
    edges: [
      { from: "A", to: "B", weight: 1 },
      { from: "C", to: "D", weight: 1 },
    ],
  };
  const outcome = runEngine(input, "A", "D");
  assert.equal(outcome.reachable, false);
  assert.equal(outcome.distance, null);
  assert.deepEqual(outcome.nodePath, []);
});

test("禁转把最后一条路也堵死时，同样返回不可达", () => {
  const input = {
    nodes: ["S", "M", "T"],
    edges: [
      { from: "S", to: "M", weight: 1 },
      { from: "M", to: "T", weight: 1 },
    ],
  };
  const outcome = runEngine(input, "S", "T", [{ from: "S", via: "M", to: "T" }]);
  assert.equal(outcome.reachable, false);
  assert.equal(outcome.distance, null);
});

test("via 为起点的禁转管不到第一条边：起点没有进入边，不构成转向", () => {
  const input = {
    nodes: ["X", "S", "A", "B"],
    edges: [
      { from: "X", to: "S", weight: 5 },
      { from: "S", to: "A", weight: 1 },
      { from: "A", to: "B", weight: 1 },
    ],
  };
  const rule = [{ from: "X", via: "S", to: "A" }];

  // 从 S 出发：第一条边 S→A 之前没有进入边，规则 (X, S, A) 不适用
  const fromSource = runEngine(input, "S", "B", rule);
  assert.equal(fromSource.reachable, true);
  assert.equal(fromSource.distance, 2);
  assert.deepEqual(fromSource.nodePath, ["S", "A", "B"]);

  // 但规则本身有牙齿：从 X 出发经 S 再去 A 就被禁，X→B 因此不可达
  const fromX = runEngine(input, "X", "B", rule);
  assert.equal(fromX.reachable, false);
});

test("compare：两种情形都不可达 / 一方不可达时 delta 为 null", () => {
  const input = {
    nodes: ["A", "B", "C"],
    edges: [
      { from: "A", to: "B", weight: 1 },
      { from: "B", to: "C", weight: 1 },
    ],
  };
  const graph = new Graph(input);

  const blocked = compareRestrictionImpact(graph, "A", "C", [{ from: "A", via: "B", to: "C" }]);
  assert.equal(blocked.withRestrictions.reachable, false);
  assert.equal(blocked.withoutRestrictions.reachable, true);
  assert.equal(blocked.delta, null);

  const unreachable = compareRestrictionImpact(graph, "C", "A", []);
  assert.equal(unreachable.withoutRestrictions.reachable, false);
  assert.equal(unreachable.delta, null);
});
