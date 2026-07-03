import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export interface HorusConversationTurn {
  agent: "horus" | "bowie";
  content: string;
}

export const horusBowieConversationsTable = pgTable("horus_bowie_conversations", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  transcript: jsonb("transcript").$type<HorusConversationTurn[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // "interrupted" = salvata dopo un errore/drop-out a metà conversazione,
  // prima che l'utente premesse "Riprova" (o senza che potesse farlo). Serve
  // a non perdere la trascrizione parziale se l'utente chiude la tab prima
  // del retry; viene aggiornata a "complete" se la conversazione riprende
  // fino in fondo.
  status: text("status").$type<"complete" | "interrupted">().notNull().default("complete"),
});

export type HorusBowieConversation = typeof horusBowieConversationsTable.$inferSelect;
