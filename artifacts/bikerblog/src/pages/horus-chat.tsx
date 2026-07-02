import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Flame, Send, Lock, Wrench, User, RotateCcw, Cpu, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const SESSION_KEY = "horus-chat-password";

type Role = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  toolCalls?: string[];
}

type ConvoAgent = "horus" | "bowie";

interface ConvoMessage {
  id: string;
  agent: ConvoAgent;
  content: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type Mode = "chat" | "conversation";

export function HorusChat() {
  const [password, setPassword] = useState<string | null>(() =>
    sessionStorage.getItem(SESSION_KEY)
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("chat");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [convoMessages, setConvoMessages] = useState<ConvoMessage[]>([]);
  const [convoActiveAgent, setConvoActiveAgent] = useState<ConvoAgent | null>(null);
  const [isConvoRunning, setIsConvoRunning] = useState(false);
  const [convoError, setConvoError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convoScrollRef = useRef<HTMLDivElement>(null);
  const convoAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    convoScrollRef.current?.scrollTo({ top: convoScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [convoMessages, convoActiveAgent]);

  function handleUnlock(e: FormEvent) {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    sessionStorage.setItem(SESSION_KEY, passwordInput);
    setPassword(passwordInput);
    setAuthError(null);
  }

  function handleReset() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setError(null);
    setIsStreaming(false);
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
      const res = await fetch(`${base}api/horus/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Horus-Password": password,
        },
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setPassword(null);
        setAuthError("Password errata. Riprova.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`Richiesta fallita (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      const activeTools: string[] = [];

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
            activeTools.push(payload.name);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, toolCalls: [...activeTools] } : m
              )
            );
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
      setError(err instanceof Error ? err.message : "Errore di connessione con Horus.");
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

  function stopConversation() {
    convoAbortRef.current?.abort();
  }

  function resetConversation() {
    convoAbortRef.current?.abort();
    setConvoMessages([]);
    setConvoActiveAgent(null);
    setConvoError(null);
    setIsConvoRunning(false);
  }

  async function startConversation(e?: FormEvent) {
    e?.preventDefault();
    const text = topic.trim();
    if (!text || isConvoRunning || !password) return;

    setConvoError(null);
    setConvoMessages([]);
    setIsConvoRunning(true);

    const controller = new AbortController();
    convoAbortRef.current = controller;

    let currentId: string | null = null;

    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}api/horus/bowie-conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Horus-Password": password,
        },
        body: JSON.stringify({ topic: text }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setPassword(null);
        setAuthError("Password errata. Riprova.");
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`Richiesta fallita (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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

          const agent = payload.agent === "bowie" ? "bowie" : payload.agent === "horus" ? "horus" : null;

          if (eventName === "turn_start" && agent) {
            setConvoActiveAgent(agent);
            currentId = uid();
            const id = currentId;
            setConvoMessages((prev) => [...prev, { id, agent, content: "" }]);
          } else if (eventName === "token" && agent && typeof payload.token === "string") {
            const id = currentId;
            setConvoMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, content: m.content + payload.token } : m))
            );
          } else if (eventName === "turn_end" && agent && typeof payload.content === "string") {
            const id = currentId;
            const finalContent = payload.content;
            setConvoMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, content: finalContent } : m))
            );
            setConvoActiveAgent(null);
          } else if (eventName === "error" && typeof payload.message === "string") {
            setConvoError(payload.message);
          } else if (eventName === "done") {
            setConvoActiveAgent(null);
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // interruzione manuale, non è un errore da mostrare
      } else {
        setConvoError(err instanceof Error ? err.message : "Errore di connessione con Horus/Bowie.");
      }
    } finally {
      setIsConvoRunning(false);
      setConvoActiveAgent(null);
      convoAbortRef.current = null;
    }
  }

  if (!password) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <form
          onSubmit={handleUnlock}
          className="w-full max-w-sm border border-border bg-muted/10 p-8 flex flex-col items-center gap-6"
        >
          <div className="flex items-center gap-3">
            <Flame className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-display font-bold uppercase tracking-tight">Horus</h1>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Questa chat è protetta. Inserisci la password per continuare.
          </p>
          <div className="w-full flex items-center gap-2 border border-border px-3 py-2">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              className="border-0 shadow-none focus-visible:ring-0 px-0 h-auto"
              autoFocus
            />
          </div>
          {authError && <p className="text-sm text-destructive">{authError}</p>}
          <Button type="submit" className="w-full uppercase tracking-wider font-bold">
            Entra
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 flex flex-col h-[calc(100vh-6rem)] max-w-3xl">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Flame className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-display font-bold uppercase tracking-tight leading-none">
              Horus
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "chat" ? "bikerlink:latest" : "Conversazione con Bowie"}
            </p>
          </div>
        </div>
        {mode === "chat" ? (
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Nuova chat
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={resetConversation} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Nuova conversazione
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-4 shrink-0">
        <Button
          type="button"
          variant={mode === "chat" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("chat")}
          className="gap-2"
        >
          <Flame className="w-4 h-4" />
          Chat con Horus
        </Button>
        <Button
          type="button"
          variant={mode === "conversation" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("conversation")}
          className="gap-2"
        >
          <Cpu className="w-4 h-4" />
          Horus ↔ Bowie
        </Button>
      </div>

      {mode === "chat" ? (
        <>
          <div ref={scrollRef} className="flex-1 border border-border bg-muted/5 mb-4 overflow-y-auto">
            <div className="p-6 space-y-6">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-16">
                  Scrivi un messaggio per iniziare a chattare con Horus.
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback
                      className={
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-foreground text-background"
                      }
                    >
                      {m.role === "user" ? <User className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
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
                          <Badge key={`${tool}-${i}`} variant="outline" className="gap-1 text-xs font-normal">
                            <Wrench className="w-3 h-3" />
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div
                      className={`px-4 py-3 whitespace-pre-wrap text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border border-border"
                      }`}
                    >
                      {m.content || (m.role === "assistant" && isStreaming ? (
                        <Spinner className="w-4 h-4" />
                      ) : null)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive mb-3 px-1">{error}</div>
          )}

          <form onSubmit={sendMessage} className="flex items-end gap-2 shrink-0">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi a Horus... (Invio per inviare, Shift+Invio per andare a capo)"
              className="min-h-[3rem] max-h-40 resize-none"
              disabled={isStreaming}
            />
            <Button type="submit" size="icon" disabled={isStreaming || !input.trim()} className="shrink-0">
              {isStreaming ? <Spinner className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </>
      ) : (
        <>
          <div ref={convoScrollRef} className="flex-1 border border-border bg-muted/5 mb-4 overflow-y-auto">
            <div className="p-6 space-y-6">
              {convoMessages.length === 0 && !isConvoRunning && (
                <div className="text-center text-muted-foreground text-sm py-16">
                  Proponi un argomento e guarda Horus e Bowie discuterne a turni.
                </div>
              )}
              {convoMessages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${m.agent === "bowie" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback
                      className={
                        m.agent === "bowie"
                          ? "bg-accent text-accent-foreground"
                          : "bg-foreground text-background"
                      }
                    >
                      {m.agent === "bowie" ? <Cpu className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`max-w-[80%] flex flex-col gap-1 ${
                      m.agent === "bowie" ? "items-end" : "items-start"
                    }`}
                  >
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                      {m.agent === "bowie" ? "Bowie" : "Horus"}
                    </span>
                    <div
                      className={`px-4 py-3 whitespace-pre-wrap text-sm leading-relaxed ${
                        m.agent === "bowie"
                          ? "bg-accent/20 border border-accent/40"
                          : "bg-background border border-border"
                      }`}
                    >
                      {m.content || <Spinner className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
              ))}
              {isConvoRunning && !convoActiveAgent && convoMessages.length === 0 && (
                <div className="flex justify-center py-8">
                  <Spinner className="w-5 h-5" />
                </div>
              )}
            </div>
          </div>

          {convoError && (
            <div className="text-sm text-destructive mb-3 px-1">{convoError}</div>
          )}

          <form onSubmit={startConversation} className="flex items-end gap-2 shrink-0">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Argomento della discussione tra Horus e Bowie..."
              disabled={isConvoRunning}
              className="flex-1"
            />
            {isConvoRunning ? (
              <Button type="button" variant="destructive" size="icon" onClick={stopConversation} className="shrink-0">
                <Square className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!topic.trim()} className="shrink-0">
                <Play className="w-4 h-4" />
              </Button>
            )}
          </form>
        </>
      )}
    </div>
  );
}
