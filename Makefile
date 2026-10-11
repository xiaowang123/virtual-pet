# 常用命令
.PHONY: dev test start run docker-build docker-run art clean

# 本地开发 (改代码自动重启)
dev:
	node --watch src/server.js

# 启动
start:
	node src/server.js

# 运行测试
test:
	node --test

# 终端预览像素画
art:
	node scripts/preview-art.js

# Docker 构建 / 运行
docker-build:
	docker build -t cloud-pet .

docker-run:
	docker run -d -p 3000:3000 -v pet-data:/app/data --name cloud-pet --restart unless-stopped cloud-pet

# 推送镜像到阿里云 ACR (先 export REGISTRY/NAMESPACE 并 docker login)
push-aliyun:
	docker build -t $(REGISTRY)/$(NAMESPACE)/cloud-pet:latest .
	docker push $(REGISTRY)/$(NAMESPACE)/cloud-pet:latest

clean:
	rm -rf node_modules
