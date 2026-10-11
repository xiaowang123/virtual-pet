# 云宠物 CloudPet 运行镜像
# 构建: docker build -t cloud-pet .
# 运行: docker run -d -p 3000:3000 -v pet-data:/app/data --name cloud-pet cloud-pet
FROM node:20-alpine

WORKDIR /app

# 先装依赖 (利用层缓存)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 拷贝源码与静态资源
COPY src ./src
COPY public ./public

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "src/server.js"]
