import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { desc, eq, and, gte, lte, like, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const recruitmentId = searchParams.get("recruitmentId");
  const actorType = searchParams.get("actorType");
  const action = searchParams.get("action");
  const resourceType = searchParams.get("resourceType");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const search = searchParams.get("search");
  const format = searchParams.get("format");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = (page - 1) * limit;

  const conditions = [];

  if (recruitmentId) {
    conditions.push(eq(auditLog.recruitmentId, recruitmentId));
  }
  if (actorType) {
    conditions.push(eq(auditLog.actorType, actorType as "admin" | "student" | "teacher" | "system"));
  }
  if (action) {
    conditions.push(eq(auditLog.action, action));
  }
  if (resourceType) {
    conditions.push(eq(auditLog.resourceType, resourceType));
  }
  if (dateFrom) {
    conditions.push(gte(auditLog.timestamp, new Date(dateFrom)));
  }
  if (dateTo) {
    conditions.push(lte(auditLog.timestamp, new Date(dateTo)));
  }
  if (search) {
    conditions.push(
      or(
        like(auditLog.actorLabel, `%${search}%`),
        like(auditLog.resourceId, `%${search}%`)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const entries = await db
    .select()
    .from(auditLog)
    .where(whereClause)
    .orderBy(desc(auditLog.timestamp))
    .limit(limit)
    .offset(offset);

  if (format === "csv") {
    const csvRows = [
      ["timestamp", "actorType", "actorLabel", "action", "resourceType", "resourceId", "recruitmentId", "ipAddress"].join(","),
      ...entries.map((e) =>
        [
          e.timestamp.toISOString(),
          e.actorType,
          `"${e.actorLabel}"`,
          e.action,
          e.resourceType,
          e.resourceId,
          e.recruitmentId || "",
          e.ipAddress || "",
        ].join(",")
      ),
    ].join("\n");

    return new NextResponse(csvRows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=\"audit-log.csv\"",
      },
    });
  }

  return NextResponse.json({ entries, page, limit });
}
