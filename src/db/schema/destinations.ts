import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { recruitments } from "./recruitments";

// Languages supported for destinations and student spoken languages
export const SUPPORTED_LANGUAGES = [
  "English",
  "Spanish",
  "German",
  "French",
  "Polish",
  "Portuguese",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const destinations = pgTable("destinations", {
  id: uuid("id").primaryKey().defaultRandom(),
  recruitmentId: uuid("recruitment_id")
    .notNull()
    .references(() => recruitments.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  slotsBachelor: integer("slots_bachelor").notNull().default(0),
  slotsMaster: integer("slots_master").notNull().default(0),
  slotsAny: integer("slots_any").notNull().default(0),
  // Stored as JSON array of SupportedLanguage values
  requiredLanguages: text("required_languages").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Destination = typeof destinations.$inferSelect;
export type NewDestination = typeof destinations.$inferInsert;

// Helper to parse/serialize required_languages JSON field
export function parseLanguages(raw: string): SupportedLanguage[] {
  try {
    return JSON.parse(raw) as SupportedLanguage[];
  } catch {
    return [];
  }
}

export function serializeLanguages(langs: SupportedLanguage[]): string {
  return JSON.stringify(langs);
}
