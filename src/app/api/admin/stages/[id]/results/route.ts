import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assignmentResults, stages, registrations, users, destinations } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const results = await db
    .select({
      id: assignmentResults.id,
      registrationId: assignmentResults.registrationId,
      destinationId: assignmentResults.destinationId,
      score: assignmentResults.score,
      approved: assignmentResults.approved,
      studentName: users.fullName,
      studentEmail: users.email,
      destinationName: destinations.name,
    })
    .from(assignmentResults)
    .innerJoin(registrations, eq(assignmentResults.registrationId, registrations.id))
    .innerJoin(users, eq(registrations.studentId, users.id))
    .leftJoin(destinations, eq(assignmentResults.destinationId, destinations.id))
    .where(eq(assignmentResults.stageId, id))
    .orderBy(assignmentResults.score);

  return NextResponse.json(results);
}
