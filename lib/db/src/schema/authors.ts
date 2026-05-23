import { pgTable, text, serial } from "drizzle-orm/pg-core";

export const authorsTable = pgTable("authors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  bio: text("bio").notNull(),
  location: text("location"),
  bike: text("bike"),
});

export type Author = typeof authorsTable.$inferSelect;
