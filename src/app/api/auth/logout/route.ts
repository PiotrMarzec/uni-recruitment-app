import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  const session = await getSessionFromRequest(req, res);
  session.destroy();
  return res;
}
