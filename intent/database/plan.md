# Plan: 日志和球员档案共用一个数据库

Paired: `intent.md` (accepted) + `spec.md` (accepted). Status: accepted.

## Goal

按 spec 把访问日志接到 Supabase 项目 `https://lxwyjdlepsntcosczors.supabase.co`。环境变量名保持 `DATABASE_URL`。值是角色 `hockey_app` 的事务池连接串。球员登录不在这次做。自动测试不连真库。

## Source of truth

| 产物 | 路径 |
| --- | --- |
| 需求 | `intent/database/intent.md` |
| 规格 | `intent/database/spec.md` |
| 日志列与上报行为 | `intent/visit-log/spec.md` |
| 现有写入 | `src/server/visitsStore.ts`、`src/server/http.ts` |
| 日志页未连接时的句子 | `src/logs/LogsPage.tsx` 已有「还没有连接数据库，所以访问没有保存。」 |

## 连接

唯一入口是 `src/server/db.ts`。它导出 `classifyDatabaseUrl` 和 `createSql`。

`classifyDatabaseUrl` 用 `URL` 解析，不打印原文：

| 结果 | 条件 |
| --- | --- |
| `missing` | 空字符串或未设置。不打日志 |
| `ok` | 协议是 `postgres:` 或 `postgresql:`；用户名以 `hockey_app` 开头，点号前的角色名正好是 `hockey_app`；端口是 `6543`；查询参数 `sslmode` 不是 `disable`；用户名或主机里含有 `lxwyjdlepsntcosczors` |
| `rejected` | 其余情况。进程内只 `console.error` 一次，固定文字 `DATABASE_URL rejected`，不含连接串 |

Supabase 事务池的用户名是 `hockey_app.lxwyjdlepsntcosczors`。点号前是角色，点号后是项目编号。这种用户名算 `ok`。`postgres` 和 `postgres.lxwyjdlepsntcosczors` 算 `rejected`。

`createSql(url)` 在第一次查询时才调用 `postgres(url, { max: 1, prepare: false, ssl: 'require' })`。模块顶层不读环境变量，不创建连接。导入本文件不得抛错。

`productionDeps` 只看分类结果：

- `ok`：使用访问存储，`databaseUrl` 设为字面量 `'configured'`。不把 `process.env.DATABASE_URL` 放进 `HandlerDeps`。
- `missing` 或 `rejected`：使用什么都不写的 store，`databaseUrl` 为 `null`。不再使用 `.data/visits.json`。

`console.error` 数据库错误之前，先去掉环境变量原文和其中的口令。响应体不带连接串。

## 建表与授权

语句放进 `src/server/schema.sql`。文件里没有口令。由你在该项目的 SQL Editor 执行一次。应用请求里不建表、不建角色。

```sql
create table if not exists public.visit_sessions (
  id text primary key,
  visitor_id text not null,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  ip text,
  country text,
  region text,
  city text,
  user_agent text
);

create table if not exists public.visit_spans (
  id bigint generated always as identity primary key,
  session_id text not null,
  screen text not null,
  mode text,
  scenario_id text,
  sheet text,
  started_at timestamptz not null,
  last_seen_at timestamptz not null
);

create table if not exists public.visit_ingest (
  ip text,
  at timestamptz not null
);

create index if not exists visit_ingest_ip_at on public.visit_ingest (ip, at);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hockey_app') then
    create role hockey_app login nosuperuser nobypassrls nocreatedb nocreaterole;
  end if;
end
$$;

alter role hockey_app login nosuperuser nobypassrls nocreatedb nocreaterole;

grant usage on schema public to hockey_app;
grant select, insert, update, delete on public.visit_sessions, public.visit_spans, public.visit_ingest to hockey_app;
grant usage, select on sequence public.visit_spans_id_seq to hockey_app;

alter table public.visit_sessions enable row level security;
alter table public.visit_sessions force row level security;
alter table public.visit_spans enable row level security;
alter table public.visit_spans force row level security;
alter table public.visit_ingest enable row level security;
alter table public.visit_ingest force row level security;

revoke all on table public.visit_sessions from public, anon, authenticated;
revoke all on table public.visit_spans from public, anon, authenticated;
revoke all on table public.visit_ingest from public, anon, authenticated;

drop policy if exists hockey_app_all on public.visit_sessions;
create policy hockey_app_all on public.visit_sessions for all to hockey_app using (true) with check (true);
drop policy if exists hockey_app_all on public.visit_spans;
create policy hockey_app_all on public.visit_spans for all to hockey_app using (true) with check (true);
drop policy if exists hockey_app_all on public.visit_ingest;
create policy hockey_app_all on public.visit_ingest for all to hockey_app using (true) with check (true);
```

你执行完文件后，只在 SQL Editor 里再跑一句，不把这句写进仓库：

```sql
alter role hockey_app password '你自己的口令';
```

然后把事务池连接串放进本机 `.env` 的 `DATABASE_URL`。用户名用 `hockey_app.lxwyjdlepsntcosczors`，端口 `6543`，主机用控制台里 Transaction pooler 的主机。`.env` 不提交。

## Files

| Path | 动作 |
| --- | --- |
| `src/server/db.ts` | 新增。分类和延迟创建连接 |
| `src/server/db.test.ts` | 新增。T-DB-01、T-DB-02、T-DB-03。用假的 `postgres` 模块，不断开网络 |
| `src/server/visitsStore.ts` | `createNeonStore` 改为通过 `createSql` 执行现有语句。占位参数保留。删除文件里的 `CREATE TABLE` |
| `src/server/http.ts` | `productionDeps` 按分类选择存储。错误日志先脱敏。`databaseUrl` 只用 `'configured'` 或 `null` |
| `src/server/fileStore.ts` | 删除。没有其他引用 |
| `src/server/schema.sql` | 新增。上面的语句 |
| `package.json`、锁文件 | 增加 `postgres`，移除 `@neondatabase/serverless` |
| `.env.example` | 只有 `DATABASE_URL=`。注释写明项目、角色 `hockey_app`、端口 `6543`。值空着 |
| `.gitignore` | 增加 `.env`。`*.local` 已经忽略 |
| `intent/visit-log/spec.md`、`intent/visit-log/plan.md` | 库改为本规格。变量名仍是 `DATABASE_URL`。谁、时间、地点、看了什么、多久，以及 T-LOG 用例不动 |
| `intent/remember-player/plan.md` | 连接改为 import `src/server/db.ts` 和同一个 `DATABASE_URL`。删掉 service role、`SUPABASE_URL`，以及「日志继续用 Neon」。档案表仍不在这次创建；那份计划以后把档案表授给 `hockey_app`，并强制行级安全 |

不改 `src/engine/`、`src/data/`、`src/state/`。不实现身份门。不部署。

`src/logs/LogsPage.tsx` 已经认得 `storage: 'unconfigured'`。保持这个响应。空的已连接列表仍由表格显示「还没有访问」。

## Order

1. 写 `src/server/schema.sql`、`.env.example`，并把 `.env` 写入 `.gitignore`。不读取、不提交真实连接串。
2. 写 `classifyDatabaseUrl` 和 T-DB-01、T-DB-02。先让测试失败，再写到通过。`postgres` 模块在这两个测试里不得被调用。
3. 改 `visitsStore.ts`。语句与现在一致：10 分钟计数、插入 ingest、按会话插入或更新、延长或新开 span、删除 90 天以前的会话和 span、删除 10 分钟以前的 ingest。`listRecent` 仍按开始时间倒序取会话，再取这些会话的 span。`session_id = ANY(...)` 继续把字符串数组当作一个参数。
4. 改 `productionDeps`，删掉 `fileStore.ts`。T-DB-03：一条符合规则的假连接串使 `databaseUrl === 'configured'`，并且到断言为止没有调用 `postgres`。Neon 主机、用户 `postgres`、端口 `5432`、`sslmode=disable`、缺少项目编号，都得到 `null`。
5. 数据库异常在 `console.error` 前脱敏。`POST` 失败仍返回 204。`GET` 失败仍返回 500，页面继续显示「记录暂时读不出来」。
6. 改三份已有文档，范围只限上面 Files 表里写的句子。
7. `npm test`。再跑两次 `npm run build`：一次不设 `DATABASE_URL`；一次设 `DATABASE_URL=postgresql://hockey_app.lxwyjdlepsntcosczors:plan-fake-secret@aws-0-example.pooler.supabase.com:6543/postgres`。在 `dist/` 和 `api/` 里搜索 `plan-fake-secret`，必须没有。`api/` 里可以出现变量名 `DATABASE_URL`。不给 esbuild 或 Vite 添加把该变量内联进包的 `define`。
8. 停下来做手动三步。没有真实 `DATABASE_URL`，或 SQL 和口令还没在项目里执行完，这一步记「还不能验收」，不写成已经连上。

## Rejected alternatives

- 继续用 `@neondatabase/serverless`：它只连接 Neon 的协议，连不上这个 Supabase 项目。
- 用 `@supabase/supabase-js` 和 service role：发起人要求变量名保持 `DATABASE_URL`。service role 会绕过行级安全。
- 用 `postgres` 超级用户的连接串：规格把它视为未配置。
- 保留 `.data/visits.json`：没配库时会把本机文件显示成已经保存。

## Risks

| 风险 | 处理 |
| --- | --- |
| 连接串进了网页包 | 只通过 `process.env` 读取。步骤 7 搜索假口令 |
| 事务池不支持预处理语句 | `prepare: false`，端口只接受 `6543` |
| `hockey_app` 插不了身份列 | 授权 `visit_spans_id_seq`。手动插入失败时先看这一条，不把超级用户填回应用 |
| 换驱动后 `ANY` 参数不匹配 | 步骤 3 写明传字符串数组。自动测试不连库，所以要靠手动第 3 步看到那一行 |
| 日志错误对象里带出口令 | 步骤 5 先脱敏 |
| 文档仍写 Neon，和代码不一致 | 步骤 6 只改存储句子，不改日志行为 |

## Proof

- `npm test` 包含 T-DB-01…03 和原来的 T-LOG-S1…S7，输出保留在会话里。测试不连接网络。
- 两次 `npm run build` 都成功。假口令不在 `dist/` 和 `api/`。
- 手动三步：进游戏，管理密码能在 `/logs` 看到这次访问，游戏密码进不去，`visit_sessions` 里有对应行。
- 没有连接串或没有执行 SQL 时，不把手动三步报成通过。日志页应显示还没有连接数据库，游戏仍能玩。
- 不 commit、不推送、不部署，除非发起人另作要求。

## Out of scope

球员登录、档案表、短密码、团队密码、把 `.data/visits.json` 迁进数据库、测试表、在 Vercel 上代填 `DATABASE_URL`。
