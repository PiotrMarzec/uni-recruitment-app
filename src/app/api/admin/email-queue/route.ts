import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emailQueue } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { desc, and, like, or, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search");
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = (page - 1) * limit;

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        like(emailQueue.to, `%${search}%`),
        like(emailQueue.subject, `%${search}%`)
      )
    );
  }

  if (status) {
    conditions.push(eq(emailQueue.status, status as "pending" | "processing" | "sent" | "failed"));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const entries = await db
    .select()
    .from(emailQueue)
    .where(whereClause)
    .orderBy(desc(emailQueue.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ entries, page, limit });
}
