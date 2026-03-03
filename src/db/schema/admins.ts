import { pgTable, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const admins = pgTable("admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
});

export type Admin = typeof admins.$inferSelect;
