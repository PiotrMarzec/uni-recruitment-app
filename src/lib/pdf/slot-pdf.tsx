import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  header: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  subheader: {
    fontSize: 14,
    color: "#555555",
    marginBottom: 4,
  },
  slotNumber: {
    fontSize: 48,
    fontFamily: "Helvetica-Bold",
    marginVertical: 16,
    color: "#1a1a1a",
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    marginVertical: 16,
  },
  label: {
    fontSize: 10,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    fontSize: 12,
    color: "#1a1a1a",
    marginBottom: 16,
    wordBreak: "break-all",
  },
  qrContainer: {
    alignItems: "center",
    marginTop: 24,
  },
  qrImage: {
    width: 180,
    height: 180,
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
  studentPage: {
    backgroundColor: "#ffffff",
  },
  teacherPage: {
    backgroundColor: "#fffbf0",
  },
  badge: {
    backgroundColor: "#1a1a1a",
    color: "#ffffff",
    padding: "4 12",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 20,
    alignSelf: "flex-start",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  teacherBadge: {
    backgroundColor: "#b45309",
    color: "#ffffff",
    padding: "4 12",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 20,
    alignSelf: "flex-start",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});

interface SlotPageData {
  slotId: string;
  slotNumber: number;
  recruitmentName: string;
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
          <Page size="A4" style={[styles.page, styles.studentPage]}>
            <View style={styles.badge}>
              <Text>Student Registration</Text>
            </View>

            <Text style={styles.subheader}>{slot.recruitmentName}</Text>
            <Text style={styles.slotNumber}>Slot #{slot.slotNumber}</Text>

            <View style={styles.divider} />

            <Text style={styles.label}>Registration Link</Text>
            <Text style={styles.value}>{slot.registrationLink}</Text>

            <View style={styles.qrContainer}>
              <Image
                src={`data:image/png;base64,${slot.registrationQrBase64}`}
                style={styles.qrImage}
              />
            </View>

            <Text style={styles.footer}>
              Scan the QR code or visit the link above to register for this slot.
            </Text>
          </Page>

          {/* Teacher Management Page */}
          <Page size="A4" style={[styles.page, styles.teacherPage]}>
            <View style={styles.teacherBadge}>
              <Text>Teacher Management</Text>
            </View>

            <Text style={styles.subheader}>{slot.recruitmentName}</Text>
            <Text style={styles.slotNumber}>Slot #{slot.slotNumber}</Text>

            <View style={styles.divider} />

            <Text style={styles.label}>Management Link</Text>
            <Text style={styles.value}>{slot.teacherLink}</Text>

            <View style={styles.qrContainer}>
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
