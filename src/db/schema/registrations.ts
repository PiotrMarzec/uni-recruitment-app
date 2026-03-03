import {
  pgTable,
  uuid,
  boolean,
  integer,
  numeric,
  timestamp,
  pgEnum,
  text,
} from "drizzle-orm/pg-core";
import { slots } from "./slots";
import { users } from "./users";

export const studentLevelEnum = pgEnum("student_level", [
  "bachelor",
  "master",
]);

export const registrations = pgTable("registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slotId: uuid("slot_id")
    .notNull()
    .unique()
    .references(() => slots.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  emailConsent: boolean("email_consent").notNull().default(false),
  privacyConsent: boolean("privacy_consent").notNull().default(false),
  level: studentLevelEnum("level"),
  // JSON array of SupportedLanguage strings
  spokenLanguages: text("spoken_languages").notNull().default("[]"),
  // JSON array of destination UUIDs (ordered by preference)
  destinationPreferences: text("destination_preferences").notNull().default("[]"),
  // Enrollment ID — 6-digit number, first digit 1-9
  enrollmentId: text("enrollment_id"),
  // Teacher-entered scores
  averageResult: numeric("average_result", { precision: 3, scale: 1 }),
  additionalActivities: integer("additional_activities"),
  recommendationLetters: integer("recommendation_letters"),
  // Registration state
  registrationCompleted: boolean("registration_completed").notNull().default(false),
  registrationCompletedAt: timestamp("registration_completed_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Registration = typeof registrations.$inferSelect;
export type NewRegistration = typeof registrations.$inferInsert;
