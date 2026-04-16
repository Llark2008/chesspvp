# 单台 CVM 首次部署

目标：在一台全新的腾讯云 Ubuntu CVM 上完成首轮部署，生产入口先用公网 IP + HTTP。

## 1. 服务器角色

- `web`：Nginx 容器，对外暴露 `80`
- `server`：Fastify + Socket.IO 容器，只在 compose 内网暴露 `3001`
- `postgres`：同机 Docker volume 持久化
- `redis`：同机 Docker volume 持久化

服务器不承担源码同步职责，不执行 `git pull`。

## 2. 预装项

服务器至少需要：

- Docker Engine
- Docker Compose v2
- `curl`

Node / pnpm 不是生产发布必需项；CI 已经在镜像里完成构建。

## 3. 目录约定

推荐固定为：

```text
/srv/chesspvp
├── docker-compose.prod.yml
├── .env.production
└── scripts/
    └── deploy-prod.sh
```

这些文件由 GitHub Actions 覆盖或更新；数据库和 Redis 数据走 Docker volumes，不放在工作目录里。

## 4. 环境变量

首次部署时，在服务器创建：

```bash
mkdir -p /srv/chesspvp/scripts
cp /path/to/.env.production.example /srv/chesspvp/.env.production
```

`.env.production` 至少填写：

- `NODE_ENV=production`
- `CORS_ORIGIN=http://<公网IP>`
- `PORT=3001`
- `JWT_SECRET=<长随机字符串>`
- `JWT_EXPIRES_IN=7d`
- `POSTGRES_IMAGE` / `REDIS_IMAGE`：默认可分别写 `postgres:16-alpine`、`redis:7-alpine`；如果中国区 CVM 无法访问 Docker Hub，建议改成你自己的 TCR 镜像地址
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `DATABASE_URL=postgresql://...@postgres:5432/...`
- `REDIS_URL=redis://redis:6379`

`WEB_IMAGE` 和 `SERVER_IMAGE` 由部署脚本在发布时注入，不要求手工常驻维护。

## 5. 安全边界

- 腾讯云安全组仅开放 HTTP `80`，以及你实际部署使用的 SSH 端口（默认可用 `22`，如果改成 `2222` 就只开 `2222`）
- 不对公网开放 `3001`、`5432`、`6379`
- 首轮不接入 HTTPS；等 IP + HTTP 链路稳定后再补域名和证书

## 6. 中国区网络注意事项

如果 CVM 位于中国大陆，Docker Hub 拉取经常成为瓶颈。推荐优先级如下：

1. 把 `postgres:16-alpine`、`redis:7-alpine` 先同步到你自己的 TCR，再把 `.env.production` 里的 `POSTGRES_IMAGE`、`REDIS_IMAGE` 改成 TCR 地址
2. 如果暂时不想建这两个基础镜像，再考虑给服务器配置 Docker registry mirror

这样生产服务器就能全程只访问腾讯云 TCR 拉业务镜像和基础镜像。
