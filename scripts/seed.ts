/**
 * Seed script — inserts stable mock data for development and testing.
 *
 * All records use fixed UUIDs (defined in seed-data.ts) so the operation is
 * idempotent: re-running the script is safe and will not duplicate data.
 *
 * Usage:
 *   npm run seed
 *
 * What is created:
 *   • 3 recruitments (Spring Erasmus, Winter Erasmus, Uni Exchange)
 *   • 4 stages per recruitment (initial → admin → supplementary → admin)
 *     Initial stage is "active"; all others are "pending"
 *   • 10 destinations for Spring and Winter Erasmus (identical names, separate records)
 *   • 4 destinations for Uni Exchange
 *   • 10 slots per recruitment (slots 0–4 registered, slots 5–9 open)
 *   • 5 users per recruitment (15 total, each unique)
 *   • 5 completed registrations per recruitment with teacher scores
 *   • 5 stage-enrollments per recruitment (initial stage)
 */

import { db } from "../src/db";
import {
  recruitments,
  stages,
  destinations,
  slots,
  users,
  registrations,
  stageEnrollments,
} from "../src/db/schema";
import {
  SEED_DATE_D0,
  SEED_DATE_D1,
  SEED_DATE_D2,
  SEED_DATE_D3,
  SEED_DATE_D4,
  SPRING_RECRUITMENT_ID,
  WINTER_RECRUITMENT_ID,
  EXCHANGE_RECRUITMENT_ID,
  SPRING_STAGE_INITIAL_ID,
  SPRING_STAGE_ADMIN1_ID,
  SPRING_STAGE_SUPP_ID,
  SPRING_STAGE_ADMIN2_ID,
  WINTER_STAGE_INITIAL_ID,
  WINTER_STAGE_ADMIN1_ID,
  WINTER_STAGE_SUPP_ID,
  WINTER_STAGE_ADMIN2_ID,
  EXCHANGE_STAGE_INITIAL_ID,
  EXCHANGE_STAGE_ADMIN1_ID,
  EXCHANGE_STAGE_SUPP_ID,
  EXCHANGE_STAGE_ADMIN2_ID,
  SPRING_DEST_LONDON_ID,
  SPRING_DEST_BERLIN_ID,
  SPRING_DEST_MADRID_ID,
  SPRING_DEST_BRUSSELS_ID,
  SPRING_DEST_BARCELONA_ID,
  SPRING_DEST_MANCHESTER_ID,
  SPRING_DEST_UTRECHT_ID,
  SPRING_DEST_PARIS_ID,
  SPRING_DEST_WROCLAW_ID,
  SPRING_DEST_LISBON_ID,
  WINTER_DEST_LONDON_ID,
  WINTER_DEST_BERLIN_ID,
  WINTER_DEST_MADRID_ID,
  WINTER_DEST_BRUSSELS_ID,
  WINTER_DEST_BARCELONA_ID,
  WINTER_DEST_MANCHESTER_ID,
  WINTER_DEST_UTRECHT_ID,
  WINTER_DEST_PARIS_ID,
  WINTER_DEST_WROCLAW_ID,
  WINTER_DEST_LISBON_ID,
  EXCHANGE_DEST_UTRECHT_ID,
  EXCHANGE_DEST_PARIS_ID,
  EXCHANGE_DEST_WROCLAW_ID,
  EXCHANGE_DEST_LISBON_ID,
  SPRING_SLOT_IDS,
  WINTER_SLOT_IDS,
  EXCHANGE_SLOT_IDS,
  SPRING_REG_IDS,
  WINTER_REG_IDS,
  EXCHANGE_REG_IDS,
  SPRING_ENROLLMENT_IDS,
  WINTER_ENROLLMENT_IDS,
  EXCHANGE_ENROLLMENT_IDS,
  STUDENT_PROFILES,
} from "./seed-data";

// ─── helpers ─────────────────────────────────────────────────────────────────

const json = (v: unknown) => JSON.stringify(v);

// ─── seed ────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding database with mock data...\n");

  // ── 1. Recruitments ─────────────────────────────────────────────────────────

  console.log("  Inserting recruitments...");
  await db
    .insert(recruitments)
    .values([
      {
        id: SPRING_RECRUITMENT_ID,
        name: "2026 Spring semester Erasmus",
        description: "Erasmus student exchange program for the spring semester of 2026.",
        startDate: SEED_DATE_D0,
        endDate: SEED_DATE_D4,
        maxDestinationChoices: 5,
      },
      {
        id: WINTER_RECRUITMENT_ID,
        name: "2026 Winter semester Erasmus",
        description: "Erasmus student exchange program for the winter semester of 2026.",
        startDate: SEED_DATE_D0,
        endDate: SEED_DATE_D4,
        maxDestinationChoices: 5,
      },
      {
        id: EXCHANGE_RECRUITMENT_ID,
        name: "2026 Uni Exchange",
        description: "University bilateral exchange program 2026.",
        startDate: SEED_DATE_D0,
        endDate: SEED_DATE_D4,
        maxDestinationChoices: 3,
      },
    ])
    .onConflictDoNothing();

  // ── 2. Stages ────────────────────────────────────────────────────────────────

  console.log("  Inserting stages...");
  await db
    .insert(stages)
    .values([
      // Spring Erasmus
      {
        id: SPRING_STAGE_INITIAL_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Initial Registration",
        description: "Students register via slot links during this stage.",
        startDate: SEED_DATE_D0,
        endDate: SEED_DATE_D1,
        order: 0,
        type: "initial",
        status: "active",
      },
      {
        id: SPRING_STAGE_ADMIN1_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Admin Review",
        description: "Admin reviews registrations and runs the assignment algorithm.",
        startDate: SEED_DATE_D1,
        endDate: SEED_DATE_D2,
        order: 1,
        type: "admin",
        status: "pending",
      },
      {
        id: SPRING_STAGE_SUPP_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Supplementary Registration",
        description: "Students who cancelled can re-register or update preferences.",
        startDate: SEED_DATE_D2,
        endDate: SEED_DATE_D3,
        order: 2,
        type: "supplementary",
        status: "pending",
      },
      {
        id: SPRING_STAGE_ADMIN2_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Admin Review (Supplementary)",
        description: "Final admin review after the supplementary stage.",
        startDate: SEED_DATE_D3,
        endDate: SEED_DATE_D4,
        order: 3,
        type: "admin",
        status: "pending",
      },
      // Winter Erasmus
      {
        id: WINTER_STAGE_INITIAL_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Initial Registration",
        description: "Students register via slot links during this stage.",
        startDate: SEED_DATE_D0,
        endDate: SEED_DATE_D1,
        order: 0,
        type: "initial",
        status: "active",
      },
      {
        id: WINTER_STAGE_ADMIN1_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Admin Review",
        description: "Admin reviews registrations and runs the assignment algorithm.",
        startDate: SEED_DATE_D1,
        endDate: SEED_DATE_D2,
        order: 1,
        type: "admin",
        status: "pending",
      },
      {
        id: WINTER_STAGE_SUPP_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Supplementary Registration",
        description: "Students who cancelled can re-register or update preferences.",
        startDate: SEED_DATE_D2,
        endDate: SEED_DATE_D3,
        order: 2,
        type: "supplementary",
        status: "pending",
      },
      {
        id: WINTER_STAGE_ADMIN2_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Admin Review (Supplementary)",
        description: "Final admin review after the supplementary stage.",
        startDate: SEED_DATE_D3,
        endDate: SEED_DATE_D4,
        order: 3,
        type: "admin",
        status: "pending",
      },
      // Uni Exchange
      {
        id: EXCHANGE_STAGE_INITIAL_ID,
        recruitmentId: EXCHANGE_RECRUITMENT_ID,
        name: "Initial Registration",
        description: "Students register via slot links during this stage.",
        startDate: SEED_DATE_D0,
        endDate: SEED_DATE_D1,
        order: 0,
        type: "initial",
        status: "active",
      },
      {
        id: EXCHANGE_STAGE_ADMIN1_ID,
        recruitmentId: EXCHANGE_RECRUITMENT_ID,
        name: "Admin Review",
        description: "Admin reviews registrations and runs the assignment algorithm.",
        startDate: SEED_DATE_D1,
        endDate: SEED_DATE_D2,
        order: 1,
        type: "admin",
        status: "pending",
      },
      {
        id: EXCHANGE_STAGE_SUPP_ID,
        recruitmentId: EXCHANGE_RECRUITMENT_ID,
        name: "Supplementary Registration",
        description: "Students who cancelled can re-register or update preferences.",
        startDate: SEED_DATE_D2,
        endDate: SEED_DATE_D3,
        order: 2,
        type: "supplementary",
        status: "pending",
      },
      {
        id: EXCHANGE_STAGE_ADMIN2_ID,
        recruitmentId: EXCHANGE_RECRUITMENT_ID,
        name: "Admin Review (Supplementary)",
        description: "Final admin review after the supplementary stage.",
        startDate: SEED_DATE_D3,
        endDate: SEED_DATE_D4,
        order: 3,
        type: "admin",
        status: "pending",
      },
    ])
    .onConflictDoNothing();

  // ── 3. Destinations ──────────────────────────────────────────────────────────

  console.log("  Inserting destinations...");
  await db
    .insert(destinations)
    .values([
      // ── Spring Erasmus ──────────────────────────────────────────────────────
      {
        id: SPRING_DEST_LONDON_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "London Uni",
        slotsMaster: 5,
        slotsBachelor: 5,
        slotsAny: 0,
        requiredLanguages: json(["English"]),
      },
      {
        id: SPRING_DEST_BERLIN_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Berlin Uni",
        slotsMaster: 1,
        slotsBachelor: 1,
        slotsAny: 1,
        requiredLanguages: json(["German"]),
      },
      {
        id: SPRING_DEST_MADRID_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Madrid Uni",
        slotsMaster: 2,
        slotsBachelor: 0,
        slotsAny: 0,
        requiredLanguages: json(["Spanish", "English"]),
      },
      {
        id: SPRING_DEST_BRUSSELS_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Brussels Uni",
        slotsMaster: 0,
        slotsBachelor: 2,
        slotsAny: 0,
        requiredLanguages: json(["English"]),
      },
      {
        id: SPRING_DEST_BARCELONA_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Barcelona Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 3,
        requiredLanguages: json(["Spanish", "English"]),
      },
      {
        id: SPRING_DEST_MANCHESTER_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Manchester Uni",
        slotsMaster: 1,
        slotsBachelor: 1,
        slotsAny: 0,
        requiredLanguages: json(["English"]),
      },
      {
        id: SPRING_DEST_UTRECHT_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Utrecht Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 3,
        requiredLanguages: json(["German"]),
      },
      {
        id: SPRING_DEST_PARIS_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Paris Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 3,
        requiredLanguages: json(["French", "English"]),
      },
      {
        id: SPRING_DEST_WROCLAW_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Wrocław Uni",
        slotsMaster: 5,
        slotsBachelor: 0,
        slotsAny: 0,
        requiredLanguages: json(["Polish"]),
      },
      {
        id: SPRING_DEST_LISBON_ID,
        recruitmentId: SPRING_RECRUITMENT_ID,
        name: "Lisbon Uni",
        slotsMaster: 0,
        slotsBachelor: 5,
        slotsAny: 0,
        requiredLanguages: json(["Portuguese"]),
      },
      // ── Winter Erasmus ──────────────────────────────────────────────────────
      {
        id: WINTER_DEST_LONDON_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "London Uni",
        slotsMaster: 5,
        slotsBachelor: 5,
        slotsAny: 0,
        requiredLanguages: json(["English"]),
      },
      {
        id: WINTER_DEST_BERLIN_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Berlin Uni",
        slotsMaster: 1,
        slotsBachelor: 1,
        slotsAny: 1,
        requiredLanguages: json(["German"]),
      },
      {
        id: WINTER_DEST_MADRID_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Madrid Uni",
        slotsMaster: 2,
        slotsBachelor: 0,
        slotsAny: 0,
        requiredLanguages: json(["Spanish", "English"]),
      },
      {
        id: WINTER_DEST_BRUSSELS_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Brussels Uni",
        slotsMaster: 0,
        slotsBachelor: 2,
        slotsAny: 0,
        requiredLanguages: json(["English"]),
      },
      {
        id: WINTER_DEST_BARCELONA_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Barcelona Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 3,
        requiredLanguages: json(["Spanish", "English"]),
      },
      {
        id: WINTER_DEST_MANCHESTER_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Manchester Uni",
        slotsMaster: 1,
        slotsBachelor: 1,
        slotsAny: 0,
        requiredLanguages: json(["English"]),
      },
      {
        id: WINTER_DEST_UTRECHT_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Utrecht Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 3,
        requiredLanguages: json(["German"]),
      },
      {
        id: WINTER_DEST_PARIS_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Paris Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 3,
        requiredLanguages: json(["French", "English"]),
      },
      {
        id: WINTER_DEST_WROCLAW_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Wrocław Uni",
        slotsMaster: 5,
        slotsBachelor: 0,
        slotsAny: 0,
        requiredLanguages: json(["Polish"]),
      },
      {
        id: WINTER_DEST_LISBON_ID,
        recruitmentId: WINTER_RECRUITMENT_ID,
        name: "Lisbon Uni",
        slotsMaster: 0,
        slotsBachelor: 5,
        slotsAny: 0,
        requiredLanguages: json(["Portuguese"]),
      },
      // ── Uni Exchange ────────────────────────────────────────────────────────
      {
        id: EXCHANGE_DEST_UTRECHT_ID,
        recruitmentId: EXCHANGE_RECRUITMENT_ID,
        name: "Utrecht Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 3,
        requiredLanguages: json(["German"]),
      },
      {
        id: EXCHANGE_DEST_PARIS_ID,
        recruitmentId: EXCHANGE_RECRUITMENT_ID,
        name: "Paris Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 3,
        requiredLanguages: json(["French", "English"]),
      },
      {
        id: EXCHANGE_DEST_WROCLAW_ID,
        recruitmentId: EXCHANGE_RECRUITMENT_ID,
        name: "Wrocław Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 2,
        requiredLanguages: json(["Polish"]),
      },
      {
        id: EXCHANGE_DEST_LISBON_ID,
        recruitmentId: EXCHANGE_RECRUITMENT_ID,
        name: "Lisbon Uni",
        slotsMaster: 0,
        slotsBachelor: 0,
        slotsAny: 2,
        requiredLanguages: json(["Portuguese"]),
      },
    ])
    .onConflictDoNothing();

  // ── 4. Slots ─────────────────────────────────────────────────────────────────

  console.log("  Inserting slots...");

  // Spring students (profiles 0–4 map to slots 0–4)
  const springStudentUserIds = [
    STUDENT_PROFILES[0].userId, // Anna  → slot 0
    STUDENT_PROFILES[1].userId, // Marco → slot 1
    STUDENT_PROFILES[2].userId, // Klaus → slot 2
    STUDENT_PROFILES[3].userId, // Sophie → slot 3
    STUDENT_PROFILES[4].userId, // Jan   → slot 4
  ];

  // Winter students (profiles 5–9 map to slots 0–4)
  const winterStudentUserIds = [
    STUDENT_PROFILES[5].userId,  // Emma   → slot 0
    STUDENT_PROFILES[6].userId,  // Carlos → slot 1
    STUDENT_PROFILES[7].userId,  // Hans   → slot 2
    STUDENT_PROFILES[8].userId,  // Marie  → slot 3
    STUDENT_PROFILES[9].userId,  // Piotr  → slot 4
  ];

  // Exchange students (profiles 10–14 map to slots 0–4)
  const exchangeStudentUserIds = [
    STUDENT_PROFILES[10].userId, // Lena      → slot 0
    STUDENT_PROFILES[11].userId, // Pierre    → slot 1
    STUDENT_PROFILES[12].userId, // Katarzyna → slot 2
    STUDENT_PROFILES[13].userId, // Ana       → slot 3
    STUDENT_PROFILES[14].userId, // Tom       → slot 4
  ];

  const buildSlots = (
    slotIds: readonly string[],
    recruitmentId: string,
    registeredUserIds: string[],
  ) =>
    slotIds.map((id, i) => ({
      id,
      recruitmentId,
      number: i,
      status: (i < registeredUserIds.length ? "registered" : "open") as
        | "registered"
        | "open",
      studentId: i < registeredUserIds.length ? registeredUserIds[i] : null,
    }));

  // Users must exist before slots reference them — insert users first
  console.log("  Inserting users...");
  await db
    .insert(users)
    .values(
      STUDENT_PROFILES.map((p) => ({
        id: p.userId,
        fullName: p.fullName,
        email: p.email,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(slots)
    .values([
      ...buildSlots(SPRING_SLOT_IDS, SPRING_RECRUITMENT_ID, springStudentUserIds),
      ...buildSlots(WINTER_SLOT_IDS, WINTER_RECRUITMENT_ID, winterStudentUserIds),
      ...buildSlots(EXCHANGE_SLOT_IDS, EXCHANGE_RECRUITMENT_ID, exchangeStudentUserIds),
    ])
    .onConflictDoNothing();

  // ── 5. Registrations ─────────────────────────────────────────────────────────

  console.log("  Inserting registrations...");

  const buildRegistrations = (
    regIds: readonly string[],
    slotIds: readonly string[],
    profileIndexStart: number,
    prefKey: "springPreferences" | "winterPreferences" | "exchangePreferences",
  ) =>
    regIds.map((id, i) => {
      const p = STUDENT_PROFILES[profileIndexStart + i];
      const completedAt = new Date(
        SEED_DATE_D0.getTime() + p.registrationCompletedOffsetMs,
      );
      return {
        id,
        slotId: slotIds[i],
        studentId: p.userId,
        emailConsent: true,
        privacyConsent: true,
        level: p.level,
        enrollmentId: p.enrollmentId,
        spokenLanguages: json(p.spokenLanguages),
        destinationPreferences: json(p[prefKey]),
        averageResult: p.averageResult,
        additionalActivities: p.additionalActivities,
        recommendationLetters: p.recommendationLetters,
        registrationCompleted: true,
        registrationCompletedAt: completedAt,
      };
    });

  await db
    .insert(registrations)
    .values([
      ...buildRegistrations(SPRING_REG_IDS, SPRING_SLOT_IDS, 0, "springPreferences"),
      ...buildRegistrations(WINTER_REG_IDS, WINTER_SLOT_IDS, 5, "winterPreferences"),
      ...buildRegistrations(EXCHANGE_REG_IDS, EXCHANGE_SLOT_IDS, 10, "exchangePreferences"),
    ])
    .onConflictDoNothing();

  // ── 6. Stage enrollments (initial stage) ─────────────────────────────────────

  console.log("  Inserting stage enrollments...");

  const buildEnrollments = (
    enrollmentIds: readonly string[],
    regIds: readonly string[],
    initialStageId: string,
  ) =>
    enrollmentIds.map((id, i) => ({
      id,
      stageId: initialStageId,
      registrationId: regIds[i],
    }));

  await db
    .insert(stageEnrollments)
    .values([
      ...buildEnrollments(SPRING_ENROLLMENT_IDS, SPRING_REG_IDS, SPRING_STAGE_INITIAL_ID),
      ...buildEnrollments(WINTER_ENROLLMENT_IDS, WINTER_REG_IDS, WINTER_STAGE_INITIAL_ID),
      ...buildEnrollments(EXCHANGE_ENROLLMENT_IDS, EXCHANGE_REG_IDS, EXCHANGE_STAGE_INITIAL_ID),
    ])
    .onConflictDoNothing();

  console.log("\nSeed complete.");
  console.log("  Recruitments : 3");
  console.log("  Stages       : 12 (4 per recruitment)");
  console.log("  Destinations : 24 (10 + 10 + 4)");
  console.log("  Slots        : 30 (10 per recruitment, 5 registered + 5 open each)");
  console.log("  Users        : 15");
  console.log("  Registrations: 15");
  console.log("  Enrollments  : 15 (initial stage only)");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
