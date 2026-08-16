/** Google ADK API server client (make agents-api → :8001 by default). */

export function adkBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_ADK_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "/api/agents";
}

export function adkAppName(): string {
  return import.meta.env.VITE_ADK_APP_NAME?.trim() || "dtam";
}

export function adkUserId(): string {
  return import.meta.env.VITE_ADK_USER_ID?.trim() || "gui-user";
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { detail?: unknown; errorMessage?: string };
    if (typeof json.errorMessage === "string") return json.errorMessage;
    if (typeof json.detail === "string") return json.detail;
    if (json.detail != null) return JSON.stringify(json.detail);
  } catch {
    /* plain */
  }
  return text || `${res.status} ${res.statusText}`;
}

export async function listAdkApps(): Promise<string[]> {
  const res = await fetch(`${adkBaseUrl()}/list-apps`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data.map(String);
}

export type AdkSession = {
  id: string;
  appName?: string;
  userId?: string;
};

/** Create a session; server assigns `id`. */
export async function createAdkSession(
  appName = adkAppName(),
  userId = adkUserId(),
): Promise<AdkSession> {
  const res = await fetch(
    `${adkBaseUrl()}/apps/${encodeURIComponent(appName)}/users/${encodeURIComponent(userId)}/sessions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as AdkSession;
  if (!data?.id) throw new Error("ADK session response missing id");
  return data;
}

export type AdkContentPart = {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: { name?: string; response?: unknown };
};

export type AdkEvent = {
  author?: string;
  content?: {
    role?: string;
    parts?: AdkContentPart[];
  };
  partial?: boolean;
  id?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type RunHandlers = {
  onEvent: (event: AdkEvent) => void;
  signal?: AbortSignal;
};

export type AdkInlineImage = {
  displayName: string;
  mimeType: string;
  /** Raw base64 without data: URL prefix */
  data: string;
};

export type AdkModelOption = {
  id: string;
  label: string;
};

const DEFAULT_MODELS: AdkModelOption[] = [
  { id: "gemini-2.5-flash", label: "2.5 Flash" },
  { id: "gemini-2.5-pro", label: "2.5 Pro" },
  { id: "gemini-2.0-flash", label: "2.0 Flash" },
];

/** Models offered in the composer dropdown (override with VITE_ADK_MODELS=id:Label,...). */
export function adkModelOptions(): AdkModelOption[] {
  const raw = import.meta.env.VITE_ADK_MODELS?.trim();
  if (!raw) return DEFAULT_MODELS;
  return raw.split(",").map((entry) => {
    const [id, label] = entry.split(":").map((s) => s.trim());
    return { id, label: label || id };
  }).filter((m) => m.id);
}

export function defaultAdkModelId(options = adkModelOptions()): string {
  const fromEnv = import.meta.env.VITE_ADK_MODEL?.trim();
  if (fromEnv && options.some((m) => m.id === fromEnv)) return fromEnv;
  return options[0]?.id ?? "gemini-2.5-flash";
}

function runBody(params: {
  appName: string;
  userId: string;
  sessionId: string;
  message: string;
  streaming: boolean;
  images?: AdkInlineImage[];
  modelId?: string;
}) {
  const parts: Array<Record<string, unknown>> = [];
  if (params.message.trim()) {
    parts.push({ text: params.message });
  }
  for (const img of params.images ?? []) {
    parts.push({
      inlineData: {
        displayName: img.displayName,
        mimeType: img.mimeType,
        data: img.data,
      },
    });
  }
  if (!parts.length) {
    parts.push({ text: "" });
  }

  const body: Record<string, unknown> = {
    appName: params.appName,
    userId: params.userId,
    sessionId: params.sessionId,
    streaming: params.streaming,
    newMessage: {
      role: "user",
      parts,
    },
  };
  if (params.modelId) {
    body.customMetadata = { preferredModel: params.modelId };
  }
  return body;
}

export type RunRequest = {
  appName: string;
  userId: string;
  sessionId: string;
  message: string;
  images?: AdkInlineImage[];
  modelId?: string;
  streaming?: boolean;
};

export async function runAdkSse(body: RunRequest, handlers: RunHandlers): Promise<void> {
  const res = await fetch(`${adkBaseUrl()}/run_sse`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(
      runBody({
        ...body,
        streaming: body.streaming ?? true,
      }),
    ),
    signal: handlers.signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  if (!res.body) throw new Error("No response body from /run_sse");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLines = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.replace(/^data:\s?/, ""));
      if (!dataLines.length) continue;
      const payload = dataLines.join("\n").trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as AdkEvent;
        if (event.errorMessage) {
          throw new Error(event.errorMessage);
        }
        handlers.onEvent(event);
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }
}

/** Non-streaming run — returns event list. */
export async function runAdk(body: RunRequest, signal?: AbortSignal): Promise<AdkEvent[]> {
  const res = await fetch(`${adkBaseUrl()}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(runBody({ ...body, streaming: false })),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) return data as AdkEvent[];
  if (data && typeof data === "object" && Array.isArray((data as { events?: unknown }).events)) {
    return (data as { events: AdkEvent[] }).events;
  }
  return [];
}

/** Prefer SSE; fall back to `/run` if SSE fails. */
export async function runAdkWithFallback(
  body: RunRequest,
  handlers: RunHandlers,
): Promise<"sse" | "run"> {
  try {
    await runAdkSse({ ...body, streaming: true }, handlers);
    return "sse";
  } catch (sseErr) {
    if (handlers.signal?.aborted) throw sseErr;
    const events = await runAdk(body, handlers.signal);
    for (const event of events) {
      if (event.errorMessage) throw new Error(event.errorMessage);
      handlers.onEvent(event);
    }
    return "run";
  }
}

export function extractEventText(event: AdkEvent): string {
  const parts = event.content?.parts ?? [];
  return parts
    .map((p) => p.text)
    .filter((t): t is string => Boolean(t && t.length))
    .join("");
}

export function extractToolHints(event: AdkEvent): string[] {
  const hints: string[] = [];
  for (const part of event.content?.parts ?? []) {
    if (part.functionCall?.name) {
      hints.push(`tool → ${part.functionCall.name}`);
    }
    if (part.functionResponse?.name) {
      hints.push(`tool ← ${part.functionResponse.name}`);
    }
  }
  return hints;
}

/** Forecast / advisory plot attached to a chat turn (from tool functionResponse). */
export type AdkChatPlot = {
  id: string;
  toolName: string;
  mimeType: string;
  /** Raw base64 without data: URL prefix */
  pngBase64: string;
  caption?: string;
  artifactName?: string;
  artifactVersion?: string | number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function stripDataUrlBase64(raw: string): string {
  const comma = raw.indexOf(",");
  if (raw.startsWith("data:") && comma >= 0) return raw.slice(comma + 1);
  return raw;
}

/** Pull plot_png_base64 (and caption) from a tool functionResponse payload. */
export function extractChatPlots(event: AdkEvent): AdkChatPlot[] {
  const plots: AdkChatPlot[] = [];
  const parts = event.content?.parts ?? [];

  for (let i = 0; i < parts.length; i++) {
    const fr = parts[i]?.functionResponse;
    if (!fr?.name) continue;
    const root = asRecord(fr.response);
    if (!root) continue;

    // Common wrappers: response itself, response.data, response.result, response.output
    const candidates: Record<string, unknown>[] = [root];
    for (const nest of ["data", "result", "output", "plot"]) {
      const inner = asRecord(root[nest]);
      if (inner) candidates.push(inner);
    }

    for (const obj of candidates) {
      const b64 = pickString(obj, [
        "plot_png_base64",
        "png_base64",
        "image_base64",
        "plotBase64",
      ]);
      const mime =
        pickString(obj, ["mime_type", "mimeType"]) || "image/png";
      const caption = pickString(obj, ["caption", "title", "alt"]);
      const artifactName = pickString(obj, ["artifact_name", "artifactName"]);
      const verRaw = obj.artifact_version ?? obj.artifactVersion;
      const artifactVersion =
        typeof verRaw === "string" || typeof verRaw === "number" ? verRaw : undefined;

      if (!b64 && !(artifactName && artifactVersion != null)) continue;

      plots.push({
        id: `${event.id ?? "evt"}-${fr.name}-${i}-${plots.length}`,
        toolName: fr.name,
        mimeType: mime,
        pngBase64: b64 ? stripDataUrlBase64(b64) : "",
        caption,
        artifactName,
        artifactVersion,
      });
      break; // one plot per functionResponse part
    }
  }

  return plots;
}

/** Optional ADK artifact download when tool only returns artifact refs. */
export async function fetchAdkArtifact(params: {
  appName: string;
  userId: string;
  sessionId: string;
  artifactName: string;
  versionId: string | number;
  signal?: AbortSignal;
}): Promise<{ mimeType: string; dataBase64: string } | null> {
  const url =
    `${adkBaseUrl()}/apps/${encodeURIComponent(params.appName)}` +
    `/users/${encodeURIComponent(params.userId)}` +
    `/sessions/${encodeURIComponent(params.sessionId)}` +
    `/artifacts/${encodeURIComponent(params.artifactName)}` +
    `/versions/${encodeURIComponent(String(params.versionId))}`;

  const res = await fetch(url, { cache: "no-store", signal: params.signal });
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = (await res.json()) as Record<string, unknown>;
    const data =
      pickString(json, ["plot_png_base64", "png_base64", "data", "inlineData"]) ||
      pickString(asRecord(json.data) ?? {}, ["plot_png_base64", "png_base64", "data"]);
    if (!data) return null;
    return {
      mimeType: pickString(json, ["mime_type", "mimeType"]) || "image/png",
      dataBase64: stripDataUrlBase64(data),
    };
  }

  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return {
    mimeType: contentType.split(";")[0]?.trim() || "image/png",
    dataBase64: btoa(binary),
  };
}

export function preferAppName(apps: string[], preferred = adkAppName()): string | null {
  if (!apps.length) return null;
  const hit = apps.find((a) => a === preferred || a.toLowerCase() === preferred.toLowerCase());
  if (hit) return hit;
  for (const name of ["dtam", "dtam_supervisor", "root"]) {
    const alt = apps.find((a) => a === name || a.toLowerCase() === name);
    if (alt) return alt;
  }
  return apps[0] ?? null;
}
