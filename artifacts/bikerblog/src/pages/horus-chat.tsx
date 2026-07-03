import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Flame, Lock, RotateCcw, Cpu, Bot, Play, Square, History, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { AgentChatPanel } from "./agent-chat-panel";
import { friendlyChatErrorMessage } from "@/lib/friendly-error";
import { useAgentHealth, useAgentRegistry } from "@/hooks/use-agent-health";
import { AgentHealthGate } from "@/hooks/agent-health-status";

const SESSION_KEY = "horus-chat-password";
// Preset di lunghezza conversazione ricordato tra una visita e l'altra
// (Task #160): senza questo, ogni apertura della tab "Horus ↔ Bowie" o ogni
// "Nuova conversazione" ripartiva sempre da "Normale", costringendo chi
// preferisce sempre "Veloce" a riselezionarlo ogni volta.
const CONVO_TURNS_PRESET_STORAGE_KEY = "horus-convo-turns-preset";

// Deve restare in sync con `DEFAULT_MAX_TURNS` in
// `artifacts/api-server/src/routes/horus.ts` — usato solo per il messaggio
// "durata tipica" mostrato PRIMA di avviare una conversazione, quando non
// abbiamo ancora ricevuto il vero `totalTurns` dal server (Task #157). Una
// volta che la conversazione parte, il vero valore arriva via SSE e questa
// costante non viene più usata.
const DEFAULT_CONVO_TURNS_HINT = 6;
const ESTIMATED_SECONDS_PER_TURN_HINT = 105;

// L'id di un agente conversazionale è una stringa generica (allineato al
// server, vedi horus.ts): la conversazione osservabile è generalizzata a N
// interlocutori, quindi la UI non deve assumere esattamente "horus"/"bowie".
// Aggiungere un terzo agente (es. "quebracho") richiede solo una voce in
// AGENT_PRESENTATIONS qui sotto, non un refactor di questo file.
type ConvoAgent = string;

// Preset di lunghezza conversazione mostrati all'utente prima di premere
// Play (Task #158). Il server (`createBowieConversationHandler` in
// horus.ts) già supportava `maxTurns` fino a `MAX_ALLOWED_TURNS` (20), ma il
// frontend non lo inviava mai: la conversazione partiva sempre con
// `DEFAULT_MAX_TURNS` (6). "Normale" resta allineato a quel default.
const CONVO_TURN_PRESETS: { key: "fast" | "normal" | "long"; label: string; turns: number }[] = [
  { key: "fast", label: "Veloce", turns: 3 },
  { key: "normal", label: "Normale", turns: DEFAULT_CONVO_TURNS_HINT },
  { key: "long", label: "Lunga", turns: 12 },
];

interface ConvoMessage {
  id: string;
  agent: ConvoAgent;
  content: string;
}

interface ConvoTurn {
  agent: ConvoAgent;
  content: string;
}

interface AgentPresentation {
  label: string;
  icon: ReactNode;
  avatarClassName: string;
  bubbleClassName: string;
  /** Lato del bubble/riga: allineamento storico per Horus (sinistra) e Bowie
   * (destra). Agenti sconosciuti restano a sinistra per default, così un
   * terzo interlocutore non "rompe" il layout a due colonne esistente. */
  align: "left" | "right";
}

// Presentazione nota per gli agenti storici: stile invariato rispetto a
// prima della generalizzazione. Qualsiasi agente non presente qui (es. un
// futuro "Quebracho") riceve una presentazione generica calcolata da
// `getAgentPresentation`, senza bisogno di toccare questo codice.
const AGENT_PRESENTATIONS: Record<string, AgentPresentation> = {
  horus: {
    label: "Horus",
    icon: <Flame className="w-4 h-4" />,
    avatarClassName: "bg-foreground text-background",
    bubbleClassName: "bg-background border border-border",
    align: "left",
  },
  bowie: {
    label: "Bowie",
    icon: <Cpu className="w-4 h-4" />,
    avatarClassName: "bg-accent text-accent-foreground",
    bubbleClassName: "bg-accent/20 border border-accent/40",
    align: "right",
  },
  quebracho: {
    label: "Quebracho",
    icon: <Bot className="w-4 h-4" />,
    avatarClassName: "bg-primary text-primary-foreground",
    bubbleClassName: "bg-primary/10 border border-primary/30",
    align: "left",
  },
};

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function getAgentPresentation(agent: ConvoAgent): AgentPresentation {
  return (
    AGENT_PRESENTATIONS[agent] ?? {
      label: capitalize(agent),
      icon: <Bot className="w-4 h-4" />,
      avatarClassName: "bg-secondary text-secondary-foreground",
      bubbleClassName: "bg-muted/30 border border-muted-foreground/30",
      align: "left",
    }
  );
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadStoredTurnsPreset(): (typeof CONVO_TURN_PRESETS)[number] {
  try {
    const storedKey = localStorage.getItem(CONVO_TURNS_PRESET_STORAGE_KEY);
    const found = CONVO_TURN_PRESETS.find((preset) => preset.key === storedKey);
    if (found) return found;
  } catch {
    // localStorage non disponibile (es. modalità privata): usa il default.
  }
  return CONVO_TURN_PRESETS[1];
}

function storeTurnsPreset(preset: (typeof CONVO_TURN_PRESETS)[number]): void {
  try {
    localStorage.setItem(CONVO_TURNS_PRESET_STORAGE_KEY, preset.key);
  } catch {
    // localStorage non disponibile: la preferenza semplicemente non persiste.
  }
}

type Mode = "chat" | "bowie-chat" | "quebracho-chat" | "conversation" | "history";

type ConvoStatus = "complete" | "interrupted";

interface ConvoHistoryItem {
  id: number;
  topic: string;
  turnCount: number;
  createdAt: string;
  status: ConvoStatus;
}

interface ConvoHistoryDetail {
  id: number;
  topic: string;
  createdAt: string;
  transcript: { agent: ConvoAgent; content: string }[];
  status: ConvoStatus;
}

// Formatta secondi come "Xm Ys" (o solo "Ys" sotto il minuto), usata sia per
// il cronometro dei trascorsi sia per la stima dei rimanenti (Task #157).
function formatDurationShort(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m ${rest.toString().padStart(2, "0")}s`;
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
  const [quebrachoChatKey, setQuebrachoChatKey] = useState(0);

  const [topic, setTopic] = useState("");
  // Preset scelto dall'utente prima di avviare la conversazione (Task #158).
  // Resta lo stesso anche durante un "Riprova" dopo un drop-out, così la
  // lunghezza totale non cambia a metà conversazione.
  const [selectedTurnsPreset, setSelectedTurnsPreset] = useState<(typeof CONVO_TURN_PRESETS)[number]>(
    loadStoredTurnsPreset
  );
  const [convoMessages, setConvoMessages] = useState<ConvoMessage[]>([]);
  const [convoActiveAgent, setConvoActiveAgent] = useState<ConvoAgent | null>(null);
  const [isConvoRunning, setIsConvoRunning] = useState(false);
  // Progresso/stima durata (Task #157): ogni turno di Bowie/Horus sul
  // tunnel CPU condiviso richiede realisticamente 90-120s (vedi
  // .agents/memory/bowie-real-model-quality-check.md), quindi una
  // conversazione a più turni può sembrare bloccata senza un'indicazione di
  // quanto manca. Questi valori arrivano dal server con ogni evento
  // `turn_start` così il client non deve indovinare il totale dei turni
  // (dipende da `DEFAULT_MAX_TURNS`/`maxTurns` lato server).
  const [convoProgress, setConvoProgress] = useState<{
    turnNumber: number;
    totalTurns: number;
    estimatedSecondsPerTurn: number;
  } | null>(null);
  // Aggiornato ogni secondo mentre la conversazione gira, solo per mostrare
  // un cronometro "trascorsi" all'utente (nessun impatto sulla logica).
  const [convoElapsedSeconds, setConvoElapsedSeconds] = useState(0);
  const convoStartedAtRef = useRef<number | null>(null);
  const [convoError, setConvoError] = useState<{
    message: string;
    agent: ConvoAgent | null;
    prefixed: boolean;
    // Un errore "fatale" non è recuperabile riprovando con la stessa
    // trascrizione (es. resumeTranscript corrotto rifiutato dal server con
    // 400): in questo caso non ha senso offrire "Riprova" perché ripeterebbe
    // esattamente lo stesso errore. L'unica via d'uscita è ricominciare.
    fatal?: boolean;
  } | null>(null);

  // Trascrizione dei soli turni completati (turn_end ricevuto): è quella che
  // riproponiamo al server per riprendere la conversazione dopo un errore o
  // uno stallo a metà turno, senza perdere ciò che era già stato detto.
  const convoTranscriptRef = useRef<ConvoTurn[]>([]);
  // Id della riga salvata come "interrupted" quando l'ultimo tentativo si è
  // interrotto a metà: se l'utente preme "Riprova" la passiamo al server per
  // aggiornare quella riga invece di crearne una nuova ad ogni retry.
  const convoConversationIdRef = useRef<number | null>(null);
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

  // Cronometro "trascorsi" per la conversazione osservata (Task #157): parte
  // quando la conversazione viene avviata/ripresa e si ferma appena si esce
  // dallo stato "in corso", indipendentemente da come finisce (done, error,
  // abort manuale).
  useEffect(() => {
    if (!isConvoRunning) return;
    const interval = setInterval(() => {
      if (convoStartedAtRef.current !== null) {
        setConvoElapsedSeconds(Math.floor((Date.now() - convoStartedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isConvoRunning]);

  useEffect(() => {
    if (mode !== "history" || !password) return;
    void loadHistoryList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, password]);

  // Elenco degli agenti e dei relativi endpoint di health-check, ottenuto dal
  // server (`GET /horus/agents`) invece di essere scritto a mano qui: è la
  // stessa fonte di verità (Task #156) che genera le route lato server, così
  // aggiungere/rimuovere un agente dal registry non richiede più toccare
  // anche questo file per far comparire/sparire il suo check.
  const {
    agents: agentRegistry,
    loadError: agentRegistryError,
    retry: retryAgentRegistry,
  } = useAgentRegistry(password, handleUnauthorized);

  // Ogni endpoint porta il `displayName` dell'agente (Task #161): senza
  // questo, `useAgentHealth` non saprebbe nominare quale agente specifico è
  // giù quando il fallimento è a livello di rete/HTTP (nessun corpo JSON da
  // cui ricavare il nome), e mostrerebbe un avviso generico indistinguibile
  // dagli altri anche con un solo agente su N effettivamente irraggiungibile.
  const healthEndpoints = agentRegistry.map((a) => ({ endpoint: a.healthEndpoint, displayName: a.displayName }));

  // Controllo di raggiungibilità di TUTTI gli agenti del registry eseguito
  // all'apertura della tab "Horus ↔ Bowie", prima che l'utente proponga un
  // argomento: la conversazione osservata li usa tutti, ma senza questo check
  // un problema su uno qualsiasi di essi (non configurato o giù) si scopriva
  // solo dopo aver premuto Play, quando lo stream falliva a metà turno. In
  // precedenza veniva verificato solo Bowie assumendo che Horus (già validato
  // dalla tab "Chat con Horus") fosse sempre raggiungibile — non è
  // necessariamente vero al momento in cui si apre questa tab. Logica di
  // controllo (incluso il supporto multi-endpoint) condivisa con
  // `AgentChatPanel` tramite `useAgentHealth`. Resta in stato "checking"
  // finché il registry non è ancora arrivato dal server (`enabled` sotto).
  const {
    health: convoHealth,
    notConfigured: convoNotConfigured,
    unreachableMessage: convoUnreachableMessage,
    retry: retryConvoHealth,
    modelsByEndpoint: agentModels,
  } = useAgentHealth(
    healthEndpoints,
    password,
    handleUnauthorized,
    // Sempre attivo (non solo in modalità "conversation"): serve anche a
    // conoscere il nome del modello reale dietro ciascun agente da mostrare
    // nel sottotitolo dell'header in ogni modalità, non solo per il gate
    // della conversazione osservata. Attivo solo quando il registry è stato
    // caricato, altrimenti partirebbe con un elenco vuoto di endpoint.
    agentRegistry.length > 0
  );

  function modelLabelForAgent(id: string): string | undefined {
    const entry = agentRegistry.find((a) => a.id === id);
    return entry ? agentModels[entry.healthEndpoint] : undefined;
  }

  const horusModelLabel = modelLabelForAgent("horus") ?? "bikerlink:latest";
  const bowieModelLabel = modelLabelForAgent("bowie");
  const quebrachoModelLabel = modelLabelForAgent("quebracho");

  // Se il registry stesso non è caricabile (es. richiesta a `/horus/agents`
  // fallita), `useAgentHealth` resterebbe indefinitamente in "checking" (mai
  // abilitato, vedi sopra): senza questo fallback l'utente vedrebbe uno
  // spinner infinito invece di un errore chiaro con un modo per riprovare.
  const effectiveConvoHealth = agentRegistryError ? "unreachable" : convoHealth;
  const effectiveConvoUnreachableMessage = agentRegistryError ?? convoUnreachableMessage;

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

  function handleResetQuebrachoChat() {
    setQuebrachoChatKey((k) => k + 1);
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
    convoConversationIdRef.current = null;
    setConvoProgress(null);
    setConvoElapsedSeconds(0);
    convoStartedAtRef.current = null;
    // Il preset resta quello ricordato dall'ultima scelta dell'utente
    // (Task #160), non torna a "Normale": la funzione di reset permette
    // comunque di cambiarlo tramite i pulsanti prima di ripartire.
    setSelectedTurnsPreset(loadStoredTurnsPreset());
  }

  async function startConversation(e?: FormEvent) {
    e?.preventDefault();
    const text = topic.trim();
    if (!text || isConvoRunning || !password || effectiveConvoHealth !== "ok") return;

    convoTranscriptRef.current = [];
    convoConversationIdRef.current = null;
    setConvoMessages([]);
    await runConversation(text, [], null, selectedTurnsPreset.turns);
  }

  // Riprende la conversazione dopo un drop-out di uno dei due agenti,
  // ripartendo dall'ultimo turno completato invece di azzerare tutto: il
  // topic e la trascrizione finora ottenuta restano quelli già mostrati
  // all'utente, si aggiunge solo il turno mancante e quelli successivi.
  async function retryConversation() {
    if (isConvoRunning || !password || effectiveConvoHealth !== "ok") return;
    const text = topic.trim() || lastTopicRef.current;
    if (!text) return;
    // Rimuoviamo dall'interfaccia l'eventuale messaggio incompleto del turno
    // che è fallito a metà (mai arrivato il suo turn_end).
    setConvoMessages((prev) => prev.slice(0, convoTranscriptRef.current.length));
    await runConversation(text, convoTranscriptRef.current, convoConversationIdRef.current, selectedTurnsPreset.turns);
  }

  async function runConversation(
    text: string,
    resumeTranscript: ConvoTurn[],
    resumeConversationId: number | null,
    maxTurns: number
  ) {
    if (!password) return;
    lastTopicRef.current = text;
    setConvoError(null);
    setIsConvoRunning(true);
    setConvoProgress(null);
    convoStartedAtRef.current = Date.now();
    setConvoElapsedSeconds(0);

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
        body: JSON.stringify({ topic: text, resumeTranscript, resumeConversationId, maxTurns }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setPassword(null);
        setAuthError("Password errata. Riprova.");
        return;
      }

      if (res.status === 400) {
        // Il server ha rifiutato la richiesta prima ancora di aprire lo
        // stream SSE (es. `resumeTranscript` corrotto/manomesso che non
        // alterna correttamente horus/bowie — vedi la validazione in
        // horus.ts). Questo NON è un errore transitorio di rete: se
        // continuassimo a riproporre la stessa `convoTranscriptRef`
        // corrotta col pulsante "Riprova" otterremmo di nuovo lo stesso 400
        // all'infinito, con l'utente bloccato senza capire perché. Azzeriamo
        // subito la trascrizione salvata così l'unica via d'uscita mostrata è
        // ricominciare da capo, non un retry che ripeterebbe lo stesso errore.
        convoTranscriptRef.current = [];
        convoConversationIdRef.current = null;
        setConvoError({
          message:
            "La conversazione salvata sembra corrotta e non può essere ripresa. " +
            'Premi "Nuova conversazione" per ricominciare da capo.',
          agent: null,
          prefixed: true,
          fatal: true,
        });
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

          const agent = typeof payload.agent === "string" && payload.agent.length > 0 ? payload.agent : null;

          if (eventName === "turn_start" && agent) {
            setConvoActiveAgent(agent);
            convoActiveAgentRef.current = agent;
            currentId = uid();
            const id = currentId;
            setConvoMessages((prev) => [...prev, { id, agent, content: "" }]);
            if (
              typeof payload.turnNumber === "number" &&
              typeof payload.totalTurns === "number" &&
              typeof payload.estimatedSecondsPerTurn === "number"
            ) {
              setConvoProgress({
                turnNumber: payload.turnNumber,
                totalTurns: payload.totalTurns,
                estimatedSecondsPerTurn: payload.estimatedSecondsPerTurn,
              });
            }
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
                  typeof (t as ConvoTurn).agent === "string" &&
                  (t as ConvoTurn).agent.length > 0 &&
                  typeof (t as ConvoTurn).content === "string"
              );
            }
            // Id della riga salvata lato server per questo drop-out: la
            // teniamo per il prossimo retry, così aggiorna la stessa riga
            // invece di crearne una nuova, e per non perdere la trascrizione
            // se l'utente chiude la tab senza riprovare.
            if (typeof payload.conversationId === "number") {
              convoConversationIdRef.current = payload.conversationId;
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
                ? `Horus (${horusModelLabel})`
                : mode === "bowie-chat"
                  ? `Chat diretta con Bowie${bowieModelLabel ? ` (${bowieModelLabel})` : ""}`
                  : mode === "quebracho-chat"
                    ? `Chat diretta con Quebracho${quebrachoModelLabel ? ` (${quebrachoModelLabel})` : ""}`
                    : mode === "conversation"
                      ? `Conversazione Horus (${horusModelLabel}) ↔ Bowie${
                          bowieModelLabel ? ` (${bowieModelLabel})` : ""
                        } ↔ Quebracho${quebrachoModelLabel ? ` (${quebrachoModelLabel})` : ""}`
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
        ) : mode === "quebracho-chat" ? (
          <Button variant="ghost" size="sm" onClick={handleResetQuebrachoChat} className="gap-2">
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
          variant={mode === "quebracho-chat" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("quebracho-chat")}
          className="gap-2"
        >
          <Bot className="w-4 h-4" />
          Chat con Quebracho
        </Button>
        <Button
          type="button"
          variant={mode === "conversation" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("conversation")}
          className="gap-2"
        >
          <Cpu className="w-4 h-4" />
          Horus ↔ Bowie ↔ Quebracho
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

      <div className={mode === "quebracho-chat" ? "flex-1 flex flex-col overflow-hidden" : "hidden"}>
        <AgentChatPanel
          key={quebrachoChatKey}
          endpoint="api/horus/quebracho-chat"
          healthEndpoint="api/horus/quebracho-health"
          password={password}
          onUnauthorized={handleUnauthorized}
          agentIcon={<Bot className="w-4 h-4" />}
          agentAvatarClassName="bg-primary text-primary-foreground"
          emptyStateText="Scrivi un messaggio per iniziare a chattare con Quebracho."
          placeholderText="Scrivi a Quebracho... (Invio per inviare, Shift+Invio per andare a capo)"
        />
      </div>

      {mode === "conversation" && effectiveConvoHealth !== "ok" ? (
        <AgentHealthGate
          health={effectiveConvoHealth}
          unreachableMessage={effectiveConvoUnreachableMessage}
          onRetry={() => {
            retryAgentRegistry();
            retryConvoHealth();
          }}
          checkingLabel="Verifica della connessione con gli agenti in corso…"
          unreachableFallback="Uno o più agenti non sono raggiungibili in questo momento."
        />
      ) : mode === "conversation" ? (
        <>
          {convoNotConfigured && (
            <div className="text-sm text-muted-foreground mb-3 px-1">{convoNotConfigured}</div>
          )}
          {isConvoRunning && convoProgress && (
            // Stima di avanzamento/durata (Task #157): Bowie/Horus su questo
            // tunnel CPU condiviso impiegano realisticamente 90-120s a
            // turno, quindi senza questa indicazione una conversazione a più
            // turni sembra bloccata. `totalTurns` arriva dal server (dipende
            // da DEFAULT_MAX_TURNS/maxTurns), non è ipotizzato qui.
            <div className="text-xs text-muted-foreground mb-3 px-1 flex items-center justify-between gap-3">
              <span>
                Turno {convoProgress.turnNumber} di {convoProgress.totalTurns} · trascorsi{" "}
                {formatDurationShort(convoElapsedSeconds)}
              </span>
              <span>
                circa{" "}
                {formatDurationShort(
                  Math.max(0, convoProgress.totalTurns - convoProgress.turnNumber + 1) *
                    convoProgress.estimatedSecondsPerTurn
                )}{" "}
                rimanenti
              </span>
            </div>
          )}
          {!isConvoRunning && convoMessages.length === 0 && (
            <div className="mb-3 px-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                  Durata
                </span>
                <div className="flex gap-1">
                  {CONVO_TURN_PRESETS.map((preset) => (
                    <Button
                      key={preset.key}
                      type="button"
                      variant={selectedTurnsPreset.key === preset.key ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-3 text-xs"
                      onClick={() => {
                        setSelectedTurnsPreset(preset);
                        storeTurnsPreset(preset);
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedTurnsPreset.turns} turni · ogni turno richiede in genere 1-2 minuti, quindi
                dura circa{" "}
                {formatDurationShort(selectedTurnsPreset.turns * ESTIMATED_SECONDS_PER_TURN_HINT)}.
              </p>
            </div>
          )}
          <div ref={convoScrollRef} className="flex-1 border border-border bg-muted/5 mb-4 overflow-y-auto">
            <div className="p-6 space-y-6">
              {convoMessages.length === 0 && !isConvoRunning && (
                <div className="text-center text-muted-foreground text-sm py-16">
                  Proponi un argomento e guarda Horus, Bowie e Quebracho discuterne a turni.
                </div>
              )}
              {convoMessages.map((m) => {
                const presentation = getAgentPresentation(m.agent);
                return (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${presentation.align === "right" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className={presentation.avatarClassName}>
                        {presentation.icon}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`max-w-[80%] flex flex-col gap-1 ${
                        presentation.align === "right" ? "items-end" : "items-start"
                      }`}
                    >
                      <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                        {presentation.label}
                      </span>
                      <div
                        className={`px-4 py-3 whitespace-pre-wrap text-sm leading-relaxed ${presentation.bubbleClassName}`}
                      >
                        {m.content || <Spinner className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                    {getAgentPresentation(convoError.agent).label}:
                  </span>
                )}
                {convoError.message}
              </span>
              {convoError.fatal ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={resetConversation}
                >
                  <RotateCcw className="w-4 h-4" />
                  Nuova conversazione
                </Button>
              ) : (
                convoTranscriptRef.current.length > 0 && (
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
                )
              )}
            </div>
          )}

          <form onSubmit={startConversation} className="flex items-end gap-2 shrink-0">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Argomento della discussione tra Horus, Bowie e Quebracho..."
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
                {viewingConvo.status === "interrupted" && (
                  <span className="ml-2 text-amber-600 dark:text-amber-500">· Interrotta</span>
                )}
              </p>
              <p className="text-sm font-medium">{viewingConvo.topic}</p>
            </div>
            {viewingConvo.transcript.map((m, i) => {
              const presentation = getAgentPresentation(m.agent);
              return (
                <div
                  key={i}
                  className={`flex gap-3 ${presentation.align === "right" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback className={presentation.avatarClassName}>
                      {presentation.icon}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`max-w-[80%] flex flex-col gap-1 ${
                      presentation.align === "right" ? "items-end" : "items-start"
                    }`}
                  >
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                      {presentation.label}
                    </span>
                    <div
                      className={`px-4 py-3 whitespace-pre-wrap text-sm leading-relaxed ${presentation.bubbleClassName}`}
                    >
                      {m.content}
                    </div>
                  </div>
                </div>
              );
            })}
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
                Nessuna conversazione tra Horus, Bowie e Quebracho salvata finora.
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
                      {item.status === "interrupted" && (
                        <span className="ml-2 text-amber-600 dark:text-amber-500 font-bold uppercase tracking-wider">
                          Interrotta
                        </span>
                      )}
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
