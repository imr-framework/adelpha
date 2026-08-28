import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import {
  adkAppName,
  adkModelOptions,
  adkUserId,
  createAdkSession,
  defaultAdkModelId,
  extractChatPlots,
  extractEventText,
  extractToolHints,
  fetchAdkArtifact,
  listAdkApps,
  preferAppName,
  runAdkWithFallback,
  type AdkChatPlot,
  type AdkInlineImage,
  type AdkModelOption,
} from "./adkApi";
import type { SystemState } from "./dtamTypes";
import { pushConsole } from "./consoleLog";
import { isTauri, AGENTS_CONFIG_EVENT } from "../desktop/runtime";
import { requestOpenSettings } from "./settingsOpen";
import { useHeadMotionStore } from "./headMotionStore";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  author?: string;
  pending?: boolean;
  tools?: string[];
  /** Forecast / tool PNGs for this turn */
  plots?: AdkChatPlot[];
};

function mergePlots(prev: AdkChatPlot[] | undefined, next: AdkChatPlot[]): AdkChatPlot[] {
  if (!next.length) return prev ?? [];
  const out = [...(prev ?? [])];
  for (const p of next) {
    const dup = out.some(
      (x) =>
        x.pngBase64 === p.pngBase64 ||
        (x.toolName === p.toolName && x.caption === p.caption && x.pngBase64.slice(0, 64) === p.pngBase64.slice(0, 64)),
    );
    if (!dup) out.push(p);
  }
  return out;
}

/** Merge SSE/text chunks: prefer cumulative snapshots over naive append (avoids duplicated answers). */
function mergeStreamText(prev: string, piece: string): string {
  if (!piece) return prev;
  if (!prev) return piece;
  if (piece === prev) return prev;
  if (piece.startsWith(prev)) return piece;
  if (prev.startsWith(piece)) return prev;
  if (prev.endsWith(piece)) return prev;
  // Exact full-answer replay
  if (piece.length > 48 && prev.includes(piece)) return prev;
  return prev + piece;
}

type Props = {
  systemState: SystemState | null;
};

const MODEL_KEY = "twin_adk_model_id";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function readFileAsInlineImage(file: File): Promise<AdkInlineImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      const data = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({
        displayName: file.name,
        mimeType: file.type || "image/jpeg",
        data,
      });
    };
    reader.readAsDataURL(file);
  });
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function twinContextBlock(state: SystemState | null): string {
  if (!state) return "";
  const t = state.thermal?.mean_magnet_temperature_c?.value;
  const room = state.thermal?.room_temperature_c?.value;
  const dT = state.thermal?.delta_magnet_temperature_c?.value;
  const b0 = state.magnetic?.b0_t?.value;
  const f0 = state.magnetic?.resonant_frequency_mhz?.value;
  const emi = state.emi?.rms_v?.value;
  const emiClass = state.emi?.classification_label;
  const rf = state.rf?.noise_floor_dbm_per_hz?.value;
  return [
    "[Live twin snapshot — observer GUI]",
    `scanner=${state.scanner_id} mode=${state.mode} twin=${state.twin_version}`,
    `mean_magnet_T_C=${t?.toFixed(3) ?? "null"} room_T_C=${room?.toFixed(3) ?? "null"} delta_T_C=${dT?.toFixed(3) ?? "null"}`,
    `B0_T=${b0?.toExponential(6) ?? "null"} f0_MHz=${f0?.toFixed(4) ?? "null"}`,
    `EMI_rms_V=${emi?.toExponential(3) ?? "null"} EMI_class=${emiClass ?? "null"}`,
    `RF_noise_floor_dBm_Hz=${rf?.toFixed(2) ?? "null"}`,
    "",
  ].join("\n");
}

const SUGGESTIONS = [
  "Summarize the current twin state and any risks.",
  "Is magnet temperature drifting relative to the 23 °C reference?",
  "Explain the EMI classification and whether RF noise looks elevated.",
  "What would a 60 s thermal forecast imply for B₀?",
];

export function AgentChatPanel({ systemState }: Props) {
  const userId = adkUserId();
  const models = useMemo(() => adkModelOptions(), []);
  const [apps, setApps] = useState<string[]>([]);
  const [appName, setAppName] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [modelId, setModelId] = useState(() => {
    try {
      const saved = localStorage.getItem(MODEL_KEY);
      if (saved) return saved;
    } catch {
      /* ignore */
    }
    return defaultAdkModelId();
  });
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<AdkInlineImage[]>([]);
  const [listening, setListening] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "system",
      text: "This is the digital twin chat interface. Ask about the current twin state, or request specific tasks related to twin observation and advisory control.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [status, setStatus] = useState("Checking ADK…");
  const attachContext = true;
  const shareRequestId = useHeadMotionStore((s) => s.shareRequestId);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const sendMessageRef = useRef<
    (raw: string, opts?: { displayText?: string; skipMotionContext?: boolean }) => Promise<void>
  >(async () => {});

  const selectedModel: AdkModelOption =
    models.find((m) => m.id === modelId) ?? models[0] ?? { id: modelId, label: modelId };
  const modelNameParts = selectedModel.label.split(/\s+/);
  const modelName = modelNameParts[0] ?? selectedModel.label;
  const modelVariant = modelNameParts.slice(1).join(" ");
  const speechSupported = typeof window !== "undefined" && Boolean(getSpeechRecognition());

  useEffect(() => {
    try {
      localStorage.setItem(MODEL_KEY, modelId);
    } catch {
      /* ignore */
    }
  }, [modelId]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!modelMenuRef.current?.contains(e.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [modelMenuOpen]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const listed = await listAdkApps();
        if (cancelled) return;
        setApps(listed);
        const preferred = preferAppName(listed, adkAppName());
        setAppName(preferred);
        setOnline(true);
        setStatus(
          preferred
            ? `Connected · app ${preferred}`
            : "ADK online · no apps discovered",
        );
        pushConsole("SUCCESS", `ADK reachable (${listed.join(", ") || "no apps"})`);
      } catch (err) {
        if (cancelled) return;
        setOnline(false);
        setApps([]);
        setAppName(null);
        setStatus("ADK offline");
        pushConsole(
          "WARN",
          `Agent API offline — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    void refresh();
    window.addEventListener(AGENTS_CONFIG_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(AGENTS_CONFIG_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const canSend = Boolean(online && appName && !busy && (draft.trim() || attachments.length > 0));

  async function ensureSession(app: string): Promise<string> {
    if (sessionId) return sessionId;
    const session = await createAdkSession(app, userId);
    setSessionId(session.id);
    pushConsole("INFO", `ADK session ${session.id}`);
    return session.id;
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    const images: AdkInlineImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        pushConsole("WARN", `Skipped non-image file ${file.name}`);
        continue;
      }
      images.push(await readFileAsInlineImage(file));
    }
    if (images.length) {
      setAttachments((prev) => [...prev, ...images].slice(0, 4));
    }
  }

  function toggleMic() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      pushConsole("WARN", "Speech recognition is not supported in this browser");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (ev) => {
      const parts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        const alt = ev.results[i]?.[0];
        if (alt?.transcript) parts.push(alt.transcript);
      }
      const transcript = parts.join(" ").trim();
      if (transcript) setDraft(transcript);
    };
    rec.onerror = (ev) => {
      setListening(false);
      pushConsole("WARN", `Mic error: ${ev.error ?? "unknown"}`);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      pushConsole("WARN", `Mic failed: ${err instanceof Error ? err.message : String(err)}`);
      setListening(false);
    }
  }

  async function sendMessage(
    raw: string,
    opts?: { displayText?: string; skipMotionContext?: boolean },
  ) {
    const text = raw.trim();
    const images = attachments;
    if ((!text && !images.length) || busy) return;
    if (!online || !appName) {
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "system",
          text: isTauri()
            ? "Agent API is not running. Add a Google API key in Settings → AI & Agents, then retry."
            : "Agent API is not running. Start it with `make agents-api` in the DTAM repo, then retry.",
        },
      ]);
      return;
    }

    const display =
      opts?.displayText?.trim() ||
      text ||
      (images.length ? `(${images.length} image${images.length > 1 ? "s" : ""} attached)` : "");
    const userMsg: ChatMessage = { id: uid(), role: "user", text: display };
    const assistantId = uid();
    setMessages((m) => [
      ...m,
      userMsg,
      { id: assistantId, role: "assistant", text: "", pending: true, author: appName },
    ]);
    setDraft("");
    setAttachments([]);
    setBusy(true);
    setModelMenuOpen(false);
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    }

    const motionBlock = opts?.skipMotionContext
      ? ""
      : useHeadMotionStore.getState().motionContextBlock();
    const outbound = attachContext
      ? `${twinContextBlock(systemState)}${motionBlock}${text}`
      : text;
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const sid = await ensureSession(appName);
      const transport = await runAdkWithFallback(
        {
          appName,
          userId,
          sessionId: sid,
          message: outbound,
          images,
          modelId,
        },
        {
          signal: ac.signal,
          onEvent: (event) => {
            const piece = extractEventText(event);
            const tools = extractToolHints(event);
            const plots = extractChatPlots(event);
            const author = event.author;
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantId) return msg;
                const nextTools = tools.length
                  ? Array.from(new Set([...(msg.tools ?? []), ...tools]))
                  : msg.tools;
                return {
                  ...msg,
                  text: piece ? mergeStreamText(msg.text, piece) : msg.text,
                  author: author ?? msg.author,
                  tools: nextTools,
                  plots: mergePlots(msg.plots, plots),
                  pending: true,
                };
              }),
            );

            // Artifact-only responses: fetch PNG when inline base64 is absent.
            for (const plot of plots) {
              if (plot.pngBase64.length > 32) continue;
              if (!plot.artifactName || plot.artifactVersion == null) continue;
              void fetchAdkArtifact({
                appName,
                userId,
                sessionId: sid,
                artifactName: plot.artifactName,
                versionId: plot.artifactVersion,
                signal: ac.signal,
              }).then((art) => {
                if (!art?.dataBase64) return;
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantId) return msg;
                    const withoutStub = (msg.plots ?? []).filter((x) => x.id !== plot.id);
                    return {
                      ...msg,
                      plots: mergePlots(withoutStub, [
                        {
                          ...plot,
                          mimeType: art.mimeType || plot.mimeType,
                          pngBase64: art.dataBase64,
                        },
                      ]),
                    };
                  }),
                );
              });
            }
          },
        },
      );
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                pending: false,
                text: msg.text.trim() || "(No text response — check tool events above.)",
              }
            : msg,
        ),
      );
      pushConsole(
        "INFO",
        `Agent reply via /${transport === "sse" ? "run_sse" : "run"} (${appName} · ${selectedModel.label})`,
      );
    } catch (err) {
      if (ac.signal.aborted) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, pending: false, text: msg.text || "(Cancelled)" }
              : msg,
          ),
        );
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  pending: false,
                  role: "system",
                  text: `Agent error: ${detail}`,
                }
              : msg,
          ),
        );
        pushConsole("ERROR", `Agent chat failed: ${detail}`);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    if (shareRequestId <= 0) return;
    const prompt = useHeadMotionStore.getState().consumeShareRequest();
    if (!prompt) return;
    const t = window.setTimeout(() => {
      void sendMessageRef.current(prompt, {
        displayText:
          "Shared optical head-motion log (last ~60s) — please summarize for retrospective correction.",
        skipMotionContext: true,
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [shareRequestId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(draft);
  }

  function newChat() {
    abortRef.current?.abort();
    setSessionId(null);
    setMessages([
      {
        id: uid(),
        role: "system",
        text: "New session will be created on the next message (server-assigned id).",
      },
    ]);
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="agent-chat">
      <div className="agent-chat-toolbar">
        <div className="agent-chat-status">
          <span className={`agent-dot${online ? " agent-dot-on" : ""}`} />
          <span className="agent-status-text">{status}</span>
        </div>
        <div className="agent-chat-toolbar-actions">
          {apps.length > 1 ? (
            <select
              className="agent-app-select"
              value={appName ?? ""}
              onChange={(e) => {
                setAppName(e.target.value);
                newChat();
              }}
              disabled={busy}
              aria-label="ADK app"
            >
              {apps.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="agent-tool-btn" onClick={newChat} disabled={busy}>
            New chat
          </button>
        </div>
      </div>

      {online === false ? (
        <div className="agent-offline">
          {isTauri() ? (
            <>
              <p>Agent runtime is not reachable. Add a Google API key in Settings to enable chat.</p>
              <p>
                <button
                  type="button"
                  className="agent-tool-btn"
                  onClick={() => requestOpenSettings({ section: "ai-agents" })}
                >
                  Open AI & Agents settings
                </button>
              </p>
              <p className="muted">
                Chat is proxied as <code>/api/agents</code>. Twin telemetry does not need the agent
                runtime.
              </p>
            </>
          ) : (
            <>
              <p>Agent API not reachable. In the DTAM repo run:</p>
              <pre>make agents-api</pre>
              <p className="muted">
                Proxied here as <code>/api/agents</code>. Twin telemetry keeps using{" "}
                <code>make twin-api</code> on :8080.
              </p>
            </>
          )}
        </div>
      ) : null}

      <div className="agent-chat-messages" ref={scrollerRef}>
        {messages.map((m) => (
          <div key={m.id} className={`agent-bubble agent-bubble-${m.role}`}>
            {m.role === "assistant" && m.author ? (
              <div className="agent-bubble-meta">{m.author}</div>
            ) : null}
            {m.tools?.length ? (
              <div className="agent-tools">
                {m.tools.map((t) => (
                  <span key={t} className="agent-tool-chip">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="agent-bubble-text">
              {m.role === "assistant" ? (
                <div className="agent-md">
                  {m.text ? <ReactMarkdown>{m.text}</ReactMarkdown> : null}
                  {m.pending ? <span className="agent-typing">▍</span> : null}
                </div>
              ) : (
                <>
                  {m.text}
                  {m.pending ? <span className="agent-typing">▍</span> : null}
                </>
              )}
            </div>
            {m.plots?.length ? (
              <div className="agent-plots">
                {m.plots
                  .filter((p) => p.pngBase64.length > 32)
                  .map((p) => (
                    <figure key={p.id} className="agent-plot">
                      <img
                        className="agent-plot-img"
                        src={`data:${p.mimeType || "image/png"};base64,${p.pngBase64}`}
                        alt={p.caption || `Plot from ${p.toolName}`}
                      />
                      {p.caption ? (
                        <figcaption className="agent-plot-caption">{p.caption}</figcaption>
                      ) : null}
                    </figure>
                  ))}
              </div>
            ) : null}
          </div>
        ))}

        {!messages.some((m) => m.role === "user") && online ? (
          <div className="agent-suggestions">
            <div className="agent-suggestions-label">Try asking</div>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="agent-suggestion"
                onClick={() => void sendMessage(s)}
                disabled={busy || !online}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <form className="agent-composer" onSubmit={onSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="agent-file-input"
          onChange={(e) => {
            void onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className={`agent-composer-shell${online === false ? " agent-composer-shell-disabled" : ""}`}>
          {attachments.length ? (
            <div className="agent-attach-chips">
              {attachments.map((img) => (
                <button
                  key={`${img.displayName}-${img.data.slice(0, 12)}`}
                  type="button"
                  className="agent-attach-chip"
                  title="Remove attachment"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((a) => a.data !== img.data))
                  }
                >
                  <span className="agent-attach-chip-name">{img.displayName}</span>
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          ) : null}
          <textarea
            className="agent-input"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about twin state or request an advisory task…"
            disabled={online === false}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(draft);
              }
            }}
          />
          <div className="agent-composer-toolbar">
            <div className="agent-composer-tools-left">
              <button
                type="button"
                className="agent-icon-btn"
                title="Attach photo"
                aria-label="Attach photo"
                disabled={online === false || busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden>
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="agent-icon-btn"
                title="Insert a suggested question"
                disabled={online === false || busy}
                onClick={() => {
                  const next = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
                  setDraft(next);
                }}
              >
                <span className="agent-slash">/</span>
              </button>
            </div>
            <div className="agent-composer-tools-right">
              <div className="agent-model-wrap" ref={modelMenuRef}>
                <button
                  type="button"
                  className={`agent-model-pill${modelMenuOpen ? " agent-model-pill-open" : ""}`}
                  title="Choose model"
                  aria-haspopup="listbox"
                  aria-expanded={modelMenuOpen}
                  disabled={online === false}
                  onClick={() => setModelMenuOpen((v) => !v)}
                >
                  <span className="agent-model-label">{modelName}</span>
                  {modelVariant ? <span className="agent-model-variant">{modelVariant}</span> : null}
                  <span className="agent-model-chevron" aria-hidden>
                    ▾
                  </span>
                </button>
                {modelMenuOpen ? (
                  <ul className="agent-model-menu" role="listbox">
                    {models.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={m.id === selectedModel.id}
                          className={`agent-model-option${m.id === selectedModel.id ? " agent-model-option-active" : ""}`}
                          onClick={() => {
                            setModelId(m.id);
                            setModelMenuOpen(false);
                          }}
                        >
                          {m.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                className={`agent-icon-btn${listening ? " agent-icon-btn-active" : ""}`}
                title={
                  speechSupported
                    ? listening
                      ? "Stop listening"
                      : "Speech to text"
                    : "Speech recognition not supported"
                }
                aria-label="Speech to text"
                aria-pressed={listening}
                disabled={online === false || busy || !speechSupported}
                onClick={toggleMic}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-1 14.93V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.07A7.002 7.002 0 0 0 19 10a1 1 0 1 0-2 0 5 5 0 1 1-10 0 1 1 0 1 0-2 0 7.002 7.002 0 0 0 6 6.93z"
                  />
                </svg>
              </button>
              {busy ? (
                <button type="button" className="agent-send-round" onClick={stop} title="Stop">
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
                    <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  className="agent-send-round"
                  disabled={!canSend}
                  title="Send"
                  aria-label="Send"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M12 5.2a1 1 0 0 1 .7.3l5 5a1 1 0 1 1-1.4 1.4L13 8.6V18a1 1 0 1 1-2 0V8.6L7.7 11.9a1 1 0 1 1-1.4-1.4l5-5a1 1 0 0 1 .7-.3z"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
