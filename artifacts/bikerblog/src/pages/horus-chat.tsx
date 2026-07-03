import { useEffect, useRef, useState, type FormEvent } from "react";
import { Flame, Lock, RotateCcw, Cpu, Play, Square, History, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { AgentChatPanel } from "./agent-chat-panel";
import { friendlyChatErrorMessage } from "@/lib/friendly-error";
import { useAgentHealth } from "@/hooks/use-agent-health";
import { AgentHealthGate } from "@/hooks/agent-health-status";

const SESSION_KEY = "horus-chat-password";

type ConvoAgent = "horus" | "bowie";

interface ConvoMessage {
  id: string;
  agent: ConvoAgent;
  content: string;
}

interface ConvoTurn {
  agent: ConvoAgent;
  content: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type Mode = "chat" | "bowie-chat" | "conversation" | "history";

interface ConvoHistoryItem {
  id: number;
  topic: string;
  turnCount: number;
  createdAt: string;
}

interface ConvoHistoryDetail {
  id: number;
  topic: string;
  createdAt: string;
  transcript: { agent: ConvoAgent; content: string }[];
}

function formatConvoDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function HorusChat() {
  const [password, setPassword] = useState<string | null>(() =>
    sessionStorage.getItem(SESSION_KEY)
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("chat");

  const [horusChatKey, setHorusChatKey] = useState(0);
  const [bowieChatKey, setBowieChatKey] = useState(0);

  const [topic, setTopic] = useState("");
  const [convoMessages, setConvoMessages] = useState<ConvoMessage[]>([]);
  const [convoActiveAgent, setConvoActiveAgent] = useState<ConvoAgent | null>(null);
  const [isConvoRunning, setIsConvoRunning] = useState(false);
  const [convoError, setConvoError] = useState<{
    message: string;
    agent: ConvoAgent | null;
    prefixed: boolean;
  } | null>(null);

  // Trascrizione dei soli turni completati (turn_end ricevuto): è quella che
  // riproponiamo al server per riprendere la conversazione dopo un errore o
  // uno stallo a metà turno, senza perdere ciò che era già stato detto.
  const convoTranscriptRef = useRef<ConvoTurn[]>([]);
  const lastTopicRef = useRef("");
  // Rispecchia convoActiveAgent ma letto dentro il catch/finally di
  // runConversation, dove lo stato React catturato alla creazione della
  // closure sarebbe stantio (una caduta di rete silenziosa, es. tunnel
  // interrotto senza un evento "error" dal server, altrimenti risulterebbe
  // sempre attribuita ad agent: null).
  const convoActiveAgentRef = useRef<ConvoAgent | null>(null);

  const [historyItems, setHistoryItems] = useState<ConvoHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [viewingConvo, setViewingConvo] = useState<ConvoHistoryDetail | null>(null);
  const [isViewingLoading, setIsViewingLoading] = useState(false);

  const convoScrollRef = useRef<HTMLDivElement>(null);
  const convoAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    convoScrollRef.current?.scrollTo({ top: convoScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [convoMessages, convoActiveAgent]);

  useEffect(() => {
    if (mode !== "history" || !password) return;
    void loadHistoryList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, password]);

  // Controllo di raggiungibilità di Horus E Bowie eseguito all'apertura della
  // tab "Horus ↔ Bowie", prima che l'utente proponga un argomento: la
  // conversazione osservata usa entrambi gli agenti, ma senza questo check un
  // problema su uno qualsiasi dei due (non configurato o giù) si scopriva solo
  // dopo aver premuto Play, quando lo stream falliva a metà turno. In
  // precedenza veniva verificato solo Bowie assumendo che Horus (già validato
  // dalla tab "Chat con Horus") fosse sempre raggiungibile — non è
  // necessariamente vero al momento in cui si apre questa tab. Logica di
  // controllo (incluso il supporto multi-endpoint) condivisa con
  // `AgentChatPanel` tramite `useAgentHealth`.
  const {
    health: convoHealth,
    notConfigured: convoNotConfigured,
    unreachableMessage: convoUnreachableMessage,
    retry: retryConvoHealth,
  } = useAgentHealth(
    ["api/horus/health", "api/horus/bowie-health"],
    password,
    handleUnauthorized,
    mode === "conversation"
  );

  async function loadHistoryList() {
    if (!password) return;
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}api/horus/bowie-conversations`, {
        headers: { "X-Horus-Password": password },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setPassword(null);
        setAuthError("Password errata. Riprova.");
        return;
      }
      if (!res.ok) throw new Error(`Richiesta fallita (HTTP ${res.status})`);
      const data = (await res.json()) as ConvoHistoryItem[];
      setHistoryItems(data);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Errore nel caricamento della cronologia.");
    } finally {
      setIsHistoryLoading(false);
    }
  }

  async function openHistoryItem(id: number) {
    if (!password) return;
    setIsViewingLoading(true);
    setHistoryError(null);
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}api/horus/bowie-conversations/${id}`, {
        headers: { "X-Horus-Password": password },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setPassword(null);
        setAuthError("Password errata. Riprova.");
        return;
      }
      if (!res.ok) throw new Error(`Richiesta fallita (HTTP ${res.status})`);
      const data = (await res.json()) as ConvoHistoryDetail;
      setViewingConvo(data);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Errore nel caricamento della conversazione.");
    } finally {
      setIsViewingLoading(false);
    }
  }

  const filteredHistoryItems = historySearch.trim()
    ? historyItems.filter((item) =>
        item.topic.toLowerCase().includes(historySearch.trim().toLowerCase())
      )
    : historyItems;

  function handleUnlock(e: FormEvent) {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    sessionStorage.setItem(SESSION_KEY, passwordInput);
    setPassword(passwordInput);
    setAuthError(null);
  }

  function handleResetHorusChat() {
    setHorusChatKey((k) => k + 1);
  }

  function handleResetBowieChat() {
    setBowieChatKey((k) => k + 1);
  }

  function handleUnauthorized() {
    sessionStorage.removeItem(SESSION_KEY);
    setPassword(null);
    setAuthError("Password errata. Riprova.");
  }

  function stopConversation() {
    convoAbortRef.current?.abort();
  }

  function resetConversation() {
    convoAbortRef.current?.abort();
    setConvoMessages([]);
    setConvoActiveAgent(null);
    convoActiveAgentRef.current = null;
    setConvoError(null);
    setIsConvoRunning(false);
    convoTranscriptRef.current = [];
  }

  async function startConversation(e?: FormEvent) {
    e?.preventDefault();
    const text = topic.trim();
    if (!text || isConvoRunning || !password || convoHealth !== "ok") return;

    convoTranscriptRef.current = [];
    setConvoMessages([]);
    await runConversation(text, []);
  }

  // Riprende la conversazione dopo un drop-out di uno dei due agenti,
  // ripartendo dall'ultimo turno completato invece di azzerare tutto: il
  // topic e la trascrizione finora ottenuta restano quelli già mostrati
  // all'utente, si aggiunge solo il turno mancante e quelli successivi.
  async function retryConversation() {
    if (isConvoRunning || !password || convoHealth !== "ok") return;
    const text = topic.trim() || lastTopicRef.current;
    if (!text) return;
    // Rimuoviamo dall'interfaccia l'eventuale messaggio incompleto del turno
    // che è fallito a metà (mai arrivato il suo turn_end).
    setConvoMessages((prev) => prev.slice(0, convoTranscriptRef.current.length));
    await runConversation(text, convoTranscriptRef.current);
  }

  async function runConversation(text: string, resumeTranscript: ConvoTurn[]) {
    if (!password) return;
    lastTopicRef.current = text;
    setConvoError(null);
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
        body: JSON.stringify({ topic: text, resumeTranscript }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setPassword(null);
        setAuthError("Password errata. Riprova.");
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
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
            convoActiveAgentRef.current = agent;
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
            convoTranscriptRef.current = [...convoTranscriptRef.current, { agent, content: finalContent }];
            setConvoActiveAgent(null);
            convoActiveAgentRef.current = null;
          } else if (eventName === "error" && typeof payload.message === "string") {
            // Il server ci ripassa la trascrizione dei turni completati fino
            // all'errore: la usiamo come fonte di verità per il retry, così
            // anche se qualche evento SSE si fosse perso il "riprendi" del
            // client resta allineato a ciò che il server ha davvero salvato.
            if (Array.isArray(payload.transcript)) {
              convoTranscriptRef.current = (payload.transcript as unknown[]).filter(
                (t): t is ConvoTurn =>
                  typeof t === "object" &&
                  t !== null &&
                  ((t as ConvoTurn).agent === "horus" || (t as ConvoTurn).agent === "bowie") &&
                  typeof (t as ConvoTurn).content === "string"
              );
            }
            // Il server include già il nome dell'agente nel messaggio
            // (vedi horus.ts), quindi qui non duplichiamo il prefisso in UI.
            setConvoError({ message: payload.message, agent, prefixed: true });
          } else if (eventName === "done") {
            setConvoActiveAgent(null);
            convoActiveAgentRef.current = null;
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // interruzione manuale, non è un errore da mostrare
      } else {
        // Stream caduto senza un evento "error" esplicito dal server (es.
        // tunnel interrotto a metà): non sappiamo con certezza a chi
        // attribuire il drop, ma possiamo comunque indicare l'ultimo agente
        // che stava rispondendo. Usiamo un ref (non lo stato React catturato
        // alla creazione della closure, che qui sarebbe stantio) perché
        // viene aggiornato in tempo reale a ogni turn_start/turn_end mentre
        // lo stream procede in modo asincrono.
        setConvoError({
          message: friendlyChatErrorMessage(err),
          agent: convoActiveAgentRef.current,
          prefixed: false,
        });
      }
    } finally {
      setIsConvoRunning(false);
      setConvoActiveAgent(null);
      convoActiveAgentRef.current = null;
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
              {mode === "chat"
                ? "bikerlink:latest"
                : mode === "bowie-chat"
                  ? "Chat diretta con Bowie"
                  : mode === "conversation"
                    ? "Conversazione con Bowie"
                    : "Cronologia conversazioni"}
            </p>
          </div>
        </div>
        {mode === "chat" ? (
          <Button variant="ghost" size="sm" onClick={handleResetHorusChat} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Nuova chat
          </Button>
        ) : mode === "bowie-chat" ? (
          <Button variant="ghost" size="sm" onClick={handleResetBowieChat} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Nuova chat
          </Button>
        ) : mode === "conversation" ? (
          <Button variant="ghost" size="sm" onClick={resetConversation} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Nuova conversazione
          </Button>
        ) : viewingConvo ? (
          <Button variant="ghost" size="sm" onClick={() => setViewingConvo(null)} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Torna alla cronologia
          </Button>
        ) : null}
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
          variant={mode === "bowie-chat" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("bowie-chat")}
          className="gap-2"
        >
          <Cpu className="w-4 h-4" />
          Chat con Bowie
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
        <Button
          type="button"
          variant={mode === "history" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("history")}
          className="gap-2"
        >
          <History className="w-4 h-4" />
          Cronologia
        </Button>
      </div>

      <div className={mode === "chat" ? "flex-1 flex flex-col overflow-hidden" : "hidden"}>
        <AgentChatPanel
          key={horusChatKey}
          endpoint="api/horus/chat"
          healthEndpoint="api/horus/health"
          password={password}
          onUnauthorized={handleUnauthorized}
          agentIcon={<Flame className="w-4 h-4" />}
          agentAvatarClassName="bg-foreground text-background"
          emptyStateText="Scrivi un messaggio per iniziare a chattare con Horus."
          placeholderText="Scrivi a Horus... (Invio per inviare, Shift+Invio per andare a capo)"
        />
      </div>

      <div className={mode === "bowie-chat" ? "flex-1 flex flex-col overflow-hidden" : "hidden"}>
        <AgentChatPanel
          key={bowieChatKey}
          endpoint="api/horus/bowie-chat"
          healthEndpoint="api/horus/bowie-health"
          password={password}
          onUnauthorized={handleUnauthorized}
          agentIcon={<Cpu className="w-4 h-4" />}
          agentAvatarClassName="bg-accent text-accent-foreground"
          emptyStateText="Scrivi un messaggio per iniziare a chattare con Bowie."
          placeholderText="Scrivi a Bowie... (Invio per inviare, Shift+Invio per andare a capo)"
        />
      </div>

      {mode === "conversation" && convoHealth !== "ok" ? (
        <AgentHealthGate
          health={convoHealth}
          unreachableMessage={convoUnreachableMessage}
          onRetry={retryConvoHealth}
          checkingLabel="Verifica della connessione con Bowie in corso…"
          unreachableFallback="Bowie non è raggiungibile in questo momento."
        />
      ) : mode === "conversation" ? (
        <>
          {convoNotConfigured && (
            <div className="text-sm text-muted-foreground mb-3 px-1">{convoNotConfigured}</div>
          )}
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
            <div className="flex items-center justify-between gap-3 text-sm text-destructive mb-3 px-1">
              <span>
                {convoError.agent && !convoError.prefixed && (
                  <span className="font-bold uppercase tracking-wider mr-1">
                    {convoError.agent === "bowie" ? "Bowie" : "Horus"}:
                  </span>
                )}
                {convoError.message}
              </span>
              {convoTranscriptRef.current.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => void retryConversation()}
                >
                  <RotateCcw className="w-4 h-4" />
                  Riprova
                </Button>
              )}
            </div>
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
      ) : viewingConvo ? (
        <div className="flex-1 border border-border bg-muted/5 mb-4 overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="pb-4 border-b border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">
                {formatConvoDate(viewingConvo.createdAt)}
              </p>
              <p className="text-sm font-medium">{viewingConvo.topic}</p>
            </div>
            {viewingConvo.transcript.map((m, i) => (
              <div
                key={i}
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
                    {m.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 border border-border bg-muted/5 mb-4 overflow-y-auto">
          {historyItems.length > 0 && (
            <div className="p-4 pb-0 shrink-0">
              <Input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Cerca per argomento..."
                className="w-full"
              />
            </div>
          )}
          <div className="p-6 space-y-3">
            {isHistoryLoading && (
              <div className="flex justify-center py-16">
                <Spinner className="w-5 h-5" />
              </div>
            )}
            {!isHistoryLoading && historyError && (
              <div className="text-sm text-destructive text-center py-16">{historyError}</div>
            )}
            {!isHistoryLoading && !historyError && historyItems.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-16">
                Nessuna conversazione tra Horus e Bowie salvata finora.
              </div>
            )}
            {!isHistoryLoading && !historyError && historyItems.length > 0 && filteredHistoryItems.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-16">
                Nessuna conversazione trovata per &quot;{historySearch.trim()}&quot;.
              </div>
            )}
            {!isHistoryLoading &&
              !historyError &&
              filteredHistoryItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openHistoryItem(item.id)}
                  disabled={isViewingLoading}
                  className="w-full text-left border border-border bg-background hover:bg-muted/20 transition-colors px-4 py-3 flex items-center justify-between gap-3 disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.topic}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatConvoDate(item.createdAt)} · {item.turnCount} turni
                    </p>
                  </div>
                  {isViewingLoading ? (
                    <Spinner className="w-4 h-4 shrink-0" />
                  ) : (
                    <Cpu className="w-4 h-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
