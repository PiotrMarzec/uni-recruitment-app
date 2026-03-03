import { db } from "../src/db";
import { users, admins } from "../src/db/schema";
import { eq } from "drizzle-orm";
import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

async function main() {
  const email = (await ask("Admin email: ")).trim();
  const fullName = (await ask("Full name: ")).trim();
  rl.close();

  if (!email || !fullName) {
    console.error("Email and full name are required.");
    process.exit(1);
  }

  // Upsert user
  const [user] = await db
    .insert(users)
    .values({ email, fullName })
    .onConflictDoUpdate({ target: users.email, set: { fullName } })
    .returning();

  // Check if already admin
  const existing = await db.select().from(admins).where(eq(admins.userId, user.id));
  if (existing.length > 0) {
    console.log(`${email} is already an admin.`);
    process.exit(0);
  }

  await db.insert(admins).values({ userId: user.id });
  console.log(`Admin created: ${fullName} <${email}>`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
