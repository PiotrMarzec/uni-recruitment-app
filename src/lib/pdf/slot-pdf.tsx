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

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  // Full-width centered bar
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
  stagesSection: {
    marginBottom: 12,
  },
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
  stageName: {
    fontSize: 10,
    color: "#1a1a1a",
    flex: 1,
  },
  stageDateColumn: {
    fontSize: 10,
    color: "#555555",
    width: 130,
    textAlign: "right",
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    marginVertical: 14,
  },
  label: {
    fontSize: 10,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    fontSize: 10,
    color: "#1a1a1a",
    marginBottom: 14,
    wordBreak: "break-all",
  },
  qrContainer: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 16,
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  instructionsSection: {
    marginTop: 12,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 10,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  instructionRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  instructionNumber: {
    fontSize: 10,
    color: "#1a1a1a",
    fontFamily: "Helvetica-Bold",
    width: 18,
    flexShrink: 0,
  },
  instructionText: {
    fontSize: 10,
    color: "#1a1a1a",
    lineHeight: 1.4,
    flex: 1,
  },
  instructionEmphasis: {
    fontFamily: "Helvetica-Bold",
  },
  slotNumberBottom: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slotNumberText: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
  },
  slotLabel: {
    fontSize: 10,
    color: "#aaaaaa",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  // Teacher page specific
  teacherPage: {
    backgroundColor: "#ffffff",
  },
  slotNumberTopTeacher: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    marginVertical: 12,
    color: "#1a1a1a",
  },
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
        <React.Fragment key={slot.slotId}>
          {/* Student Registration Page */}
          <Page size="A4" style={styles.page}>
            <Text style={styles.headerBar}>Student Registration</Text>

            <Text style={styles.recruitmentName}>{slot.recruitmentName}</Text>

            {slot.recruitmentDescription ? (
              <Text style={styles.description}>{slot.recruitmentDescription}</Text>
            ) : null}

            {slot.stages.length > 0 && (
              <View style={styles.stagesSection}>
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

            <View style={styles.divider} />

            <Text style={styles.label}>Registration Link</Text>
            <Text style={styles.value}>{slot.registrationLink}</Text>

            <View style={styles.qrContainer}>
              <Image
                src={`data:image/png;base64,${slot.registrationQrBase64}`}
                style={styles.qrImage}
              />
            </View>

            <View style={styles.instructionsSection}>
              <Text style={styles.instructionsTitle}>How to register</Text>
              {[
                { n: "1.", text: "Scan the above QR on your mobile device to start your registration process." },
                { n: "2.", text: "Fill out the steps, and complete the registration in order to participate in the recruitment." },
                { n: "3.", text: "After your registration is complete, you will receive an email with a confirmation." },
                { n: "4.", text: "After each stage is finished you will receive relevant updates via email as well." },
                { n: "5.", text: "Do not lose this page." },
                { n: "6.", text: "Use the above QR code to edit your registration details." },
              ].map((item) => (
                <View key={item.n} style={styles.instructionRow}>
                  <Text style={styles.instructionNumber}>{item.n}</Text>
                  <Text style={styles.instructionText}>{item.text}</Text>
                </View>
              ))}
            </View>

            {/* Slot number at the bottom */}
            <View style={styles.slotNumberBottom}>
              <Text style={styles.slotLabel}>Slot</Text>
              <Text style={styles.slotNumberText}>#{slot.slotNumber}</Text>
            </View>
          </Page>

          {/* Teacher Management Page */}
          <Page size="A4" style={[styles.page, styles.teacherPage]}>
            <Text style={styles.teacherHeaderBar}>Teacher Management</Text>

            <Text style={styles.recruitmentName}>{slot.recruitmentName}</Text>
            <Text style={styles.slotNumberTopTeacher}>Slot #{slot.slotNumber}</Text>

            <View style={styles.divider} />

            <Text style={styles.label}>Management Link</Text>
            <Link src={slot.teacherLink} style={styles.value}>{slot.teacherLink}</Link>

            {/* QR at the bottom for visual distinction */}
            <View style={styles.teacherQrContainer}>
              <Text style={styles.teacherQrLabel}>Scan to manage this slot</Text>
              <Image
                src={`data:image/png;base64,${slot.teacherQrBase64}`}
                style={styles.qrImage}
              />
            </View>

            <Text style={styles.footer}>
              CONFIDENTIAL — For authorized university staff only. Do not share this link publicly.
            </Text>
          </Page>
        </React.Fragment>
      ))}
    </Document>
  );
}
