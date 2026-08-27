# P16.6 — Fix Duplicate Wake/Voice Requests + Groq Rate Limit Pressure

**Date:** August 18, 2026
**Status:** COMPLETE

---

## Root Cause Analysis

### Root Cause 1: Wake phrase reaching AI pipeline (PRIMARY)

When the global wake companion detected "Hey JARVIS":

1. Companion → POST `/api/wake` → SSE broadcast
2. `GlobalWakeIndicator` → `handleGlobalWake()` → `session.start()`
3. Voice session starts SpeechRecognition
4. SpeechRecognition captures "hey jarvis" as final text
5. `onTranscript("hey jarvis", true)` fires in JarvisOrb
6. **`processVoiceCommand("hey jarvis")` calls `callAIAssistant("hey jarvis")`**
7. `/api/assistant` → Groq API request with "hey jarvis" as a normal command

**Why it happened:** `wakeWordEnabled` defaults to `false` in `VoiceSettings`. The wake word detection in `session.ts:176` was gated behind `settings.wakeWordEnabled`. With it `false`, the wake phrase was never detected or stripped — it fell through to line 186 where any final text is treated as a command.

### Root Cause 2: Duplicate companion events

The companion fired on both partial AND full vosk matches (lines 123-133). A single utterance could trigger both, creating duplicate POST `/api/wake` requests within milliseconds.

### Root Cause 3: No Retry-After handling for 429

The retry loop used fixed exponential backoff (`1000 * (attempt + 1)`) without reading the `Retry-After` header. Three rapid 429 retries made rate limiting worse.

---

## Fixes Implemented

### Fix 1: Wake phrase filter in processVoiceCommand (JarvisOrb.tsx:154)

```typescript
// Filter wake phrases — they are control signals, not AI commands
const normalized = text.trim().toLowerCase().replace(/[,!?.'"-]/g, "");
if (/^(hey|hi|ok)\s+jarvis\s*$/.test(normalized)) {
  return; // bare wake phrase → no AI request
}
// Strip leading wake phrase from combined input
const cleaned = text.trim().replace(/^(hey|hi|ok)\s+jarvis\s*[,.]?\s*/i, "").trim();
if (!cleaned) return;
const command = cleaned; // "hey jarvis what is my cpu" → "what is my cpu"
```

- Bare "hey jarvis" → **zero AI requests**
- "hey jarvis what is my cpu" → **one AI request** with "what is my cpu"
- "what is my cpu" → **one AI request** unchanged

### Fix 2: Client-side wake deduplication (GlobalWakeIndicator.tsx)

Added 5-second debounce via `lastWakeTimestampRef`:

```typescript
const lastWakeTimestampRef = useRef(0);
const WAKE_DEBOUNCE_MS = 5000;
// In onmessage handler:
if (now - lastWakeTimestampRef.current < WAKE_DEBOUNCE_MS) return;
lastWakeTimestampRef.current = now;
```

### Fix 3: Companion partial match removed (jarvis-wake.py)

Removed the `else` branch that fired on partial vosk matches. Now only fires on completed (`AcceptWaveform`) results. Eliminates double-signals from a single utterance.

### Fix 4: Retry-After header respected (provider.ts)

- Reads `retry-after` header from 429 responses
- Attaches `retryAfter` to the Error object
- Uses `retryAfter * 1000` ms as delay (capped at 30s)
- Breaks retry loop if `retryAfter > 30` seconds

---

## Before/After

| Metric | Before | After |
|--------|--------|-------|
| "Hey JARVIS" → AI requests | 1+ | 0 |
| "Hey JARVIS, open Safari" → AI requests | 1-2 | 1 |
| "what is my cpu" → AI requests | 1 | 1 |
| Duplicate wake events per utterance | 2 (full + partial) | 1 |
| 429 retry delay | Fixed backoff | Retry-After header |
| 429 with long Retry-After | Retries 3 times | Breaks after first |

---

## Quality Gates

| Gate | Result |
|------|--------|
| TypeScript | PASS |
| ESLint | PASS |
| Tests | **104 suites / 1634 tests** (all pass) |
| Build | PASS |
| npm audit | 0 vulnerabilities |

---

## Files Changed

| File | Change |
|------|--------|
| `components/JarvisOrb.tsx` | Wake phrase filter in processVoiceCommand |
| `components/GlobalWakeIndicator.tsx` | 5s client-side debounce |
| `companion/jarvis-wake.py` | Removed partial match signal |
| `lib/ai/provider.ts` | Retry-After header support |
| `__tests__/provider.test.ts` | Added headers mock |
| `__tests__/groq-provider.test.ts` | Added headers mock |
| `__tests__/xai-provider.test.ts` | Added headers mock |
| `__tests__/p16_6-wake-filtering.test.ts` | **NEW** — 38 regression tests |

---

## Regression Tests (38 new)

| Category | Tests |
|----------|-------|
| Wake phrase detection | 5 |
| Wake phrase stripping | 6 |
| processVoiceCommand filtering | 10 |
| Duplicate wake event prevention | 4 |
| Server-side wake cooldown | 3 |
| Retry-After handling | 6 |
| AI request count verification | 4 |

---

## Live Test Matrix

After restarting Next.js and companion:

1. Say "Hey JARVIS" → **No** `[AI] pipeline` log → voice session activates
2. Say "What is my CPU usage?" → **Exactly one** `[AI] pipeline: input="What is my CPU usage?"` → real CPU response
3. Say "Hey JARVIS, open Safari" → **One** AI request → confirmation prompt → Safari does NOT launch until approved
4. Approve → Safari launches
5. Repeat "Hey JARVIS" rapidly → **Only one** session activates (5s debounce)
