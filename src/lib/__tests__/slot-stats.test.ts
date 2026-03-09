import { describe, it, expect } from "vitest";
import { computeSlotStats } from "../slot-stats";

describe("computeSlotStats", () => {
  it("counts open slots correctly", () => {
    const rows = [
      { status: "open", registrationCompleted: null },
      { status: "open", registrationCompleted: null },
    ];
    expect(computeSlotStats(rows)).toEqual({
      totalSlots: 2,
      openSlots: 2,
      registeredSlots: 0,
      startedSlots: 0,
    });
  });

  it("counts a normally completed registration as registered", () => {
    // Typical flow: slot is "registered", registration is completed
    const rows = [
      { status: "registered", registrationCompleted: true },
      { status: "open", registrationCompleted: null },
    ];
    expect(computeSlotStats(rows)).toMatchObject({
      openSlots: 1,
      registeredSlots: 1,
      startedSlots: 0,
    });
  });

  it("counts an in-progress registration (OTP started, not completed) as startedSlots", () => {
    const rows = [
      { status: "registration_started", registrationCompleted: false },
      { status: "registered", registrationCompleted: true },
    ];
    expect(computeSlotStats(rows)).toMatchObject({
      registeredSlots: 1,
      startedSlots: 1,
    });
  });

  it("counts slot as registered (not in-progress) when student re-opens a completed registration link", () => {
    // Bug scenario: student re-opens their completed registration link which
    // reverts slot.status to "registration_started", but registrationCompleted
    // is still true.  The slot must NOT count as "In Progress".
    const rows = [
      { status: "registration_started", registrationCompleted: true },  // re-opened
      { status: "registered", registrationCompleted: true },
      { status: "registered", registrationCompleted: true },
      { status: "registered", registrationCompleted: true },
      { status: "registered", registrationCompleted: true },
    ];
    const stats = computeSlotStats(rows);
    expect(stats.registeredSlots).toBe(5);
    expect(stats.startedSlots).toBe(0);
  });

  it("treats registration_started with null registrationCompleted as in-progress", () => {
    // Slot opened link but hasn't reached OTP step yet — no registration row exists
    const rows = [{ status: "registration_started", registrationCompleted: null }];
    expect(computeSlotStats(rows)).toMatchObject({
      registeredSlots: 0,
      startedSlots: 1,
    });
  });

  it("returns correct totals for a mixed set", () => {
    const rows = [
      { status: "open", registrationCompleted: null },           // open
      { status: "open", registrationCompleted: null },           // open
      { status: "registration_started", registrationCompleted: null },  // in progress
      { status: "registration_started", registrationCompleted: true },  // re-edit of completed
      { status: "registered", registrationCompleted: true },    // completed normally
    ];
    expect(computeSlotStats(rows)).toEqual({
      totalSlots: 5,
      openSlots: 2,
      startedSlots: 1,
      registeredSlots: 2,
    });
  });
});
