import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";

export const emailQueueStatusEnum = pgEnum("email_queue_status", [
  "pending",
  "processing",
  "sent",
  "failed",
]);

export const emailQueue = pgTable("email_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  from: text("from").notNull(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  status: emailQueueStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export type EmailQueueEntry = typeof emailQueue.$inferSelect;
export type NewEmailQueueEntry = typeof emailQueue.$inferInsert;
