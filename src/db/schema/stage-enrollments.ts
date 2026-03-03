import { pgTable, uuid, boolean, timestamp } from "drizzle-orm/pg-core";
import { stages } from "./stages";
import { registrations } from "./registrations";
import { destinations } from "./destinations";

export const stageEnrollments = pgTable("stage_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => stages.id, { onDelete: "cascade" }),
  registrationId: uuid("registration_id")
    .notNull()
    .references(() => registrations.id, { onDelete: "cascade" }),
  assignedDestinationId: uuid("assigned_destination_id").references(
    () => destinations.id,
    { onDelete: "set null" }
  ),
  cancelled: boolean("cancelled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StageEnrollment = typeof stageEnrollments.$inferSelect;
export type NewStageEnrollment = typeof stageEnrollments.$inferInsert;
