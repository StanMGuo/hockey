# Intent: 自建访问日志

Author: Stan Guo. Status: accepted.

## Problem

Hockey Defence Trainer 部署在 Vercel 上，但站长看不到谁来过。现有站点是 Vite 静态 PWA，没有自己的接口，也没有把访问写到任何地方。

已核对代码（未改实现）：

- 全站只有一个页面。Learn / Practice / Game、某一关、首页，都在同一网址里切换（`gameController.ts` 的 `show()` 和 `G.mode`）。只看网址，不知道人进了哪个模式、哪一关。
- 准入是大家共用的一个密码，写在 `src/auth/gate.ts`，存在 `sessionStorage`。没有球员账号，也没有名字。关卡进度只在这台浏览器的 `localStorage`。
- 仓库里没有 `api/`、没有数据库、没有 `vercel.json`。浏览器打开页面时，请求打到 Vercel 的静态文件，不会经过我们自己的代码。
- Vercel 自带的运行日志和 Observability 要付费。Hobby 上留不住一份可以事后查询的访问记录。

所以现在答不了：谁、什么时间、从哪里、看了哪个画面或哪一关、停留了多久。

## Proposed outcome

1. 每次有人打开或在站内切换画面，留下一条我们自己的记录，至少包含：
   - **谁**：这台浏览器的一个匿名编号，外加当次请求的 IP。没有账号，记不到真人姓名。
   - **什么时间**：到达和离开的时间（UTC）。
   - **什么地点**：国家、地区、城市。用 Vercel 在每次请求上免费附带的地理头，不向手机要 GPS。
   - **访问了什么**：画面（首页、密码门、Learn、Practice、Game、How to play、Settings）以及进行中的关卡 id。
   - **多久**：这一次连续使用从第一次上报到最后一次心跳或离开页面的时长。
2. 记录写入我们自己的数据库，不依赖 Vercel 付费日志、Log Drains 或 Observability。
3. 站长能在站内打开一个日志页看最近的访问：时间、地点、看了什么、停留多久。这个页面用单独的管理密码，不能用球员那个共用密码打开。
4. 玩法、规则、关卡、解锁、进度存储保持不变。日志失败不能挡住进游戏。
5. 本变更按 AI-Native SDLC 走完 `intent.md` → `spec.md` → `plan.md`，计划被接受后再改代码。

## Affected users and systems

- **用户**：打开 PWA 的球员和教练会被记录；看记录的人只有站长。
- **系统**：新增浏览器上报、一个 Vercel Serverless Function（`/api`）、一份 Neon Postgres。现有 `src/engine/`、`src/data/`、`src/state/` 的规则和进度不改语义。
- **验证**：本地或预览环境走通「打开 → 切模式 → 离开 → 日志页能看到这条和时长」。`npm test` 仍须通过。

## Constraints

- 不购买、不接入 Vercel Observability、Log Drains 或运行时日志留存。
- 存储用 Vercel Marketplace 上的 Neon Postgres 免费层。`@vercel/postgres` 和 `@vercel/kv` 已停用，不用它们。
- 地点只到城市。不采集 GPS，不把密码、进度内容、拖拽坐标写进日志。
- 日志页不得复用 `APP_PASSWORD`。球员知道那组密码，不能因此看到别人的访问。
- 静态页面本身不会进我们的函数。时长和「看了什么」必须由页面主动上报；断网时先记在本机，恢复后再送出。
- 不改 `kindOf` / `zonesFor` / `evaluate`，不改 Learn / Practice / Game 的流程和解锁条件。
- 上报或数据库不可用时，游戏照常能玩。
- 写实现代码之前，必须有被接受的 `spec.md` 和 `plan.md`。
- 未获明确要求，不 commit、不推送、不部署生产。连数据库这件事要站长在 Vercel 里授权。

## Non-goals

- 替代 Vercel 上的构建日志、函数报错日志
- 账号、登录、按真人姓名统计（`intent/remember-player/` 仍是 draft，本变更不依赖它）
- 漏斗、留存曲线、A/B、广告分析
- 记录每一次拖拽或每一次点击坐标

## Decisions（已随本 intent 接受）

1. 「谁」= 浏览器匿名编号 + IP。姓名不做。编号存在这台浏览器里，同一台机器再次打开能对上同一个人。
2. 「地点」= 国家 / 地区 / 城市，来自请求头，不是 GPS。
3. 「多久」= 同一次使用里，首次上报到最后一次心跳或页面隐藏。人把页面放到后台或关掉，记到这一刻为止。
4. 用 Neon Postgres 存，站内单独密码的日志页来看。不把日志只留在 Vercel 控制台。
5. 球员共用的游戏密码继续只管进游戏，不管日志。

## Open questions

无。
