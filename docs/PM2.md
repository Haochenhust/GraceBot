# GraceBot PM2 操作速查

在项目根目录执行（或先 `cd` 到项目根）。

---

## 日常操作

| 操作 | 命令 |
|------|------|
| **启动** | `npm run pm2:start` 或 `pm2 start ecosystem.config.cjs` |
| **停止** | `npm run pm2:stop` 或 `pm2 stop gracebot` |
| **重启**（代码/配置更新后用这个） | `pm2 restart gracebot` |
| **看状态** | `pm2 status` |
| **看实时日志** | `npm run pm2:logs` 或 `pm2 logs gracebot` |

---

## 代码更新后要不要重启？

- **配置了 `watch: true`**：改完代码保存后 PM2 会自动重启，一般不用手动操作。
- **想立刻生效**：执行 `pm2 restart gracebot`。
- **没开 watch**：每次改完代码都要执行一次 `pm2 restart gracebot`。

---

## 首次 / 重装后

```bash
# 1. 全局安装 PM2（二选一）
npm install -g pm2
# bun add -g pm2

# 2. 启动
cd /Users/chenhao/Desktop/GraceBot
npm run pm2:start

# 3. 开机自启（Mac 重启后自动拉起）
pm2 save
pm2 startup
# 把终端输出的 sudo env PATH=... 那一行复制执行一次
```

---

## 其他常用

```bash
# 看最近日志（不跟屏）
pm2 logs gracebot --lines 100

# 看进程详情
pm2 show gracebot

# 清空日志
pm2 flush gracebot
```
