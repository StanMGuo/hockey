# AI-Native SDLC 工作流（Project Workflow）

> 依据 Anthropic《The AI-native SDLC playbook》提炼，供本 Project 日常执行。  
> 课程原生术语保留英文（Plan / Design / Build / Test / Deploy / Maintain，以及 `intent.md`、`CLAUDE.md`、skills、hooks、evals 等）。

---

## 1. 目的与适用范围

### 1.1 目的

代码已不再是瓶颈；瓶颈在计划、评审、测试、发布等仍以人速运行的环节。本工作流把 **AI 嵌入 SDLC 每一阶段**，用 **可版本控制的产物链** 串联阶段，让人把注意力集中在 **判断型门禁（gates）**，而不是从零起草每个阶段。

### 1.2 何时使用

| 适用 | 不适用 / 先降级 |
| --- | --- |
| 有可改的 Git 仓库与 CI（或等价流水线） | 纯探索、一次性便签、无仓库的临时问答 |
| 需要从想法 → 实现 → 验证 → 上线 → 回流的完整变更 | 仅查阅文档、无产物落地的调研 |
| Agent（Cloud / Local）参与编写、评审或运维闭环 | 明确禁止自动化触碰的受控变更（仍走人工流程，但可保留产物记录） |

**默认假设**：本 Project 使用 Cursor Cloud Agent / Local Agent（及 Coordinator）完成工作；原则与 Claude Code 体系兼容，产物命名可直接复用。

**Cursor 适配（本 Project 约定）**：机构知识**不必**写入 `CLAUDE.md`。同等内容优先放在 Cursor 原生位置（Project 规则 / Agent Store `docs` 与 `preferences` / skills / hooks 或 CI 硬门禁）。文中出现的 `CLAUDE.md` 均视为「Agent 可读的机构说明」占位名，可替换为上述路径。

### 1.3 核心模型：闭环，而非线性瀑布

```
触发 → Plan(intent.md) → Design(spec.md) → Build(plan.md + diff)
    → Test(反馈环 + evals) → Deploy(评审 + hooks) → Maintain(指标/扫描)
         ↑________________ 新 intent.md / 事故回流 ________________↓
```

每一阶段 **结束时 commit 一个下一阶段可读的产物**；下一阶段 **从该产物开始**。Commit 链即审计轨迹。

---

## 2. 不可妥协原则（Non-negotiables）

1. **人仍对需要判断的决策负责**（接受 intent/spec/plan、合并 PR、生产放行、事故 triage）。
2. **每阶段必须留下可版本控制的产物**（至少：`intent.md` → `spec.md` → `plan.md` → diff/tests → PR 评审记录 → 事故/发现记录）。
3. **写代码前先有被接受的 plan**（plan mode / 等价计划门禁）；无计划不得进入大规模实现。
4. **Agent 必须能自证工作**（测试 / build / lint / 截图对比等反馈环）；不能验证则不算 done。
5. **Skills 是建议性控制；Hooks 是确定性控制**。必须始终成立的策略，必须有 hook 或等价硬门禁 backing。
6. **Agent 写的代码不能由同一 Agent 批准**（职责分离：agent 评审 ≠ 人批准；branch protection / code owner 必须保留）。
7. **Agent 可做到生产门禁之前，不能越过生产门禁**（生产发布需具名人工授权 + hook）。
8. **机构知识进文件，不进大脑**：Agent 可读说明 / skills / hooks / `REVIEW.md`（或 Cursor Project 规则与 store）进版本控制，变更像代码一样评审；**不要求**单独维护 `CLAUDE.md`。
9. **同一类错误出现两次 → 写入 Agent 说明（或 skill/hook / Project 规则）**，避免重复人肉纠错。
10. **每个生产事故 / 漏洞类问题 → 至少补一条 eval（或等价回归检查）**。
11. **每种产物只认定一个 Source of Truth**（Repo 权威 / 遗留系统权威 / 或至少双向链接 commit SHA ↔ ticket ID）。
12. **检测保持确定性；模型只在触发后介入**（如 control band：先脚本判越界，再调 Agent）。

---

## 3. 角色与 Agent 分工

| 角色 | 职责 |
| --- | --- |
| **发起人（Originator）** | 用自然语言描述问题；与 Agent 共创 `intent.md`；纠正误解 |
| **产品负责人（Product Owner）** | 接受/拒绝 intent；评审 `spec.md`；协调策略 owner 处理 flagged concerns |
| **工程师 / Tech Lead** | Plan mode、实现、并行会话编排；接受高风险 plan；维护 `CLAUDE.md` / `REVIEW.md` |
| **平台 / 安全** | Hooks、managed settings、CI evals、沙箱、密钥边界、扫描调度 |
| **Code Owner / Release Manager** | PR 人工批准；生产放行 |
| **On-call / Service Owner** | Maintain 阶段 triage：立刻修 / 排期 / 驳回并调带宽 |

| Agent 形态 | 典型用法 |
| --- | --- |
| **Local Agent / IDE 会话** | Plan mode、实现、本地反馈环、改 `CLAUDE.md`/skills |
| **Cloud Agent** | 长任务、PR 修复循环、非交互 CI 步骤、多仓库/多 worktree |
| **Coordinator + Workers** | 拆并行子任务；人只盯门禁与汇总；子 Agent 不越权合并/发布 |
| **CI 非交互 Agent**（`claude -p` / action） | Build triage、changelog、`@claude` 修评审意见、evals |
| **Headless Maintain Agent** | 指标越界诊断、开 PR / 写 `intent.md`、预批准 runbook（含 rollback） |
| **Subagent** | 会话内限定工具的校验器/研究者/简化器；只报告或做窄任务 |
| **并行 Session + worktree** | 互不冲突的文件集并行；工程师负责编排与评审容量 |

**知识落点速查（CLAUDE.md vs Skill vs Hook）**

| 放哪里 | 放什么 |
| --- | --- |
| **Agent 说明（Cursor 规则 / store / 可选 `CLAUDE.md`）** | 新人 Day-1 需要的命令、约定、架构、反复踩坑；保持 ≤ 约一页；本 Project 默认用 Cursor 侧落点 |
| **Skill** | 必须一致应用的机构策略（安全标准、API 规范、品牌/UX）；有命名 owner |
| **Hook** | 必须强制的动作边界（禁改路径、禁改测试文件、格式化、生产门禁、密钥外泄） |
| **Prompt / 一次性指令** | 仅本次变更的上下文；不要把机构知识只留在聊天里 |

---

## 4. 阶段工作流

每个阶段统一字段：**我们做什么 · 谁/什么负责 · 输入 · 输出 · Agent 如何参与 · 决策点/质量门禁**。

### Stage 1 — Plan：捕获为 `intent.md`

| | |
| --- | --- |
| **做什么** | 把想法/工单/告警写成短小、可版本控制的 proto-spec：要什么、为什么、约束是什么 |
| **负责** | 发起人起草；Product Owner 接受/拒绝 |
| **输入** | 口述问题、ticket、Maintain 阶段告警诊断 |
| **输出** | 已 commit 的 `intent.md`（建议目录：`intent/`） |
| **Agent** | 访谈式澄清范围/用户/约束/成功标准；按模板生成 `intent.md`；非工程师可通过连接器代为 commit |
| **门禁** | Product Owner 合并/接受 → 进入 Design；拒绝则关闭并保留历史 |

**最小模板**

```markdown
# Intent: <标题>
Author: <人>. Status: draft|accepted|closed.

## Problem
## Proposed outcome
## Affected users and systems
## Constraints
## Open questions
```

---

### Stage 2 — Design：`intent.md` → `spec.md`

| | |
| --- | --- |
| **做什么** | 需求与设计压成一次工作会话；策略（brand/security/compliance/UX）以 skills 约束写入 |
| **负责** | Product Owner 评审与拍板；策略 flagged 项与对应 policy owner 共决；高风险咨询 Tech Lead |
| **输入** | 已接受的 `intent.md` + 组织 skills |
| **输出** | 与 intent 成对的 `spec.md`（含 areas of concern） |
| **Agent** | 读 intent + skills 生成 spec；可先人手跑 prompt，再做成 slash command / merge 触发的非交互任务开 PR |
| **门禁** | 人确认：是否解决陈述问题；open questions 已答或显式结转；flagged concerns 已处理 → 接受 spec 才启动 Build |

**推荐 Prompt 骨架**

> 阅读 `intent.md`，结合现有代码库产出 requirements & design `spec.md`。应用可用 skills（品牌/安全/UX）。明确标出无法同时满足冲突策略的 concern。

---

### Stage 3 — Build：计划后实现 + 机构知识文件化

#### 3A. Plan mode 为默认起点

| | |
| --- | --- |
| **做什么** | 在改文件前产出可独立执行的 `plan.md`（改哪些文件、顺序、风险、如何证明） |
| **负责** | 工程师接受常规 plan；高风险由 Tech Lead/架构 |
| **输入** | `intent.md` + `spec.md` + `CLAUDE.md` |
| **输出** | 已批准 `plan.md`；随后 diff；偏离 plan 时同 commit 更新 `plan.md` |
| **Agent** | Plan mode 只读代码库；问答风险/备选；接受后再实现；成熟后 routine 可用 auto-accept |
| **门禁** | 未接受 plan 不得大规模写码；PR 对照 `plan.md` 检查一致性 |

#### 3B. `CLAUDE.md`

| | |
| --- | --- |
| **做什么** | `/init` 后精简为 Day-1 必读；错误两次写入；进 Git 与 code owners 评审 |
| **输出** | 仓库根 `CLAUDE.md`（Commands / Conventions / Architecture / Things agents get wrong） |

#### 3C. Skills 与 build-time Hooks

| | |
| --- | --- |
| **做什么** | 把执行不一致的策略写成 `.claude/skills/<name>/SKILL.md`；必须强制的用 hook 卡住 |
| **Build hooks 示例** | 禁改生成代码/冻结包；编辑后 format/lint；阻止凭据进 diff；为 skill 做确定性 backing |
| **注意** | 需要人批准的 hook 放到 Deploy（避免把人重新绑回并行会话关键路径） |

#### 3D. 并行 Session / Subagents

| | |
| --- | --- |
| **做什么** | 独立文件集 → 多 worktree 并行；重复窄任务 → `.claude/agents/` subagent |
| **门禁** | 并行上限 = 人能认真评审的数量；权限/hooks 对所有会话统一生效 |

#### 3E. 遗留系统 Source of Truth

对每类产物声明其一：**Repo 权威** / **遗留系统权威（Jira/ServiceNow 等，markdown 为工作副本）** / **最低标准：双向链接（ticket ID ↔ commit SHA）**。

---

### Stage 4 — Test：会话内反馈环 + 配置级 Evals

#### 4A. 给 Agent 反馈环

| | |
| --- | --- |
| **做什么** | 单命令可跑的 test/build；目标可量化；bugfix 先提交失败测试再修（禁改该测试）；UI 用截图/浏览器闭环 |
| **负责** | 会话工程师配置；Code Owner 在 PR 看证据 |
| **输出** | 会话记录中的命令输出；PR check；必要时 OTel 导出 |
| **Agent** | 完成前必须跑通验证并粘贴证据；verifier subagent 可做终检（新上下文，防自我合理化） |
| **门禁** | 无验证证据不得报 done；hook 可禁止 fix 任务改测试文件 |

#### 4B. Continuous evals in CI

| | |
| --- | --- |
| **做什么** | 20–50 个真实任务 → prompt + 验收检查；在变更 `CLAUDE.md`/skills/hooks 时与定时任务中跑 |
| **负责** | 平台维护套件；配置变更方对 pass-rate 负责；事故队补 eval |
| **门禁** | 配置变更导致 pass-rate 下降 → 阻断或强制复审后再合 |

---

### Stage 5 — Deploy：双向评审 + 动作时治理

#### 5A. AI 进入 PR Review Loop

| | |
| --- | --- |
| **做什么** | 统一评审通道（bugs / security / compliance vs `spec.md`+`plan.md`）；人审 intent 与风险；`@claude` 修意见；二次同类错误回流 `CLAUDE.md` |
| **产物** | 根目录 `REVIEW.md`（Important vs Nit、上限、跳过项） |
| **门禁** | Findings **不**单独批准 PR；**必须** code owner + branch protection；Agent 无路径自批自合 |

#### 5B. Hooks 作为 Approval Gates

| | |
| --- | --- |
| **做什么** | 列出必须保留的人工门禁 → 实现为 allow/ask/block；团队 hooks 进 `.claude/settings.json`；不可协商项进 managed settings |
| **门禁** | 生产部署等动作无授权则 block，并输出原因与审批路径 |

#### 5C. CI/CD 集成

| | |
| --- | --- |
| **做什么** | 先只读判断（失败 triage、changelog）；再闸门后写操作（修 lint、回评审）；沙箱 + 短时 scoped token；部署经 MCP 白名单；按环境分自治等级 |
| **环境自治** | Dev：可自由部署 → Staging：中间 → Prod：只准备发布，Release Manager 授权，hook 强制 |
| **门禁** | Agent 无直推 main；rollback 必须可单命令演练（Maintain 高自治会调用） |

---

### Stage 6 — Maintain：闭环回流为新的 `intent.md`

#### 6A. 指标 Control Band → 诊断 → 回流

| | |
| --- | --- |
| **做什么** | 确定性脚本监控基线（如 CI 失败率、发布后 5xx、PR cycle time）；越界后按档位调 Agent |
| **档位示例** | 1σ 仅日志 → 2σ 只读诊断 → 3σ 可行动（开 PR 或预批准 runbook，如 rollback） |
| **输出** | 新的 `intent.md`（异常证据、拟议结果、影响面、开放问题）进 triage |
| **门禁** | Service Owner triage：立刻修 / 排期 / 驳回（驳回用于调带宽）；修复后补 eval |

#### 6B. 周期性代码扫描

| | |
| --- | --- |
| **做什么** | 定时扫描；小修复走 PR gate；大问题写成 `intent.md` 从 Plan 重启；dismiss 必须写原因 |
| **门禁** | 扫描方不能自行合入；确定性 SAST/依赖扫描仍留在 CI |

#### 6C. 渠道触发（如 Tag / 工单 / 聊天）

小而边界清晰 → 直接 PR；更大 → `intent.md`。频道/工单线程保留请求、诊断、授权与修复，作为审计轨迹。

---

## 5. 决策点与质量门禁总表

| # | 决策点 | 通过条件 | 失败/回流 |
| --- | --- | --- | --- |
| G1 | 接受 `intent.md` | PO 确认问题/结果/约束可读可执行 | 关闭或退回发起人 |
| G2 | 接受 `spec.md` | 解决问题；questions 已处理；concerns 已协调 | 改 spec / 回调策略 |
| G3 | 接受 `plan.md` | 他人仅凭 plan 可实现；风险与证明清晰 | 继续审讯 plan |
| G4 | 会话 Done | 反馈环证据齐全；未削弱测试 | 继续修或拆任务 |
| G5 | 配置变更合并 | Evals pass-rate 达标 | 阻挡合并 |
| G6 | PR 合并 | Agent 评审完成 + **人工** code owner | 修或重开 |
| G7 | 生产发布 | 具名授权 + production hook | Block |
| G8 | Maintain triage | Owner 明确处置；大项变 intent | 驳回并调带宽 |
| G9 | 事故关闭 | 修复已合 + eval/回归已补 | 保持开放 |

**产物链检查（每个变更）**

`intent.md` → `spec.md` → `plan.md` → tests/diff → PR + review findings →（若生产问题）incident/eval → 可能的新 `intent.md`

---

## 6. 可复用检查清单

### 6.1 开新变更（Plan → Design）

- [ ] 已用自然语言说清：现状痛点、谁受影响、更好的样子、非目标
- [ ] 已生成并人工纠正 `intent.md`
- [ ] 已 commit 到约定 `intent/`（或等价 SoT），作者/时间可追溯
- [ ] PO 已接受；高风险已标记
- [ ] 已加载相关 skills 生成 `spec.md`，concerns 已处理
- [ ] `spec.md` 已与 `intent.md` 成对入库

### 6.2 实现前（Build）

- [ ] 从 plan mode 开始；输入 intent + spec
- [ ] `plan.md` 含：文件列表、顺序、风险、证明方式
- [ ] 已追问：会破坏什么、最险步骤、未选方案
- [ ] 计划已接受并 commit
- [ ] `CLAUDE.md` 命令/约定仍准确；已知坑已写入
- [ ] 相关 skill/hook 是否覆盖本次变更类型

### 6.3 实现中与自证（Build + Test）

- [ ] 验证命令单入口且失败非零退出
- [ ] 完成前跑 test/build/lint（或 UI 对比）并保留输出
- [ ] Bugfix：先提交失败测试，再修代码；Agent 未改该测试
- [ ] 偏离 plan 时同步更新 `plan.md`
- [ ] 需要并行时：独立 worktree；评审容量未超载

### 6.4 PR 与发布（Deploy）

- [ ] `REVIEW.md` 通道已跑（或等价 Agent review）
- [ ] Diff 对照 `plan.md` / `spec.md`
- [ ] 二次同类问题已写入 `CLAUDE.md`
- [ ] Code owner 人工批准；Agent 未自批
- [ ] 生产路径有 hook；无授权不可部署
- [ ] Rollback 路径已知且演练过（若本次触及发布）

### 6.5 配置变更（`CLAUDE.md` / skills / hooks）

- [ ] 有命名 owner
- [ ] 触发了 evals（或说明为何豁免）
- [ ] Pass-rate 未回退，或已有意接受并记录
- [ ] 必须强制的策略有 hook/CI 硬门禁，而非仅 skill

### 6.6 生产回流（Maintain）

- [ ] 检测脚本确定性；档位配置在版本库
- [ ] 越界后产出 `intent.md` 或受控 PR/runbook
- [ ] Triage 有结论；dismiss 有原因
- [ ] 修复后补 eval / 回归用例
- [ ] 扫描/渠道发现同样走 PR gate 或 Plan 重启

### 6.7 本 Project（Cursor Agents）特别项

- [ ] Coordinator 分配清晰；Worker 不越权合主分支/发生产
- [ ] 持久流程/结论写入约定 store 路径（如 `docs/`），证据进 `internal/`
- [ ] Cloud vs Local：长时/CI/多机用 Cloud；紧耦合 IDE 实现用 Local
- [ ] 对外系统写入（评论、发消息、合并）仅在任务明确授权时执行

---

## 7. 建议采纳顺序（Dependency 友好）

可模块化推进。课程中 **无前置依赖、可先做** 的起点：

1. **Capture as `intent.md`**
2. **Plan mode 默认开工**
3. **建立 Agent 可读机构说明（Cursor 规则 / store；非必须 `CLAUDE.md`）**
4. **Skills 承载机构知识**
5. **Feedback loop（自证）**
6. **Hooks as approval gates**

随后再叠加：Design 自动生成 `spec.md`、PR review loop、continuous evals、CI/CD 非交互 Agent、Maintain 闭环与定时扫描。

**滚动目标**：先人手驱动各步 → 再让「被接受的产物」自动触发下一闸门；人的时间集中在 gates。

---

## 8. 度量（用于改进流程，而非虚荣指标）

| 阶段 | Leading | Lagging |
| --- | --- | --- |
| Plan | 首次对话 → 已 commit intent 的时长 | Intent 被接受进入 Design 的比例；spec 之后仍改 intent 的次数 |
| Design | Intent commit → spec commit 时长 | Build 开始后的 requirements 返工（spec 在 plan 之后的提交） |
| Build | 一次实现通过率；plan 批准 → PR 合并时长 | 返工轮次；合并 diff 与 `plan.md` 一致率 |
| Test | Agent 变更的首次 CI 通过率 | PR 评审耗时；变更失败率 |
| Deploy | 首次评审等待时长；无人工改分支即解决的评论比例 | 合并前捕获缺陷 vs 逃逸生产 |
| Maintain | 越界 → triage 队列中 intent 的时长 | 发现转化为已合并修复的比例；同类重复事故下降 |

---

## 9. 本 Project 落地约定（轻量默认）

在未另开仓库级标准前，默认：

1. 变更意图与规格：优先 `intent/<change>/intent.md`、`spec.md`、`plan.md`（或任务指定的 store/`docs` 路径）。
2. Agent 行为规范：Cursor Project 规则 / Agent Store / skills；强制项用 hooks/CI。不要求单独写 `CLAUDE.md`。
3. 评审：Agent 先审，人做 G6；生产相关保留 G7。
4. 文档：用户可见流程进 `docs/`；抓取证据/缺口进 `internal/`。
5. 不把本工作流写成「课程摘要」替代执行——**以本节门禁与清单为准日常对照**。

---

## 10. 来源

提炼自 Anthropic Academy 课程与公开 Playbook 文章（详见 `internal/ai-native-sdlc-sources.md`）。课程面向已在用 Claude Code、且能改计划/评审/测试/部署方式的工程与平台团队；本文件将其改写为 **本 Project 可执行的工作流**。
