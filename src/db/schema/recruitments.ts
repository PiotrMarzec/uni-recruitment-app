import { pgTable, uuid, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";

export const recruitments = pgTable("recruitments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  maxDestinationChoices: integer("max_destination_choices").notNull().default(3),
  // JSON array of StudentLevel values — which levels are eligible for this recruitment
  eligibleLevels: text("eligible_levels").notNull().default('["bachelor_1","bachelor_2","bachelor_3","master_1","master_2","master_3"]'),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RecruitmentStatus = "current" | "upcoming" | "completed" | "archived";

export type Recruitment = typeof recruitments.$inferSelect;
export type NewRecruitment = typeof recruitments.$inferInsert;
