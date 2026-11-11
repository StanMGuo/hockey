# Plan: Refactor Hockey Defence Trainer to Vite + React + TypeScript

Paired: `intent.md` (accepted) + `spec.md` (accepted). Status: accepted.

## Goal

按 spec 将基线单文件 PWA 迁入可测试的 Vite + React + TS 仓库，跑通 §3.4 全部 `AUTO` 用例与 build，再推送到 `origin/main`。

## Source of truth

| 产物 | 路径 |
| --- | --- |
| 基线应用 | `/Users/stanguo/Downloads/Hockey Defence Trainer (for sending)/Game files/` |
| 规则说明 | 同目录 `防守站位规则.md` → 迁入 `docs/防守站位规则.md` |
| 工作流 | `docs/ai-native-sdlc-workflow.md`（已在仓） |
| 远程 | `https://github.com/StanMGuo/hockey.git`（当前空 main） |

## File plan（将创建 / 迁入）

```
package.json
tsconfig.json
tsconfig.app.json
tsconfig.node.json
vite.config.ts          # react, vitest, vite-plugin-pwa
index.html
README.md
.gitignore
public/
  icon-192.png
  icon-512.png
  apple-touch-icon.png
docs/
  ai-native-sdlc-workflow.md   # exists
  防守站位规则.md
intent/refactor-vite-react/
  intent.md spec.md plan.md
src/
  main.tsx
  App.tsx
  vite-env.d.ts
  types.ts                     # Scenario, Zone, DefPos, Kind, Grade, Progress...
  styles/
    app.css                    # from baseline <style>
  engine/
    geometry.ts
    kind.ts
    zones.ts
    evaluate.ts
    messages.ts                # GOOD_MSG, ROLE_TXT, fixMsg, overall picks
    __fixtures__/
      zones.golden.json
      evaluate.golden.json
      kinds.golden.json
    geometry.test.ts
    kind.test.ts
    zones.test.ts
    evaluate.test.ts
  data/
    scenarios.ts
    sequences.ts
    scenarios.test.ts
    sequences.test.ts
  state/
    types.ts
    ProgressStore.ts           # interface
    LocalStorageProgressStore.ts
    progress.ts                # unlocked, defaultProg helpers
    progress.test.ts
  rink/
    coords.ts                  # clampToIce, toRink helpers + tests
    coords.test.ts
    SvgRink.tsx
    useDragDefencemen.ts
  screens/
    Home.tsx
    Play.tsx
    sheets.tsx                 # HowTo / Settings / pickers
  audio/
    sfx.ts
```

**不修改**：规则公式数值；`hdt-progress-v1` 字段语义。

## Execution order

### Step 0 — 仓库卫生

- 确认 cwd 为 `/Users/stanguo/Downloads/hockey`
- 保留已有 `docs/` 与 `intent/`；添加 Node `.gitignore`

### Step 1 — Scaffold

- `npm create vite@latest . -- --template react-ts`（若目录非空则手动写等价配置，避免覆盖 intent/docs）
- 依赖：`react` `react-dom`；dev：`vitest` `@vitest/coverage-v8`(可选) `jsdom` `vite-plugin-pwa` `typescript`
- `vite.config.ts`：`plugins: [react(), VitePWA({... cache-first ...})]`；`test: { environment: 'node' }`（引擎单测无需 jsdom；rink coords 亦纯函数）
- 拷贝 icons → `public/`；manifest 字段写入 PWA 插件或 `public/manifest.webmanifest`
- 拷贝 `防守站位规则.md` → `docs/`

**证明**：`npm install` 成功；空 App 可 `npm run dev` 启动。

### Step 2 — 类型 + 数据层

- 写 `src/types.ts` 与 `src/data/scenarios.ts` / `sequences.ts`（从 baseline 逐字迁移坐标与文案）
- 实现 T-DATA-01…04 测试

**证明**：`npx vitest run src/data` 绿。

### Step 3 — 引擎 + Golden

1. 移植 `geometry` / `kind` / `zones` / `evaluate` / `messages`（无 React）
2. 一次性脚本（可丢在 `scripts/gen-golden.mjs` 或临时 ts-node）对 baseline 逻辑生成 fixtures，**提交 JSON**，然后删除脚本或保留为 `npm run gen:golden`（默认不覆盖 unless `--write`）
3. 实现 T-GEO / T-KIND / T-ZONE / T-EVAL 全表

**证明**：`npx vitest run src/engine` 绿；覆盖 spec §3.4.1–3.4.4。

### Step 4 — ProgressStore

- `ProgressStore` 接口 + `LocalStorageProgressStore`
- 单测用内存 fake store 覆盖 T-PROG-01…05（jsdom 或 mock `localStorage`）

**证明**：`npx vitest run src/state` 绿。

### Step 5 — Rink 坐标纯函数

- 抽出 `clampToIce` / 朝向相关纯函数；T-RINK-01…02
- 再实现 `SvgRink` + 拖拽 hook（可先只读渲染，再接线 pointer events）

**证明**：coords 单测绿；浏览器可见冰场与两名可拖 D。

### Step 6 — Screens 与模式流程

- 迁移 CSS → `app.css`
- `Home`：ladder、Learn/Practice/Game 入口、解锁态
- `Play`：banner、rows、check、hint、Learn 动画、Practice、Game 序列与结束星级
- sheets：HowTo、Settings（sound / unlockAll）、practice/game pickers
- `App.tsx` 屏切换

**证明**：手动 T-UI-01…05；进度刷新仍在。

### Step 7 — Audio + PWA

- `sfx.ts`；Settings 开关
- PWA 生成 SW；`npm run build` + `vite preview` 打开；T-UI-06 / T-BUILD-02

**证明**：`npm test` 全绿；`npm run build` 成功。

### Step 8 — README + 推送

- README：`npm i` / `npm run dev` / `npm test` / `npm run build` / 如何加题（改 `scenarios.ts` + 可选 LEARN/SEQ + 补测）
- 征得你确认后：`git add` → commit → `git push -u origin main`
- 偏离本 plan 的实现变更须同 commit 更新本 `plan.md`

## Risk register

| 风险 | 缓解 |
| --- | --- |
| Vite scaffold 覆盖已有 docs/intent | 不用强制 empty 模板覆盖；手写配置或 `create-vite` 到临时目录再合并 |
| Golden 与手迁引擎不一致 | 先迁引擎再生成 golden，或用同一份 TS 源生成 |
| 随机文案 flaky | 断言不依赖 `pick()` 文案；或注入 RNG |
| `randomSequence` flaky | mock `Math.random` / 注入 `rng` 参数；内层抽题循环加次数上限避免固定 RNG 死循环 |
| 拖拽竖屏回归 | coords 单测 + MANUAL T-UI-05 |
| 大文件一次 PR 难审 | 提交可按 Step 分 commit（仍一次 push） |

## Out of scope（再次确认）

OQ-1…3（DB / 排行榜 / 登录）只留接口缝；不实现 API、Auth、排行 UI。

## Proof gate（G3 → G4）

他人仅凭本 plan 应能实现。接受 plan 后才开始 Step 1+ 大规模写码。

完成定义：

1. `npm test` 覆盖 spec 全部 `AUTO` ID，退出码 0  
2. `npm run build` 退出码 0  
3. MANUAL T-UI 勾选或记录豁免  
4. 已 push 到 GitHub（需你授权执行 push）

## Acceptance checklist（G3）

- [ ] 文件清单与顺序完整
- [ ] 风险与证明清晰
- [ ] 与 spec 测试表对齐
- [ ] PO/工程师接受 → 开始实现
