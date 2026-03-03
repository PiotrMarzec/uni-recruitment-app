import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  text,
  jsonb,
} from "drizzle-orm/pg-core";

export const actorTypeEnum = pgEnum("actor_type", [
  "admin",
  "student",
  "teacher",
  "system",
]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  actorType: actorTypeEnum("actor_type").notNull(),
  actorId: uuid("actor_id"),
  actorLabel: varchar("actor_label", { length: 255 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: uuid("resource_id").notNull(),
  recruitmentId: uuid("recruitment_id"),
  details: jsonb("details").notNull().default({}),
  ipAddress: text("ip_address"),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
