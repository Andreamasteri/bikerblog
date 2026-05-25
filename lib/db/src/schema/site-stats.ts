import { pgTable, integer, bigint } from "drizzle-orm/pg-core";

export const siteStatsTable = pgTable("site_stats", {
  id: integer("id").primaryKey().default(1),
  visits: bigint("visits", { mode: "number" }).notNull().default(0),
});
