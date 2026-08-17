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
import { createVoiceController } from "@/lib/voice";
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

export default function JarvisOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const [store] = useState(() => createJarvisStore(DEFAULT_JARVIS_STATE));
  const [state, setState] = useState<JarvisState>(() => store.getState());
  const [error, setError] = useState<string | null>(null);
  const [voiceController] = useState<ReturnType<typeof createVoiceController> | null>(() =>
    typeof window === "undefined" ? null : createVoiceController(),
  );
  const conversationIdRef = useRef<string>("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingToolCall | null>(null);
  const [actionChain, setActionChain] = useState<ActionChainStatus | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [memoryTick, setMemoryTick] = useState(0);
  const lastNotificationAtRef = useRef<number>(0);
  const lastNotificationSpokenRef = useRef<string>("");

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
      scene.dispose();
      sceneRef.current = null;
    };
  }, [store]);

  useEffect(() => {
    sceneRef.current?.setMode(state.orbMode);
    sceneRef.current?.setAudioLevel(state.audioLevel);
    sceneRef.current?.setHudVisible(state.hudVisible);
  }, [state.orbMode, state.audioLevel, state.hudVisible]);

  const updateMode = useCallback((orbMode: OrbMode, statusText?: string) => {
    store.setOrbMode(orbMode);
    if (statusText) {
      store.setInfo({ responseText: statusText });
    }
  }, [store]);

  const applyAssistantResult = useCallback((parsed: AssistantResult) => {
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
  }, [store, updateMode]);

  const speakResponse = useCallback((text: string, onEndMode: OrbMode = "IDLE") => {
    if (!voiceController) return;
    voiceController.speak(text, {
      onStart: () => updateMode("SPEAKING"),
      onEnd: () => updateMode(onEndMode),
    });
  }, [updateMode, voiceController]);

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
            if (voiceController) {
              voiceController.speak(notification.body, {
                onStart: () => updateMode("SPEAKING"),
                onEnd: () => updateMode("IDLE"),
              });
            }
          }
        })
        .catch(() => {
          // Notifications are best-effort; never break the HUD on errors.
        });
    }, 10000);

    return () => {
      window.clearInterval(notificationInterval);
    };
  }, [store, updateMode, voiceController]);

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
    if (!voiceController || typeof window === "undefined") {
      setError("SPEECH RECOGNITION UNAVAILABLE");
      updateMode("ERROR");
      return;
    }

    updateMode("LISTENING", "LISTENING...");
    store.setInfo({ micEnabled: true, transcript: "LISTENING..." });
    const controller = voiceController;
    controller.startListening((text) => {
      store.setInfo({ transcript: text });
      setPendingConfirmation(null);

      const processAI = async () => {
        const parsed = await callAIAssistant(text, conversationIdRef.current);
        if (parsed.conversationId) {
          conversationIdRef.current = parsed.conversationId;
        }
        applyAssistantResult(parsed);
        if (parsed.pendingConfirmation) {
          return;
        }
        if (parsed.response) {
          speakResponse(parsed.response);
        }
      };
      void processAI();
    }, (message) => {
      setError(message);
      updateMode("ERROR");
    });

    store.setInfo({ micEnabled: true });
  }, [applyAssistantResult, speakResponse, store, updateMode, voiceController]);

  const handleConfirmationApprove = useCallback((requestId: string) => {
    setConfirmationBusy(true);
    const processDecision = async () => {
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
    };
    void processDecision();
  }, [applyAssistantResult, speakResponse]);

  const handleConfirmationDeny = useCallback((requestId: string) => {
    setConfirmationBusy(true);
    const processDecision = async () => {
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
    };
    void processDecision();
  }, [applyAssistantResult, speakResponse]);

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
  const statusText =
    state.gesture === "IDLE" ? (cameraOn ? "HAND TRACKING ON" : "WAITING FOR INPUT") : state.gesture;

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
          <div className="messenger-transcript">“{state.transcript}”</div>
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
            {state.micEnabled ? "MIC ON" : "MIC OFF"}
          </button>
        </div>
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
