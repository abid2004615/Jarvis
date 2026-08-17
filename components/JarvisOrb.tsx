"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callAIAssistant, confirmToolDecision } from "@/lib/aiRouter";
import type { AssistantResult } from "@/lib/aiRouter";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";
import {
  createJarvisStore,
  DEFAULT_JARVIS_STATE,
  type JarvisState,
  type OrbMode,
} from "@/lib/jarvisState";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
import { createTelemetrySnapshot } from "@/lib/systemTelemetry";
import { createVoiceSession } from "@/lib/voice";
import type { VoiceSession, VoiceSessionState, VoiceSettings } from "@/lib/voice";
import { ToolConfirmation } from "@/components/ToolConfirmation";
import { MemoryIndicator } from "@/components/MemoryIndicator";
import { ActionStatus } from "@/components/ActionStatus";
import { AutomationPanel } from "@/components/AutomationPanel";
import { NotificationCenter } from "@/components/NotificationCenter";
import { JarvisDashboard } from "@/components/JarvisDashboard";
import { fetchNotifications } from "@/lib/automation/client";
import type { ActionChainStatus, PendingToolCall } from "@/lib/runtime/types";
import { JarvisRuntimeState } from "@/lib/runtime/types";

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

const formatClock = (value: number) => {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

const VOICE_STATE_LABEL: Record<VoiceSessionState, string> = {
  idle: "STANDBY",
  mic_requested: "REQUESTING MIC...",
  listening: "LISTENING",
  transcribing: "TRANSCRIBING...",
  thinking: "THINKING...",
  executing: "EXECUTING...",
  waiting_for_confirmation: "AWAITING CONFIRMATION",
  responding: "RESPONDING...",
  speaking: "SPEAKING",
  error: "VOICE ERROR",
};

export default function JarvisOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const [store] = useState(() => createJarvisStore(DEFAULT_JARVIS_STATE));
  const [state, setState] = useState<JarvisState>(() => store.getState());
  const [error, setError] = useState<string | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const conversationIdRef = useRef<string>("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingToolCall | null>(null);
  const [actionChain, setActionChain] = useState<ActionChainStatus | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [memoryTick, setMemoryTick] = useState(0);
  const lastNotificationAtRef = useRef<number>(0);
  const lastNotificationSpokenRef = useRef<string>("");
  const [voiceSessionState, setVoiceSessionState] = useState<VoiceSessionState>("idle");
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    wakeWordEnabled: false,
    followUpWindow: 15,
    voiceResponseEnabled: true,
    pushToTalkEnabled: true,
  });
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  useEffect(() => {
    const unsubscribe = store.subscribe((next) => setState(next));
    const container = containerRef.current;
    if (!container) return unsubscribe;

    const scene = createOrbScene(container);
    sceneRef.current = scene;
    scene.setMode(store.getState().orbMode);

    if (!conversationIdRef.current) {
      conversationIdRef.current = `jarvis-${Date.now()}`;
    }

    const interval = window.setInterval(() => {
      const snapshot = createTelemetrySnapshot();
      store.setInfo({
        cpu: snapshot.cpu,
        memory: snapshot.memory,
        network: snapshot.network,
        battery: snapshot.battery,
        uptime: snapshot.uptime,
        disk: snapshot.disk,
      });
    }, 2200);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      trackerRef.current?.stop();
      trackerRef.current = null;
      voiceSessionRef.current?.destroy();
      voiceSessionRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, [store]);

  useEffect(() => {
    sceneRef.current?.setMode(state.orbMode);
    sceneRef.current?.setAudioLevel(state.audioLevel);
    sceneRef.current?.setHudVisible(state.hudVisible);
  }, [state.orbMode, state.audioLevel, state.hudVisible]);

  const updateMode = useCallback(
    (orbMode: OrbMode, statusText?: string) => {
      store.setOrbMode(orbMode);
      if (statusText) {
        store.setInfo({ responseText: statusText });
      }
    },
    [store],
  );

  const applyAssistantResult = useCallback(
    (parsed: AssistantResult) => {
      store.setInfo({
        responseText: parsed.response,
        orbMode: parsed.mode,
        runtimeState: parsed.state ?? JarvisRuntimeState.IDLE,
      });
      updateMode(parsed.mode);
      if (parsed.pendingConfirmation) {
        setPendingConfirmation(parsed.pendingConfirmation);
      }
      setActionChain(parsed.actionChain ?? null);
      setMemoryTick((tick) => tick + 1);
    },
    [store, updateMode],
  );

  const speakResponse = useCallback(
    (text: string, onEndMode: OrbMode = "IDLE") => {
      const session = voiceSessionRef.current;
      if (!session) return;
      session.handlePipelineResponse({ message: text });
    },
    [],
  );

  const processVoiceCommand = useCallback(
    async (text: string) => {
      const session = voiceSessionRef.current;
      if (!session) return;
      store.setInfo({ transcript: text });
      setPendingConfirmation(null);
      updateMode("THINKING", "THINKING...");

      const parsed = await callAIAssistant(text, conversationIdRef.current);
      if (parsed.conversationId) {
        conversationIdRef.current = parsed.conversationId;
      }
      applyAssistantResult(parsed);
      session.handlePipelineResponse({
        message: parsed.response,
        pendingConfirmation: parsed.pendingConfirmation
          ? { toolId: parsed.pendingConfirmation.id, description: parsed.pendingConfirmation.description }
          : null,
      });
    },
    [applyAssistantResult, store, updateMode],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const session = createVoiceSession({
      onStateChange: (s: VoiceSessionState) => {
        setVoiceSessionState(s);
        if (s === "listening") {
          updateMode("LISTENING", "LISTENING...");
          store.setInfo({ micEnabled: true });
        } else if (s === "thinking") {
          updateMode("THINKING", "THINKING...");
        } else if (s === "speaking") {
          updateMode("SPEAKING");
        } else if (s === "error") {
          updateMode("ERROR");
        } else if (s === "idle") {
          store.setInfo({ micEnabled: false });
          updateMode("IDLE");
        } else if (s === "waiting_for_confirmation") {
          updateMode("SYSTEM", "CONFIRM ACTION?");
        }
      },
      onTranscript: (text: string, isFinal: boolean) => {
        store.setInfo({ transcript: text });
        if (isFinal && text.length > 0) {
          void processVoiceCommand(text);
        }
      },
      onAudioLevel: (level: number) => {
        store.setInfo({ audioLevel: level });
      },
      onConfirmationRequest: (_toolId: string, description: string) => {
        store.setInfo({ responseText: description });
        updateMode("SYSTEM", "CONFIRM ACTION?");
      },
      onConfirmationResult: (toolId: string, approved: boolean) => {
        void (async () => {
          setConfirmationBusy(true);
          const parsed = await confirmToolDecision(toolId, approved);
          setPendingConfirmation(null);
          setConfirmationBusy(false);
          if (parsed.conversationId) {
            conversationIdRef.current = parsed.conversationId;
          }
          applyAssistantResult(parsed);
          const session = voiceSessionRef.current;
          if (session && parsed.response) {
            session.handlePipelineResponse({
              message: parsed.response,
              pendingConfirmation: parsed.pendingConfirmation
                ? { toolId: parsed.pendingConfirmation.id, description: parsed.pendingConfirmation.description }
                : null,
            });
          }
        })();
      },
      onError: (msg: string) => {
        setError(msg);
        updateMode("ERROR");
      },
      onSpeakingStart: () => updateMode("SPEAKING"),
      onSpeakingEnd: () => updateMode("IDLE"),
    });

    voiceSessionRef.current = session;
    setVoiceSettings(session.getSettings());

    return () => {
      session.destroy();
      voiceSessionRef.current = null;
    };
  }, [store, updateMode, processVoiceCommand, applyAssistantResult]);

  useEffect(() => {
    const notificationInterval = window.setInterval(() => {
      void fetchNotifications(lastNotificationAtRef.current)
        .then((notifications) => {
          for (const notification of notifications) {
            if (notification.createdAt > lastNotificationAtRef.current) {
              lastNotificationAtRef.current = notification.createdAt;
            }
            if (notification.id === lastNotificationSpokenRef.current) continue;
            lastNotificationSpokenRef.current = notification.id;
            store.setInfo({ responseText: notification.body });
            voiceSessionRef.current?.handlePipelineResponse({ message: notification.body });
          }
        })
        .catch(() => {});
    }, 10000);

    return () => {
      window.clearInterval(notificationInterval);
    };
  }, [store]);

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    store.setInfo({ camera: "off", gesture: "IDLE", gestureConfidence: 0 });
  }, [store]);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    store.setInfo({ camera: "starting" });
    setError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: (status) => {
        store.setInfo({
          gesture:
            status.mode === "zoom"
              ? "TWO-HAND ZOOM"
              : status.mode === "spin"
                ? "PINCH ACTIVE"
                : "IDLE",
          gestureConfidence: status.hands > 0 ? 92 : 0,
        });
      },
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      store.setInfo({ camera: "on" });
      updateMode("LISTENING");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED";
      setError(message);
      store.setInfo({ camera: "error" });
    }
  }, [store, updateMode]);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  const runVoiceInput = useCallback(() => {
    const session = voiceSessionRef.current;
    if (!session) {
      setError("VOICE SESSION UNAVAILABLE");
      updateMode("ERROR");
      return;
    }

    if (session.getState() === "listening" || session.getState() === "mic_requested") {
      session.stop();
    } else {
      void session.start();
    }
  }, [updateMode]);

  const handleConfirmationApprove = useCallback(
    (requestId: string) => {
      setConfirmationBusy(true);
      void (async () => {
        const parsed = await confirmToolDecision(requestId, true);
        setPendingConfirmation(null);
        setConfirmationBusy(false);
        if (parsed.conversationId) {
          conversationIdRef.current = parsed.conversationId;
        }
        applyAssistantResult(parsed);
        if (parsed.response) {
          speakResponse(parsed.response);
        }
      })();
    },
    [applyAssistantResult, speakResponse],
  );

  const handleConfirmationDeny = useCallback(
    (requestId: string) => {
      setConfirmationBusy(true);
      void (async () => {
        const parsed = await confirmToolDecision(requestId, false);
        setPendingConfirmation(null);
        setConfirmationBusy(false);
        if (parsed.conversationId) {
          conversationIdRef.current = parsed.conversationId;
        }
        applyAssistantResult(parsed);
        if (parsed.response) {
          speakResponse(parsed.response);
        }
      })();
    },
    [applyAssistantResult, speakResponse],
  );

  const updateVoiceSettings = useCallback(
    (partial: Partial<VoiceSettings>) => {
      const session = voiceSessionRef.current;
      if (!session) return;
      session.updateSettings(partial);
      setVoiceSettings(session.getSettings());
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
        case "m":
        case "M":
          runVoiceInput();
          break;
        case "h":
        case "H":
          store.setInfo({ hudVisible: !state.hudVisible });
          break;
        case "a":
        case "A":
          updateMode("THINKING");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runVoiceInput, state.hudVisible, store, toggleGestures, updateMode]);

  const cameraOn = state.camera === "on";
  const micActive = voiceSessionState === "listening" || voiceSessionState === "transcribing" || voiceSessionState === "speaking";
  const voiceLabel = VOICE_STATE_LABEL[voiceSessionState] ?? "VOICE OFF";
  const statusText =
    state.gesture === "IDLE"
      ? micActive
        ? voiceLabel
        : cameraOn
          ? "HAND TRACKING ON"
          : "WAITING FOR INPUT"
      : state.gesture;

  return (
    <>
      <div ref={containerRef} className="orb-root" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      <div className="hud hud-title">J.A.R.V.I.S.</div>

      <div className="hud hud-monitor">
        <div className="monitor-row"><span>CPU</span><strong>{state.cpu.toFixed(1)}%</strong></div>
        <div className="monitor-row"><span>MEM</span><strong>{state.memory.toFixed(1)} GB</strong></div>
        <div className="monitor-row"><span>NET</span><strong>{state.network.toFixed(1)} MB/s</strong></div>
        <div className="monitor-row"><span>BAT</span><strong>{state.battery}%</strong></div>
        <div className="monitor-row"><span>TIME</span><strong>{formatClock(state.uptime)}</strong></div>
      </div>

      <div className="hud hud-message">
        <div className="messenger-label">{state.orbMode}</div>
        <div className="messenger-line">{state.responseText}</div>
        {state.transcript && state.transcript !== "SYSTEM READY" && (
          <div className="messenger-transcript">&ldquo;{state.transcript}&rdquo;</div>
        )}
      </div>

      <div className="hud hud-hint">
        <div>
          <span className="key">DRAG</span> spin&nbsp;&nbsp;
          <span className="key">SCROLL</span> zoom
        </div>
        {cameraOn ? (
          <div>
            <span className="key">PINCH</span> select&nbsp;&nbsp;
            <span className="key">OPEN PALM</span> focus
          </div>
        ) : (
          <div>
            <span className="key">G</span> gestures&nbsp;&nbsp;
            <span className="key">M</span> mic&nbsp;&nbsp;
            <span className="key">H</span> HUD
          </div>
        )}
      </div>

      <div className="hud hud-controls">
        <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
          <video ref={videoRef} muted playsInline className="camera-video" />
          <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
          <div className="camera-status">
            {statusText} · {state.gestureConfidence > 0 ? `CONF ${state.gestureConfidence}%` : "OFFLINE"}
          </div>
        </div>

        {error && <div className="hud-error">{error}</div>}

        <ToolConfirmation
          request={pendingConfirmation}
          busy={confirmationBusy}
          onApprove={handleConfirmationApprove}
          onDeny={handleConfirmationDeny}
        />

        <ActionStatus chain={actionChain} />

        <div className="hud-row">
          <button type="button" className="hud-btn" aria-pressed={cameraOn} onClick={toggleGestures} disabled={state.camera === "starting"}>
            {state.camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
          </button>
          <button type="button" className="hud-btn" onClick={() => runVoiceInput()}>
            {micActive ? "VOICE ON" : "VOICE OFF"}
          </button>
          <button type="button" className="hud-btn" onClick={() => setShowVoiceSettings(!showVoiceSettings)}>
            ⚙
          </button>
        </div>

        {showVoiceSettings && (
          <div className="hud-row hud-settings-panel">
            <div className="setting-row">
              <span>Wake Word</span>
              <button
                type="button"
                className={`hud-btn-toggle ${voiceSettings.wakeWordEnabled ? "on" : "off"}`}
                onClick={() => updateVoiceSettings({ wakeWordEnabled: !voiceSettings.wakeWordEnabled })}
              >
                {voiceSettings.wakeWordEnabled ? "ON" : "OFF"}
              </button>
            </div>
            <div className="setting-row">
              <span>Voice Response</span>
              <button
                type="button"
                className={`hud-btn-toggle ${voiceSettings.voiceResponseEnabled ? "on" : "off"}`}
                onClick={() => updateVoiceSettings({ voiceResponseEnabled: !voiceSettings.voiceResponseEnabled })}
              >
                {voiceSettings.voiceResponseEnabled ? "ON" : "OFF"}
              </button>
            </div>
            <div className="setting-row">
              <span>Follow-up ({voiceSettings.followUpWindow}s)</span>
              <div>
                {[10, 15, 30].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`hud-btn-toggle ${voiceSettings.followUpWindow === v ? "on" : "off"}`}
                    onClick={() => updateVoiceSettings({ followUpWindow: v })}
                  >
                    {v}s
                  </button>
                ))}
              </div>
            </div>
            {voiceSettings.wakeWordEnabled && (
              <div className="hud-note">
                Browser tab must be focused. Always-on background listening is not available in web browsers.
              </div>
            )}
          </div>
        )}

        <div className="hud-row">
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">+</button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">−</button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>RESET</button>
        </div>
        <div className="hud-row">
          <MemoryIndicator refreshKey={memoryTick} />
        </div>
        <div className="hud-row">
          <AutomationPanel refreshKey={memoryTick} />
        </div>
        <div className="hud-row">
          <NotificationCenter refreshKey={memoryTick} onSpeak={(text) => speakResponse(text)} />
          <JarvisDashboard refreshKey={memoryTick} />
        </div>
      </div>
    </>
  );
}
