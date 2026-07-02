import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Send, Wrench, User, Square, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

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

type HealthStatus = "checking" | "ok" | "unreachable";

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
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthStatus>("checking");
  const [unreachableMessage, setUnreachableMessage] = useState<string | null>(null);
  const [healthRetryKey, setHealthRetryKey] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Controllo di raggiungibilità eseguito subito all'apertura della chat,
  // prima che l'utente scriva un messaggio: senza questo, un tunnel o Ollama
  // giù sul server dell'utente si scoprivano solo dopo l'invio del primo
  // messaggio, con un pannello che nel frattempo sembrava pronto all'uso.
  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      setHealth("checking");
      setNotConfigured(null);
      setUnreachableMessage(null);
      try {
        const base = import.meta.env.BASE_URL;
        const res = await fetch(`${base}${healthEndpoint}`, {
          headers: { "X-Horus-Password": password },
        });
        if (cancelled) return;

        if (res.status === 401) {
          onUnauthorized();
          return;
        }

        if (!res.ok) {
          setUnreachableMessage("Impossibile verificare lo stato della connessione. Riprova tra poco.");
          setHealth("unreachable");
          return;
        }

        const data = (await res.json()) as {
          status?: "ok" | "not_configured" | "unreachable";
          message?: string;
        };

        if (data.status === "not_configured") {
          setNotConfigured(data.message ?? "Questo agente non è configurato su questo ambiente.");
          setHealth("ok");
        } else if (data.status === "unreachable") {
          setUnreachableMessage(data.message ?? "L'agente non è raggiungibile in questo momento.");
          setHealth("unreachable");
        } else {
          setHealth("ok");
        }
      } catch {
        if (!cancelled) {
          setUnreachableMessage("Impossibile verificare la connessione. Controlla la rete e riprova.");
          setHealth("unreachable");
        }
      }
    }

    void checkHealth();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthEndpoint, password, healthRetryKey]);

  function stopMessage() {
    abortRef.current?.abort();
  }

  async function sendMessage(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || !password) return;

    setError(null);
    setInput("");

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    const assistantId = uid();
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
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
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        onUnauthorized();
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
        return;
      }

      if (res.status === 503) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
        setNotConfigured(data.message ?? "Questo agente non è configurato su questo ambiente.");
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`Richiesta fallita (HTTP ${res.status})`);
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
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Errore di connessione.");
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

  if (health === "checking") {
    return (
      <div className="flex-1 border border-border bg-muted/5 mb-4 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="w-4 h-4" />
          Verifica della connessione in corso…
        </div>
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className="flex-1 border border-border bg-muted/5 mb-4 flex items-center justify-center">
        <p className="text-sm text-muted-foreground text-center max-w-sm px-6">{notConfigured}</p>
      </div>
    );
  }

  if (health === "unreachable") {
    return (
      <div className="flex-1 border border-border bg-muted/5 mb-4 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground text-center max-w-sm px-6">
          {unreachableMessage ?? "L'agente non è raggiungibile in questo momento."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setHealthRetryKey((k) => k + 1)}
        >
          <RotateCcw className="w-4 h-4" />
          Riprova
        </Button>
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
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="text-sm text-destructive mb-3 px-1">{error}</div>}

      <form onSubmit={sendMessage} className="flex items-end gap-2 shrink-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          className="min-h-[3rem] max-h-40 resize-none"
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
          <Button type="submit" size="icon" disabled={!input.trim()} className="shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        )}
      </form>
    </>
  );
}
