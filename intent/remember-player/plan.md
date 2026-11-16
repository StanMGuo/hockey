# Plan: 按球员身份记住进度

Paired: `intent.md` (accepted) + `spec.md` (accepted). Status: draft. 未经发起人明确接受，不得改实现代码。

## Goal

按 spec 用 nickname、球衣号和 4 位短密码进入个人进度。团队密码只在新建档案时由服务端核对。数据存在 Supabase 项目 `https://lxwyjdlepsntcosczors.supabase.co`。

## Source of truth

| 产物 | 路径 |
| --- | --- |
| 需求 | `intent/remember-player/intent.md` |
| 规格 | `intent/remember-player/spec.md` |
| 现有进度字段 | `src/state/progress.ts`、`src/types.ts` 的 `Progress` |
| 现有密码门 | `src/auth/gate.ts`、`src/screens/PasswordGate.tsx`、`src/App.tsx` |

## 连接数据库

浏览器不连接数据库。档案和访问日志共用 `src/server/db.ts`。环境变量名是 `DATABASE_URL`。值是 Supabase 项目 `lxwyjdlepsntcosczors` 上角色 `hockey_app` 的事务池连接串。规则以已接受的 `intent/database/spec.md` 为准。

不使用 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 或 service role。不另开第二条连接。

| 变量 | 值 |
| --- | --- |
| `DATABASE_URL` | 已由 `intent/database/` 规定。本计划不另开连接 |
| `TEAM_PASSWORD` | 现有 `src/auth/gate.ts` 里 `APP_PASSWORD` 的值，挪进环境变量后从源码删除 |

禁止使用 `VITE_` 前缀。Vite 会把这类变量打进网页。

`.env` 不提交。`.gitignore` 已忽略它。

## 建表

建表写在本 plan，不写进 spec。规格只定档案里有什么；具体的 `create table` 是实现步骤。

实现开始后，语句追加到 `src/server/schema.sql`。由你在 Supabase 的 SQL Editor 里执行一次。自动测试不连真库。手工验收前要先执行完，否则登录和建档会失败。档案表授权给 `hockey_app`，强制行级安全，不给 `anon` 或 `authenticated` 策略。连接 import `src/server/db.ts`，不新建客户端。

要建两张表：

- `profiles`：名字、球衣号、短密码哈希、进度。名字加球衣号唯一。
- `sessions`：登录后的会话令牌，过期后失效。

```sql
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  name_key text not null,
  display_name text not null,
  jersey integer not null check (jersey between 0 and 99),
  pin_hash text not null,
  progress jsonb not null,
  created_at timestamptz not null default now(),
  unique (name_key, jersey)
);

create table public.sessions (
  token text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
```

两张表都强制行级安全，并且不添加给 `anon` 或 `authenticated` 的策略。服务端用已有的 `hockey_app`，不绕过行级安全。给这个角色的策略只覆盖这两张表的语句。

短密码用 Node `crypto.scrypt` 加随机盐，存成一段字符串。不新增哈希库。会话令牌用 `crypto.randomBytes`，写进 `sessions`，12 小时过期。浏览器只把令牌放在内存状态里，不写 `localStorage` 或 `sessionStorage`。

次数限制记在这个 Node 进程的内存里：

- 同一对名字和球衣号，10 分钟内短密码错误 5 次，登录返回 429。
- 同一 IP，10 分钟内团队密码错误 5 次，新建返回 429。

## Files

| Path | 动作 |
| --- | --- |
| `src/server/schema.sql` | 追加上面的建表语句，并授给 `hockey_app` |
| `server/identity.ts` | 新增。名字、球衣号、短密码的规范化。纯函数 |
| `server/identity.test.ts` | 新增。T-ID-01、T-ID-02 |
| `server/handlers.ts` | 新增。登录、新建、保存。依赖一个假的也能用的档案接口 |
| `server/handlers.test.ts` | 新增。不连网：不存在、短密码错误、团队密码错误、已存在不覆盖、保存要有会话 |
| `src/server/db.ts` | 已有。档案接口 import 它，不新建连接 |
| `server/main.ts` | 新增。`tsx` 启动的 Node HTTP。提供 `/api/*`，并托管 `dist/` |
| `vite.config.ts` | 开发时把 `/api` 交到同一组 handler。Workbox 的 `navigateFallbackDenylist` 加上 `/api` |
| `src/state/progress.ts` | 增加空进度判断和迁移取舍。不改现有字段含义 |
| `src/state/progress.test.ts` | T-ID-03、T-ID-04、T-ID-05 |
| `src/auth/gate.ts` | 删除 `APP_PASSWORD`、`sessionStorage` 解锁和客户端比对 |
| `src/auth/gate.test.ts` | 删掉现有密码用例，避免再把团队密码留在测试里 |
| `src/screens/PasswordGate.tsx` | 名字、球衣号、短密码。只有服务端说「没有这份档案」时才出现团队密码，并展示将要建档的名字和号码 |
| `src/state/SessionProgressStore.ts` | 新增。权威进度来自登录结果。保存失败写入 `hdt-progress-queue-v1`，恢复网络或回到首页时再提交 |
| `src/App.tsx` | 令牌只放在组件状态。换球员或刷新都回到身份门 |
| `src/screens/GameApp.tsx` | 把会话进度仓库传给 `createGame` |
| `src/screens/gameController.ts` | 保存仍走 `ProgressStore`。设置里加「换球员」，调用传入的回调。不改关卡流程 |
| `src/styles/app.css` | 只在身份门需要时补间距，保证主按钮至少 44px |
| `package.json` | 数据库驱动已是 `postgres`。不添加 `@supabase/supabase-js`。脚本 `start`：`tsx server/main.ts` |
| `.env.example`、`.gitignore` | 见上一节 |
| `tsconfig.node.json` | `include` 加上 `server` |
| `vite.config.ts` 的 `test.include` | 加上 `server/**/*.test.ts` |

不改 `src/engine/`、`src/data/`。不实现 `intent/visit-log/`。

接口：

| 方法与路径 | 成功 | 失败 |
| --- | --- | --- |
| `POST /api/login` | 200：令牌、显示名、球衣号、进度 | 404 没有这对档案；401 短密码错误；400 格式不对；429 太多次 |
| `POST /api/profiles` | 201：同样的成功身体 | 401 团队密码错误；409 这对已经存在且不覆盖；400；429 |
| `PUT /api/progress` | 200：保存后的进度 | 401 会话无效或过期 |
| `POST /api/logout` | 204，删掉会话 | |

响应里不出现短密码、团队密码、`pin_hash` 或 service role。

## Order

1. 把档案表追加到 `src/server/schema.sql`。不读取、不提交真实连接串，不新建第二套数据库连接。
2. 写身份规范化和进度取舍的纯函数，先把 T-ID-01…05 跑红，再写实现直到变绿。
3. 写 `handlers.ts` 和假档案测试。短密码用 scrypt。团队密码用定长比较。
4. 写档案存储，import `src/server/db.ts`。写 `server/main.ts`。开发服务器通过 Vite 挂上同一组 handler。不写 `server/supabase.ts`。
5. 改身份门和 `App.tsx`。删除客户端里的团队密码。若访问日志已经上线并引用了 `APP_PASSWORD`，同一次改动里改成与 `TEAM_PASSWORD` 比较。
6. 接上 `SessionProgressStore`。登录到已有档案且本机匿名进度非空：删掉 `hdt-progress-v1`，不上传。新建且本机进度非空：把它作为初始进度上传，成功后删除。回到首页时，队列还在就显示「进度还没保存到你的档案」。
7. 设置里加「换球员」。点击后退出会话并回到身份门。
8. 跑 `npm test` 和 `npm run build`。在 `dist/` 里搜索原来的团队密码和 `service_role`，必须没有。然后按 spec 的 T-UI-01…07 在浏览器里操作。T-UI 需要发起人已经执行 SQL，并且本机 `.env` 有密钥。

## Rejected alternatives

- 浏览器直接用 Supabase anon 密钥：团队密码会留在网页里，或者无法在数据库策略里核对这串共享密码。
- 另开 service role 或 `@supabase/supabase-js`：已接受的 `intent/database/spec.md` 规定只用 `DATABASE_URL` 和 `hockey_app`。
- 把会话令牌放进 `localStorage`：刷新后会跳过短密码，违反 F1。
- 用内存保存会话：开发服务器一重启，正在打的进度保存就会全部失效。会话行放在 Supabase。
- 在本计划里改访问日志：日志已经接上 `intent/database/`。本计划不新建日志功能。

## Risks

| 风险 | 处理 |
| --- | --- |
| `DATABASE_URL` 被打进网页 | 变量名不以 `VITE_` 开头。步骤 8 搜索 `dist/` |
| 团队密码继续留在 `gate.ts` 或测试快照里 | 步骤 5 删除常量。步骤 8 搜索 `dist/` 和 `src/` |
| 访问日志先上线，并用客户端的 `APP_PASSWORD` 拒绝「用游戏密码打开日志」 | 本功能后上线。删除 `APP_PASSWORD` 的同一次改动里，把已经上线的日志校验改成和 `TEAM_PASSWORD` 比较。知道游戏密码的人仍然打不开日志。本计划不实现日志本身 |
| SQL 还没在 Supabase 里执行 | 自动测试不连库。T-UI 开始前停下来，等发起人执行 `src/server/schema.sql` |
| PWA 把 `/api` 导航回 `index.html` | `navigateFallbackDenylist` 排除 `/api` |
| 次数限制在进程重启后清零 | 接受。阈值就是上面的 5 次 / 10 分钟。不做跨进程同步 |
| 打错一个字母建成第二份档案 | 新建前展示规范化后的名字和球衣号。不提供合并 |

## Proof

- `npm test` 覆盖 T-ID-01…06，输出保留在会话里。
- `npm run build` 成功，并且构建产物里没有团队密码和 service role。
- 浏览器按 T-UI-01…07 实际登录、建档、输错短密码、换球员。只看截图不算完成。
- 没有 `.env` 和没有执行 SQL 时，不把 T-UI 报成通过。
- 不 commit、不推送，除非发起人另作要求。

## Out of scope

规则数值、关卡内容、排行榜、新建访问日志、选定另一家数据库、把密钥写进仓库。访问日志若已上线，只改它的密码比较对象。
