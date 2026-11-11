# Plan: 适配手机端

Paired: `intent.md` (accepted) + `spec.md` (accepted). Status: accepted.

## Goal

按 spec 让验收视口上的说明完整可见、竖屏弹层贴底、横屏保持左右布局。不改规则、关卡、流程和进度。

## Source of truth

| 产物 | 路径 |
| --- | --- |
| 需求 | `intent/mobile-fit/intent.md` |
| 规格 | `intent/mobile-fit/spec.md` |
| 壳与样式 | `src/screens/GameApp.tsx`、`src/styles/app.css` |
| 弹层行为 | `src/screens/gameController.ts` 的 `openSheet` / `closeSheet`（只读，不改流程） |

## Files

| Path | 动作 |
| --- | --- |
| `src/styles/app.css` | 必改。竖屏高度、去掉会挡住说明的 sticky、短屏间距、竖屏底栏、首页与密码门收进一屏 |
| `src/screens/GameApp.tsx` | 先不改。只有 CSS 无法把 `#actions` 和说明分开时，才加一层容器，且不改现有 id |
| `index.html` | 先不改。T-UI-07 不依赖键盘弹出 |
| `src/screens/gameController.ts` | 不改。热区只有在 T-UI-03 量到小于约 44px 时，才加大透明点击圈 |
| `src/engine/`、`src/data/`、`src/state/` | 不改 |

## Order

1. 竖屏 `#play` 改为：面板按内容高度占位，冰场拿剩下的高度，并受冰场宽高比限制。不再使用 `min(100vw * 1.14, 60dvh)` 把冰场撑到 60%。
2. 去掉 `#actions` 的 sticky 遮罩。按钮留在面板底部，说明排在按钮上方。面板不设为滚动容器。
3. 用 iPhone SE 375×667 量说明区。若冰场因此低于大约一半高度，只收紧间距和字号，主按钮保持至少 44px。仍然不够时，允许冰场略低于一半。
4. 竖屏 `#sheet` 贴底：顶角圆角，宽度铺满，底部避开安全区，最高不超过视口减去顶部安全区。横屏不使用这条规则，查询条件必须是竖屏，不能只看宽度。
5. 首页和密码门在 375×667 与 393×852 上收进一屏。已经放得下就不动间距。
6. 跑 `npm test`。再按 spec §3.4 在三个视口里操作页面。How to play 若在 SE 上仍高于弹层，只打开弹层内部滚动，并在本文件补一句实际结果。

## Implementation notes

- 只改了 `src/styles/app.css`。`GameApp.tsx` 与 `gameController.ts` 未动。
- SE Learn：冰场约占 50% 高度；D1/D2 说明与按钮无重叠；面板不滚动；拖拽热区约 48×48。
- iPhone 15 Learn：冰场约占 59%（说明区用不完时多余高度给冰场）。
- How to play 在 SE 上贴底后完整可见，**弹层内部未出现滚动**。
- 横屏 844×390 与桌面 1280×800：左右布局 + 居中卡片，未套用竖屏底栏。

## Rejected alternatives

- 说明区内部滚动，冰场维持 60%：小朋友要滚动才能看见 D2，和已接受的决定相反。
- 所有竖屏都把冰场锁在 50%：iPhone 15 下半屏会空出一块，规格要求把多余高度给冰场。
- 用 `max-width` 触发底栏：宽屏被拉窄时会误伤，T-UI-06 会失败。
- 先改 `gameController.ts` 的流程或热区：没有测量证据之前不动拖拽。

## Risks

| 风险 | 处理 |
| --- | --- |
| SE 说明区约 345px，半屏约 333px | 步骤 3。禁止用滚动补差额 |
| 冰场变小后热区变小 | 步骤 6 的 T-UI-03。不够再加透明热区 |
| 桌面横屏被手机规则改成上下布局 | 新规则都放在竖屏查询里；T-UI-06 核对宽度 ≥ 1024 的横屏 |
| How to play 高于 SE 一屏 | 只允许弹层内部滚动，并回写本 plan |

## Proof

- `npm test` 通过。
- 浏览器核对 spec 的 T-UI-01 到 T-UI-07。每个视口都要点、要看说明是否被挡住，不能只截一张静态图。
- 不 commit、不推送，除非发起人另作要求。

## Out of scope

规则数值、关卡、解锁、文案含义、音效、PWA 缓存、键盘弹出后的密码门（spec §4 已排除出失败条件）。
