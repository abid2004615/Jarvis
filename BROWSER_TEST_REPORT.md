# Browser Test Report — JARVIS

**Date:** 2026-08-24  
**Environment:** Next.js 16.3.1 development server; in-app browser; `http://localhost:3000/`

## Final result: pass

All browser-test findings are resolved without changing the AI provider/model, tool-confirmation policy, PermissionManager, or native Electron voice support.

| Finding | Result | Fix and verification |
| --- | --- | --- |
| Typed command entered `VOICE ERROR` | Fixed | Typed and notification responses now use passive TTS (`speakText`) rather than the recognition/follow-up flow. Voice transitions no longer overwrite an already-rendered AI reply. Browser test displayed `typed response visible` while voice remained `STANDBY`. |
| Active-window live test was intermittent | Fixed | When macOS withholds an accessibility window title, `getActiveWindow` returns the verified frontmost application and explicitly labels its source as `application`. A real window title remains labeled `window`. |
| Unknown target resolved ambiguously | Fixed | `role: "unknown"` is no longer treated as a usable target; resolution fails closed as `not_found`. |
| Controls overlapped command bar | Fixed | The HUD tray now reserves vertical space above the command bar, wraps compact rows, and reduces mobile control sizing. Measured button overlap is empty at both tested viewports. |
| `THREE.Clock` warning | Fixed | Replaced the deprecated `THREE.Clock` with `THREE.Timer`, including update/connect/dispose lifecycle handling. Browser console was clean after the regression flow. |
| Health endpoint | Pass | `GET /api/health` returned HTTP 200 with `status: healthy`; AI provider and storage both reported healthy. |

## Browser regression checks

| Check | Result |
| --- | --- |
| Default desktop viewport (1280×720) | Pass — no controls overlap the command bar. |
| Compact viewport (390×844) | Pass — no controls overlap the command bar; input remains usable. |
| Typed assistant flow | Pass — the assistant reply rendered after `/api/assistant`; no `VOICE ERROR` or recognition error occurred. |
| Browser console | Pass — no warnings or errors after the typed-command flow. |

## Automated testing

| Command | Result |
| --- | --- |
| `npm test -- --runInBand __tests__/p9-live.test.ts __tests__/p10-targets.test.ts __tests__/voice-session.test.ts` | 43/43 tests passed. |
| `npm test` | 106/106 suites passed; **1,674/1,674 tests passed**. A targeted voice-isolation regression test accounts for the total increasing by one. |
| `npx eslint .` | Pass. |
| `npx tsc --noEmit` | Pass. |
| `npm run build` | Pass. |
| `npm audit` | Pass — 0 vulnerabilities. |

## Runner note

The suite contains live macOS integrations and shared local resources. Parallel Jest workers produced an intermittent `SIGSEGV`; the Jest configuration now uses one worker so the required plain `npm test` command runs the unchanged assertions reliably. Jest still emits a non-failing post-run open-handle notice, but exits with status 0 after all tests pass.
