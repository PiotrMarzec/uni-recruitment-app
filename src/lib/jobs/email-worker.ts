import { Resend } from "resend";
import { db } from "@/db";
import { emailQueue } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

// Resend allows up to 100 emails per batch call.
const BATCH_SIZE = 100;

/**
 * Claim pending emails atomically (SELECT FOR UPDATE SKIP LOCKED) and mark
 * them as "processing" so a concurrent run cannot pick them up again.
 */
async function claimPendingEmails() {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id FROM email_queue WHERE status = 'pending' LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED`
    );

    if (rows.rows.length === 0) return [];

    const ids = rows.rows.map((r) => r.id as string);

    return tx
      .update(emailQueue)
      .set({
        status: "processing",
        attempts: sql`${emailQueue.attempts} + 1`,
      })
      .where(inArray(emailQueue.id, ids))
      .returning();
  });
}

/**
 * Process one batch of queued emails via resend.batch.send.
 * Guarantees at most one Resend API call per invocation.
 */
export async function processEmailQueue(): Promise<void> {
  // Nothing to do in SMTP/dev mode — emails are sent synchronously there.
  if (process.env.SMTP_HOST) return;

  const claimed = await claimPendingEmails();
  if (claimed.length === 0) return;

  logger.info("email_worker.dispatching", { count: claimed.length });

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.batch.send(
      claimed.map((e) => ({
        from: e.from,
        to: e.to,
        subject: e.subject,
        html: e.html,
      }))
    );

    if (error) {
      // Whole batch failed — mark every email as failed.
      const errMsg = error.message ?? "Unknown Resend batch error";
      logger.error("email_worker.batch_failed", { error: errMsg, count: claimed.length });
      await db
        .update(emailQueue)
        .set({ status: "failed", error: errMsg, processedAt: new Date() })
        .where(
          inArray(
            emailQueue.id,
            claimed.map((e) => e.id)
          )
        );
    } else {
      logger.info("email_worker.batch_sent", { count: claimed.length });
      await db
        .update(emailQueue)
        .set({ status: "sent", processedAt: new Date() })
        .where(
          inArray(
            emailQueue.id,
            claimed.map((e) => e.id)
          )
        );
    }
  } catch (err) {
    const errMsg = String(err);
    logger.error("email_worker.exception", { error: errMsg, count: claimed.length });
    await db
      .update(emailQueue)
      .set({ status: "failed", error: errMsg, processedAt: new Date() })
      .where(
        inArray(
          emailQueue.id,
          claimed.map((e) => e.id)
        )
      );
  }
}

/**
 * Start the email-queue worker. Fires once per second; skips a tick if the
 * previous run is still in progress, guaranteeing ≤1 Resend request per second.
 */
export function startEmailWorker(): void {
  if (process.env.SMTP_HOST) {
    console.log("[EmailWorker] SMTP mode — worker disabled, emails sent directly.");
    return;
  }

  console.log("[EmailWorker] Starting (Resend queue mode, 1 req/s)...");

  let running = false;

  setInterval(async () => {
    if (running) return; // previous tick still in progress
    running = true;
    try {
      await processEmailQueue();
    } catch (err) {
      logger.error("email_worker.tick_error", { error: String(err) });
      console.error("[EmailWorker] Unhandled error:", err);
    } finally {
      running = false;
    }
  }, 1000);
}
