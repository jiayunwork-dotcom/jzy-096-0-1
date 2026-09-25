# 带禁转的有向图最短路服务
# 构建:  docker build -t turn-restricted-router .
# 运行:  docker run -p 3000:3000 turn-restricted-router
# 测试:  docker run --rm turn-restricted-router npm test

FROM node:20-alpine

WORKDIR /app

# 先装依赖，利用镜像层缓存（devDependencies 也装：编译与跑测试需要）
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY test ./test

# 编译 TypeScript 产出可直接运行的 dist/，并在构建期跑一遍测试把不变量锁死
RUN npm run build && npm test

EXPOSE 3000
ENV PORT=3000

CMD ["node", "dist/server.js"]
