import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { authorsTable } from "./authors";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  coverImageUrl: text("cover_image_url").notNull(),
  category: text("category").notNull(),
  tags: text("tags").array().notNull().default([]),
  authorId: integer("author_id")
    .notNull()
    .references(() => authorsTable.id),
  publishedAt: timestamp("published_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  readingMinutes: integer("reading_minutes").notNull().default(5),
  likeCount: integer("like_count").notNull().default(0),
  location: text("location"),
  bike: text("bike"),
  featured: integer("featured").notNull().default(0),
  dailyMaxim: text("daily_maxim"),
  audioUrl: text("audio_url"),
  titleEn: text("title_en"),
  excerptEn: text("excerpt_en"),
  bodyEn: text("body_en"),
  /**
   * "published" (default) o "draft". I post in "draft" non sono mai
   * visibili sulle route pubbliche — usato dall'audit automatico dei
   * contenuti per bloccare la pubblicazione di post con termini vietati.
   */
  status: text("status").notNull().default("published"),
});

export type PostRow = typeof postsTable.$inferSelect;
