import { EdgeInput, GraphInput } from "./graph";
import { TurnRestriction } from "./restrictions";

/**
 * 输入校验。以下问题一律拒绝并说明原因（HTTP 400）：
 *  - 边或禁转引用了不存在的节点；
 *  - 边权不是正数（负权、零权都不收；负权自环也在这里被挡下）；
 *  - 同一对端点之间出现重复边；
 *  - 禁转三元组指向的边 (from→via 或 via→to) 在图里不存在；
 *  - 起点 / 终点缺失或不在图中。
 * 校验会尽量收集全部问题一次返回，而不是只报第一条。
 */

export interface ValidatedRequest {
  graph: GraphInput;
  source: string;
  target: string;
  restrictions: TurnRestriction[];
}

export type ValidationOutcome =
  | { ok: true; value: ValidatedRequest }
  | { ok: false; errors: string[] };

const KEY_SEP = "\u0001";

export function validateRoutingRequest(body: unknown): ValidationOutcome {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }
  const b = body as Record<string, unknown>;
  const errors: string[] = [];

  // ---- 图：节点 ----
  const nodeIds = new Set<string>();
  let edges: EdgeInput[] = [];
  const edgeKeys = new Set<string>();

  const graphRaw = b.graph;
  if (typeof graphRaw !== "object" || graphRaw === null || Array.isArray(graphRaw)) {
    errors.push("graph is required and must be an object with nodes and edges");
  } else {
    const g = graphRaw as Record<string, unknown>;

    if (!Array.isArray(g.nodes) || g.nodes.length === 0) {
      errors.push("graph.nodes must be a non-empty array of node id strings");
    } else {
      for (const n of g.nodes) {
        if (typeof n !== "string" || n.length === 0) {
          errors.push("graph.nodes must contain only non-empty strings");
          continue;
        }
        if (nodeIds.has(n)) errors.push(`duplicate node id "${n}"`);
        nodeIds.add(n);
      }
    }

    // ---- 图：边 ----
    if (!Array.isArray(g.edges)) {
      errors.push("graph.edges must be an array of {from, to, weight}");
    } else {
      edges = validateEdges(g.edges, nodeIds, edgeKeys, errors);
    }
  }

  // ---- 起点 / 终点 ----
  const source = validateEndpoint(b.source, "source", nodeIds, errors);
  const target = validateEndpoint(b.target, "target", nodeIds, errors);

  // ---- 禁转规则 ----
  const restrictions = validateRestrictions(b.restrictions, nodeIds, edgeKeys, errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      graph: { nodes: [...nodeIds], edges },
      source: source!,
      target: target!,
      restrictions,
    },
  };
}

function validateEdges(
  rawEdges: unknown[],
  nodeIds: ReadonlySet<string>,
  edgeKeys: Set<string>,
  errors: string[],
): EdgeInput[] {
  const edges: EdgeInput[] = [];

  rawEdges.forEach((raw, i) => {
    if (typeof raw !== "object" || raw === null) {
      errors.push(`graph.edges[${i}] must be an object {from, to, weight}`);
      return;
    }
    const e = raw as Record<string, unknown>;
    const { from, to, weight } = e;

    if (typeof from !== "string" || typeof to !== "string") {
      errors.push(`graph.edges[${i}]: from and to must be node id strings`);
      return;
    }
    if (!nodeIds.has(from)) errors.push(`graph.edges[${i}]: from node "${from}" does not exist`);
    if (!nodeIds.has(to)) errors.push(`graph.edges[${i}]: to node "${to}" does not exist`);

    if (typeof weight !== "number" || !Number.isFinite(weight)) {
      errors.push(`graph.edges[${i}] (${from}->${to}): weight must be a finite number`);
    } else if (weight <= 0) {
      // 边长必须为正：负权、零权、负权自环统一在这里拒绝
      const kind = from === to ? "negative self-loop" : "non-positive weight";
      errors.push(`graph.edges[${i}] (${from}->${to}): ${kind} is not allowed, weight must be > 0, got ${weight}`);
    }

    const key = from + KEY_SEP + to;
    if (edgeKeys.has(key)) errors.push(`duplicate edge ${from}->${to}`);
    edgeKeys.add(key);

    edges.push({ from, to, weight: weight as number });
  });

  return edges;
}

function validateEndpoint(
  value: unknown,
  field: string,
  nodeIds: ReadonlySet<string>,
  errors: string[],
): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${field} is required and must be a node id string`);
    return undefined;
  }
  if (nodeIds.size > 0 && !nodeIds.has(value)) {
    errors.push(`${field} node "${value}" does not exist in the graph`);
  }
  return value;
}

function validateRestrictions(
  raw: unknown,
  nodeIds: ReadonlySet<string>,
  edgeKeys: ReadonlySet<string>,
  errors: string[],
): TurnRestriction[] {
  const restrictions: TurnRestriction[] = [];
  if (raw === undefined || raw === null) return restrictions;

  if (!Array.isArray(raw)) {
    errors.push("restrictions must be an array of {from, via, to}");
    return restrictions;
  }

  raw.forEach((item, i) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as any).from !== "string" ||
      typeof (item as any).via !== "string" ||
      typeof (item as any).to !== "string"
    ) {
      errors.push(`restrictions[${i}] must be an object with string fields from, via, to`);
      return;
    }
    const r = item as TurnRestriction;

    const nodesOk = (["from", "via", "to"] as const).every((field) => {
      const id = r[field];
      const exists = nodeIds.has(id);
      if (!exists) errors.push(`restrictions[${i}]: ${field} node "${id}" does not exist`);
      return exists;
    });

    // 节点都存在时才检查边，避免级联出无意义的报错
    if (nodesOk) {
      if (!edgeKeys.has(r.from + KEY_SEP + r.via)) {
        errors.push(`restrictions[${i}]: edge ${r.from}->${r.via} does not exist`);
      }
      if (!edgeKeys.has(r.via + KEY_SEP + r.to)) {
        errors.push(`restrictions[${i}]: edge ${r.via}->${r.to} does not exist`);
      }
    }

    restrictions.push({ from: r.from, via: r.via, to: r.to });
  });

  return restrictions;
}
