import { db } from "@/db";
import { stages, recruitments } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

/**
 * Synchronize the recruitment's startDate and endDate to always match:
 * - startDate = initial stage (order 0) startDate
 * - endDate = last verification stage endDate
 *
 * Call this after any stage startDate/endDate is modified.
 */
export async function syncRecruitmentDates(recruitmentId: string): Promise<void> {
  const allStages = await db
    .select({
      type: stages.type,
      order: stages.order,
      startDate: stages.startDate,
      endDate: stages.endDate,
    })
    .from(stages)
    .where(eq(stages.recruitmentId, recruitmentId))
    .orderBy(asc(stages.order));

  if (allStages.length === 0) return;

  const initialStage = allStages.find((s) => s.type === "initial");
  const verificationStages = allStages.filter((s) => s.type === "verification");
  const lastVerification = verificationStages[verificationStages.length - 1];

  const updates: { startDate?: Date; endDate?: Date } = {};

  if (initialStage?.startDate) {
    updates.startDate = initialStage.startDate;
  }
  if (lastVerification?.endDate) {
    updates.endDate = lastVerification.endDate;
  }

  if (updates.startDate || updates.endDate) {
    await db
      .update(recruitments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(recruitments.id, recruitmentId));
  }
}
