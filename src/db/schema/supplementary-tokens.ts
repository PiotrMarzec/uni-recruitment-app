import { pgTable, uuid, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { registrations } from "./registrations";
import { stages } from "./stages";

export const supplementaryTokens = pgTable("supplementary_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  registrationId: uuid("registration_id")
    .notNull()
    .references(() => registrations.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => stages.id, { onDelete: "cascade" }),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type SupplementaryToken = typeof supplementaryTokens.$inferSelect;
export type NewSupplementaryToken = typeof supplementaryTokens.$inferInsert;
