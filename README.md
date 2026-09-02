# ModernWar-Bot

QQ 群聊机器人（ModernWar 战绩查询 + 玩家绑定 + 插件数据互联）

## 功能

- **玩家绑定**：每个游戏ID仅能被绑定一次，同一QQ账号不可重复绑定
- **KD 计算**：`人头数 ÷ 对局数`（胜 +1 输出胜场，负 + 输出负场），由插件推送数据，机器人计算
- **QQ 查询命令**：
  - `功能列表`（或 `帮助` / `菜单` / `help`）查看全部功能
  - `绑定玩家ID {你的游戏ID}`
  - `查询排位 {玩家ID}`
  - `查询战绩 {玩家ID}`（最近一局）
  - `查询KD {玩家ID}`（当前赛季）
- **插件互联 HTTP API**：游戏插件通过接口推送给机器人数据
- **心跳检测**：`/api/heat` 供插件探测机器人存活
- **WebSocket 网关接入**（无需公网，不使用 ngrok）
- **PM2 后台常驻**：随机器人进程托管，崩溃自动重启

## 快速开始

```bash
npm install
cp .env.example .env   # 填入 QQ_BOT_APP_ID / QQ_BOT_APP_SECRET / 数据库配置
npm run build
npm start
```

### PM2 后台常驻部署

```bash
npm install -g pm2
pm2 start ecosystem.config.js   # 使用仓库内配置文件启动
pm2 save                        # 保存进程列表
```

常用命令：

```bash
pm2 status                      # 查看状态
pm2 logs modernwar-bot          # 实时查看日志
pm2 restart modernwar-bot       # 重启
pm2 stop modernwar-bot          # 停止
```

> 注：本仓库默认不配置开机自启。如需开机自动启动，请在系统环境变量或登录任务中调用 `pm2 resurrect`。

## 环境变量

| 变量 | 说明 |
|------|------|
| `QQ_BOT_APP_ID` | 机器人 AppID |
| `QQ_BOT_APP_SECRET` | 机器人 AppSecret |
| `INTENTS` | 订阅事件，默认 `GROUP_AT_MESSAGE_CREATE` |
| `HTTP_PORT` | HTTP 服务端口，默认 3000 |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | MySQL 数据库配置，默认库 `modernwar` |

## QQ 命令

在群内 @机器人 或单聊发送：

| 命令 | 说明 |
|------|------|
| `功能列表` | 查看机器人全部功能 |
| `绑定玩家ID {你的游戏ID}` | 绑定游戏ID（仅能绑定一次） |
| `查询排位 {玩家ID}` | 当前赛季段位 |
| `查询战绩 {玩家ID}` | 最近一局战绩 |
| `查询KD {玩家ID}` | 当前赛季 KD |

> `{玩家ID}` 省略时，默认查询当前账号已绑定的游戏ID。

## HTTP 接口

### 心跳检测（供插件探测机器人生存状态）

```
GET /api/heat
```

返回示例：

```json
{
  "ok": true,
  "status": "alive",
  "uptime_sec": 120,
  "uptime_min": 2,
  "timestamp": "2026-09-03T10:00:00.000Z"
}
```

### 玩家绑定（每个玩家仅能绑定一次）

```
POST /api/player/bind
Content-Type: application/json

{ "openid": "xxxx", "game_id": "玩家游戏ID" }
```

- 该游戏ID已被其他玩家绑定 → `409`，返回错误信息
- 当前账号已绑定其他游戏ID → `409`

### 插件数据接口（机器人 & 插件互联）

推送当前赛季数据（KD 自动按 `人头数 ÷ 对局数` 计算）：

```
POST /api/plugin/stats
{ "game_id": "玩家游戏ID", "season": "2026_S2", "heads": 120, "wins": 20, "losses": 10, "rank_label": "黄金" }
```

推送最近一局战绩：

```
POST /api/plugin/match
{ "game_id": "玩家游戏ID", "result": "win", "game_mode": "排位", "kills": 15, "deaths": 5, "heads": 8, "match_time": "2026-09-03T10:00:00" }
```

### 玩家查询接口

| 接口 | 说明 |
|------|------|
| `GET /api/player/select/kd?game_id=xxx&season=xxx` | 当前赛季 KD |
| `GET /api/player/select/zj?game_id=xxx` | 最近一局战绩 |
| `GET /api/player/select/dw?game_id=xxx&season=xxx` | 当前赛季段位 |
| `GET /api/player/select/rank?season=xxx&limit=50` | KD 排行榜 |
| `GET /api/player/openid/:openid` | 通过 openid 解析已绑定游戏ID |

`season` 缺省时取当前赛季：格式 `YYYY_S{1..3}`（按每 4 个月一个赛季）。

## 目录结构

```
├── ecosystem.config.js         # PM2 常驻配置
├── src/
│   ├── index.ts                 # 入口：初始化 DB、启动 HTTP 与网关
│   ├── config.ts                # 配置读取
│   ├── token.ts                 # access_token 获取/刷新
│   ├── gateway.ts               # WebSocket 网关（心跳/重连/resume）
│   ├── handlers.ts              # QQ 事件分发
│   ├── commands.ts              # QQ 文本命令解析
│   ├── routes.ts                # HTTP 插件 API
│   ├── db.ts                    # MySQL 连接池与建表
│   └── services/
│       ├── playerService.ts     # 玩家绑定与查询
│       └── pluginService.ts     # 插件数据入库与 KD 计算
```

## 免责说明

KD 计算：`人头数(heads) ÷ 对局数(wins+losses)`。对局样本由插件通过 `/api/plugin/*` 推送。