# Spec: 日志和球员档案共用一个数据库

Paired intent: `intent.md` (accepted). Status: accepted.

## 1. Problem restatement

访问日志的已接受方案和现有代码使用 Neon，环境变量名是 `DATABASE_URL`。球员档案的已接受规格使用另一个库：Supabase 项目 `lxwyjdlepsntcosczors`。线上两边都还没连上。

本变更只处理「连哪一个库、谁来连、连接之后能碰哪些表」。日志列的含义仍以 `intent/visit-log/spec.md` 为准。球员如何登录、如何建档仍以 `intent/remember-player/spec.md` 为准。本规格被接受之前不写 `plan.md`，计划被接受之前不改实现。

环境变量名继续用 `DATABASE_URL`。它的值改成这个 Supabase 项目的连接串，不再是 Neon 的连接串。

## 2. Requirements

### 2.1 Functional

| ID | Requirement |
| --- | --- |
| F1 | 唯一数据库是 Supabase 项目 `lxwyjdlepsntcosczors`（`https://lxwyjdlepsntcosczors.supabase.co`）。环境变量名保持 `DATABASE_URL`。已配置时，它的值是该项目事务池（端口 `6543`）的 Postgres 连接串，用户名是 `hockey_app`。 |
| F2 | 本仓库只有一个服务端连接，放在 `src/server/db.ts`。访问日志现在就用它。以后的球员档案也只能 import 它，不得再打开第二条连接或另选项目。 |
| F3 | 浏览器不连接数据库。打包进网页的产物里不得出现 `DATABASE_URL` 的值，也不得出现连接串里的口令。禁止 `VITE_DATABASE_URL`。 |
| F4 | 访问表仍是 `visit_sessions`、`visit_spans`、`visit_ingest`。列、限流、时长和 90 天保留的含义不改，以 `intent/visit-log/spec.md` 为准。 |
| F5 | 球员档案仍是另一组表。本变更不实现登录、建档、短密码或进度保存，也不在本变更的 SQL 里建档案表。 |
| F6 | 两组表互不引用。访问日志不写 nickname、球衣号或进度。日志代码不查询档案表。 |
| F7 | 只有 F1 这种连接串才算已配置，访问才写入该项目。下面任何一种都算未配置，一次都不连接：变量为空、主机或用户名里没有 `lxwyjdlepsntcosczors`、用户名不是 `hockey_app`、端口不是 `6543`、`sslmode=disable`。未配置时游戏照常能玩。日志页写明还没有连接数据库，而不是「还没有访问」。 |
| F8 | 不在请求里建表或建角色。语句放在仓库里，由发起人在该项目的 SQL Editor 执行一次。口令那一句只在编辑器里执行，不写进仓库。表还没有或角色还不能登录时，写入失败走 F7 的失败路径：游戏照常，服务端记录错误，不把数据库错误页返回给球员。 |
| F9 | 三张访问表 `ENABLE ROW LEVEL SECURITY`，并且 `FORCE ROW LEVEL SECURITY`。不给 `anon`、`authenticated`、`public` 写策略，并收回它们在这三张表上的权限。Supabase 的公开接口因此读不到、也写不了这些表。 |
| F10 | 服务端使用的数据库角色是 `hockey_app`。它不是超级用户，没有 `BYPASSRLS`、`CREATEDB`、`CREATEROLE`。它只拥有 `public` 的 `USAGE`，以及这三张表的 `SELECT`、`INSERT`、`UPDATE`、`DELETE`，外加 `visit_spans` 身份序列的使用权。不授予 `auth`、`storage` 和其他 schema。给这个角色的策略只放行它自己的这些语句。 |
| F11 | 查询使用占位参数。浏览器送来的正文不拼进 SQL 文本。接口只执行访问存储里写好的那些语句。响应和日志里不出现 `DATABASE_URL`，也不出现连接串中的口令。 |
| F12 | 读取访问日志仍要管理密码。游戏密码仍然打不开 `/logs`。本变更不放宽这一条。 |

### 2.2 Non-functional

| ID | Requirement |
| --- | --- |
| N1 | 驱动用 `postgres`（postgres.js），每个调用 `max: 1`、`prepare: false`、`ssl: 'require'`。变量名是 `DATABASE_URL`。`.env.example` 只写这个名字；值留空，注释写明它是本项目端口 `6543`、用户 `hockey_app` 的连接串。 |
| N2 | `npm test` 与 `npm run build` 在没有 `DATABASE_URL` 时通过，并且不连接网络。 |
| N3 | 访问路径上不再使用 `@neondatabase/serverless`。该驱动只连接 Neon 的协议，连不上这个 Supabase 项目。本变更不引入第二个数据库产品，也不使用 `@supabase/supabase-js`。 |
| N4 | `.env` 不提交。现有 `.gitignore` 已忽略 `*.local`，计划里再忽略 `.env`。 |

### 2.3 Non-goals

- 实现 `intent/remember-player/` 的身份门和进度保存
- 修改日志的画面集合、心跳间隔、限流次数或保留天数
- 把 `.data/visits.json` 里的开发记录迁进 Supabase
- 另建一张用完即删的测试表。第一次真实写入就是 `visit_sessions`
- 部署生产，或在 Vercel 上代填 `DATABASE_URL`
- 使用 Supabase 的 `service_role` 或项目的 `postgres` 超级用户来跑应用

## 3. Design

### 3.1 连接

`src/server/db.ts` 只在服务端读取 `DATABASE_URL`。

- 符合 F1：返回一个 SQL 客户端。
- 不符合 F7：返回未配置，不创建连接。主机不对、用户名是 `postgres`、或端口是 `5432` 时 `console.error` 一次，内容不含连接串。
- 模块被导入时，缺少变量也不得抛错。不得在模块顶层创建连接。

本机没有连接串时，自动测试和构建仍按 N2 通过。手动验收在连接串和 SQL 都就绪之前，结论是「还不能验收」。

### 3.2 安全性

安全分成三层。三层都要在，少一层就不算接上。

1. **连接串只在服务端。** `DATABASE_URL` 放在本机 `.env` 和 Vercel 的环境变量里。网页包、Git、接口响应和错误日志都不带它。拿到这串连接串的人，能做 `hockey_app` 被允许的全部事情，所以它按密钥保管。
2. **数据库角色只能动我们的表。** 应用不用 `postgres` 超级用户，也不用 `service_role`。那两个身份会绕过行级安全，还能碰到 Supabase 自己的 `auth` 表。`hockey_app` 没有 `BYPASSRLS`。行级安全对它也生效。它的权限和策略只覆盖 F10 列出的表。`anon` 和 `authenticated` 没有策略，原有授权也被收回，因此知道项目 URL 的人从 Supabase 公开接口进不来。
3. **应用只执行自己的语句。** 上报接口先按已接受的访问日志规格校验字段，再用占位参数写入。它不接收任意 SQL。日志页的读取仍要管理密码，游戏密码无效。日志代码不查询以后的档案表。

口令由发起人在 SQL Editor 里执行 `alter role hockey_app password '...'`，然后把连上的连接串放进 `DATABASE_URL`。这一句不进入 `src/server/schema.sql`，也不进入 Git。

### 3.3 访问日志

`VisitStore` 接口保持不变。`src/visit/success.test.ts` 继续注入内存库，不连接数据库。

`src/server/visitsStore.ts` 的生产实现改为通过 §3.1 的客户端执行现在这些语句。语句仍用占位参数。限流、延长或新开一段、地点只在会话第一次写入、删除 90 天以前的记录，这些行为与现在的实现一致。

`src/server/http.ts` 的 `productionDeps`：

- 已配置：使用这个实现。
- 未配置：不写入。不再使用 `.data/visits.json`。`DATABASE_URL` 指向 Neon、超级用户或直连端口时，同样不写入。

日志页在未配置或查询失败时，文字是「还没有连接数据库，所以访问没有保存。」或「记录暂时读不出来」。不得显示成没有人来过。

### 3.4 建表与授权

计划被接受后，语句写入 `src/server/schema.sql`。内容包括：

- 现有三张访问表，以及 `visit_ingest` 上现有的 `(ip, at)` 索引
- `hockey_app`：`LOGIN`，非超级用户，无 `BYPASSRLS`、`CREATEDB`、`CREATEROLE`。文件里不写口令
- F10 的授权，以及 F9 的行级安全和只给 `hockey_app` 的策略
- 收回 `anon`、`authenticated`、`public` 在这三张表上的权限

不写档案表，不写测试表。发起人执行完文件后，自己在 SQL Editor 里设定口令。执行和口令都完成之前，不把连库报为完成。

以后档案表要授权给同一个 `hockey_app`。那部分语句留在 `intent/remember-player/` 的计划里，不写进这次的文件。

### 3.5 球员档案

本变更交付的是共享连接和上面的权限边界，不是档案功能。`intent/remember-player/plan.md` 仍是 draft。它现在写的是 service role 再连一次，并让日志继续留在 Neon。那份计划被接受之前，先改成 import `src/server/db.ts`，使用同一个 `DATABASE_URL`，并删掉「日志用 Neon」。档案表建在这同一个项目里，授权给 `hockey_app`，同样强制行级安全，不给 `anon` 策略。

### 3.6 Files

本表是接受后的 `plan.md` 要落的范围。规格未被接受前，不改这些文件。

| Path | Change |
| --- | --- |
| `src/server/db.ts` | 新增。全仓库唯一的数据库连接，并执行 F7 的判断 |
| `src/server/visitsStore.ts` | 生产实现从 Neon 驱动改为该连接。SQL 仍用占位参数，`VisitStore` 不变 |
| `src/server/http.ts` | 只按 §3.1 判断是否已配置 |
| `src/server/fileStore.ts` | 生产路径不再引用。没有剩余引用时删除 |
| `package.json` | 增加 `postgres`。移除 `@neondatabase/serverless` |
| `.env.example`、`.gitignore` | 见 N1、N4 |
| `src/server/schema.sql` | 见 §3.4。不含口令 |
| `intent/visit-log/spec.md`、`intent/visit-log/plan.md` | 库从 Neon 改为本规格。变量名 `DATABASE_URL` 保留。日志行为条款不动 |
| `intent/remember-player/plan.md` | 去掉「日志继续用 Neon」、service role 和第二套连接，改为 `src/server/db.ts` 与 `DATABASE_URL` |

不改 `src/engine/`、`src/data/`、`src/state/`。不实现身份门。

### 3.7 Test strategy

自动测试不连接真库：

| ID | 检查 |
| --- | --- |
| T-DB-01 | 没有 `DATABASE_URL` 时，导入 `src/server/db.ts` 不抛，且不创建连接 |
| T-DB-02 | Neon 主机、用户名 `postgres`、端口 `5432`、`sslmode=disable`、或没有项目编号 `lxwyjdlepsntcosczors` 时，不创建连接 |
| T-DB-03 | 符合 F1 的连接串使 `productionDeps` 选用新的访问存储。测试只判断这个选择，不打开网络 |
| T-LOG-S1…S7 | 仍用内存库通过，不跳过，不连网 |
| T-DB-04 | 构建时环境里放一条假的 `DATABASE_URL`。网页产物里搜不到这条假口令。`npm run build` 在变量为空时也能通过 |

手动，只在 `.env` 里的 `DATABASE_URL` 已是 `hockey_app` 的池化连接串，且 `src/server/schema.sql` 与口令都已在该项目执行之后做：

1. 打开游戏，走过密码门并进入首页。
2. 打开 `/logs`，用管理密码登录，能看到这次访问。游戏密码仍然进不去。
3. 在 Supabase 的 `visit_sessions` 里能找到对应的一行。

缺连接串、用了超级用户、或还没执行 SQL 时，这一步的结论是「还不能验收」。游戏仍要能玩，日志页要写明没有连接数据库。没有部署，就不写线上通过。

Done（G4）需要 T-DB-01…04 和 T-LOG-S1…S7 的命令输出，以及上面三步的记录。没有这三步，不得把「已经连上 Supabase」报为完成。

## 4. Areas of concern

| Concern | 处理 |
| --- | --- |
| 连接串泄露之后，对方可以做 `hockey_app` 能做的事 | F3、F11。连接串只在服务端。角色权限停在 F10，到不了 `auth` 和其他 schema |
| 用项目自带的 `postgres` 用户会绕过行级安全 | F7、F10。这种连接串视为未配置，代码不连接 |
| Supabase 默认可能把 `public` 表授给 `anon` | F9。启用并强制行级安全，同时收回这些授权 |
| 换掉 Neon 驱动时，限流或时长可能变样 | SQL 文本和占位参数保持现有语句。T-LOG-S1…S7 继续守住规则 |
| 去掉 `.data/visits.json` 之后，没配连接串就看不到本机访问 | 接受。页面说明未连接，符合已接受 intent |
| `intent/visit-log/` 里已经接受的文字仍写着 Neon | 库以本 spec 为准，变量名仍是 `DATABASE_URL`。那两个文件要等本 spec 和随后的 `plan.md` 都接受后再改 |
| `intent/remember-player/plan.md` 还写着 service role | 以本 spec 的 `DATABASE_URL` 和 `hockey_app` 为准。那份计划接受前先改；本变更不提前实现档案 |
| 本机还没有这条连接串 | 自动测试不需要它。手动三步在连接串和 SQL 就绪前停住 |
| 孩子的 nickname 和访问记录会在同一个项目里 | 表不关联，日志不写姓名。同一个角色以后能读写两边，所以日志代码按 F6 不查询档案表 |

## 5. Open questions

无。环境变量名继续用 `DATABASE_URL`，这是发起人在本 spec 草稿上的要求，已经写进 F1。驱动、`hockey_app`、端口 `6543`、不建测试表、去掉本机文件后备，都是本 spec 为了可实现而写下的决定。不同意就退回本 spec。

## 6. Acceptance checklist（G2）

- [x] 覆盖已接受 intent：一个 Supabase 项目同时供访问日志和球员档案使用，表分开
- [x] 环境变量名保持 `DATABASE_URL`；值是 `hockey_app` 的池化连接串，不是 Neon，也不是超级用户
- [x] 网页产物不含连接串；公开接口没有这些表的策略
- [x] 自动测试不连真库
- [x] 没配库时游戏能玩，日志不显示成「还没有访问」
- [x] 球员登录仍留在 `intent/remember-player/`，本变更不提前实现
- [x] concerns 有对应处理
- [x] 发起人已接受本 spec。下一步写 `plan.md`；`plan.md` 被接受之前不改实现代码
