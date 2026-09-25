import express, { NextFunction, Request, Response } from "express";
import { Graph } from "./graph";
import { TurnRestrictions } from "./restrictions";
import { compareRestrictionImpact, runScenario } from "./compare";
import { validateRoutingRequest } from "./validation";
import { SAMPLE_GRAPH, SAMPLE_RESTRICTIONS, SAMPLE_SOURCE, SAMPLE_TARGET } from "./sampleData";

/**
 * HTTP 接口层。只做「解析 → 校验 → 调用核心 → 序列化」，不含搜索逻辑。
 *
 * 并发说明：服务常驻、无共享可变状态——每个请求各自构造 Graph /
 * TurnRestrictions / 搜索堆，搜索状态完全隔离，同时涌入的查询互不干扰。
 */
export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  /**
   * 给定整张图 + 起终点 + 禁转规则，返回最短路长度与节点序列。
   * 不可达时返回 { reachable: false, distance: null, path: [] }。
   */
  app.post("/shortest-path", (req: Request, res: Response) => {
    const v = validateRoutingRequest(req.body);
    if (!v.ok) {
      res.status(400).json({ error: "invalid_input", details: v.errors });
      return;
    }
    const { graph, source, target, restrictions } = v.value;
    const g = new Graph(graph);
    const outcome = runScenario(g, source, target, TurnRestrictions.build(g, restrictions));
    res.json(outcome);
  });

  /**
   * 同一图上对比「开启这组禁转」与「关闭这组禁转」，
   * 返回两个长度及差值（绕行代价）。
   */
  app.post("/compare", (req: Request, res: Response) => {
    const v = validateRoutingRequest(req.body);
    if (!v.ok) {
      res.status(400).json({ error: "invalid_input", details: v.errors });
      return;
    }
    const { graph, source, target, restrictions } = v.value;
    const g = new Graph(graph);
    res.json(compareRestrictionImpact(g, source, target, restrictions));
  });

  /**
   * 预置算例：小网格 + 一个被禁掉的左转。
   * 期望结果：禁转后 7，禁转前 3，delta 4——绕行明显变长。
   */
  app.get("/sample", (_req: Request, res: Response) => {
    const g = new Graph(SAMPLE_GRAPH);
    res.json({
      description:
        "2x3 grid, all streets bidirectional. Vertical edges A-D and B-E cost 5, all others cost 1. " +
        "Restriction bans the left turn (C -> F -> E). Expect: without=3, with=7, delta=4.",
      graph: SAMPLE_GRAPH,
      source: SAMPLE_SOURCE,
      target: SAMPLE_TARGET,
      restrictions: SAMPLE_RESTRICTIONS,
      result: compareRestrictionImpact(g, SAMPLE_SOURCE, SAMPLE_TARGET, SAMPLE_RESTRICTIONS),
    });
  });

  // JSON 解析失败等请求级错误统一返回 JSON，而不是 Express 默认的 HTML
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "invalid_json", details: ["request body is not valid JSON"] });
      return;
    }
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  createApp().listen(port, () => {
    console.log(`turn-restricted routing service listening on port ${port}`);
  });
}
