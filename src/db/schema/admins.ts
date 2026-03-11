import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const admins = pgTable("admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  firstLoginAt: timestamp("first_login_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

export type Admin = typeof admins.$inferSelect;
