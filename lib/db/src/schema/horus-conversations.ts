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
});

export type HorusBowieConversation = typeof horusBowieConversationsTable.$inferSelect;
