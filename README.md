# turn-restricted-router

带禁转规则的有向图最短路 HTTP 服务。输入整张图、起点终点和一批禁转规则，
服务返回**遵守禁转**的最短路径长度与节点序列；也可以对比「开启 / 关闭」
一组禁转两种情形，给出绕行代价。

纯路由后端：只算带禁转的有向图最短路，只走 HTTP 接口；不含网页、
不含派单逻辑，也不涉及经纬度 / 测地距离等地理概念。

## 核心做法：扩展状态空间上的 Dijkstra

禁转规则是三元组 `(from, via, to)`：在 `via` 节点上，不允许从 `from→via`
这条边直接拐上 `via→to` 这条边。

要正确管住禁转，搜索状态必须包含「从哪条边进来」。本服务把状态定义为
**当前节点 + 进入边**（实现上用进入边下标 + 1 作为状态 id，0 为起点状态），
在这个扩展状态空间上跑 Dijkstra，最后把状态路径（边序列）铺回节点序列。
只在朴素节点状态上搜会丢掉来向信息，被禁的转向照样会被走通——
本服务不允许出现这种错误，并有测试专门锁定（含「禁转迫使路径重复经过
同一节点」这种朴素搜索根本表达不了的情形）。

所有边权必须为正，负权 / 零权（含负权自环）在输入校验阶段直接拒绝。

## 快速开始

```bash
npm ci
npm run build     # 编译 TypeScript → dist/
npm start         # 监听 3000 端口（PORT 环境变量可改）
npm test          # 跑全部测试（node:test + tsx，无需先编译）
```

Docker：

```bash
docker build -t turn-restricted-router .    # 构建期会自动跑一遍测试
docker run --rm -p 3000:3000 turn-restricted-router
docker run --rm turn-restricted-router npm test   # 在容器里跑测试
```

启动后可直接核对预置算例（小网格 + 一个被禁掉的左转，绕行应明显变长）：

```bash
curl localhost:3000/sample
# 期望：withoutRestrictions.distance = 3（C→F→E→D），
#       withRestrictions.distance   = 7（绕行），delta = 4
```

## HTTP 接口

### `POST /shortest-path`

给定整张图、起点、终点、禁转规则，返回最短路长度与节点序列。

```json
{
  "graph": {
    "nodes": ["A", "B", "C"],
    "edges": [
      { "from": "A", "to": "B", "weight": 1 },
      { "from": "B", "to": "C", "weight": 2 }
    ]
  },
  "source": "A",
  "target": "C",
  "restrictions": [{ "from": "X", "via": "B", "to": "C" }]
}
```

- `restrictions` 可省略，等价于空数组。
- 成功（200）：`{ "reachable": true, "distance": 3, "path": ["A", "B", "C"] }`
- 不可达（200）：`{ "reachable": false, "distance": null, "path": [] }` —— 明确的不可达标记
- 起点 = 终点（200）：`{ "reachable": true, "distance": 0, "path": ["A"] }`
- 输入非法（400）：`{ "error": "invalid_input", "details": ["...具体原因..."] }`

### `POST /compare`

请求体同上。在同一张图上分别计算「开启这组禁转」与「关闭这组禁转」，
返回两个长度及差值（绕行代价）：

```json
{
  "withRestrictions":    { "reachable": true, "distance": 7, "path": ["C", "B", "A", "D"] },
  "withoutRestrictions": { "reachable": true, "distance": 3, "path": ["C", "F", "E", "D"] },
  "delta": 4
}
```

任一情形不可达时 `delta` 为 `null`。

### `GET /sample` / `GET /health`

`/sample` 返回预置算例的图、禁转规则和两情形对比结果；`/health` 探活。

## 输入校验（一律 400 并说明原因）

- 边或禁转引用了不存在的节点；
- 边权不是正数（负权、零权、负权自环都不收）；
- 同一对端点之间的重复边；
- 禁转三元组指向的边（`from→via` 或 `via→to`）在图中不存在；
- 起点 / 终点缺失或不在图中。

## 并发与状态隔离

服务常驻运行，无任何共享可变状态：每个请求各自构造图、禁转索引和
搜索堆，搜索状态彼此完全隔离，同时涌入的查询互不干扰
（有并发测试覆盖）。

## 模块划分（src/）

| 文件 | 职责 |
| --- | --- |
| `graph.ts` | 图与扩展搜索状态（节点 + 进入边）建模 |
| `dijkstra.ts` | 状态空间上的 Dijkstra + 朴素 Dijkstra 对照基准 |
| `restrictions.ts` | 禁转三元组 →「进入边 → 禁行离开边」索引 |
| `path.ts` | 状态路径（边序列）展开为节点序列 |
| `compare.ts` | 开启 / 关闭禁转两情形对比与绕行代价 |
| `validation.ts` | 输入校验，收集全部问题并说明原因 |
| `priorityQueue.ts` | 自实现的二叉最小堆 |
| `sampleData.ts` | 预置小网格算例（禁掉一个左转） |
| `server.ts` | Express 接口层（只做解析 / 校验 / 序列化） |

## 测试（test/）

- `invariants.test.ts` —— 核心不变量，随机图上批量验证：
  1. 无禁转时与朴素 Dijkstra 完全一致；
  2. 新增一条命中原最短路的禁转后，最短路不会变短；
  3. 调大任意边权，最短路长度不会减少；
  4. 起点 = 终点时长度为零、序列只含该节点。
- `engine.test.ts` —— 预置算例、禁转迫使节点重复经过、不可达标记、
  起点无进入边不构成转向等边界。
- `api.test.ts` —— HTTP 层：两类调用、400 报错原因、不可达、
  起终点相同、并发请求隔离。
