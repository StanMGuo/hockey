# Intent: 适配手机端

Author: Stan Guo. Status: accepted.

## Problem

Hockey Defence Trainer 的主要使用者是手机上的球员和教练，但当前布局仍按「宽屏横放 + 一条竖屏断点」处理。短竖屏上，冰场占掉约 60% 高度，底部按钮用 sticky 盖住说明，D2 的站位提示被挡住，用户看不清该把人拖到哪里。

已在本地用手机视口核对（未改代码）：

- iPhone SE 竖屏 375×667：面板内容高度约 345px，可见区域约 265px，`#actions` 压住 D2 那一行。
- iPhone 14 竖屏 390×844：两行说明和按钮都能看见，面板中部留白偏大，但能用。
- iPhone 14 横屏 844×390：冰场和面板能同时放下，这一档基本可用。
- 首页在极矮屏幕上不能滚动（`body` 锁死、`#home` 不溢出滚动），内容高于视口时会被裁掉。
- 密码门同样锁在固定视口里，键盘弹出时输入框可能被挡住。

现有 `@media (orientation: portrait)`、安全区和 “turn your phone sideways” 提示还在，但没有解决短竖屏被挡住的问题。

## Proposed outcome

1. 手机竖屏上，冰场和说明同时可用：D1 / D2 的提示不被底部按钮盖住，按钮始终可点。
2. 手机横屏保持现在能玩的左右布局，不把冰场挤没。
3. 竖屏上的 How to play、Settings、选关改为贴底弹出，关键按钮仍可点到。首页和密码门在验收机型上不裁切关键操作。
4. 拖拽守门站位、Learn / Practice / Game 流程、规则数值、解锁进度保持不变。
5. 本变更按 AI-Native SDLC 走完 `intent.md` → `spec.md` → `plan.md`，计划被接受后再改代码。

## Affected users and systems

- **用户**：用手机（其次平板）打开 PWA 的球员和教练。桌面宽屏是回归面，不是这次的主要场景。
- **系统**：`src/screens/GameApp.tsx` 的壳、`src/styles/app.css`、必要时 `index.html` 的 viewport。规则引擎、关卡数据、进度存储不在本次范围。
- **验证**：手机视口下的首页、密码门、Learn 对局、How to play / Settings。现有 `npm test` 仍须通过。

## Constraints

- 不改 `kindOf` / `zonesFor` / `evaluate` 的语义和数值。
- 不改 Learn / Practice / Game 的流程、解锁条件和文案含义。
- 不引入新框架、不做成原生 App、不加账号或后端。
- 不重做视觉品牌；只调整布局、间距、滚动和安全区。
- 写实现代码之前，必须有被接受的 `spec.md` 和 `plan.md`。
- 未获明确要求，不 commit、不推送。

## Non-goals

- 新关卡、新模式、新音效
- 平板专用信息架构（平板沿用现有宽屏/横屏布局，除非被短边高挡住）
- 多语言、离线策略、安装引导重做

## Decisions（已随本 intent 接受）

1. 短竖屏：冰场可以缩到大约视口高度的一半，换出完整说明区。尽量不要出现滚动，主要用户是低龄小朋友。
2. 竖屏弹层（How to play、Settings、选关）改为贴底弹出。
3. 验收视口：iPhone SE 竖屏 375×667、iPhone 15 竖屏 393×852，外加横屏约 844×390。

## Open questions

无。
