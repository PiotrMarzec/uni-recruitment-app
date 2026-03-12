import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { generateSlotsPdf } from "@/lib/pdf/generate";
import type { SlotPdfLayout } from "@/lib/pdf/slot-pdf";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const layoutParam = req.nextUrl.searchParams.get("layout");
  const layout: SlotPdfLayout =
    layoutParam === "dual" ? "dual" :
    layoutParam === "compact" ? "compact" :
    layoutParam === "triple" ? "triple" :
    "single";

  try {
    const pdfBuffer = await generateSlotsPdf(id, layout);

    await logAuditEvent({
      actorType: "admin",
      actorId: admin.userId,
      actorLabel: admin.email,
      action: ACTIONS.BULK_PDF_GENERATED,
      resourceType: "recruitment",
      resourceId: id,
      recruitmentId: id,
      details: {},
      ipAddress: getIpAddress(req),
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="slots-${id}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
