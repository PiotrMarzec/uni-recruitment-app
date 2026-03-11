import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

const H_PAD = 32;
const CUT_GAP = 16;

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
    flex: 1,
    paddingRight: 18,
  },
  teacherRight: {
    width: 138,
    alignItems: "flex-start",
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

export function SlotPdfDocument({ slots }: SlotPdfDocumentProps) {
  return (
    <Document
      title="Slot Registration Cards"
      author="University Recruitment System"
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
                <Text style={styles.teacherSlotLabel}>Slot</Text>
                <Text style={styles.teacherSlotNumber}>#{slot.slotNumber}</Text>
                <Text style={styles.recruitmentName}>{slot.recruitmentName}</Text>
              </View>

              <View style={styles.teacherRight}>
                <Image
                  src={`data:image/png;base64,${slot.teacherQrBase64}`}
                  style={styles.qrImage}
                />
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
