import { db } from "@/db";
import { slots, recruitments, stages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { renderToBuffer, DocumentProps } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { SlotPdfDocument } from "./slot-pdf";
import { signTeacherLink, getStudentRegistrationLink, getTeacherLink } from "@/lib/auth/hmac";
import React from "react";

async function generateQrBase64(url: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  // Remove data:image/png;base64, prefix
  return dataUrl.split(",")[1];
}

export async function generateSlotsPdf(recruitmentId: string): Promise<Buffer> {
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
          name: s.name,
          startDate: s.startDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          endDate: s.endDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        })),
        registrationLink,
        teacherLink,
        registrationQrBase64,
        teacherQrBase64,
      };
    })
  );

  // Render PDF to buffer
  const element = React.createElement(SlotPdfDocument, { slots: slotPageData }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  return Buffer.from(buffer);
}
