import cron from "node-cron";
import { cleanupOtps } from "./otp-cleanup";
import { processStageTransitions } from "./stage-transitions";

export function startJobs(): void {
  console.log("[Jobs] Starting background jobs...");

  // Stage transitions: check every minute
  cron.schedule("* * * * *", async () => {
    try {
      await processStageTransitions();
    } catch (err) {
      console.error("[Jobs] Stage transition job failed:", err);
    }
  });

  // OTP cleanup: every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      await cleanupOtps();
    } catch (err) {
      console.error("[Jobs] OTP cleanup job failed:", err);
    }
  });

  console.log("[Jobs] Background jobs started.");
}
