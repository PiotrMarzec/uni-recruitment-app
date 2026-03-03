import { pgTable, uuid, integer, pgEnum, timestamp } from "drizzle-orm/pg-core";
import { recruitments } from "./recruitments";
import { users } from "./users";

export const slotStatusEnum = pgEnum("slot_status", ["open", "registration_started", "registered"]);

export const slots = pgTable("slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruitmentId: uuid("recruitment_id")
    .notNull()
    .references(() => recruitments.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  status: slotStatusEnum("status").notNull().default("open"),
  studentId: uuid("student_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Slot = typeof slots.$inferSelect;
export type NewSlot = typeof slots.$inferInsert;
