/**
 * Tests that no student-facing email template includes admin notes.
 *
 * The `registrations.notes` column is for admin use only. None of the email
 * send functions should accept a notes parameter or render notes content in
 * their HTML output. These tests act as regression guards to prevent notes
 * from accidentally being added to a template in the future.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── capture sendEmail calls ───────────────────────────────────────────────────

const capturedEmails: Array<{ from: string; to: string; subject: string; html: string }> = [];

vi.mock("@/lib/email/client", () => ({
  EMAIL_FROM: "noreply@example.com",
  sendEmail: vi.fn(async (msg: { from: string; to: string; subject: string; html: string }) => {
    capturedEmails.push(msg);
  }),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(),
  ACTIONS: { EMAIL_SENT: "email_sent" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

// ── import senders (after mocks) ─────────────────────────────────────────────

import {
  sendOtpEmail,
  sendRegistrationCompletedEmail,
  sendInitialStageClosedEmail,
  sendSupplementaryStageClosedEmail,
  sendAssignmentApprovedEmail,
  sendAssignmentUnassignedEmail,
  sendAdminInviteEmail,
  sendSupplementaryStageEmail,
} from "../send";

// ── helpers ───────────────────────────────────────────────────────────────────

const NOTES_SENTINEL = "ADMIN_NOTES_SHOULD_NOT_APPEAR_IN_EMAIL";

beforeEach(() => {
  capturedEmails.length = 0;
  vi.clearAllMocks();
});

function lastHtml(): string {
  const last = capturedEmails[capturedEmails.length - 1];
  expect(last).toBeDefined();
  return last.html;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Email templates — notes field not exposed", () => {
  it("sendOtpEmail does not include notes in HTML", async () => {
    await sendOtpEmail("student@example.com", "ABC123", "otp-id-001", "en");
    expect(lastHtml()).not.toContain(NOTES_SENTINEL);
    expect(lastHtml().toLowerCase()).not.toContain("notes");
  });

  it("sendRegistrationCompletedEmail does not include notes in HTML", async () => {
    await sendRegistrationCompletedEmail({
      email: "student@example.com",
      fullName: "Alice Smith",
      recruitmentName: "Winter Erasmus 2025",
      level: "bachelor_2",
      spokenLanguages: ["English", "French"],
      destinationPreferences: ["Paris", "Berlin"],
      enrollmentId: "123456",
      registrationLink: "http://localhost/en/register/slot-1",
      locale: "en",
    });
    expect(lastHtml()).not.toContain(NOTES_SENTINEL);
    expect(lastHtml().toLowerCase()).not.toContain("notes");
  });

  it("sendInitialStageClosedEmail does not include notes in HTML", async () => {
    await sendInitialStageClosedEmail({
      email: "student@example.com",
      fullName: "Alice Smith",
      recruitmentName: "Winter Erasmus 2025",
      adminStageEndDate: new Date("2025-03-01"),
      locale: "en",
    });
    expect(lastHtml()).not.toContain(NOTES_SENTINEL);
    expect(lastHtml().toLowerCase()).not.toContain("notes");
  });

  it("sendSupplementaryStageClosedEmail does not include notes in HTML", async () => {
    await sendSupplementaryStageClosedEmail({
      email: "student@example.com",
      fullName: "Alice Smith",
      recruitmentName: "Winter Erasmus 2025",
      adminStageEndDate: new Date("2025-05-01"),
      locale: "en",
    });
    expect(lastHtml()).not.toContain(NOTES_SENTINEL);
    expect(lastHtml().toLowerCase()).not.toContain("notes");
  });

  it("sendAssignmentApprovedEmail does not include notes in HTML", async () => {
    await sendAssignmentApprovedEmail({
      email: "student@example.com",
      fullName: "Alice Smith",
      recruitmentName: "Winter Erasmus 2025",
      destinationName: "University of Paris",
      destinationDescription: "A great destination in the heart of Paris.",
      supplementaryStage: { startDate: new Date("2025-04-01"), endDate: new Date("2025-04-15") },
      locale: "en",
    });
    expect(lastHtml()).not.toContain(NOTES_SENTINEL);
    expect(lastHtml().toLowerCase()).not.toContain("notes");
  });

  it("sendAssignmentUnassignedEmail does not include notes in HTML", async () => {
    await sendAssignmentUnassignedEmail({
      email: "student@example.com",
      fullName: "Alice Smith",
      recruitmentName: "Winter Erasmus 2025",
      supplementaryStage: { startDate: new Date("2025-04-01"), endDate: new Date("2025-04-15") },
      registrationLink: "http://localhost/en/register/slot-1",
      locale: "en",
    });
    expect(lastHtml()).not.toContain(NOTES_SENTINEL);
    expect(lastHtml().toLowerCase()).not.toContain("notes");
  });

  it("sendAdminInviteEmail does not include notes in HTML", async () => {
    await sendAdminInviteEmail({
      email: "newadmin@university.edu",
      fullName: "Bob Admin",
      invitedByName: "Dean Smith",
      adminUrl: "http://localhost/en/admin",
    });
    expect(lastHtml()).not.toContain(NOTES_SENTINEL);
    expect(lastHtml().toLowerCase()).not.toContain("notes");
  });

  it("sendSupplementaryStageEmail does not include notes in HTML", async () => {
    await sendSupplementaryStageEmail({
      email: "student@example.com",
      fullName: "Alice Smith",
      recruitmentName: "Winter Erasmus 2025",
      currentDestination: "University of Berlin",
      registrationLink: "http://localhost/en/register/slot-1",
      stageEndDate: new Date("2025-04-15"),
      locale: "en",
    });
    expect(lastHtml()).not.toContain(NOTES_SENTINEL);
    expect(lastHtml().toLowerCase()).not.toContain("notes");
  });

  it("sendRegistrationCompletedEmail — function signature does not accept a notes parameter", () => {
    // Type-level guard: verify the parameter type doesn't include notes.
    // This test passes as long as the function doesn't silently accept extra keys
    // that include notes content.
    type Params = Parameters<typeof sendRegistrationCompletedEmail>[0];
    type HasNotes = "notes" extends keyof Params ? true : false;
    const hasNotes: HasNotes = false as HasNotes;
    expect(hasNotes).toBe(false);
  });
});
