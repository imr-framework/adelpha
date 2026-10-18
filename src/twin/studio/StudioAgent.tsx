import { useEffect, useRef, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, Copy, Download, FileText, FolderOpen, Mic, AudioLines, Wrench, Network, Paperclip, Plus, Search, Settings2, Sparkles, Square, X } from "lucide-react";
import { adkModelOptions, adkUserId, createAdkSession, defaultAdkModelId, extractChatPlots, extractEventText, listAdkApps, preferAppName, runAdkWithFallback, type AdkChatPlot, type AdkInlineImage } from "../adkApi";
import { requestOpenSettings } from "../settingsOpen";
import { readProjects } from "./library";
import "./studioAgent.css";

type Message = { id: string; role: "user" | "assistant"; text: string; plots?: AdkChatPlot[]; pending?: boolean };
type Dictation = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type Attachment = { name: string; text?: string; image?: AdkInlineImage };
const starters = [
  { title: "Explore a design", detail: "Discuss and iterate on an MRI design.", prompt: "Help me turn an MRI design idea into a design brief.", Icon: BookOpen },
  { title: "Build a workflow", detail: "Create a simulation or analysis workflow.", prompt: "Help me plan a simulation workflow. Ask me about the requirements first.", Icon: Network },
  { title: "Review a project", detail: "Get feedback on your code, methods, or results.", prompt: "I'd like to review a project. What context should I share?", Icon: FileText },
];
export function StudioAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const speech = useRef<Dictation | null>(null);
  const toolsMenu = useRef<HTMLDivElement>(null);
  const toolsButton = useRef<HTMLButtonElement>(null);
  const [reading, setReading] = useState(false);
  const [mode, setMode] = useState("Designer / Developer");
  const [model, setModel] = useState("auto");
  const [modelOpen, setModelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const session = useRef<{ app: string; id: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const modelButton = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const models = adkModelOptions();
  const projects = readProjects();
  const canvas = messages.find((message) => message.id === canvasId);
  useEffect(() => () => { controller.current?.abort(); speech.current?.stop(); }, []);
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`;
  }, [draft]);
  useEffect(() => {
    if (!toolsOpen) return;
    const close = (event: MouseEvent) => { if (!toolsMenu.current?.contains(event.target as Node)) setToolsOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setToolsOpen(false); toolsButton.current?.focus(); } };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [toolsOpen]);
  function toggleDictation() {
    if (listening) { speech.current?.stop(); return; }
    const host = window as Window & { SpeechRecognition?: new () => Dictation; webkitSpeechRecognition?: new () => Dictation };
    const Recognition = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Recognition) { setError("Voice input is not supported in this browser. You can type your message instead."); return; }
    const recognition = new Recognition(); speech.current = recognition;
    const prefix = draft.trim();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = "en-US";
    recognition.onresult = (event) => { const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" "); setDraft([prefix, text].filter(Boolean).join(" ")); };
    recognition.onerror = () => { setListening(false); setError("Could not use the microphone. Check your browser microphone permission and try again."); };
    recognition.onend = () => { setListening(false); speech.current = null; };
    try { recognition.start(); setListening(true); setError(""); } catch { setError("Could not start voice input. Please try again."); }
  }
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [messages]);
  useEffect(() => {
    if (!modelOpen) return;
    const close = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) setModelOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setModelOpen(false); modelButton.current?.focus(); } };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [modelOpen]);

  async function attach(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []); event.target.value = "";
    setReading(true); setError("");
    try {
      if (files.length + attachments.length > 4) throw new Error("Attach up to four files at a time.");
      const next: Attachment[] = [];
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} exceeds the 5 MB limit.`);
        if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
          const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`)); reader.readAsDataURL(file); });
          next.push({ name: file.name, image: { displayName: file.name, mimeType: file.type, data } });
        } else if (/\.(txt|md|json|csv|py|ts|tsx|js|yaml|yml)$/i.test(file.name)) {
          next.push({ name: file.name, text: await file.text() });
        } else throw new Error("Choose a text, code, PNG, JPEG, or WebP file.");
      }
      setAttachments((current) => [...current, ...next]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read files."); }
    finally { setReading(false); }
  }

  async function send() {
    if (controller.current || reading || (!draft.trim() && !attachments.length)) return;
    speech.current?.stop();
    const text = draft.trim(); const files = attachments;
    const ac = new AbortController(); controller.current = ac;
    setBusy(true); setError(""); setModelOpen(false); setToolsOpen(false);
    const assistantId = crypto.randomUUID();
    let started = false;
    try {
      if (!session.current) {
        const app = preferAppName(await listAdkApps());
        if (!app) throw new Error("No agent is available. Configure AI & Agents in Settings and try again.");
        const created = await createAdkSession(app, adkUserId());
        if (ac.signal.aborted) return;
        session.current = { app, id: created.id };
      }
      if (ac.signal.aborted) return;
      started = true;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: [text, ...files.map((file) => `Attached: ${file.name}`)].filter(Boolean).join("\n\n") }, { id: assistantId, role: "assistant", text: "", pending: true }]);
      setDraft(""); setAttachments([]);
      await runAdkWithFallback({ appName: session.current.app, userId: adkUserId(), sessionId: session.current.id, modelId: model === "auto" ? defaultAdkModelId() : model,
        message: `[Engineering Studio: ${mode}]\nHelp with MRI design and development. Distinguish proposals from completed work. Format documents and code in Markdown.\n\n${text}\n${files.filter((file) => file.text !== undefined).map((file) => `\n[Attached reference file: ${file.name}]\n${file.text}\n[End reference file]`).join("\n")}`,
        images: files.flatMap((file) => file.image ? [file.image] : []),
      }, { signal: ac.signal, onEvent: (event) => {
        if (ac.signal.aborted) return;
        if (event.errorMessage) throw new Error(event.errorMessage);
        const piece = extractEventText(event); const plots = extractChatPlots(event).filter((plot) => plot.pngBase64.length > 32);
        setMessages((current) => current.map((message) => {
          if (message.id !== assistantId) return message;
          const previous = message.text;
          const merged = !piece || previous.endsWith(piece) || previous.startsWith(piece) ? previous : piece.startsWith(previous) ? piece : previous + piece;
          return { ...message, text: merged, plots: [...(message.plots ?? []), ...plots.filter((plot) => !message.plots?.some((old) => old.id === plot.id))] };
        }));
      } });
    } catch (reason) {
      if (!ac.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Could not reach the agent. Check AI & Agents in Settings.");
        if (started) { setDraft(text); setAttachments(files); }
      }
    } finally {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, pending: false, text: message.text || (ac.signal.aborted ? "Response stopped." : "No response received.") } : message));
      controller.current = null; setBusy(false);
    }
  }
  function newChat() { if (busy || reading) return; speech.current?.stop(); setMessages([]); session.current = null; setCanvasId(null); setError(""); setDraft(""); setAttachments([]); input.current?.focus(); }
  function download() {
    if (!canvas) return;
    const url = URL.createObjectURL(new Blob([canvas.text], { type: "text/markdown" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "adelpha-design-notes.md"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy(message: Message) { try { await navigator.clipboard.writeText(message.text); setCopied(message.id); } catch { setError("Could not copy. Select the response text to copy it manually."); } }
  return <section className={`studio-agent${canvas ? " has-canvas" : ""}`} aria-label="Designer and developer agent">
    <div className={`sa-chat${messages.length ? "" : " is-empty"}`}>
      {messages.length > 0 && <div className="sa-chat-title"><span>{messages.find((message) => message.role === "user")?.text.split("\n")[0]}</span><button type="button" aria-label="New chat" title="New chat" disabled={busy || reading} onClick={newChat}><Plus size={18} /></button></div>}
      {messages.length === 0 ? <div className="sa-welcome"><svg width={46} height={46} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <g transform="translate(24 0) scale(-1 1)"><Wrench width={24} height={24} strokeWidth={1.3} /></g>
          <Wrench width={24} height={24} stroke="var(--sa-icon-background, #08080a)" strokeWidth={3.6} />
          <Wrench width={24} height={24} strokeWidth={1.3} />
        </svg><h1>What would you like to build?</h1><p>Design, develop, and refine with Adelpha.</p></div> : <div className="sa-transcript" role="log" aria-label="Conversation" aria-live="polite">
        {messages.map((message) => <article key={message.id} className={`sa-message is-${message.role}`} aria-label={message.role === "user" ? "You" : "Adelpha"}>
          {message.role === "assistant" && <div className="sa-author"><Sparkles size={20} /><strong>Adelpha</strong>{message.pending && <span role="status">Working…</span>}</div>}
          <div className="sa-markdown"><ReactMarkdown>{message.text}</ReactMarkdown></div>
          {message.plots?.map((plot) => <img className="sa-plot" key={plot.id} src={`data:${plot.mimeType};base64,${plot.pngBase64}`} alt={plot.caption || "Generated plot"} />)}
          {message.role === "assistant" && !message.pending && !!message.text && <div className="sa-message-actions"><button type="button" className="sa-canvas-link" onClick={() => setCanvasId(message.id)}><FileText size={17} />Open in canvas<ArrowUpRight size={16} /></button><button type="button" aria-label={copied === message.id ? "Copied" : "Copy response"} onClick={() => void copy(message)}>{copied === message.id ? <Check size={16} /> : <Copy size={16} />}</button></div>}
        </article>)}<div ref={end} />
      </div>}
      <div className="sa-compose-wrap">
        {error && <div className="sa-error" role="alert"><span>{error}</span><button type="button" onClick={() => requestOpenSettings()}>Settings</button><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
        <form className="sa-compose-form" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          {!!attachments.length && <div className="sa-attachments">{attachments.map((file, index) => <span key={`${file.name}-${index}`}><FileText size={13} />{file.name}<button type="button" disabled={busy} aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}><X size={12} /></button></span>)}</div>}
          <div className="sa-composer sa-slim-composer">
            <div className="sa-more" ref={toolsMenu}><button type="button" ref={toolsButton} aria-label="Add context and tools" aria-expanded={toolsOpen} onClick={() => { setToolsOpen(!toolsOpen); setModelOpen(false); }}><Plus size={23} /></button>
              {toolsOpen && <div className="sa-tools-menu"><strong>Context & tools</strong><input hidden type="file" multiple ref={fileInput} accept=".txt,.md,.json,.csv,.py,.ts,.tsx,.js,.yaml,.yml,image/png,image/jpeg,image/webp" onChange={(event) => void attach(event)} /><div className="sa-context-tools"><button type="button" title="Attach text, code, or images (up to 5 MB each)" aria-label="Attach files" disabled={busy || reading} onClick={() => fileInput.current?.click()}><Paperclip size={18} /></button><span className="sa-tool-divider" aria-hidden="true" /><label className="sa-project-picker" title="Attach project summary"><FolderOpen size={18} aria-hidden="true" /><select aria-label="Add project context" disabled={busy || reading} value="" onChange={(event) => {
              const project = projects.find((item) => item.id === event.target.value);
              if (!project) return;
              if (attachments.length >= 4) { setError("Attach up to four files at a time."); return; }
              const name = `${project.name} — project summary`;
              if (attachments.some((item) => item.name === name)) return;
              setAttachments((current) => [...current, { name, text: JSON.stringify({ name: project.name, application: project.application, discipline: project.discipline, workspace: project.lastView, summary: project.summary, parts: project.parts }, null, 2) }]);
            }}><option value="">Add project context</option>{projects.length ? projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>) : <option disabled>No saved projects</option>}</select></label></div>
            <div className="sa-mode-picker"><select aria-label="Agent mode" value={mode} disabled={busy} onChange={(event) => setMode(event.target.value)}><option>Designer / Developer</option><option>Design</option><option>Develop</option><option>Review</option></select><ChevronDown size={14} aria-hidden="true" /></div>
<button type="button" onClick={() => { setToolsOpen(false); requestOpenSettings(); }}><Settings2 size={16} />Agent settings</button></div>}
            </div>
          <textarea ref={input} aria-label="Message the agent" title="Enter to send · Shift + Enter for a new line" rows={1} placeholder="Ask Adelpha" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
            <div className="sa-model" ref={menu}><button type="button" ref={modelButton} aria-label="Choose model" aria-expanded={modelOpen} disabled={busy} onClick={() => { setModelOpen(!modelOpen); setToolsOpen(false); setSearch(""); }}><span>{model === "auto" ? "Auto" : models.find((item) => item.id === model)?.label ?? model}</span><ChevronDown size={14} /></button>
              {modelOpen && <div className="sa-model-menu"><strong>Choose a model</strong><label><Search size={15} /><input autoFocus aria-label="Search models" placeholder="Search models…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="sa-model-options">{[{ id: "auto", label: "Auto" }, ...models].filter((item) => `${item.label} ${item.id}`.toLowerCase().includes(search.toLowerCase())).map((item) => <button type="button" key={item.id} aria-pressed={model === item.id} onClick={() => { setModel(item.id); setModelOpen(false); modelButton.current?.focus(); }}><span>{item.label}<small>{item.id === "auto" ? "Use the configured default" : item.id}</small></span>{model === item.id && <Check size={15} />}</button>)}</div><button type="button" onClick={() => { setModelOpen(false); requestOpenSettings(); }}><Settings2 size={16} />Manage models</button></div>}
            </div><button type="button" className="sa-mic" aria-label={listening ? "Stop dictation" : "Dictate message"} aria-pressed={listening} title="Dictate a message" disabled={busy || reading} onClick={toggleDictation}><Mic size={21} /></button>
            {busy ? <button type="button" className="sa-send" aria-label="Stop response" onClick={() => controller.current?.abort()}><Square size={17} /><span>Stop</span></button> : draft.trim() || attachments.length ? <button type="submit" className="sa-send" aria-label="Send message" disabled={reading || (!draft.trim() && !attachments.length)}><ArrowUp size={21} /></button> : <button type="button" className="sa-send sa-voice" aria-label={listening ? "Stop voice input" : "Start voice input"} title="Voice input · dictate a message" disabled={reading} onClick={toggleDictation}><AudioLines size={22} /></button>}
          </div>
        </form><p className="sa-keyboard">{reading ? "Reading attachments…" : listening ? "Listening… Speak to draft your message." : ""}</p>
      </div>
      {!messages.length && <div className="sa-starters">{starters.map(({ title, detail, prompt, Icon }) => <button type="button" key={title} onClick={() => { setDraft(prompt); input.current?.focus(); }}><Icon size={20} /><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight size={15} /></button>)}</div>}
    </div>
    {canvas && <aside className="sa-canvas" aria-label="Design canvas"><header><FileText size={19} /><strong>Design notes</strong><span>Preview</span><button type="button" aria-label="Download canvas" onClick={download}><Download size={18} /></button><button type="button" aria-label="Close canvas" onClick={() => setCanvasId(null)}><X size={19} /></button></header><div className="sa-canvas-content sa-markdown"><ReactMarkdown>{canvas.text}</ReactMarkdown>{canvas.plots?.map((plot) => <figure key={plot.id}><img className="sa-plot" src={`data:${plot.mimeType};base64,${plot.pngBase64}`} alt={plot.caption || "Generated plot"} /><figcaption>{plot.caption}</figcaption></figure>)}</div></aside>}
  </section>;
}
