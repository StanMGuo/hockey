# Plan: 自建访问日志

Paired: `intent.md` (accepted) + `spec.md` (accepted). Status: accepted.

## Goal

按 spec 记下谁、时间、城市级地点、看了什么、停留多久，存进 Neon，在 `/logs` 给站长看。不改规则、关卡、流程、解锁和进度。没有数据库时游戏照常能玩，构建和测试也不依赖数据库。

## Source of truth

| 产物 | 路径 |
| --- | --- |
| 需求 | `intent/visit-log/intent.md` |
| 规格 | `intent/visit-log/spec.md` |
| 画面切换 | `src/screens/gameController.ts` 的 `show`、`loadScenario`、`openSheet`、`closeSheet`、`goHome` |
| 密码门 | `src/screens/PasswordGate.tsx`、`src/App.tsx` |
| 游戏密码 | `src/auth/gate.ts` 的 `APP_PASSWORD`。日志不得复用它 |

## Files

| Path | 动作 |
| --- | --- |
| `src/visit/types.ts` | 新增。快照、上报身体、画面段判定的类型 |
| `src/visit/decide.ts` | 新增。纯函数：校验身体、这一拍是延长还是新开、时长、10 分钟 30 次、队列裁到 50 条 |
| `src/visit/decide.test.ts` | 新增。T-LOG-01…05 |
| `src/visit/identity.ts` | 新增。`hdt-visitor-id`、`hdt-visit-session` |
| `src/visit/identity.test.ts` | 新增。T-LOG-06 |
| `src/visit/report.ts` | 新增。`noteVisit`、心跳、队列、`pagehide` / `online`。只被浏览器引用 |
| `src/auth/logAccess.ts` | 新增。管理密码、cookie。不读数据库 |
| `src/auth/logAccess.test.ts` | 新增。T-LOG-07 |
| `src/server/store.ts` | 新增。写入和查询的接口。API 与测试都靠它，不直接绑死 Neon |
| `src/server/memoryStore.ts` | 新增。同一套接口的内存实现，给自动验收用。不进浏览器包 |
| `src/server/visitsStore.ts` | 新增。Neon 实现。只被 API 引用 |
| `src/logs/format.ts` | 新增。把一条会话格式成日志页上的五列文字。页面和自动测试共用 |
| `src/visit/success.test.ts` | 新增。自动验收：谁、时间、地点、看了什么、多久。不连数据库，不许跳过 |
| `api/visits.ts` | 新增。`POST` 上报，`GET` 查最近 100 次 |
| `api/logs/session.ts` | 新增。`POST` 登录 |
| `logs.html`、`src/logs/main.tsx`、`src/logs/LogsPage.tsx`、`src/logs/logs.css` | 新增。日志页。不引用 `app.css` |
| `src/screens/gameController.ts` | 改挂钩。`createGame` 增加可选第三参，默认空函数。不改规则分支 |
| `src/screens/GameApp.tsx` | 把 `noteVisit` 传进 `createGame` |
| `src/screens/PasswordGate.tsx` | 挂上时上报 `gate` |
| `vite.config.ts` | 第二入口、Workbox 排除、开发时把 `/logs` 和 `/api` 接上 |
| `vercel.json` | `/logs` → `/logs.html`，其余未命中文件回 `index.html` |
| `package.json` / lock | 增加 `@neondatabase/serverless` |
| `src/engine/`、`src/data/`、`src/state/` | 不改 |

## Order

1. 写 `decide.ts` 和它的测试，先让 T-LOG-01…05 失败再通过。身体只认 `visitorId`、`sessionId`、`kind`（`beat` | `end`）、`screen`、`mode`、`scenarioId`、`sheet`。UUID 用标准 8-4-4-4-12。时长用服务器时间相减，结束早于开始则为 0。同一会话且 screen、mode、scenarioId、sheet 都相同 → 延长；否则新开一段。
2. 写 `identity.ts` 和 T-LOG-06。存储抛错时用当页内存编号，不向外抛。
3. 写 `logAccess.ts` 和 T-LOG-07。用 SHA-256 把提交值和管理密码变成定长摘要再逐字节比较。比较之后，只要提交值等于 `APP_PASSWORD` 就拒绝。未配置 `LOG_ADMIN_PASSWORD` 视为不可登录。Cookie 名 `hdt_log`，值是 `过期秒.HMAC`，HMAC 密钥是管理密码，有效期 7 天。篡改或过期无效。
4. 先写 `store.ts` 和 `memoryStore.ts`，再写 `visitsStore.ts`。处理函数接收 store 和 `now()`，测试传入内存库和固定时钟，生产才用 Neon。`neon()` 放在函数内部，不要在模块顶层调用，这样没有 `DATABASE_URL` 时导入模块也不会在构建期炸掉。第一次写入前执行下面的建表（`IF NOT EXISTS`）：

   - `visit_sessions(id text primary key, visitor_id text, started_at timestamptz, last_seen_at timestamptz, ip text, country text, region text, city text, user_agent text)`
   - `visit_spans(id bigint generated always as identity primary key, session_id text, screen text, mode text, scenario_id text, sheet text, started_at timestamptz, last_seen_at timestamptz)`
   - `visit_ingest(ip text, at timestamptz)`，给 `(ip, at)` 建索引

   写入时：先数这个 IP 在 10 分钟内的 `visit_ingest` 行，已有 30 行就不要再写会话，交给接口返回 429。没超限就插入一行 ingest，再按步骤 1 的判定延长或新开。地点和 IP 只在会话第一次插入时写入。然后删掉 `last_seen_at` 早于 90 天的会话和画面段，以及 10 分钟以前的 ingest 行。
5. 写 `src/visit/success.test.ts`，先红再绿。用内存库和固定时钟，不 `sleep`，不连 Neon。脚本按这个顺序写入同一会话：`T` 首页 → `T+5秒` Learn 关卡 `wall` → `T+45秒` 同一关心跳 → `T+50秒` 回首页。然后走真正的 POST / GET 处理函数（注入内存库），再用 `format.ts` 格式化。下面任一条失败，`npm test` 必须非 0 退出：

   | ID | 断言 |
   | --- | --- |
   | T-LOG-S1 | 读回的访客编号等于写入的编号；再开一个新会话、同一访客，编号仍是它 |
   | T-LOG-S2 | 开始时间等于 `T`。格式化时传入固定时区，得到该时区下的 `T`，而不是跑测试的机器碰巧对不对 |
   | T-LOG-S3 | 请求头 `CA` / `ON` / 百分号编码的城市，格式化后是解码出的城市加地区加国家。头都空着时，地点列是「未知」 |
   | T-LOG-S4 | 路径列含「首页」、`Learn`、关卡 id `wall`，顺序是首页 → Learn → 首页 |
   | T-LOG-S5 | 会话时长等于 50 秒，大于 0。Learn 那一段是 40 秒 |
   | T-LOG-S6 | 用 `renderToStaticMarkup` 渲染日志表，HTML 里同时出现 S1 的编号前 8 位、S2 的时间、S3 的地点、S4 的路径、S5 的时长。没有这五个字符串不算通过 |
   | T-LOG-S7 | 未登录 GET 是 401。游戏密码登录是 401。管理密码登录后，同一个 GET 才得到上面这条。`databaseUrl` 为空时 POST 仍是 204，且 store 的写入次数是 0 |

6. 写两个 API。处理函数的签名是 `(request, store, now)`，文件里的默认导出再去拿 Neon。`POST /api/visits`：先校验，400 直接返回且不记限流；没有 `DATABASE_URL` 或数据库抛错则 `console.error` 并返回 204；超限 429；成功 204。从 `x-vercel-ip-country`、`x-vercel-ip-country-region`、`x-vercel-ip-city` 取地点，城市做一次 `decodeURIComponent`，失败或空字符串当空。IP 用 `x-forwarded-for` 第一段，否则 `x-real-ip`。不读经纬度。User-Agent 截到 200 字。`GET /api/visits`：cookie 无效 401，有效则返回按开始时间倒序的 100 个会话和各自的画面段，并带上算好的 `durationMs`。`POST /api/logs/session`：503（没配密码）、401、或 Set-Cookie。本地 HTTP 不加 Secure；`VERCEL` 环境或 `x-forwarded-proto: https` 时加 Secure。SameSite=Lax，HttpOnly，Path=/。
7. 写 `report.ts`。`noteVisit` 若和上一拍的画面身份相同，不发请求。真正发出之后，把下一次心跳重新排到 30 秒后，避免和刚发出的画面变化叠在一起。页面不可见时不跳心跳。隐藏或 `pagehide` 用 `sendBeacon` 送 `kind: "end"`，没有 beacon 就用 `fetch` 且 `keepalive: true`。失败（除 400）进 `hdt-visit-queue`；400 丢掉。`online`、心跳、页面打开时从旧到新补送；遇到 429 或网络失败就停，60 秒后再试。队列逻辑用步骤 1 的纯函数裁剪。
8. 挂钩，且不上报拖拽和评分：
   - `PasswordGate` 挂载 → `gate`
   - `createGame` 启动末尾 `show('home')` 之后 → `home`
   - `loadScenario` 在 `G.st = st` 且画面数据已经画上之后 → `play` + `G.mode` + `st.id`
   - `openSheet` 增加可选第三参，默认 `other`。`howTo` 传 `how`，`settings` 传 `settings`，`practicePicker` 传 `practice-pick`，`gamePicker` 传 `game-pick`
   - `closeSheet`：正在对局则回到当前 `play`，否则 `home`
   - `goHome` → `home`
   - 回调包在 try/catch 里，上报异常只 `console.error`，不打断游戏
9. 日志页。表格用 `format.ts` 的输出，不要在页面里再算一遍时长或地点。`logs.html` 作为 Vite 第二入口。样式只复制 `:root` 里的颜色和字体，页面可以滚动、文字可以选中。不链到游戏首页。中文表头：开始时间、访客（前 8 位）、地点、IP、停留、路径。时间用浏览器本地时区。不到 1 分钟显示秒。空列表写「还没有访问」。登录失败写「密码不对」。503 写「日志管理密码还没配置」。查询失败写「记录暂时读不出来」。
10. `vercel.json`：先把 `/logs` 指到 `/logs.html`，再把其余请求指到 `/index.html`。Vercel 会先匹配文件和 `/api` 函数，所以接口不会被这条回退吃掉。Workbox 的 `navigateFallbackDenylist` 加上 `/logs` 和 `/api/`。开发服务器把 `/logs` 改写到 `/logs.html`，并把 `/api/visits`、`/api/logs/session` 转给步骤 6 的函数，这样 `npm run dev` 就能点到日志页。
11. 跑 `npm test` 和 `npm run build`。T-LOG-S1…S7 有一条失败就不能说做成了。通过之后再做手动那一截，只查自动化碰不到的事。

## Implementation notes

- `createGame` 的第三参必须有默认值。现有调用少传一个参数时行为与现在相同。
- 设置里每次拨开关都会重画弹层。因为画面身份没变，`noteVisit` 不会再发一次。
- 一组比赛大约 6 个关卡。心跳从「上一次真正发出」起算 30 秒，正常玩一局不会先被 30 次上限挡住。上限仍然留着，挡住的是连打接口。
- 客户端不计算、不上传时长。时长只在服务端用两张表的时间列相减。
- `.env.local` 已被 `*.local` 忽略。不要新增会被提交的环境文件，也不要把密码写进 `vercel.json`。

## Rejected alternatives

- 用 Vercel Observability 或 Log Drains：intent 明确不付这笔费用，而且静态页面的切换根本不会进平台日志。
- 把日志表做进游戏首页的一个按钮：球员都知道游戏密码，入口一放出来就等于公开访问记录。
- 复用 `app.css`：它把 `body` 锁死且禁止选择文字，日志表无法往下滚动。
- 只在浏览器 `localStorage` 记日志：换一台手机就没了，站长也看不到别人。
- 模块顶层就 `neon(process.env.DATABASE_URL)`：没配数据库时，构建导入该文件会直接抛错，违反 spec N2。
- 每个心跳都新插一行画面：日志会被心跳刷满，违反 spec F5。

## Risks

| 风险 | 处理 |
| --- | --- |
| 最险的一步是改 `gameController.ts`。`openSheet` 的调用很多，第三参一旦传错，会把选关记成 `other`，或在动画中途把对局记丢 | 第三参有默认值。只改 `howTo`、`settings`、`practicePicker`、`gamePicker` 四个具名调用。`loadScenario` 的上报放在画面已经画完之后，不放在 `tween` 里面。挂钩后先跑现有 `npm test`，再做 M1、M2 |
| Service Worker 把 `/logs` 打开成游戏 | 步骤 10 的 denylist。手动只看页面上有没有三个模式按钮 |
| 开发时 Vite 不执行 `api/` | 步骤 10 的开发转发。自动验收不依赖这个转发，它直接调用处理函数 |
| 城市头解码失败 | 当空地点，接口仍返回 204 |
| 共用平板只有一个访客编号 | 按 spec N5 接受，不加姓名 |
| 限流表在并发下可能略超过 30 | 两个请求同时数到 29 可以都写下。接受。游戏路径不会靠这个并发 |

## 怎样算成功

五列对不对，由 `npm test` 里的 T-LOG-S1…S7 判定，不靠人眼。这组测试用内存库和固定时钟，不连 Neon，也不许 `it.skip`。一条失败，命令以非 0 退出，就不能说做成了。

它固定写这一次访问：`T` 首页，5 秒后进入 Learn 的 `wall`，40 秒后再跳一次，50 秒时回首页。然后检查：

| 列 | 测试 | 必须成立 |
| --- | --- | --- |
| 谁 | S1 | 读回的编号就是写入的那个；新会话仍是同一人 |
| 什么时间 | S2 | 开始时间就是 `T`，并且按给定时区格式化，不跟跑测试的电脑时区走 |
| 什么地点 | S3 | 有地理头时是解码后的城市、地区、国家；没有头时是「未知」 |
| 访问了什么 | S4 | 路径是首页 → Learn / `wall` → 首页 |
| 访问了多久 | S5 | 整段 50 秒，Learn 那一段 40 秒 |
| 页上真有这五列 | S6 | 渲染出来的 HTML 里同时有编号前 8 位、时间、地点、路径、时长 |
| 别人看不到 | S7 | 不登录是 401，游戏密码是 401，管理密码通过后才能读到上面这条。没配数据库时上报返回 204，且一次都不写入 |

T-LOG-01…07 只检查零件（身体、裁剪、游戏密码）。它们通过，不算五列成功。S1…S7 通过才算。

手动只做自动化碰不到的三件事，不能用来代替上表：

1. 打开游戏，进 Learn 再回来，拖一下人，确认还能玩。
2. 打开 `/logs`，确认不是游戏首页，游戏密码登不进去。
3. 部署到 Vercel 之后再看一行：地点从「未知」变成国家或城市。没部署就写「线上未验」，不要写成已经看到城市。

实现的人把 `npm test` 的结果写进本文件末尾的验收记录。S1…S7 的名字必须出现在通过列表里。手动三件事各写过或不过。不 commit、不推送、不部署生产，除非你另作要求。

## Out of scope

真名和账号、GPS、拖拽坐标、漏斗图、Vercel 构建日志、改规则或进度格式、生产发布。

## 验收记录

2026-11-15。`npm test` 13 个文件、64 条通过，退出码 0。`npm run build` 在没有 `DATABASE_URL` 时通过。

S1…S7 都出现在通过列表里，文件是 `src/visit/success.test.ts`：

- T-LOG-S1 keeps the visitor id across a new session
- T-LOG-S2 records the start time and formats it in the given zone
- T-LOG-S3 decodes a city header and shows 未知 when the headers are empty
- T-LOG-S4 shows home, then Learn / wall, then home
- T-LOG-S5 measures 50 seconds for the visit and 40 seconds on Learn
- T-LOG-S6 renders all five columns into the log table
- T-LOG-S7 hides the log and does not write when the database is unset

手动：

1. 过。打开游戏，密码门之后进首页，再进 Learn。拖动 D1 和 D2 后，说明变成 KEEP GOING，球员位置变了。再点 Home 回到首页。
2. 过。`/logs` 的标题是「访问日志」，页面上没有 LEARN、PRACTICE、GAME。提交游戏密码后仍停在密码框，并显示「密码不对」。
3. 线上未验。没有部署，所以还没有在 Vercel 上看到国家或城市。

处理函数放在 `src/server/http.ts`，`api/visits.ts` 和 `api/logs/session.ts` 只做默认导出。这样 S1…S7 能直接调用它，同时 `tsc` 能检查到。
