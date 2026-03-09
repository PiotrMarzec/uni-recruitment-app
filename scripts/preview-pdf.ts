import { renderToBuffer, DocumentProps } from "@react-pdf/renderer";
import { SlotPdfDocument } from "../src/lib/pdf/slot-pdf";
import React from "react";
import { writeFileSync } from "fs";

const mockSlot = {
  slotId: "preview-1",
  slotNumber: 42,
  recruitmentName: "Test recruitment no 1",
  recruitmentDescription: "More details regarding Test recruitment no 1",
  stages: [
    { name: "Initial recruitment stage", startDate: "08 Mar 2026, 23:00", endDate: "09 Mar 2026, 10:07:37" },
    { name: "Admin stage", startDate: "09 Mar 2026, 10:07:37", endDate: "09 Mar 2026, 10:09:54" },
    { name: "Supplementary recruitment stage #1", startDate: "09 Mar 2026, 10:10", endDate: "09 Mar 2026, 10:12:55" },
    { name: "Supplementary admin stage #1", startDate: "09 Mar 2026, 10:12:55", endDate: "09 Mar 2026, 10:13:41" },
    { name: "Supplementary recruitment stage #2", startDate: "11 Mar 2026, 08:00", endDate: "13 Mar 2026, 13:00" },
    { name: "Supplementary admin stage #2", startDate: "13 Mar 2026, 13:01", endDate: "13 Mar 2026, 17:00" },
  ],
  registrationLink: "https://regie.kapibara.cloud/en/register/26a84ece-cb78-47ac-a33e-a60299bf141a",
  teacherLink: "https://regie.kapibara.cloud/en/teacher/26a84ece-cb78-47ac-a33e-a60299bf141a",
  registrationQrBase64: "",
  teacherQrBase64: "",
};

async function main() {
  const element = React.createElement(SlotPdfDocument, { slots: [mockSlot] }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  writeFileSync("/tmp/preview.pdf", Buffer.from(buffer));
  console.log("Preview written to /tmp/preview.pdf");
}

main();
