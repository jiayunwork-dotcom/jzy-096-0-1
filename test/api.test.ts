import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { createApp } from "../src/server";
import { SAMPLE_GRAPH, SAMPLE_RESTRICTIONS, SAMPLE_SOURCE, SAMPLE_TARGET } from "../src/sampleData";

let server: Server;
let base: string;

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const sampleRequest = {
  graph: SAMPLE_GRAPH,
  source: SAMPLE_SOURCE,
  target: SAMPLE_TARGET,
};

test("POST /shortest-path：无禁转时走最短直路", async () => {
  const { status, json } = await post("/shortest-path", sampleRequest);
  assert.equal(status, 200);
  assert.equal(json.reachable, true);
  assert.equal(json.distance, 3);
  assert.deepEqual(json.path, ["C", "F", "E", "D"]);
});

test("POST /shortest-path：禁掉左转后绕行变长", async () => {
  const { status, json } = await post("/shortest-path", {
    ...sampleRequest,
    restrictions: SAMPLE_RESTRICTIONS,
  });
  assert.equal(status, 200);
  assert.equal(json.reachable, true);
  assert.equal(json.distance, 7);
  // 结果里不允许出现被禁的 C→F→E 转向
  for (let i = 0; i + 2 < json.path.length; i++) {
    assert.notEqual(json.path.slice(i, i + 3).join("->"), "C->F->E");
  }
});

test("POST /compare：返回两个长度与绕行代价", async () => {
  const { status, json } = await post("/compare", {
    ...sampleRequest,
    restrictions: SAMPLE_RESTRICTIONS,
  });
  assert.equal(status, 200);
  assert.equal(json.withoutRestrictions.distance, 3);
  assert.equal(json.withRestrictions.distance, 7);
  assert.equal(json.delta, 4);
});

test("GET /sample：预置算例直接可核对，禁转后明显更长", async () => {
  const res = await fetch(base + "/sample");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.result.withoutRestrictions.distance, 3);
  assert.equal(json.result.withRestrictions.distance, 7);
  assert.equal(json.result.delta, 4);
  assert.ok(json.result.withRestrictions.distance > json.result.withoutRestrictions.distance);
});

test("POST /shortest-path：不可达返回明确标记", async () => {
  const { status, json } = await post("/shortest-path", {
    graph: {
      nodes: ["A", "B"],
      edges: [{ from: "A", to: "B", weight: 1 }],
    },
    source: "B",
    target: "A",
  });
  assert.equal(status, 200);
  assert.equal(json.reachable, false);
  assert.equal(json.distance, null);
  assert.deepEqual(json.path, []);
});

test("POST /shortest-path：起点等于终点，长度为零、序列只含该节点", async () => {
  const { status, json } = await post("/shortest-path", {
    ...sampleRequest,
    source: "E",
    target: "E",
  });
  assert.equal(status, 200);
  assert.equal(json.reachable, true);
  assert.equal(json.distance, 0);
  assert.deepEqual(json.path, ["E"]);
});

test("非法输入一律 400 并说明原因", async () => {
  const cases: Array<[string, unknown, string]> = [
    ["边引用不存在的节点", { ...sampleRequest, graph: { nodes: ["A"], edges: [{ from: "A", to: "ZZ", weight: 1 }] } }, "does not exist"],
    ["负权边", { ...sampleRequest, graph: { nodes: ["A", "B"], edges: [{ from: "A", to: "B", weight: -2 }] } }, "must be > 0"],
    ["负权自环", { ...sampleRequest, graph: { nodes: ["A"], edges: [{ from: "A", to: "A", weight: -1 }] } }, "self-loop"],
    ["零权边", { ...sampleRequest, graph: { nodes: ["A", "B"], edges: [{ from: "A", to: "B", weight: 0 }] } }, "must be > 0"],
    ["起点不存在", { graph: SAMPLE_GRAPH, source: "ZZ", target: "D" }, "does not exist"],
    ["终点不存在", { graph: SAMPLE_GRAPH, source: "C", target: "ZZ" }, "does not exist"],
    [
      "禁转指向不存在的边",
      { ...sampleRequest, restrictions: [{ from: "A", via: "B", to: "F" }] },
      "does not exist",
    ],
    [
      "禁转引用不存在的节点",
      { ...sampleRequest, restrictions: [{ from: "A", via: "ZZ", to: "B" }] },
      "does not exist",
    ],
    ["缺 graph", { source: "A", target: "B" }, "graph"],
    ["重复边", { ...sampleRequest, graph: { nodes: ["A", "B"], edges: [{ from: "A", to: "B", weight: 1 }, { from: "A", to: "B", weight: 2 }] } }, "duplicate"],
  ];

  for (const [name, body, needle] of cases) {
    const { status, json } = await post("/shortest-path", body);
    assert.equal(status, 400, `${name}: expected 400, got ${status}`);
    assert.equal(json.error, "invalid_input");
    const details = (json.details as string[]).join("\n");
    assert.ok(details.includes(needle), `${name}: details should mention "${needle}", got: ${details}`);
  }
});

test("POST /compare 的非法输入同样被拦截", async () => {
  const { status, json } = await post("/compare", {
    graph: { nodes: ["A", "B"], edges: [{ from: "A", to: "B", weight: -5 }] },
    source: "A",
    target: "B",
  });
  assert.equal(status, 400);
  assert.equal(json.error, "invalid_input");
});

test("并发请求互不干扰：混合查询同时打进来，各自结果正确", async () => {
  const jobs: Array<Promise<void>> = [];
  for (let i = 0; i < 24; i++) {
    if (i % 3 === 0) {
      jobs.push(
        post("/shortest-path", sampleRequest).then(({ status, json }) => {
          assert.equal(status, 200);
          assert.equal(json.distance, 3);
        }),
      );
    } else if (i % 3 === 1) {
      jobs.push(
        post("/shortest-path", { ...sampleRequest, restrictions: SAMPLE_RESTRICTIONS }).then(
          ({ status, json }) => {
            assert.equal(status, 200);
            assert.equal(json.distance, 7);
          },
        ),
      );
    } else {
      jobs.push(
        post("/compare", { ...sampleRequest, restrictions: SAMPLE_RESTRICTIONS }).then(
          ({ status, json }) => {
            assert.equal(status, 200);
            assert.equal(json.delta, 4);
          },
        ),
      );
    }
  }
  await Promise.all(jobs);
});
