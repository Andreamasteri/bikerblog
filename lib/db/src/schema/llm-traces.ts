import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Traccia strutturata di UNA chiamata del tool-loop LLM condiviso (Task #200
 * — Fase 2f prep): direct chat (Horus/Bowie/Quebracho, con eventuali tool) e
 * conversazione osservabile a più agenti (senza tool). Schema fisso e
 * query-abile così la ronda notturna di supervisione semantica (#199) può
 * campionare "conversazioni/output recenti" con una query SQL invece di fare
 * parsing ad hoc della cronologia grezza.
 *
 * Deliberatamente NON un dump completo del payload: `inputExcerpt`/
 * `outputExcerpt` sono estratti minimi (poche centinaia di caratteri), mai
 * l'intera conversazione né segreti/token — coerente con la nota di
 * sicurezza già presente in #199 e con il threat model del progetto
 * (Information Disclosure).
 */
export const llmTracesTable = pgTable("llm_traces", {
  id: serial("id").primaryKey(),
  /** Nome dell'agente che ha risposto: "Horus" | "Bowie" | "Quebracho". */
  agent: text("agent").notNull(),
  /**
   * Superficie del tool-loop che ha prodotto la traccia:
   * "direct_chat" (chat 1:1 con tool disponibili) o
   * "agent_conversation" (conversazione osservabile a più agenti, senza tool).
   */
  surface: text("surface").$type<"direct_chat" | "agent_conversation">().notNull(),
  /**
   * Identificativo che raggruppa le tracce di una stessa conversazione. Per
   * "agent_conversation" è l'id della riga persistita in
   * `horus_bowie_conversations` quando disponibile, altrimenti una chiave
   * generata lato richiesta; per "direct_chat" non esiste una conversazione
   * persistita, quindi resta null (ogni riga è già un turno completo).
   */
  conversationId: text("conversation_id"),
  /** Numero di turno all'interno della conversazione (1-based), se applicabile. */
  turnNumber: integer("turn_number"),
  /** Nomi dei tool usati durante questa chiamata, in ordine di esecuzione (vuoto se nessuno). */
  toolsUsed: text("tools_used").array().notNull().default([]),
  /** Latenza totale della chiamata (dal primo invio al modello all'esito finale), in ms. */
  latencyMs: integer("latency_ms").notNull(),
  /** Esito: "success" se è stata prodotta una risposta finale, "error" altrimenti. */
  outcome: text("outcome").$type<"success" | "error">().notNull(),
  /** Messaggio d'errore (troncato), solo quando outcome === "error". */
  errorMessage: text("error_message"),
  /** Estratto minimo dell'input (ultimo messaggio utente/argomento), troncato. */
  inputExcerpt: text("input_excerpt").notNull(),
  /** Estratto minimo dell'output prodotto (risposta finale), troncato. Assente in caso di errore senza risposta. */
  outputExcerpt: text("output_excerpt"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LlmTraceRow = typeof llmTracesTable.$inferSelect;
