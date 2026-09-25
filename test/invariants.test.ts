import { test } from "node:test";
import assert from "node:assert/strict";
import { Graph } from "../src/graph";
import { TurnRestrictions } from "../src/restrictions";
import { naiveDijkstra, shortestPathRespectingRestrictions } from "../src/dijkstra";
import { expandNodePath } from "../src/path";
import {
  distOrInf,
  makeRng,
  pathWeight,
  randomConnectedGraph,
  randInt,
  respectsRestrictions,
  runEngine,
} from "./helpers";

/**
 * 核心不变量（随机图上批量验证）：
 *  1. 无禁转时，状态空间搜索与朴素 Dijkstra 结果一模一样；
 *  2. 新增一条命中原最短路的禁转后，新最短路不会变短；
 *  3. 调大任意一条边的权重，最短路长度不会减少；
 *  4. 起点 === 终点时，长度为零、序列只含该节点。
 */

test("不变量1：无禁转时与朴素 Dijkstra 完全一致", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rng = makeRng(seed);
    const input = randomConnectedGraph(rng, randInt(rng, 2, 12), randInt(rng, 0, 25), 20);
    const graph = new Graph(input);
    const source = input.nodes[randInt(rng, 0, input.nodes.length - 1)]!;
    const target = input.nodes[randInt(rng, 0, input.nodes.length - 1)]!;

    const got = shortestPathRespectingRestrictions(graph, TurnRestrictions.empty(), source, target);
    const want = naiveDijkstra(graph, source, target);

    assert.equal(got.reachable, want.reachable, `seed=${seed} reachable mismatch`);
    assert.equal(got.distance, want.distance, `seed=${seed} distance mismatch`);

    if (got.reachable) {
      // 展开出的节点序列必须是一条真实存在、权值吻合的路径
      const nodePath = expandNodePath(graph, source, got.edgePath);
      assert.equal(nodePath[0], source);
      assert.equal(nodePath[nodePath.length - 1], target);
      assert.equal(pathWeight(graph, nodePath), got.distance);
    }
  }
});

test("不变量2：新增一条命中原最短路的禁转后，最短路不会变短", () => {
  let samples = 0;
  for (let seed = 1; seed <= 200 && samples < 60; seed++) {
    const rng = makeRng(seed * 7 + 1);
    const input = randomConnectedGraph(rng, randInt(rng, 3, 12), randInt(rng, 0, 25), 20);
    const source = input.nodes[randInt(rng, 0, input.nodes.length - 1)]!;
    const target = input.nodes[randInt(rng, 0, input.nodes.length - 1)]!;

    const base = runEngine(input, source, target);
    if (!base.reachable || base.nodePath.length < 3) continue; // 需要路径上至少存在一个转向

    // 从原最短路上随机挑一个真实发生的转向，禁掉它
    const i = randInt(rng, 0, base.nodePath.length - 3);
    const restriction = {
      from: base.nodePath[i]!,
      via: base.nodePath[i + 1]!,
      to: base.nodePath[i + 2]!,
    };

    const restricted = runEngine(input, source, target, [restriction]);
    assert.ok(
      distOrInf(restricted) >= distOrInf(base),
      `seed=${seed}: distance shrank after adding restriction ${JSON.stringify(restriction)}`,
    );
    if (restricted.reachable) {
      assert.ok(
        respectsRestrictions(restricted.nodePath, [restriction]),
        `seed=${seed}: banned turn still used`,
      );
    }
    samples++;
  }
  assert.ok(samples >= 30, `too few usable samples: ${samples}`);
});

test("不变量3：调大某条边的权重，最短路长度不会减少", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rng = makeRng(seed * 13 + 5);
    const input = randomConnectedGraph(rng, randInt(rng, 2, 12), randInt(rng, 0, 25), 20);
    const source = input.nodes[randInt(rng, 0, input.nodes.length - 1)]!;
    const target = input.nodes[randInt(rng, 0, input.nodes.length - 1)]!;

    const before = runEngine(input, source, target);

    const bumpIndex = randInt(rng, 0, input.edges.length - 1);
    const heavier = {
      nodes: input.nodes,
      edges: input.edges.map((e, i) =>
        i === bumpIndex ? { ...e, weight: e.weight + randInt(rng, 1, 10) } : e,
      ),
    };

    const after = runEngine(heavier, source, target);
    assert.ok(
      distOrInf(after) >= distOrInf(before),
      `seed=${seed}: distance decreased after increasing edge weight`,
    );
  }
});

test("不变量4：起点终点相同时长度为零、序列只含该节点", () => {
  const rng = makeRng(42);
  const input = randomConnectedGraph(rng, 8, 10, 20);
  const node = input.nodes[3]!;

  const outcome = runEngine(input, node, node);
  assert.equal(outcome.reachable, true);
  assert.equal(outcome.distance, 0);
  assert.deepEqual(outcome.nodePath, [node]);

  // 即使图上带着禁转规则，结论也不变（规则从真实边里挑，保证合法）
  const graph = new Graph(input);
  const someEdge = graph.edges[0]!;
  const nextEdge = graph.outEdges(someEdge.to)[0];
  const rules = nextEdge
    ? [{ from: someEdge.from, via: someEdge.to, to: nextEdge.to }]
    : [];
  const withRules = runEngine(input, node, node, rules);
  assert.equal(withRules.distance, 0);
  assert.deepEqual(withRules.nodePath, [node]);
});
