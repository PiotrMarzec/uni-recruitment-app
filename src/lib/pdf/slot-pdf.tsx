import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Link,
} from "@react-pdf/renderer";

const H_PAD = 32;
const CUT_GAP = 16;

const REGISTRATION_INSTRUCTIONS = [
  { n: "1.", text: "Scan the QR code on your mobile device to start your registration." },
  { n: "2.", text: "Fill out all the steps to complete your registration." },
  { n: "3.", text: "After completing your registration you will receive a confirmation email." },
  { n: "4.", text: "You will receive updates about the recruitment process via email." },
  { n: "5.", text: "Do not lose or share this page." },
  { n: "6.", text: "You can use the QR code to update your registration details." },
];

const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
    flexDirection: "column",
  },

  // ── Sections ──────────────────────────────────────────────────────────────
  studentSection: {
    height: "50%",
    flexDirection: "column",
  },
  teacherSection: {
    height: "50%",
    flexDirection: "column",
  },

  // ── Full-width header bars ─────────────────────────────────────────────────
  studentHeaderBar: {
    backgroundColor: "#1a1a1a",
    color: "#ffffff",
    paddingVertical: 9,
    paddingHorizontal: H_PAD,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    textAlign: "center",
  },
  teacherHeaderBar: {
    backgroundColor: "#b45309",
    color: "#ffffff",
    paddingVertical: 9,
    paddingHorizontal: H_PAD,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    textAlign: "center",
  },

  // ── Student: full-width title block ───────────────────────────────────────
  studentTitleBlock: {
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: 6,
  },

  // ── Student: two-column row (stages left, QR right) ──────────────────────
  studentContentRow: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: H_PAD,
    paddingBottom: 4,
  },
  studentLeft: {
    flex: 1,
    paddingRight: 18,
  },
  studentRight: {
    width: 138,
    alignItems: "flex-end",
  },

  // ── Student: bottom strip (link left, slot # right, above cut line) ────────
  studentBottomStrip: {
    paddingHorizontal: H_PAD,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  studentSlotLabel: {
    fontSize: 7,
    color: "#aaaaaa",
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "right",
    marginBottom: 2,
  },
  studentSlotNumber: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    textAlign: "right",
  },
  registrationLink: {
    fontSize: 6.5,
    color: "#333333",
    textAlign: "left",
  },

  // ── Cut / fold line ────────────────────────────────────────────────────────
  cutLine: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#aaaaaa",
  },

  // ── Teacher: spacer below cut line ────────────────────────────────────────
  creaseSpacer: {
    height: CUT_GAP,
  },

  // ── Teacher: two-column content row ───────────────────────────────────────
  teacherContentRow: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: H_PAD,
    paddingTop: 14,
    paddingBottom: 4,
  },
  teacherLeft: {
    width: 138,
    alignItems: "flex-start",
  },
  teacherRight: {
    flex: 1,
    paddingLeft: 18,
  },

  // ── Teacher: bottom-right strip (link, above confidential bar) ────────────
  teacherBottomStrip: {
    paddingHorizontal: H_PAD,
    paddingBottom: 8,
    alignItems: "flex-end",
  },
  managementLink: {
    fontSize: 6.5,
    color: "#333333",
    textAlign: "right",
  },

  // ── Text elements ─────────────────────────────────────────────────────────
  recruitmentName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
    color: "#1a1a1a",
  },
  description: {
    fontSize: 9,
    color: "#444444",
    lineHeight: 1.4,
  },

  // Stages table
  stagesTitle: {
    fontSize: 8,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  stagesHeaderRow: {
    flexDirection: "row",
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    marginBottom: 1,
  },
  stagesHeaderName: {
    fontSize: 7,
    color: "#aaaaaa",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  stagesHeaderDate: {
    fontSize: 7,
    color: "#aaaaaa",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: 86,
    textAlign: "right",
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  stageName: {
    fontSize: 9,
    color: "#1a1a1a",
    flex: 1,
  },
  stageDateColumn: {
    fontSize: 9,
    color: "#555555",
    width: 86,
    textAlign: "right",
  },

  // Instructions
  instructionsTitle: {
    fontSize: 7,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
    marginTop: 8,
  },
  instructionRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  instructionNumber: {
    fontSize: 7,
    color: "#1a1a1a",
    fontFamily: "Helvetica-Bold",
    width: 14,
    flexShrink: 0,
  },
  instructionText: {
    fontSize: 7,
    color: "#1a1a1a",
    lineHeight: 1.35,
    flex: 1,
  },

  // QR images
  qrImage: {
    width: 118,
    height: 118,
  },

  // Teacher left column
  teacherSlotLabel: {
    fontSize: 8,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  teacherSlotNumber: {
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    marginBottom: 8,
  },

  // Confidential bar
  confidentialBar: {
    backgroundColor: "#fef3c7",
    paddingVertical: 7,
    paddingHorizontal: H_PAD,
    fontSize: 8,
    color: "#92400e",
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
});

function RegistrationInstructions() {
  return (
    <>
      <Text style={styles.instructionsTitle}>How to register</Text>
      {REGISTRATION_INSTRUCTIONS.map((item) => (
        <View key={item.n} style={styles.instructionRow}>
          <Text style={styles.instructionNumber}>{item.n}</Text>
          <Text style={styles.instructionText}>{item.text}</Text>
        </View>
      ))}
    </>
  );
}

interface StageInfo {
  name: string;
  startDate: string;
  endDate: string;
}

interface SlotPageData {
  slotId: string;
  slotNumber: number;
  recruitmentName: string;
  recruitmentDescription: string;
  stages: StageInfo[];
  registrationLink: string;
  teacherLink: string;
  registrationQrBase64: string;
  teacherQrBase64: string;
}

interface SlotPdfDocumentProps {
  slots: SlotPageData[];
}

export type SlotPdfLayout = "single" | "dual" | "compact" | "triple";

const dualStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  headerBar: {
    backgroundColor: "#1a1a1a",
    color: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 20,
    marginHorizontal: -40,
    marginTop: -40,
  },
  teacherHeaderBar: {
    backgroundColor: "#b45309",
    color: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 20,
    marginHorizontal: -40,
    marginTop: -40,
  },
  recruitmentName: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    color: "#1a1a1a",
  },
  description: {
    fontSize: 11,
    color: "#444444",
    marginBottom: 12,
    lineHeight: 1.4,
  },
  stagesSection: { marginBottom: 12 },
  stagesTitle: {
    fontSize: 10,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  stagesHeaderRow: {
    flexDirection: "row",
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    marginBottom: 1,
  },
  stagesHeaderName: {
    fontSize: 8,
    color: "#aaaaaa",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  stagesHeaderDate: {
    fontSize: 8,
    color: "#aaaaaa",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: 130,
    textAlign: "right",
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  stageName: { fontSize: 10, color: "#1a1a1a", flex: 1 },
  stageDateColumn: { fontSize: 10, color: "#555555", width: 130, textAlign: "right" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#dddddd", marginVertical: 14 },
  label: {
    fontSize: 10,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: { fontSize: 10, color: "#1a1a1a", marginBottom: 14, wordBreak: "break-all" },
  qrContainer: { alignItems: "center", marginTop: 16, marginBottom: 16 },
  qrImage: { width: 180, height: 180 },
  instructionsSection: { marginTop: 12, marginBottom: 16 },
  instructionsTitle: {
    fontSize: 10,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  instructionRow: { flexDirection: "row", marginBottom: 5 },
  instructionNumber: { fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica-Bold", width: 18, flexShrink: 0 },
  instructionText: { fontSize: 10, color: "#1a1a1a", lineHeight: 1.4, flex: 1 },
  slotNumberBottom: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slotNumberText: { fontSize: 28, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  slotLabel: { fontSize: 10, color: "#aaaaaa", textTransform: "uppercase", letterSpacing: 1 },
  slotNumberTopTeacher: { fontSize: 36, fontFamily: "Helvetica-Bold", marginVertical: 12, color: "#1a1a1a" },
  teacherQrContainer: {
    alignItems: "center",
    position: "absolute",
    bottom: 60,
    left: 40,
    right: 40,
  },
  teacherQrLabel: {
    fontSize: 10,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 9,
    color: "#aaaaaa",
    textAlign: "center",
  },
});

export function DualPageSlotPdfDocument({ slots }: SlotPdfDocumentProps) {
  return (
    <Document title="Slot Registration Cards" author="Regie">
      {slots.map((slot) => (
        <React.Fragment key={slot.slotId}>
          {/* Student Registration Page */}
          <Page size="A4" style={dualStyles.page}>
            <Text style={dualStyles.headerBar}>Student Registration</Text>
            <Text style={dualStyles.recruitmentName}>{slot.recruitmentName}</Text>
            {slot.recruitmentDescription ? (
              <Text style={dualStyles.description}>{slot.recruitmentDescription}</Text>
            ) : null}
            {slot.stages.length > 0 && (
              <View style={dualStyles.stagesSection}>
                <Text style={dualStyles.stagesTitle}>Recruitment Stages</Text>
                <View style={dualStyles.stagesHeaderRow}>
                  <Text style={dualStyles.stagesHeaderName}>Stage</Text>
                  <Text style={dualStyles.stagesHeaderDate}>From</Text>
                  <Text style={dualStyles.stagesHeaderDate}>To</Text>
                </View>
                {slot.stages.map((stage, i) => (
                  <View key={i} style={dualStyles.stageRow}>
                    <Text style={dualStyles.stageName}>{stage.name}</Text>
                    <Text style={dualStyles.stageDateColumn}>{stage.startDate}</Text>
                    <Text style={dualStyles.stageDateColumn}>{stage.endDate}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={dualStyles.divider} />
            <Text style={dualStyles.label}>Registration Link</Text>
            <Text style={dualStyles.value}>{slot.registrationLink}</Text>
            <View style={dualStyles.qrContainer}>
              <Image
                src={`data:image/png;base64,${slot.registrationQrBase64}`}
                style={dualStyles.qrImage}
              />
            </View>
            <View style={dualStyles.instructionsSection}>
              <Text style={dualStyles.instructionsTitle}>How to register</Text>
              {[
                { n: "1.", text: "Scan the above QR on your mobile device to start your registration process." },
                { n: "2.", text: "Fill out the steps, and complete the registration in order to participate in the recruitment." },
                { n: "3.", text: "After your registration is complete, you will receive an email with a confirmation." },
                { n: "4.", text: "After each stage is finished you will receive relevant updates via email as well." },
                { n: "5.", text: "Do not lose this page." },
                { n: "6.", text: "Use the above QR code to edit your registration details." },
              ].map((item) => (
                <View key={item.n} style={dualStyles.instructionRow}>
                  <Text style={dualStyles.instructionNumber}>{item.n}</Text>
                  <Text style={dualStyles.instructionText}>{item.text}</Text>
                </View>
              ))}
            </View>
            <View style={dualStyles.slotNumberBottom}>
              <Text style={dualStyles.slotLabel}>Slot</Text>
              <Text style={dualStyles.slotNumberText}>#{slot.slotNumber}</Text>
            </View>
          </Page>

          {/* Teacher Management Page */}
          <Page size="A4" style={dualStyles.page}>
            <Text style={dualStyles.teacherHeaderBar}>Teacher Management</Text>
            <Text style={dualStyles.recruitmentName}>{slot.recruitmentName}</Text>
            <Text style={dualStyles.slotNumberTopTeacher}>Slot #{slot.slotNumber}</Text>
            <View style={dualStyles.divider} />
            <Text style={dualStyles.label}>Management Link</Text>
            <Link src={slot.teacherLink} style={dualStyles.value}>{slot.teacherLink}</Link>
            <View style={dualStyles.teacherQrContainer}>
              <Text style={dualStyles.teacherQrLabel}>Scan to manage this slot</Text>
              <Image
                src={`data:image/png;base64,${slot.teacherQrBase64}`}
                style={dualStyles.qrImage}
              />
            </View>
            <Text style={dualStyles.footer}>
              CONFIDENTIAL — For authorized university staff only. Do not share this link publicly.
            </Text>
          </Page>
        </React.Fragment>
      ))}
    </Document>
  );
}

export function CompactSlotPdfDocument({ slots }: SlotPdfDocumentProps) {
  // Pair up slots — two student sections per page
  const pages: [SlotPageData, SlotPageData | null][] = [];
  for (let i = 0; i < slots.length; i += 2) {
    pages.push([slots[i], slots[i + 1] ?? null]);
  }

  function renderStudentSection(slot: SlotPageData, isBottom: boolean) {
    return (
      <View style={styles.studentSection}>
        {isBottom && <View style={styles.creaseSpacer} />}

        <Text style={styles.studentHeaderBar}>Student Registration</Text>

        <View style={styles.studentTitleBlock}>
          <Text style={styles.recruitmentName}>{slot.recruitmentName}</Text>
          {slot.recruitmentDescription ? (
            <Text style={styles.description}>{slot.recruitmentDescription}</Text>
          ) : null}
        </View>

        <View style={styles.studentContentRow}>
          <View style={styles.studentLeft}>
            {slot.stages.length > 0 && (
              <View>
                <Text style={styles.stagesTitle}>Recruitment Stages</Text>
                <View style={styles.stagesHeaderRow}>
                  <Text style={styles.stagesHeaderName}>Stage</Text>
                  <Text style={styles.stagesHeaderDate}>From</Text>
                  <Text style={styles.stagesHeaderDate}>To</Text>
                </View>
                {slot.stages.map((stage, i) => (
                  <View key={i} style={styles.stageRow}>
                    <Text style={styles.stageName}>{stage.name}</Text>
                    <Text style={styles.stageDateColumn}>{stage.startDate}</Text>
                    <Text style={styles.stageDateColumn}>{stage.endDate}</Text>
                  </View>
                ))}
              </View>
            )}
            <RegistrationInstructions />
          </View>

          <View style={styles.studentRight}>
            <Image
              src={`data:image/png;base64,${slot.registrationQrBase64}`}
              style={styles.qrImage}
            />
          </View>
        </View>

        <View style={styles.studentBottomStrip}>
          <Text style={styles.registrationLink}>{slot.registrationLink}</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.studentSlotLabel}>Slot</Text>
            <Text style={styles.studentSlotNumber}>#{slot.slotNumber}</Text>
          </View>
        </View>

        {!isBottom && <View style={styles.cutLine} />}
      </View>
    );
  }

  return (
    <Document title="Slot Registration Cards" author="Regie">
      {pages.map(([topSlot, bottomSlot], pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {renderStudentSection(topSlot, false)}
          {bottomSlot ? renderStudentSection(bottomSlot, true) : null}
        </Page>
      ))}
    </Document>
  );
}

export function TripleSlotPdfDocument({ slots }: SlotPdfDocumentProps) {
  // Group slots three per page
  const pages: [SlotPageData, SlotPageData | null, SlotPageData | null][] = [];
  for (let i = 0; i < slots.length; i += 3) {
    pages.push([slots[i], slots[i + 1] ?? null, slots[i + 2] ?? null]);
  }

  function renderStudentSection(slot: SlotPageData) {
    return (
      <View style={tripleStyles.studentSection}>
        <Text style={styles.studentHeaderBar}>Student Registration</Text>

        <View style={tripleStyles.studentTitleBlock}>
          <Text style={tripleStyles.recruitmentName}>{slot.recruitmentName}</Text>
          {slot.recruitmentDescription ? (
            <Text style={tripleStyles.description}>{slot.recruitmentDescription}</Text>
          ) : null}
        </View>

        <View style={tripleStyles.studentContentRow}>
          <View style={tripleStyles.studentLeft}>
            {slot.stages.length > 0 && (
              <View>
                <Text style={tripleStyles.stagesTitle}>Recruitment Stages</Text>
                <View style={tripleStyles.stagesHeaderRow}>
                  <Text style={tripleStyles.stagesHeaderName}>Stage</Text>
                  <Text style={tripleStyles.stagesHeaderDate}>From</Text>
                  <Text style={tripleStyles.stagesHeaderDate}>To</Text>
                </View>
                {slot.stages.map((stage, i) => (
                  <View key={i} style={tripleStyles.stageRow}>
                    <Text style={tripleStyles.stageName}>{stage.name}</Text>
                    <Text style={tripleStyles.stageDateColumn}>{stage.startDate}</Text>
                    <Text style={tripleStyles.stageDateColumn}>{stage.endDate}</Text>
                  </View>
                ))}
              </View>
            )}
            <RegistrationInstructions />
          </View>

          <View style={tripleStyles.studentRight}>
            <Image
              src={`data:image/png;base64,${slot.registrationQrBase64}`}
              style={tripleStyles.qrImage}
            />
          </View>
        </View>

        <View style={tripleStyles.studentBottomStrip}>
          <Text style={tripleStyles.registrationLink}>{slot.registrationLink}</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={tripleStyles.studentSlotLabel}>Slot</Text>
            <Text style={tripleStyles.studentSlotNumber}>#{slot.slotNumber}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <Document title="Slot Registration Cards" author="Regie">
      {pages.map(([s1, s2, s3], pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {renderStudentSection(s1)}
          {s2 ? renderStudentSection(s2) : null}
          {s3 ? renderStudentSection(s3) : null}
        </Page>
      ))}
    </Document>
  );
}

const tripleStyles = StyleSheet.create({
  studentSection: {
    height: "33.333%",
    flexDirection: "column",
  },
  studentTitleBlock: {
    paddingHorizontal: H_PAD,
    paddingTop: 5,
    paddingBottom: 3,
  },
  recruitmentName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    color: "#1a1a1a",
  },
  description: {
    fontSize: 7,
    color: "#444444",
    lineHeight: 1.3,
  },
  studentContentRow: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: H_PAD,
    paddingBottom: 2,
  },
  studentLeft: {
    flex: 1,
    paddingRight: 12,
  },
  studentRight: {
    width: 90,
    alignItems: "flex-end",
  },
  qrImage: {
    width: 86,
    height: 86,
  },
  studentBottomStrip: {
    paddingHorizontal: H_PAD,
    paddingBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  studentSlotLabel: {
    fontSize: 6,
    color: "#aaaaaa",
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "right",
    marginBottom: 1,
  },
  studentSlotNumber: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    textAlign: "right",
  },
  registrationLink: {
    fontSize: 6,
    color: "#333333",
    textAlign: "left",
  },
  stagesTitle: {
    fontSize: 7,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  stagesHeaderRow: {
    flexDirection: "row",
    paddingBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    marginBottom: 1,
  },
  stagesHeaderName: {
    fontSize: 6,
    color: "#aaaaaa",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  stagesHeaderDate: {
    fontSize: 6,
    color: "#aaaaaa",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: 72,
    textAlign: "right",
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  stageName: {
    fontSize: 7,
    color: "#1a1a1a",
    flex: 1,
  },
  stageDateColumn: {
    fontSize: 7,
    color: "#555555",
    width: 72,
    textAlign: "right",
  },
});

export function SlotPdfDocument({ slots }: SlotPdfDocumentProps) {
  return (
    <Document
      title="Slot Registration Cards"
      author="Regie"
    >
      {slots.map((slot) => (
        <Page key={slot.slotId} size="A4" style={styles.page}>

          {/* ════ STUDENT REGISTRATION — top half ════ */}
          <View style={styles.studentSection}>
            <Text style={styles.studentHeaderBar}>Student Registration</Text>

            {/* Title + description: full width */}
            <View style={styles.studentTitleBlock}>
              <Text style={styles.recruitmentName}>{slot.recruitmentName}</Text>
              {slot.recruitmentDescription ? (
                <Text style={styles.description}>{slot.recruitmentDescription}</Text>
              ) : null}
            </View>

            {/* Two columns: stages (left) | QR (right) */}
            <View style={styles.studentContentRow}>
              <View style={styles.studentLeft}>
                {slot.stages.length > 0 && (
                  <View>
                    <Text style={styles.stagesTitle}>Recruitment Stages</Text>
                    <View style={styles.stagesHeaderRow}>
                      <Text style={styles.stagesHeaderName}>Stage</Text>
                      <Text style={styles.stagesHeaderDate}>From</Text>
                      <Text style={styles.stagesHeaderDate}>To</Text>
                    </View>
                    {slot.stages.map((stage, i) => (
                      <View key={i} style={styles.stageRow}>
                        <Text style={styles.stageName}>{stage.name}</Text>
                        <Text style={styles.stageDateColumn}>{stage.startDate}</Text>
                        <Text style={styles.stageDateColumn}>{stage.endDate}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <RegistrationInstructions />
              </View>

              <View style={styles.studentRight}>
                <Image
                  src={`data:image/png;base64,${slot.registrationQrBase64}`}
                  style={styles.qrImage}
                />
              </View>
            </View>

            {/* Bottom strip: link (left) + slot # (right), above cut line */}
            <View style={styles.studentBottomStrip}>
              <Text style={styles.registrationLink}>{slot.registrationLink}</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.studentSlotLabel}>Slot</Text>
                <Text style={styles.studentSlotNumber}>#{slot.slotNumber}</Text>
              </View>
            </View>

            {/* Dotted cut/fold line at exact half-height */}
            <View style={styles.cutLine} />
          </View>

          {/* ════ TEACHER MANAGEMENT — bottom half ════ */}
          <View style={styles.teacherSection}>
            <View style={styles.creaseSpacer} />

            <Text style={styles.teacherHeaderBar}>Teacher Management</Text>

            <View style={styles.teacherContentRow}>
              <View style={styles.teacherLeft}>
                <Image
                  src={`data:image/png;base64,${slot.teacherQrBase64}`}
                  style={styles.qrImage}
                />
              </View>

              <View style={styles.teacherRight}>
                <Text style={styles.teacherSlotLabel}>Slot</Text>
                <Text style={styles.teacherSlotNumber}>#{slot.slotNumber}</Text>
                <Text style={styles.recruitmentName}>{slot.recruitmentName}</Text>
              </View>
            </View>

            {/* Management link: bottom-right, above confidential bar */}
            <View style={styles.teacherBottomStrip}>
              <Text style={styles.managementLink}>{slot.teacherLink}</Text>
            </View>

            <Text style={styles.confidentialBar}>
              CONFIDENTIAL — For authorized university staff only. Do not share this link publicly.
            </Text>
          </View>

        </Page>
      ))}
    </Document>
  );
}
