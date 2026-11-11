# Hockey Defence Trainer

Interactive PWA that teaches defensive positioning. Refactored to **Vite + React + TypeScript** with a pure rules engine, scenario data, and UI separated for maintainability.

## Quick start

```bash
npm install
npm run dev
```

```bash
npm test          # Vitest (engine / data / progress)
npm run build     # production build + PWA
npm run preview   # serve dist/
```

## Project layout

| Path | Role |
| --- | --- |
| `src/engine/` | Positioning rules (`kindOf`, `zonesFor`, `evaluate`) |
| `src/data/` | Scenarios, mirrors, Learn order, Game sequences |
| `src/state/` | `ProgressStore` + localStorage implementation |
| `src/rink/` | Ice coordinates / clamp helpers |
| `src/screens/` | React shell + game controller |
| `docs/` | SDLC workflow + Chinese rules write-up |
| `intent/refactor-vite-react/` | intent → spec → plan for this refactor |

## Add a scenario

1. Append an entry to `BASE` in `src/data/scenarios.ts` (mirror is auto-generated).
2. Optionally add its id to `LEARN_ORDER` and/or a `SEQS` step list in `src/data/sequences.ts`.
3. Run `npm run gen:golden` if zone/kind fixtures should refresh, then `npm test`.
4. Prefer failing tests first when changing rule math (see `intent/.../spec.md` §3.4).

## Progress

Saved on-device under `localStorage` key `hdt-progress-v1` via `ProgressStore`. Future auth/DB/leaderboards are out of scope for this release (see open questions in the spec).

## SDLC artifacts

See `docs/ai-native-sdlc-workflow.md` and `intent/refactor-vite-react/`.
