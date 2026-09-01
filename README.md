# JARVIS v1.0 — macOS AI Assistant

A personal AI assistant for macOS with voice, vision, computer use, goal workflows, personalization, observability, and native macOS packaging.

## Requirements

- macOS 13+ (Apple Silicon or Intel)
- Node.js 18+
- npm
- Python 3.9+ (for wake companion)
- Groq API key (free tier at https://console.groq.com/)

## Quick Start

```bash
npm install
npm run setup          # download the offline Vosk speech model (~40MB)
cp .env.example .env.local
# Edit .env.local and add your Groq API key
npm run dev
```

`npm run setup` fetches the Vosk model into `companion/`. The model is not
stored in git, so this step is required before using voice features or
packaging the app. It is idempotent — re-running it verifies the existing
model and exits. Use `npm run setup -- --force` to re-download.

Open http://localhost:3000.

## Native macOS App (JARVIS.app)

JARVIS can be packaged as a native macOS application:

```bash
npm run package        # Build JARVIS.app (DMG + ZIP)
npm run package:dir    # Build without creating installer
```

The packaged app:
- Starts the backend server automatically
- Launches the wake companion
- Provides a menu bar icon with status
- Handles single-instance protection
- Manages graceful shutdown
- Recovers from backend crashes (max 3 retries)

### Menu Bar

The tray icon provides:
- **Open JARVIS** — show the main window
- **Backend/Wake status** — current process state
- **Restart JARVIS** — restart all services
- **Quit JARVIS** — graceful shutdown

### Port Management

JARVIS automatically:
1. Checks if a backend is already running on port 3000
2. Reuses it if healthy
3. Finds an alternative port if 3000 is occupied
4. Never kills unknown processes

## Development

```bash
npm run dev             # Start Next.js dev server
npm run dev             # Terminal 2: wake companion (optional)
```

### Global Wake Companion

```bash
npm run setup          # if you have not already fetched the model
cd companion
pip install -r requirements.txt
python jarvis-wake.py --port 3000
```

Offline wake word detection using Vosk. Signals the server when "Hey JARVIS" is heard.

The model lives in `companion/vosk-model-small-en-us-0.15/` and is gitignored.
`npm run setup` is the supported way to obtain it; the companions can also
self-download on first run, but that path does not work inside a packaged app
bundle, which is read-only.

### Packaging

```bash
npm run setup           # Fetch the Vosk model (required before packaging)
npm run build           # Production Next.js build
npm run electron:compile # Compile Electron TypeScript
npm run electron:dev    # Run Electron in development mode
npm run package         # Build and package JARVIS.app
```

`npm run package` runs `npm run setup` first, so the packaged app always ships
with the speech model bundled.

## Environment Variables

Copy `.env.example` to `.env.local`:

```
AI_PROVIDER=groq              # Only Groq is active
AI_API_KEY=                   # Your Groq API key (required)
AI_MODEL=openai/gpt-oss-120b  # Recommended model
```

**Do NOT add API keys for other providers.** Groq is the only active provider.

## macOS Permissions

| Permission | Required For | Notes |
|-----------|-------------|-------|
| Microphone | Voice input | Optional — text input works without it |
| Screen Recording | Vision / OCR | Optional — enables "what's on my screen?" |
| Accessibility | Computer Use | Optional — enables click/type/scroll automation |

Permissions can be granted in System Settings > Privacy & Security.

## Architecture

```
User Input (Voice / Text)
        ↓
    JARVIS UI (Next.js + React 19 + Three.js)
        ↓
    JarvisPipeline (runtime orchestrator)
        ↓
    AI Provider (Groq — reasoning model)
        ↓
    ToolRegistry (65+ tools, intent-filtered to ≤20/request)
        ↓
    PermissionManager + Confirmation
        ↓
    ActionChain (safe → execute, confirmation → pause)
        ↓
    Execution + Verification
        ↓
    Response + TTS
        ↓
    Observability (redacted logging)
```

### Packaging Architecture

```
JARVIS.app (Electron)
    ↓
    ├─ Main Process (electron/main.ts)
    │   ├─ Single instance lock
    │   ├─ Port management (detect/reuse/avoid)
    │   ├─ Backend process (Next.js server)
    │   ├─ Wake companion process (Python/Vosk)
    │   ├─ Health monitoring (5s interval)
    │   ├─ Crash recovery (max 3 retries)
    │   ├─ Menu bar / tray
    │   └─ Graceful shutdown
    │
    ├─ Preload Script (electron/preload.ts)
    │   └─ Safe IPC bridge (contextIsolation: true)
    │
    └─ BrowserWindow
        └─ Existing JARVIS UI (unchanged)
```

## Testing

```bash
npm test             # Run all tests (1670+)
npx tsc --noEmit     # Type checking
npm run lint         # ESLint
npm run build        # Production build
npm audit            # Security audit (0 vulnerabilities)
```

### Quality Gates

| Gate | Command | Expected |
|------|---------|----------|
| TypeScript | `npx tsc --noEmit` | 0 errors |
| ESLint | `npm run lint` | 0 warnings |
| Tests | `npm test` | All passing |
| Build | `npm run build` | Success |
| Audit | `npm audit` | 0 vulnerabilities |

## Subsystems

### Voice (P7)
Wake word detection, speech recognition, VAD, TTS, barge-in. State machine: IDLE → LISTENING → THINKING → SPEAKING → IDLE.

### Global Wake (P16)
Native Python companion with Vosk offline model. Detects "Hey JARVIS" and signals the server. 3-second cooldown + 5s client debounce prevent duplicates. Wake phrases are never sent to the AI pipeline.

### Vision (P8)
Screen capture, OCR (Apple Vision framework), screen context analysis. All screen content treated as untrusted.

### macOS Integration (P9)
System telemetry, application management, file operations, Safari, Music, calendar, clipboard, windows. 14 allowlisted applications.

### Computer Use (P10)
Accessibility-first UI automation. Click, type, scroll, keypress with target resolution, bounds validation, high-risk detection. All actions require user confirmation.

### Goal Workflows (P12)
Multi-step goal execution with planning, validation, execution, observation, verification, recovery.

### Personalization (P13)
8 preference categories with explicit intent only. Privacy-safe.

### Memory (P13)
Explicit-only memory: "remember..." saves, "forget..." deletes. 14+ secret patterns rejected.

### Tasks / Reminders / Routines (P12)
Create, list, complete, delete. Restart-persistence. No duplicate schedulers.

### Automations (P12)
Scheduled automations with condition evaluation, notification on completion.

### Observability (P14)
Structured event logging, 18 secret redaction patterns, correlation IDs, health monitoring.

### Security (P15)
Allowlisted applications (14), allowlisted folders (6), no arbitrary shell, credential detection, confirmation cannot be bypassed.

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/assistant` | POST | Process user message |
| `/api/assistant/confirm` | POST | Tool confirmation |
| `/api/dashboard` | GET | Dashboard data |
| `/api/health` | GET | System health |
| `/api/wake` | GET/POST | Wake companion SSE + signal |
| `/api/memory` | GET/DELETE | Memory CRUD |
| `/api/automations` | GET/POST | Automation CRUD |
| `/api/notifications` | GET/POST/DELETE | Notifications |

## Storage

All data stored in `.jarvis/`:

| File | Limit |
|------|-------|
| `memory.json` | 100 entries |
| `personalization.json` | 100 prefs, 200 patterns |
| `goals.json` | 20 goals |
| `automations.json` | 50 automations |
| `tasks.json` | 200 tasks |
| `reminders.json` | 100 reminders |
| `routines.json` | 20 routines |

## Troubleshooting

### Backend won't start
- Check if port 3000 is in use: `lsof -i :3000`
- Kill only the JARVIS process: `kill <PID>` (never `killall node`)

### Wake companion not detecting
- Verify Python: `python3 --version`
- Install dependencies: `pip install -r companion/requirements.txt`
- Check microphone permission in System Settings

### Groq errors
- Verify API key in `.env.local`
- Check https://status.groq.com/ for outages

### JARVIS.app won't launch
- Check Console.app for crash logs
- Verify Node.js is installed: `node --version`
- Try running `npm run dev` first to verify setup

## Project Structure

```
electron/               # Electron main process (macOS wrapper)
  main.ts              # App lifecycle, process management, tray
  preload.ts           # Safe IPC bridge
  entitlements.mac.plist # macOS permissions for hardened runtime
app/                   # Next.js pages and API routes
components/            # React UI components
  JarvisOrb.tsx        # Main orb component
  CommandBar.tsx       # Text input
  GlobalWakeIndicator.tsx  # Wake companion status
companion/             # Native wake companion (Python)
  jarvis-wake.py       # Vosk-based offline wake detection
  requirements.txt     # Python dependencies
lib/                   # Core library code
  ai/                  # AI provider, router, assistant, tool filtering
  runtime/             # Pipeline, action chain, context
  tools/               # Tool registry, permissions, types
  voice/               # Voice session, VAD, TTS, wake word
  macos/               # macOS integrations
  vision/              # Screen capture, OCR
  computer-use/        # UI automation
  memory/              # Memory store
  automation/          # Scheduler, automations
  tasks/               # Task management
  reminders/           # Reminders
  goals/               # Goal workflows
  personalization/     # User preferences
  observability/       # Logging, redaction, health
  storage/             # Atomic file storage
__tests__/             # 105+ test suites, 1670+ tests
```

## License

MIT
