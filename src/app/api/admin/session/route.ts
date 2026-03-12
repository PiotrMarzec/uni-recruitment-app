import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ userId: admin.userId, email: admin.email, name: admin.name });
}
