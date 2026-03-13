import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { recruitments } from "./recruitments";

export const stageTypeEnum = pgEnum("stage_type", [
  "initial",
  "admin",
  "supplementary",
  "verification",
]);

export const stageStatusEnum = pgEnum("stage_status", [
  "pending",
  "active",
  "completed",
]);

export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruitmentId: uuid("recruitment_id")
    .notNull()
    .references(() => recruitments.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  order: integer("order").notNull(),
  type: stageTypeEnum("type").notNull(),
  status: stageStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Stage = typeof stages.$inferSelect;
export type NewStage = typeof stages.$inferInsert;
