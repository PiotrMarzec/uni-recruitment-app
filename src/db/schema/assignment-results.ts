import { pgTable, uuid, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { stages } from "./stages";
import { registrations } from "./registrations";
import { destinations } from "./destinations";

export const assignmentResults = pgTable("assignment_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => stages.id, { onDelete: "cascade" }),
  registrationId: uuid("registration_id")
    .notNull()
    .references(() => registrations.id, { onDelete: "cascade" }),
  // nullable — null means student was unassigned
  destinationId: uuid("destination_id").references(() => destinations.id, {
    onDelete: "set null",
  }),
  score: numeric("score", { precision: 5, scale: 1 }).notNull(),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AssignmentResult = typeof assignmentResults.$inferSelect;
export type NewAssignmentResult = typeof assignmentResults.$inferInsert;
