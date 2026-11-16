# Spec: 自建访问日志

Paired intent: `intent.md` (accepted). Status: accepted.

## 1. Problem restatement

站点是 Vite 静态 PWA，画面切换不改网址，没有接口和数据库。Vercel 付费日志不能用。站长需要自己的记录：谁（浏览器匿名编号 + IP）、什么时间、城市级地点、看了哪个画面或哪一关、这一次用了多久。球员共用的游戏密码不能打开这份记录。

## 2. Requirements

### 2.1 Functional

| ID | Requirement |
| --- | --- |
| F1 | 同一浏览器第一次打开时生成访客编号（UUID），写入 `localStorage` 键 `hdt-visitor-id`。之后同一浏览器再打开，沿用这个编号。 |
| F2 | 每个标签页一次使用一个会话编号（UUID），写入 `sessionStorage` 键 `hdt-visit-session`。关掉标签页再开是新会话。 |
| F3 | 画面变化时立刻上报。画面集合：`gate`（密码门）、`home`（首页）、`play`（对局）、`sheet`（弹层）。对局带上 `mode`（`learn` / `help` / `test` / `game`）和当前关卡 `scenarioId`。弹层带上 `sheet`：`how`、`settings`、`practice-pick`、`game-pick`，其余弹层记为 `other`。 |
| F4 | 页面可见时每 30 秒再上报一次当前画面（心跳）。切到后台、关闭或刷新时，用 `sendBeacon` 再送一次并标为结束。时长只用服务器收到请求的时间，不用手机上的时钟。 |
| F5 | 一次会话的时长 = 该会话最后一次服务器时间 − 第一次服务器时间。每个画面的时长 = 该画面最后一次心跳 − 它开始的服务器时间。同一会话里连续心跳如果画面、模式、关卡、弹层都没变，只延长这一段，不新开一行。 |
| F6 | 服务器从 Vercel 请求头写入国家、地区、城市和 IP。不读、不存经纬度。头缺失或无法解码时，地点为空，日志页显示「未知」。城市头按百分号解码。IP 取 `x-forwarded-for` 的第一段，否则用 `x-real-ip`。 |
| F7 | `POST /api/visits` 接收上报。身体只允许：`visitorId`、`sessionId`、`kind`（`beat` 或 `end`）、`screen`、`mode`、`scenarioId`、`sheet`。多余字段忽略。格式不对返回 400，不入库。 |
| F8 | 同一 IP 在 10 分钟内超过 30 次上报返回 429，不入库。客户端把这条留在队列里，稍后重试。游戏本身不显示错误。 |
| F9 | 断网或非 2xx（除 400）时，事件进 `localStorage` 队列 `hdt-visit-queue`，最多 50 条，超出丢掉最旧的。`online`、下次心跳、页面重新打开时补送。 |
| F10 | 数据库不可用，或没有 `DATABASE_URL` 时，`POST /api/visits` 返回 204 且不抛到页面上。游戏可以玩。 |
| F11 | 超过 90 天的会话和画面段，在每次成功入库时删掉。 |
| F12 | 日志页在 `/logs`，首页和游戏里没有入口。打开后先要管理密码。密码来自环境变量 `LOG_ADMIN_PASSWORD`，不写进仓库。 |
| F13 | 提交的密码只要等于 `src/auth/gate.ts` 里的 `APP_PASSWORD`，一律拒绝，即使环境变量被设成同一个值。比较用定长比较，不把密码写进日志或响应。 |
| F14 | 密码正确后种下 HttpOnly、SameSite=Lax 的 cookie，有效期 7 天。生产环境加 Secure。之后 `GET /api/visits` 返回最近 100 次会话：开始时间、访客编号、地点、IP、会话时长，以及每一段画面（画面、模式、关卡 id、弹层、时长）。 |
| F15 | 日志页用中文表头，时间按看的人的本地时区显示。没有数据时写「还没有访问」。未配置 `LOG_ADMIN_PASSWORD` 时写「日志管理密码还没配置」，不给进。 |
| F16 | Learn / Practice / Game 的规则、流程、解锁、进度、音效保持现状。上报抛错不能打断拖拽、进关或密码门。 |

### 2.2 Non-functional

| ID | Requirement |
| --- | --- |
| N1 | 不接入 Vercel Observability、Log Drains，不用已停用的 `@vercel/postgres`、`@vercel/kv`。数据库是 Supabase 项目 `lxwyjdlepsntcosczors`，驱动 `postgres`，变量名仍是 `DATABASE_URL`。连接和权限见 `intent/database/spec.md`。不用 Neon，不用 `@neondatabase/serverless`。 |
| N2 | `npm test` 与 `npm run build` 在没有 `DATABASE_URL`、没有 `LOG_ADMIN_PASSWORD` 时也能通过。测试不连接真数据库。 |
| N3 | Service Worker 的导航回退不得把 `/logs` 或 `/api/*` 送去游戏的 `index.html`。`POST /api/visits` 不被 Workbox 缓存。 |
| N4 | 上报请求体小于 2 KB。不记录密码、进度、拖拽坐标、经纬度、User-Agent 全文以外的设备指纹。User-Agent 最多存 200 字符，仅作排错，日志页默认不展示。 |
| N5 | 访客编号和会话编号只识别浏览器，不识别真人。一台共用平板只有一个访客编号。 |

### 2.3 Non-goals

账号与真名、漏斗和留存图、构建日志和函数报错、记录每次拖拽、GPS、把日志页放进球员能点到的菜单。

## 3. Design

### 3.1 数据

表在 Supabase 项目 `lxwyjdlepsntcosczors`。连接、角色和行级安全见 `intent/database/spec.md`。时间列用 `timestamptz`。

`visit_sessions`

| 列 | 含义 |
| --- | --- |
| id | 会话 UUID，主键 |
| visitor_id | 访客 UUID |
| started_at | 第一次入库的服务器时间 |
| last_seen_at | 最后一次心跳或结束的服务器时间 |
| ip | 文本，可空 |
| country | 可空 |
| region | 可空 |
| city | 可空 |
| user_agent | 可空，截断到 200 字符 |

`visit_spans`

| 列 | 含义 |
| --- | --- |
| id | 自增主键 |
| session_id | 外键 |
| screen | gate / home / play / sheet |
| mode | 可空 |
| scenario_id | 可空 |
| sheet | 可空 |
| started_at | 这一段开始 |
| last_seen_at | 这一段最后心跳 |

建表语句放在服务端模块里，第一次写入时 `CREATE TABLE IF NOT EXISTS`。不另加迁移框架。

地点写在会话上，取该会话第一次请求的头。后继心跳不改地点。

### 3.2 接口

`POST /api/visits`

- 校验通过且未超限：插入或更新会话与当前画面段，顺手删除 90 天前的行，返回 204。
- 同一会话、同一画面身份的心跳：只把两张表的 `last_seen_at` 设为现在。
- 画面身份变了：把上一段的 `last_seen_at` 留在上一次，插入新的一段。
- 400：身体不合法，客户端丢掉这一条，不重试。
- 429：超限，客户端保留并退避。
- 没有 `DATABASE_URL`，或数据库抛错：204，不把错误页面返回给球员。服务端 `console.error` 一次。

`POST /api/logs/session`

- 身体 `{ password: string }`。
- 未配置管理密码：503。
- 密码等于 `APP_PASSWORD`，或与 `LOG_ADMIN_PASSWORD` 不一致：401。
- 成功：Set-Cookie。Cookie 值是 `过期时间.HMAC`，密钥用 `LOG_ADMIN_PASSWORD`，不另建会话表。

`GET /api/visits`

- Cookie 无效或过期：401。
- 有效：JSON，最多 100 个会话，按 `started_at` 降序。每个会话带它的画面段，按开始时间升序。时长用毫秒差，由接口算好 `durationMs`，不在查询里做展示用的时区转换。

### 3.3 浏览器侧

`src/visit/` 是纯模块，游戏控制器只在画面变化时调用 `noteVisit(snapshot)`。心跳、队列、`pagehide`、`online` 由这个模块自己管。

挂钩位置：

| 位置 | 上报 |
| --- | --- |
| `PasswordGate` 出现 | `gate` |
| `goHome` / 解锁后进入首页 | `home` |
| `loadScenario` 成功展示一关 | `play` + 当前 `mode` + `scenario.id` |
| `howTo` / `settings` / 练习选关 / 比赛选关 | 对应的 `sheet` 名 |
| 其他 `openSheet` | `sheet` = `other` |
| `closeSheet` 且人还在对局 | 回到当前 `play` |

`createGame` 增加可选回调，默认接到 `noteVisit`。测试可以传入空回调，现有控制器测试不会因此打到网络。

### 3.4 日志页

`logs.html` 为第二个 Vite 入口，脚本只拉日志页，不把冰场打进去。`vercel.json` 把 `/logs` 指到 `/logs.html`。游戏的单页回退排除 `/api/` 和 `/logs`。

页面两态：密码表单、会话表。表列：开始时间、访客（编号前 8 位）、地点（城市, 地区, 国家）、IP、停留、路径。路径把每一段收成一行，例如「首页 2 分 → Learn / 关卡 id 5 分」。时长不满 1 分钟显示秒。

视觉沿用现有深色底和现有字体，不新做一套品牌。这是站长用的表，不是给球员的新模式。

### 3.5 文件

| Path | Change |
| --- | --- |
| `src/visit/identity.ts` | 访客编号、会话编号 |
| `src/visit/report.ts` | 快照、心跳、队列、beacon |
| `src/visit/decide.ts` | 纯函数：这一拍是延长当前段还是新开一段；时长；限流判断；身体校验 |
| `src/visit/*.test.ts` | 上面这些纯函数和编号持久化 |
| `src/auth/logAccess.ts` | 拒绝游戏密码、校验管理密码、签发和核对 cookie。可单测，不碰数据库 |
| `api/visits.ts` | POST 上报、GET 查询 |
| `api/logs/session.ts` | POST 登录 |
| `src/server/store.ts` | 写入与查询接口。测试用内存实现，生产用 `src/server/db.ts` |
| `src/server/visitsStore.ts` | 通过 `src/server/db.ts` 读写。建表在 `src/server/schema.sql`，不在请求里执行 |
| `src/logs/format.ts` | 五列文字。日志页和 `src/visit/success.test.ts` 共用 |
| `src/visit/success.test.ts` | T-LOG-S1…S7。不连数据库，不许跳过 |
| `logs.html`、`src/logs/main.tsx` | 日志页 |
| `src/screens/gameController.ts` | 在 §3.3 的位置调用回调，不改规则分支 |
| `src/screens/PasswordGate.tsx`、`src/App.tsx` | 密码门与解锁后首页的上报 |
| `vite.config.ts` | 第二入口；Workbox 排除 `/logs` 与 `/api/` |
| `vercel.json` | `/logs` 与单页回退 |
| `package.json` | 增加 `postgres`。不再依赖 `@neondatabase/serverless` |

不改 `src/engine/`、`src/data/`、`src/state/`。

### 3.6 环境与上线前的人工步骤

代码可以在没有数据库时构建和测试。真正记下一条，需要站长自己做两件事（本 spec 的实现阶段不代做生产发布）：

1. 把 `DATABASE_URL` 设成 `intent/database/spec.md` 规定的 `hockey_app` 事务池连接串。不连接 Neon。
2. 设置 `LOG_ADMIN_PASSWORD`，且不得等于游戏密码。

本地要用日志时，把这两项放进 `.env.local`（已被 `*.local` 忽略）。

### 3.7 Test strategy

零件测试在 `npm test` 里，无数据库。通过了只说明零件在，不等于五列成功：

| ID | 检查 |
| --- | --- |
| T-LOG-01 | 合法身体通过；缺字段、坏 UUID、未知 screen 被拒绝 |
| T-LOG-02 | 同一画面的第二次心跳判定为延长；模式或关卡变了判定为新开一段 |
| T-LOG-03 | 时长 = 最后服务器时间 − 开始服务器时间；结束早于开始时时长为 0 |
| T-LOG-04 | 10 分钟内第 31 次判定为拒绝 |
| T-LOG-05 | 队列超过 50 条时丢掉最旧的 |
| T-LOG-06 | 访客编号写入后第二次读取不变；没有 `localStorage` 时返回临时编号且不抛 |
| T-LOG-07 | 密码等于 `APP_PASSWORD` 时拒绝；等于另一组管理密码时通过；cookie 被篡改或过期时无效 |

成功测试也在 `npm test` 里，文件是 `src/visit/success.test.ts`。用内存库和固定时钟，不连真库，不允许跳过。脚本写入：`T` 首页 → `T+5秒` Learn `wall` → `T+45秒` 心跳 → `T+50秒` 首页。任一条失败则命令非 0 退出：

| ID | 证明的成功 |
| --- | --- |
| T-LOG-S1 | 谁：读回的访客编号等于写入的；新会话仍是同一编号 |
| T-LOG-S2 | 什么时间：开始时间等于 `T`，按传入时区格式化 |
| T-LOG-S3 | 什么地点：有地理头时是解码后的城市、地区、国家；没有头时是「未知」 |
| T-LOG-S4 | 访问了什么：路径为首页 → Learn / `wall` → 首页 |
| T-LOG-S5 | 访问了多久：整段 50 秒，Learn 一段 40 秒 |
| T-LOG-S6 | 日志表的 HTML 里同时有编号前 8 位、时间、地点、路径、时长 |
| T-LOG-S7 | 未登录和游戏密码都是 401；管理密码登录后才能读到这条。没配数据库时 POST 为 204 且不写入 |

手动只覆盖这三项，不代替 S1…S7：游戏仍能玩、`/logs` 不是游戏页且游戏密码进不去、部署到 Vercel 后地点变成国家或城市。没部署就记「线上未验」。

Done（G4）= T-LOG-01…07 与 T-LOG-S1…S7 都通过，`npm run build` 通过，并且手动三项有记录。S 组没跑或被跳过，不算完成。

## 4. Areas of concern

| Concern | 处理 |
| --- | --- |
| 使用者里有小孩，IP 和城市会留下来 | 已在 intent 接受。只给管理密码、页面无入口、不存 GPS、90 天后删除、游戏密码打不开 |
| 上报接口没有登录，可以被刷 | F8：每 IP 每 10 分钟 30 次。超出 429。球员端不报错 |
| 心跳 30 秒，时长会少算最多约 30 秒；标签页被系统冻住会少得更多 | 接受这个误差。日志页不写成精确到秒的承诺。规格里的「多久」就是服务器收到的首尾之差 |
| Service Worker 把 `/logs` 吞进游戏壳 | N3，用 denylist。手动打开 `/logs` 确认不是游戏页。五列是否正确由 S1…S7 判定，不靠这次目视 |
| 共用平板上分不出两个孩子 | N5，与已接受的「匿名编号」一致。不在本变更加人名 |
| 数据库还没连上或暂时不可用 | F10：游戏照常。日志页在未配置时写明还没有连接数据库。查询失败时页面写「记录暂时读不出来」 |
| 城市头是编码后的非 ASCII | F6 解码失败则显示「未知」，不让接口 500 |
| 管理密码被设成游戏密码 | F13 仍然拒绝，登录永远失败，直到改成另一个密码 |

## 5. Open questions

无。90 天保留、30 秒心跳、每 10 分钟 30 次、日志页不放进游戏菜单，都是本 spec 的决定，不再问 intent。

## 6. Acceptance checklist（G2）

发起人已批准本 spec，含 §3.7 的 T-LOG-S1…S7。

- [x] 覆盖已接受 intent：谁、时间、城市级地点、看了什么、多久，且不靠 Vercel 付费日志
- [x] 日志页与游戏密码隔离（F12、F13）
- [x] 上报失败不打断游戏（F10、F16）
- [x] §3.7 的成功测试不连真数据库，而且不允许跳过。手动只查游戏还能玩、`/logs` 不是游戏页、线上地点
- [x] concerns 有对应处理
- [x] 发起人接受本 spec 之后，才写 `plan.md`；`plan.md` 被接受之前不改实现代码
