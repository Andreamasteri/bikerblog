import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Send, Wrench, User, Square, Paperclip, X, Download, RotateCcw, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { friendlyChatErrorMessage } from "@/lib/friendly-error";
import { useAgentHealth } from "@/hooks/use-agent-health";
import { AgentHealthGate } from "@/hooks/agent-health-status";

type Role = "user" | "assistant";

interface ToolCallStatus {
  name: string;
  elapsedMs: number;
  done: boolean;
}

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  toolCalls?: ToolCallStatus[];
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Nessun modello qui è multimodale: possono solo "leggere" testo. Un file
// viene quindi trattato come testo (e il suo contenuto incluso nel messaggio)
// solo se il tipo/estensione lo rende ragionevolmente sicuro come testo —
// altrimenti si allega solo nome/tipo/dimensione, così l'AI sa che è stato
// inviato un file senza fingere di poterne leggere il contenuto binario.
const TEXTY_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log",
  "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "cs", "go", "rs",
  "rb", "php", "sh", "bash", "sql", "html", "htm", "css", "ini", "conf", "env",
  "toml",
]);

function isLikelyTextFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (
    ["application/json", "application/xml", "application/javascript", "application/x-yaml"].includes(
      file.type
    )
  ) {
    return true;
  }
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && TEXTY_EXTENSIONS.has(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB, solo per l'upload dal browser
const MAX_ATTACHMENT_TEXT_CHARS = 6000; // tenuto ben sotto il limite di 1MB del body JSON

interface ChatAttachment {
  name: string;
  type: string;
  size: number;
  text: string | null;
  truncated: boolean;
}

function buildOutgoingContent(text: string, attachment: ChatAttachment | null): string {
  if (!attachment) return text;
  const sizeLabel = formatFileSize(attachment.size);
  const header =
    attachment.text !== null
      ? `[File allegato: ${attachment.name} — ${attachment.type || "tipo sconosciuto"}, ${sizeLabel}]\n"""\n${attachment.text}${
          attachment.truncated ? "\n…(contenuto troncato)" : ""
        }\n"""`
      : `[File allegato: ${attachment.name} — ${attachment.type || "tipo sconosciuto"}, ${sizeLabel}. Non è un file di testo: il contenuto binario non può essere letto, solo nome/tipo/dimensione sono noti.]`;
  return text ? `${header}\n\n${text}` : header;
}

function downloadAsFile(content: string, filenamePrefix: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

type ChatMode = "default" | "architect";

export interface AgentChatPanelProps {
  /** Endpoint relativo alla base dell'app (es. "api/horus/chat" o "api/horus/bowie-chat"). */
  endpoint: string;
  /** Endpoint del controllo di raggiungibilità (es. "api/horus/health" o "api/horus/bowie-health"). */
  healthEndpoint: string;
  password: string;
  onUnauthorized: () => void;
  agentIcon: ReactNode;
  agentAvatarClassName: string;
  emptyStateText: string;
  placeholderText: string;
  /** Nome dell'agente (es. "horus"), usato solo per il nome del file scaricato. */
  agentName: string;
  /**
   * Se true, mostra un selettore "Default / Architect" sopra l'input.
   * Cambiare modalità azzera la cronologia (prompt di sistema diverso).
   * Solo Horus supporta la modalità architect — non passare questo prop a
   * Bowie/Quebracho.
   */
  showModeSelector?: boolean;
}

/**
 * Pannello di chat diretta riutilizzabile per un singolo agente (Horus o
 * Bowie): invio messaggio, streaming SSE token-per-token, badge dei tool in
 * corso/completati, pulsante Stop per interrompere a metà risposta. Stessa
 * UX per entrambi gli agenti — solo endpoint, icona e testi cambiano.
 */
export function AgentChatPanel({
  endpoint,
  healthEndpoint,
  password,
  onUnauthorized,
  agentIcon,
  agentAvatarClassName,
  emptyStateText,
  placeholderText,
  agentName,
  showModeSelector = false,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("default");
  // Task #185: la connessione fetch/SSE su mobile può cadere mentre il server
  // sta ancora generando (Chrome sospende la rete a schermo bloccato/tab in
  // background). In quel caso il server completa comunque la risposta e la
  // mette in cache: un "Riprova" a un click rimanda la STESSA richiesta e il
  // server restituisce all'istante la risposta già generata, invece di lasciare
  // l'utente con un errore secco su una risposta che di fatto esisteva.
  const [canRetry, setCanRetry] = useState(false);
  const lastRequestRef = useRef<{
    outgoing: string;
    history: { role: Role; content: string }[];
  } | null>(null);

  const { health, notConfigured: healthNotConfigured, unreachableMessage, retry: retryHealth } =
    useAgentHealth(healthEndpoint, password, onUnauthorized);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setNotConfigured(healthNotConfigured);
  }, [healthNotConfigured]);

  // Cambiare modalità (default ↔ architect) azzera la cronologia: il prompt
  // di sistema cambia e tenere la history precedente confonde il modello.
  useEffect(() => {
    if (!showModeSelector) return;
    setMessages([]);
    setError(null);
    setCanRetry(false);
    setAttachment(null);
    abortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMode]);

  function stopMessage() {
    abortRef.current?.abort();
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAttachmentError(null);

    if (file.size > MAX_ATTACHMENT_SIZE) {
      setAttachmentError(`File troppo grande (max ${formatFileSize(MAX_ATTACHMENT_SIZE)}).`);
      return;
    }

    if (isLikelyTextFile(file)) {
      const raw = await file.text();
      const truncated = raw.length > MAX_ATTACHMENT_TEXT_CHARS;
      setAttachment({
        name: file.name,
        type: file.type,
        size: file.size,
        text: truncated ? raw.slice(0, MAX_ATTACHMENT_TEXT_CHARS) : raw,
        truncated,
      });
    } else {
      setAttachment({ name: file.name, type: file.type, size: file.size, text: null, truncated: false });
    }
  }

  function removeAttachment() {
    setAttachment(null);
    setAttachmentError(null);
  }

  async function sendMessage(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && !attachment) || isStreaming || !password) return;

    setInput("");
    const outgoingAttachment = attachment;
    setAttachment(null);

    const outgoing = buildOutgoingContent(text, outgoingAttachment);
    // Cronologia PRIMA di aggiungere il nuovo messaggio utente: è esattamente
    // quella che il server usa come chiave di cache, così un eventuale retry
    // (stesso `outgoing` + stessa `history`) trova la risposta già generata.
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { id: uid(), role: "user", content: outgoing }]);
    await runSend(outgoing, history);
  }

  // Task #185: rimanda l'ultima richiesta identica (stesso messaggio + stessa
  // cronologia) dopo un drop di connessione. Il messaggio utente è già in
  // lista, quindi ri-eseguiamo solo lo streaming: se il server aveva già
  // generato la risposta la restituisce dalla cache all'istante.
  async function retryLastMessage() {
    const last = lastRequestRef.current;
    if (!last || isStreaming || !password) return;
    await runSend(last.outgoing, last.history);
  }

  async function runSend(outgoing: string, history: { role: Role; content: string }[]) {
    if (!password) return;

    setError(null);
    setCanRetry(false);
    lastRequestRef.current = { outgoing, history };

    const assistantId = uid();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Horus-Password": password,
        },
        body: JSON.stringify({ message: outgoing, history, ...(showModeSelector ? { mode: chatMode } : {}) }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        onUnauthorized();
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      if (res.status === 503) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setNotConfigured(data.message ?? "Questo agente non è configurato su questo ambiente.");
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      const activeTools: ToolCallStatus[] = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx: number;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);

          const lines = rawEvent.split("\n");
          let eventName = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
          }
          if (!dataLine) continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(dataLine);
          } catch {
            continue;
          }

          if (eventName === "token" && typeof payload.token === "string") {
            content += payload.token;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content } : m))
            );
          } else if (eventName === "tool_call" && typeof payload.name === "string") {
            activeTools.push({ name: payload.name, elapsedMs: 0, done: false });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, toolCalls: [...activeTools] } : m
              )
            );
          } else if (
            eventName === "tool_progress" &&
            typeof payload.name === "string" &&
            typeof payload.elapsedMs === "number"
          ) {
            const status = [...activeTools].reverse().find((t) => t.name === payload.name && !t.done);
            if (status) {
              status.elapsedMs = payload.elapsedMs;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, toolCalls: [...activeTools] } : m
                )
              );
            }
          } else if (
            eventName === "tool_result" &&
            typeof payload.name === "string"
          ) {
            const status = [...activeTools].reverse().find((t) => t.name === payload.name && !t.done);
            if (status) {
              status.done = true;
              if (typeof payload.elapsedMs === "number") status.elapsedMs = payload.elapsedMs;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, toolCalls: [...activeTools] } : m
                )
              );
            }
          } else if (eventName === "done" && typeof payload.content === "string") {
            content = payload.content;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content } : m))
            );
          } else if (eventName === "error" && typeof payload.message === "string") {
            setError(payload.message);
            // Task #188: il server segnala con `recoverable: true` i fallimenti
            // transitori (timeout del tunnel, sovraccarico, gateway timeout).
            // In quel caso offriamo lo stesso "Riprova" a un click già usato per
            // il drop lato client: la stessa richiesta può recuperare la
            // risposta dalla cache del server (Task #185) o rigenerarla in
            // fretta. NON lo offriamo quando `recoverable` è false (es. "nessuna
            // risposta, prova con un'altra domanda"): lì un retry identico è
            // inutile. 401/503 non passano nemmeno da qui (gestiti prima via
            // status HTTP).
            if (payload.recoverable === true) {
              setCanRetry(true);
            }
            // Se l'errore arriva prima di qualsiasi token (es. HTTP 524 del
            // tunnel sul prefill del 2° messaggio), rimuovi il bubble vuoto
            // dell'assistente: l'utente vede un errore chiaro e recuperabile
            // invece di una bolla vuota "in sospeso" (freeze silenzioso).
            if (!content) {
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(friendlyChatErrorMessage(err));
      // Task #185: drop di connessione (il "network error" classico). Il server
      // potrebbe aver completato la risposta e averla messa in cache, quindi
      // offriamo un "Riprova" che rimanda la stessa richiesta e la recupera
      // all'istante. (I fallimenti transitori segnalati dal server come evento
      // SSE `error` recuperabile abilitano lo stesso "Riprova" nel loop sopra —
      // Task #188.) Non offriamo il retry su abort/401/503: lì non c'è nulla di
      // già-generato da riusare.
      setCanRetry(true);
      // Connessione caduta prima di ricevere qualsiasi contenuto (il caso
      // classico del "network error"): togli il bubble vuoto dell'assistente
      // così resta solo il messaggio d'errore, non una bolla in sospeso.
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content.length > 0));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  if (health !== "ok") {
    return (
      <AgentHealthGate
        health={health}
        unreachableMessage={unreachableMessage}
        onRetry={retryHealth}
      />
    );
  }

  if (notConfigured) {
    return (
      <div className="flex-1 border border-border bg-muted/5 mb-4 flex items-center justify-center">
        <p className="text-sm text-muted-foreground text-center max-w-sm px-6">{notConfigured}</p>
      </div>
    );
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 border border-border bg-muted/5 mb-4 overflow-y-auto">
        <div className="p-6 space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-16">{emptyStateText}</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback
                  className={
                    m.role === "user" ? "bg-primary text-primary-foreground" : agentAvatarClassName
                  }
                >
                  {m.role === "user" ? <User className="w-4 h-4" /> : agentIcon}
                </AvatarFallback>
              </Avatar>
              <div
                className={`max-w-[80%] flex flex-col gap-2 ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.toolCalls.map((tool, i) => (
                      <Badge key={`${tool.name}-${i}`} variant="outline" className="gap-1.5 text-xs font-normal">
                        {tool.done ? <Wrench className="w-3 h-3" /> : <Spinner className="w-3 h-3" />}
                        {tool.name}
                        {!tool.done && (
                          <span className="text-muted-foreground">
                            {tool.elapsedMs >= 4_000
                              ? `· ancora al lavoro… ${Math.round(tool.elapsedMs / 1000)}s`
                              : "· in corso…"}
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
                <div
                  className={`px-4 py-3 whitespace-pre-wrap text-sm leading-relaxed ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border border-border"
                  }`}
                >
                  {m.content || (m.role === "assistant" && isStreaming ? <Spinner className="w-4 h-4" /> : null)}
                </div>
                {m.role === "assistant" && m.content && (
                  <button
                    type="button"
                    onClick={() => downloadAsFile(m.content, agentName)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    title="Scarica questa risposta come file di testo"
                  >
                    <Download className="w-3 h-3" />
                    Scarica come file
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive mb-3 px-1 flex items-center gap-3 flex-wrap">
          <span>{error}</span>
          {canRetry && !isStreaming && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={retryLastMessage}
              className="h-7 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Riprova
            </Button>
          )}
        </div>
      )}
      {attachmentError && <div className="text-sm text-destructive mb-3 px-1">{attachmentError}</div>}

      {attachment && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 border border-border bg-muted/10 text-xs">
          <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {attachment.name} · {formatFileSize(attachment.size)}
            {attachment.text === null && " · contenuto non leggibile dal modello"}
          </span>
          <button
            type="button"
            onClick={removeAttachment}
            className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
            title="Rimuovi allegato"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showModeSelector && (
        <div className="flex items-center gap-1.5 mb-3 shrink-0">
          <HardHat className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mr-1">Modalità:</span>
          {(["default", "architect"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={isStreaming}
              onClick={() => setChatMode(m)}
              className={`px-2.5 py-1 text-xs border transition-colors ${
                chatMode === m
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {m === "default" ? "Default" : "Architect"}
            </button>
          ))}
          {chatMode === "architect" && (
            <span className="text-xs text-muted-foreground ml-1 italic">
              · prompt di sistema orientato all'analisi e architettura del codice
            </span>
          )}
        </div>
      )}

      <form onSubmit={sendMessage} className="flex items-end gap-2 shrink-0">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          disabled={isStreaming}
          onClick={() => fileInputRef.current?.click()}
          title="Allega un file"
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          className="min-h-[5.5rem] max-h-60 resize-none"
          disabled={isStreaming}
        />
        {isStreaming ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={stopMessage}
            className="shrink-0"
            title="Interrompi la risposta in corso"
          >
            <Square className="w-4 h-4" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim() && !attachment} className="shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        )}
      </form>
    </>
  );
}
