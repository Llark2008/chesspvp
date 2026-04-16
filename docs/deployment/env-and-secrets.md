# 生产环境变量与 GitHub Secrets

## 1. 服务器 `.env.production`

服务器常驻的 `.env.production` 用于：

- `docker-compose.prod.yml` 插值
- `server` 容器运行时环境

至少包含：

- `NODE_ENV`
- `CORS_ORIGIN`
- `PORT`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `DATABASE_URL`
- `REDIS_URL`

可参考根目录 `.env.production.example`。

## 2. GitHub Secrets

Actions 目前依赖这些 secrets：

- `TCR_REGISTRY`
- `TCR_NAMESPACE`
- `TCR_USERNAME`
- `TCR_PASSWORD`
- `CVM_HOST`
- `CVM_PORT`
- `CVM_USER`
- `CVM_SSH_KEY`
- `CVM_DEPLOY_DIR`

用途划分：

- `TCR_*`：登录腾讯云 TCR 并推送镜像
- `CVM_*`：SSH 到目标服务器并执行发布

## 3. TCR 镜像命名

推荐固定为：

- `chesspvp-web`
- `chesspvp-server`

如果中国区 CVM 无法稳定访问 Docker Hub，建议额外准备：

- `postgres-16-alpine`
- `redis-7-alpine`

并且每次发布只使用不可变 SHA tag，例如：

- `ccr.ccs.tencentyun.com/<namespace>/chesspvp-web:<git-sha>`
- `ccr.ccs.tencentyun.com/<namespace>/chesspvp-server:<git-sha>`

不要把 `latest` 作为生产事实来源。

## 4. 不进入仓库的信息

这些内容不能提交到仓库：

- CVM 真实 IP 对应的 SSH 私钥
- TCR 真实账号密码
- 生产 `JWT_SECRET`
- 生产数据库密码
- 生产 `.env.production`
