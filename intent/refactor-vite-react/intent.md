# Intent: Refactor Hockey Defence Trainer to Vite + React + TypeScript

Author: Stan Guo. Status: accepted.

## Problem

现有交付物是单文件 PWA（`Game files/index.html` 约 1366 行），防守规则引擎、关卡数据、SVG 冰场交互与 Learn / Practice / Game UI 全部缠在一起。加题、改规则、协作和后续扩展成本高；GitHub 仓库 `StanMGuo/hockey` 仍为空，缺少可维护的工程结构。

## Proposed outcome

1. 将应用重构为 **Vite + React + TypeScript** 工程，规则引擎 / 关卡数据 / UI 清晰分离，便于以后加题与协作。
2. 玩法与规则数值保持行为等价（椭圆区域、危险判罚、解锁进度、模式流程不变）。
3. 保留可安装 PWA（manifest + service worker）与 `localStorage` 进度。
4. 按 AI-Native SDLC 留下可版本控制产物链：`intent.md` → `spec.md` → `plan.md` → 实现与测试 → 推送到 GitHub。
5. 提供 README：本地运行、构建预览、如何加题。

## Affected users and systems

- **用户**：使用 Defence Trainer 的球员 / 教练（手机与平板为主的 PWA）。
- **系统**：本地静态前端；无后端；GitHub 仓库 `https://github.com/StanMGuo/hockey.git`。
- **源基线**：`Hockey Defence Trainer (for sending)/Game files/` 与 `防守站位规则.md`。

## Constraints

- 不改教练规则语义与数值表（`kindOf` / `zonesFor` / `evaluate` 行为保真）。
- 不引入账号、服务端或数据库。
- 不重做视觉品牌（可组件化现有样式，不做重新设计）。
- 写大规模代码前必须有被接受的 `spec.md` 与 `plan.md`。
- 推送 / 合并需人工确认（Agent 不自批）。

## Non-goals

- 新关卡内容或新玩法模式
- Next.js / SSR / 原生 App 打包
- 多语言、在线排行榜、云同步

## Open questions

- 远期（不在本次）：数据库存储、排行榜、用户登录管理 — 详见配对 `spec.md` §5；本次仍无后端，进度仅 `localStorage`，但实现上预留存储接口以便后续 intent。
