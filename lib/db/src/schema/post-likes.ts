import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { postsTable } from "./posts";

export const postLikesTable = pgTable(
  "post_likes",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    likedAt: timestamp("liked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("post_likes_post_ip_uidx").on(t.postId, t.ipHash)],
);
