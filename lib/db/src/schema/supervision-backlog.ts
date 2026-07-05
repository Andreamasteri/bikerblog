import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Backlog persistente dei problemi individuati dalla supervisione semantica
 * (Task #201, Ares). La ronda notturna di Quebracho (`#199`,
 * `scripts/src/semantic-supervision.ts`) produce solo un alert effimero; qui
 * invece le stesse anomalie diventano un backlog DURATURO e CLASSIFICATO da
 * Horus (dove/cosa/perché), consultabile su richiesta admin e consumato
 * dall'agente heavy on-demand Ares.
 *
 * Confine invariante del progetto: nessuna autocorrezione. Questa tabella
 * conserva solo diagnosi/proposte; lo stato viene fatto avanzare da Horus
 * (classificazione) e da Ares (presa in carico), mai applicando modifiche in
 * autonomia.
 *
 * Sicurezza (coerente con #199 e il threat model — Information Disclosure):
 * qui restano solo estratti minimi/metadata (id traccia, motivo breve,
 * classificazione sintetica), MAI il dump della conversazione originale né
 * segreti/token.
 *
 * Idempotenza: un solo record per `trace_id` (unique index). La ronda notturna
 * che rileva di nuovo la stessa traccia non crea duplicati — aggiorna il
 * record esistente senza resuscitare voci già `resolved`/`dismissed`.
 */

/** Stato del ciclo di vita di una voce del backlog. */
export type SupervisionBacklogStatus = "open" | "in_review" | "resolved" | "dismissed";

/** Severità assegnata da Horus in fase di classificazione (opzionale). */
export type SupervisionBacklogSeverity = "low" | "medium" | "high";

export const supervisionBacklogTable = pgTable(
  "supervision_backlog",
  {
    id: serial("id").primaryKey(),
    /** Id della traccia di origine in `llm_traces` (la conversazione anomala). */
    traceId: integer("trace_id").notNull(),
    /** Agente giudicato la cui risposta è stata segnalata: "Horus" | "Bowie". */
    agent: text("agent").notNull(),
    /** Motivo breve prodotto dal giudice (Quebracho) — la diagnosi grezza. */
    reason: text("reason").notNull(),
    /**
     * Categoria/etichetta sintetica assegnata da Horus in classificazione
     * (es. "pertinenza", "uso tool", "invenzione", "tono"). Null finché non
     * classificata.
     */
    category: text("category"),
    /**
     * Classificazione estesa di Horus (dove/cosa/perché in forma sintetica).
     * Null finché non classificata.
     */
    classification: text("classification"),
    /** Severità assegnata da Horus (opzionale). */
    severity: text("severity").$type<SupervisionBacklogSeverity>(),
    /** Stato del ciclo di vita. Default "open" alla creazione. */
    status: text("status").$type<SupervisionBacklogStatus>().notNull().default("open"),
    /** Note lasciate da Ares quando prende in carico/elabora la voce (proposte, non modifiche). */
    aresNotes: text("ares_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Valorizzato quando la voce passa a "resolved"/"dismissed". */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    traceIdUnique: uniqueIndex("supervision_backlog_trace_id_unique").on(table.traceId),
  })
);

export type SupervisionBacklogRow = typeof supervisionBacklogTable.$inferSelect;
export type SupervisionBacklogInsert = typeof supervisionBacklogTable.$inferInsert;
