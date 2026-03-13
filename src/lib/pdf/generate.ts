import { db } from "@/db";
import { slots, recruitments, stages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { renderToBuffer, DocumentProps } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { SlotPdfDocument, DualPageSlotPdfDocument, CompactSlotPdfDocument, TripleSlotPdfDocument, SlotPdfLayout } from "./slot-pdf";
import { signTeacherLink, getStudentRegistrationLink, getTeacherLink } from "@/lib/auth/hmac";
import { getStageName } from "@/lib/stage-name";
import { getRootT } from "@/lib/email/translations";
import React from "react";

function formatStageDate(date: Date): string {
  const datePart = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${datePart}, ${hours}:${minutes}`;
}

async function generateQrBase64(url: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  // Remove data:image/png;base64, prefix
  return dataUrl.split(",")[1];
}

export async function generateSlotsPdf(recruitmentId: string, layout: SlotPdfLayout = "single", locale: string = "en"): Promise<Buffer> {
  // Fetch recruitment info
  const [recruitment] = await db
    .select()
    .from(recruitments)
    .where(eq(recruitments.id, recruitmentId))
    .limit(1);

  if (!recruitment) {
    throw new Error("Recruitment not found");
  }

  // Fetch all slots ordered by number
  const allSlots = await db
    .select()
    .from(slots)
    .where(eq(slots.recruitmentId, recruitmentId))
    .orderBy(asc(slots.number));

  // Fetch all stages ordered by order
  const allStages = await db
    .select()
    .from(stages)
    .where(eq(stages.recruitmentId, recruitmentId))
    .orderBy(asc(stages.order));

  if (allSlots.length === 0) {
    throw new Error("No slots found for this recruitment");
  }

  // Build slot page data with QR codes
  const slotPageData = await Promise.all(
    allSlots.map(async (slot) => {
      const registrationLink = getStudentRegistrationLink(slot.id);
      const teacherLink = getTeacherLink(slot.id);

      const [registrationQrBase64, teacherQrBase64] = await Promise.all([
        generateQrBase64(registrationLink),
        generateQrBase64(teacherLink),
      ]);

      return {
        slotId: slot.id,
        slotNumber: slot.number,
        recruitmentName: recruitment.name,
        recruitmentDescription: recruitment.description,
        stages: allStages.map((s) => ({
          name: getStageName(s, getRootT(locale)),
          startDate: formatStageDate(s.startDate),
          endDate: formatStageDate(s.endDate),
        })),
        registrationLink,
        teacherLink,
        registrationQrBase64,
        teacherQrBase64,
      };
    })
  );

  // Render PDF to buffer
  const PdfComponent =
    layout === "dual" ? DualPageSlotPdfDocument :
    layout === "compact" ? CompactSlotPdfDocument :
    layout === "triple" ? TripleSlotPdfDocument :
    SlotPdfDocument;
  const element = React.createElement(PdfComponent, { slots: slotPageData }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  return Buffer.from(buffer);
}
