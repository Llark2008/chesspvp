# 生产发布与回滚手册

## 日常发布链路

1. 开发者提交并 `push` 到 `main`
2. GitHub Actions 执行 `typecheck/lint/test/build`
3. workflow 构建 `web/server` 镜像并推送到腾讯云 TCR
4. workflow 通过 SSH 上传：
   - `docker-compose.prod.yml`
   - `scripts/deploy-prod.sh`
5. workflow 在 CVM 上执行部署脚本

## 部署脚本固定顺序

`scripts/deploy-prod.sh` 的顺序不可随意打乱：

1. 启动 `postgres` 和 `redis`
2. 拉取 `web` 和 `server` 新镜像
3. 用新镜像执行 `prisma migrate deploy`
4. 拉起 `server` 和 `web`
5. 检查：
   - `http://127.0.0.1/health`
   - `http://127.0.0.1/`

只要迁移失败，流程就必须立即退出，不继续重启应用。

## 失败排查

优先看这几个面：

- GitHub Actions 日志：
  - 仓库校验阶段
  - 镜像构建与推送阶段
  - SSH 上传阶段
  - 远程部署阶段
- CVM 上的容器状态：

```bash
cd /srv/chesspvp
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=200
```

- 健康检查：

```bash
curl -f http://127.0.0.1/health
curl -f http://127.0.0.1/
```

## 回滚

回滚单位固定为镜像 SHA tag。

做法：

1. 找到上一次成功发布的 `WEB_IMAGE` 和 `SERVER_IMAGE`
2. 在服务器临时指定旧镜像 tag 重新执行部署脚本

示例：

```bash
cd /srv/chesspvp
WEB_IMAGE=ccr.ccs.tencentyun.com/<ns>/chesspvp-web:<old-sha> \
SERVER_IMAGE=ccr.ccs.tencentyun.com/<ns>/chesspvp-server:<old-sha> \
bash scripts/deploy-prod.sh
```

不要通过“重新拉源码再手工构建”的方式回滚，这会破坏当前镜像驱动的发布模型。
