# Intent: 日志和球员档案共用一个数据库

Author: Stan Guo. Status: accepted.

## Problem

访问日志和球员档案各写了一套数据库，两套都还没在线上连上。

已接受的决定现在是分开的：

- `intent/visit-log/` 已接受，并且代码已经按它做了：访问写入 Neon Postgres，连接串是 `DATABASE_URL`。实现在 `src/server/visitsStore.ts` 和 `src/server/http.ts`。没有这个变量时，本机写 `.data/visits.json`，Vercel 上不保存。线上目前没有 `DATABASE_URL`。
- `intent/remember-player/spec.md` 已接受：球员档案放在 Supabase 项目 `lxwyjdlepsntcosczors`（`https://lxwyjdlepsntcosczors.supabase.co`）。配对的 `plan.md` 仍是 draft，并写明访问日志继续用 Neon，本计划不建日志。
- 本机没有这个 Supabase 项目的 `.env`。打开该项目的 SQL 编辑器时，停在登录页。

日志和档案都要进我们自己的库。继续各接一家，就会有两套密钥、两种驱动，以及一份已经接受、但和发起人现在的要求相反的 Neon 决定。

## Proposed outcome

1. 数据库从「访问日志的存储」和「球员档案的存储」里抽出来，单独走这一份 `intent.md` → `spec.md` → `plan.md`。
2. 两件事用同一个库：访问日志（谁、时间、地点、看了什么、多久）和球员档案（nickname、球衣号、短密码、进度）。表仍然分开。日志不记下球员姓名，档案页也不读取访问记录。
3. 这一份库用已经指定的 Supabase 项目 `https://lxwyjdlepsntcosczors.supabase.co`。访问日志不再新接 Neon。
4. 浏览器不连接这个项目。密钥只放在服务端环境变量里，不写进仓库，也不打进网页。
5. 没有配上这个库时，游戏仍然能玩，构建和自动测试也不连接真库。日志在没配库时不假装已经保存。
6. 本意图被接受之后才写 `spec.md`。规格被接受之后才写 `plan.md`。计划被接受之前不改实现，不改 `intent/visit-log/` 和 `intent/remember-player/` 里已经写上的库，也不在 Supabase 里建表。

## Affected users and systems

- **用户**：球员和教练仍只使用游戏和自己的档案。站长仍用单独的管理密码看访问日志。球员不因为共用一个库就看得到日志。
- **系统**：已上线方向的访问日志存储（现在的 Neon 实现）、尚未开工的球员档案、Vercel 上这个项目的环境变量。`src/engine/`、`src/data/` 的规则和关卡不改。
- **验证**：计划被接受并连上之后，日志能写入这个项目，档案也能写入这个项目。自动测试仍然不连真库。

## Constraints

- 不购买、不接入 Vercel Observability、Log Drains。不用已停用的 `@vercel/postgres`、`@vercel/kv`。
- 不把访问日志和球员档案并成一张表，也不用访客编号去对真人姓名。
- 团队密码、短密码、service role 不进仓库，不进浏览器包。
- 上报或数据库不可用时，游戏照常能玩。
- 写实现代码之前，必须有被接受的 `spec.md` 和 `plan.md`。
- 未获明确要求，不 commit、不推送、不部署生产。

## Non-goals

- 在本意图里选定表的列、驱动或环境变量名
- 现在就改访问日志代码，或开始做球员登录
- 把本机 `.data/visits.json` 里的开发记录迁进线上
- 排行榜、邮箱登录、按姓名统计访问

## Decisions（已随本 intent 接受）

1. 数据库单独成这一份变更。访问日志和球员档案用同一个库。
2. 这个库是 Supabase 项目 `https://lxwyjdlepsntcosczors.supabase.co`。访问日志不再新接 Neon。
3. 表仍然分开。日志不记下球员姓名，档案也不读取访问记录。
4. 浏览器不连接。密钥只放在服务端环境变量里。
5. 没有配上这个库时，游戏仍能玩。日志不假装已经保存。
6. 表结构和连接方式写在 `spec.md`。规格被接受之后才写 `plan.md`。计划被接受之前不改实现，不改另外两份里已经写上的库，也不建表。

## Open questions

无。
