"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callAIAssistant } from "@/lib/aiRouter";
import type { AssistantResult } from "@/lib/aiRouter";
import { HandTracker } from "@/lib/handTracker";
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
import { loadVoiceSettings } from "@/lib/voice/settings";
import { ActionStatus } from "@/components/ActionStatus";
import { AutomationPanel } from "@/components/AutomationPanel";
import { NotificationCenter } from "@/components/NotificationCenter";
import { JarvisDashboard } from "@/components/JarvisDashboard";
import { MemoryIndicator } from "@/components/MemoryIndicator";
import { JarvisHeader } from "@/components/JarvisHeader";
import { CommandBar } from "@/components/CommandBar";
import { GlobalWakeIndicator } from "@/components/GlobalWakeIndicator";
import { fetchNotifications } from "@/lib/automation/client";
import type { ActionChainStatus } from "@/lib/runtime/types";
import { JarvisRuntimeState } from "@/lib/runtime/types";

const VOICE_STATE_LABEL: Record<VoiceSessionState, string> = {
  idle: "STANDBY",
  mic_requested: "REQUESTING MIC...",
  listening: "LISTENING",
  transcribing: "TRANSCRIBING...",
  thinking: "THINKING...",
  executing: "EXECUTING...",
  waiting_for_confirmation: "EXECUTING...",
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
  const [actionChain, setActionChain] = useState<ActionChainStatus | null>(null);
  const [memoryTick, setMemoryTick] = useState(0);
  const lastNotificationAtRef = useRef<number>(0);
  const lastNotificationSpokenRef = useRef<string>("");
  const [voiceSessionState, setVoiceSessionState] = useState<VoiceSessionState>("idle");
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(loadVoiceSettings);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [globalWakeActive, setGlobalWakeActive] = useState(false);

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
      void createTelemetrySnapshot().then((snapshot) => {
        if (snapshot) {
          store.setInfo({
            cpu: snapshot.cpu,
            memory: snapshot.memory,
            network: snapshot.network,
            battery: snapshot.battery,
            uptime: snapshot.uptime,
            disk: snapshot.disk,
          });
        }
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
      setActionChain(parsed.actionChain ?? null);
      setMemoryTick((tick) => tick + 1);
    },
    [store, updateMode],
  );

  const speakResponse = useCallback(
    (text: string) => {
      const session = voiceSessionRef.current;
      if (!session) return;
      // Typed commands and passive notifications may be spoken, but they must
      // not enter the speech-recognition/follow-up flow.
      session.speakText(text);
    },
    [],
  );

  const processVoiceCommand = useCallback(
    async (text: string) => {
      const session = voiceSessionRef.current;
      if (!session) return;

      // Filter wake phrases — they are control signals, not AI commands
      const normalized = text.trim().toLowerCase().replace(/[,!?.'"-]/g, "");
      if (/^(hey|hi|ok)\s+jarvis\s*$/.test(normalized)) {
        return;
      }
      // Strip leading wake phrase from combined input like "hey jarvis what is my cpu"
      const cleaned = text.trim().replace(/^(hey|hi|ok)\s+jarvis\s*[,.]?\s*/i, "").trim();
      if (!cleaned) return;
      const command = cleaned;

      store.setInfo({ transcript: command });
      updateMode("THINKING", "THINKING...");

      const parsed = await callAIAssistant(command, conversationIdRef.current);
      if (parsed.conversationId) {
        conversationIdRef.current = parsed.conversationId;
      }
      applyAssistantResult(parsed);
      session.handlePipelineResponse({
        message: parsed.response,
      });
    },
    [applyAssistantResult, store, updateMode],
  );

  const processTextCommand = useCallback(
    async (text: string) => {
      store.setInfo({ transcript: text });
      updateMode("THINKING", "THINKING...");
      const parsed = await callAIAssistant(text, conversationIdRef.current);
      if (parsed.conversationId) {
        conversationIdRef.current = parsed.conversationId;
      }
      applyAssistantResult(parsed);
      if (parsed.response) {
        speakResponse(parsed.response);
      }
    },
    [applyAssistantResult, store, updateMode, speakResponse],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const session = createVoiceSession({
      onStateChange: (s: VoiceSessionState) => {
        setVoiceSessionState(s);
        if (s === "listening") {
          updateMode("LISTENING");
          store.setInfo({ micEnabled: true });
        } else if (s === "thinking") {
          updateMode("THINKING");
        } else if (s === "responding" || s === "speaking") {
          updateMode("SPEAKING");
        } else if (s === "error") {
          updateMode("ERROR");
        } else if (s === "idle") {
          store.setInfo({ micEnabled: false });
          updateMode("IDLE");
        } else if (s === "waiting_for_confirmation") {
          updateMode("SYSTEM");
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
      onError: (msg: string) => {
        setError(msg);
        updateMode("ERROR");
      },
      onSpeakingStart: () => updateMode("SPEAKING"),
      onSpeakingEnd: () => updateMode("IDLE"),
    });

    voiceSessionRef.current = session;

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
          gestureConfidence: status.hands > 0 ? 100 : 0,
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
    } else if (session.getState() === "error") {
      void session.retry();
    } else {
      void session.start();
    }
  }, [updateMode]);

  const updateVoiceSettings = useCallback(
    (partial: Partial<VoiceSettings>) => {
      const session = voiceSessionRef.current;
      if (!session) return;
      session.updateSettings(partial);
      setVoiceSettings(session.getSettings());
      if (partial.globalWakeEnabled !== undefined) {
        setGlobalWakeActive(partial.globalWakeEnabled);
      }
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runVoiceInput, state.hudVisible, store, toggleGestures]);

  const handleGlobalWake = useCallback(() => {
    const session = voiceSessionRef.current;
    if (session && session.getState() === "idle") {
      void session.start();
    }
  }, []);

  const cameraOn = state.camera === "on";
  const micActive = voiceSessionState === "listening" || voiceSessionState === "transcribing" || voiceSessionState === "speaking";
  const wakeStatus = voiceSettings.globalWakeEnabled
    ? globalWakeActive
      ? "listening"
      : "disconnected"
    : "disconnected";

  return (
    <>
      <div ref={containerRef} className="orb-root" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      <JarvisHeader
        wakeStatus={wakeStatus as "disconnected" | "listening" | "detected"}
        systemOnline={state.systemOnline}
      />

      {state.hudVisible && (
        <div className="quick-stats">
          <div className="quick-stat">
            <span className="quick-stat-label">CPU</span>
            <span className="quick-stat-value">{state.cpu.toFixed(1)}%</span>
          </div>
          <div className="quick-stat">
            <span className="quick-stat-label">MEM</span>
            <span className="quick-stat-value">{state.memory.toFixed(1)} GB</span>
          </div>
          <div className="quick-stat">
            <span className="quick-stat-label">NET</span>
            <span className="quick-stat-value">{state.network.toFixed(1)} MB/s</span>
          </div>
          <div className="quick-stat">
            <span className="quick-stat-label">BAT</span>
            <span className="quick-stat-value">{state.battery}%</span>
          </div>
        </div>
      )}

      <div className="hud hud-message">
        <div className="messenger-label">{VOICE_STATE_LABEL[voiceSessionState] ?? state.orbMode}</div>
        <div className="messenger-line">{state.responseText}</div>
        {state.transcript && state.transcript !== "SYSTEM READY" && (
          <div className="messenger-transcript">&ldquo;{state.transcript}&rdquo;</div>
        )}
      </div>

      {state.hudVisible && (
        <div className="system-overview">
          <div className="system-overview-title">SYSTEM OVERVIEW</div>
          <div className="system-overview-row">
            <span className="system-overview-key">Status</span>
            <span className="system-overview-val">{VOICE_STATE_LABEL[voiceSessionState] ?? "IDLE"}</span>
          </div>
          <div className="system-overview-row">
            <span className="system-overview-key">Orb</span>
            <span className="system-overview-val">{state.orbMode}</span>
          </div>
          <div className="system-overview-row">
            <span className="system-overview-key">Camera</span>
            <span className="system-overview-val">{cameraOn ? "ON" : "OFF"}</span>
          </div>
          <div className="system-overview-row">
            <span className="system-overview-key">Mic</span>
            <span className="system-overview-val">{micActive ? "ACTIVE" : "OFF"}</span>
          </div>
          <div className="system-overview-row">
            <span className="system-overview-key">AI</span>
            <span className="system-overview-val">{state.aiReady ? "READY" : "OFFLINE"}</span>
          </div>
        </div>
      )}

      {state.hudVisible && (
        <div className="hud hud-controls">
          <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
            <video ref={videoRef} muted playsInline className="camera-video" />
            <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
            <div className="camera-status">
              {VOICE_STATE_LABEL[voiceSessionState] ?? "STANDBY"}
              {state.gestureConfidence > 0 ? " HANDS" : ""}
            </div>
          </div>

          {error && <div className="hud-error">{error}</div>}

          <ActionStatus chain={actionChain} />

          <div className="hud-row">
            <button type="button" className="hud-btn" aria-label={cameraOn ? "Disable gestures" : "Enable gestures"} aria-pressed={cameraOn} onClick={toggleGestures} disabled={state.camera === "starting"}>
              {state.camera === "starting" ? "INITIALIZING..." : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
            </button>
            <button type="button" className="hud-btn" aria-label={micActive ? "Turn off voice" : "Turn on voice"} onClick={() => runVoiceInput()}>
              {voiceSessionState === "error" ? "RETRY VOICE" : micActive ? "VOICE ON" : "VOICE OFF"}
            </button>
            <button type="button" className="hud-btn" aria-label="Settings" onClick={() => setShowVoiceSettings(!showVoiceSettings)}>
              SETTINGS
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
                <span>Global Wake</span>
                <button
                  type="button"
                  className={`hud-btn-toggle ${voiceSettings.globalWakeEnabled ? "on" : "off"}`}
                  onClick={() => updateVoiceSettings({ globalWakeEnabled: !voiceSettings.globalWakeEnabled })}
                >
                  {voiceSettings.globalWakeEnabled ? "ON" : "OFF"}
                </button>
              </div>
              {voiceSettings.globalWakeEnabled && (
                <div className="hud-note">
                  Run the companion: python companion/jarvis-wake.py
                </div>
              )}
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
              {voiceSettings.wakeWordEnabled && !voiceSettings.globalWakeEnabled && (
                <div className="hud-note">
                  Browser tab must be focused. Enable Global Wake for background listening.
                </div>
              )}
            </div>
          )}

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

          {voiceSettings.globalWakeEnabled && (
            <GlobalWakeIndicator
              enabled={voiceSettings.globalWakeEnabled}
              onWakeDetected={handleGlobalWake}
            />
          )}
        </div>
      )}

      <CommandBar
        disabled={voiceSessionState === "thinking" || voiceSessionState === "executing"}
        onSubmit={processTextCommand}
      />
    </>
  );
}
