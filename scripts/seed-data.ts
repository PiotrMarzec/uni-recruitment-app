/**
 * Stable mock data constants for seeding and automated testing.
 * All UUIDs are fixed so tests can reference known IDs.
 *
 * Recruitments:
 *   - SPRING  → "2026 Spring semester Erasmus"
 *   - WINTER  → "2026 Winter semester Erasmus"
 *   - EXCHANGE → "2026 Uni Exchange"
 *
 * Dates (relative to seed date 2026-03-04):
 *   D0  2026-03-04  recruitment start / initial stage start
 *   D1  2026-03-11  initial stage end / admin-1 stage start
 *   D2  2026-03-18  admin-1 stage end / supplementary stage start
 *   D3  2026-03-25  supplementary stage end / admin-2 stage start
 *   D4  2026-04-01  admin-2 stage end / recruitment end
 */

// ─── Dates ───────────────────────────────────────────────────────────────────

export const SEED_DATE_D0 = new Date("2026-03-04T08:00:00Z");
export const SEED_DATE_D1 = new Date("2026-03-11T08:00:00Z");
export const SEED_DATE_D2 = new Date("2026-03-18T08:00:00Z");
export const SEED_DATE_D3 = new Date("2026-03-25T08:00:00Z");
export const SEED_DATE_D4 = new Date("2026-04-01T08:00:00Z");

// ─── Recruitment IDs ─────────────────────────────────────────────────────────

export const SPRING_RECRUITMENT_ID = "10000000-0000-0000-0000-000000000001";
export const WINTER_RECRUITMENT_ID = "10000000-0000-0000-0000-000000000002";
export const EXCHANGE_RECRUITMENT_ID = "10000000-0000-0000-0000-000000000003";

// ─── Stage IDs ───────────────────────────────────────────────────────────────

export const SPRING_STAGE_INITIAL_ID = "20000001-0000-0000-0000-000000000001";
export const SPRING_STAGE_ADMIN1_ID = "20000001-0000-0000-0000-000000000002";
export const SPRING_STAGE_SUPP_ID = "20000001-0000-0000-0000-000000000003";
export const SPRING_STAGE_ADMIN2_ID = "20000001-0000-0000-0000-000000000004";

export const WINTER_STAGE_INITIAL_ID = "20000002-0000-0000-0000-000000000001";
export const WINTER_STAGE_ADMIN1_ID = "20000002-0000-0000-0000-000000000002";
export const WINTER_STAGE_SUPP_ID = "20000002-0000-0000-0000-000000000003";
export const WINTER_STAGE_ADMIN2_ID = "20000002-0000-0000-0000-000000000004";

export const EXCHANGE_STAGE_INITIAL_ID = "20000003-0000-0000-0000-000000000001";
export const EXCHANGE_STAGE_ADMIN1_ID = "20000003-0000-0000-0000-000000000002";
export const EXCHANGE_STAGE_SUPP_ID = "20000003-0000-0000-0000-000000000003";
export const EXCHANGE_STAGE_ADMIN2_ID = "20000003-0000-0000-0000-000000000004";

// ─── Destination IDs — Spring Erasmus ────────────────────────────────────────

export const SPRING_DEST_LONDON_ID = "30000001-0000-0000-0000-000000000001";
export const SPRING_DEST_BERLIN_ID = "30000001-0000-0000-0000-000000000002";
export const SPRING_DEST_MADRID_ID = "30000001-0000-0000-0000-000000000003";
export const SPRING_DEST_BRUSSELS_ID = "30000001-0000-0000-0000-000000000004";
export const SPRING_DEST_BARCELONA_ID = "30000001-0000-0000-0000-000000000005";
export const SPRING_DEST_MANCHESTER_ID = "30000001-0000-0000-0000-000000000006";
export const SPRING_DEST_UTRECHT_ID = "30000001-0000-0000-0000-000000000007";
export const SPRING_DEST_PARIS_ID = "30000001-0000-0000-0000-000000000008";
export const SPRING_DEST_WROCLAW_ID = "30000001-0000-0000-0000-000000000009";
export const SPRING_DEST_LISBON_ID = "30000001-0000-0000-0000-000000000010";

// ─── Destination IDs — Winter Erasmus ────────────────────────────────────────

export const WINTER_DEST_LONDON_ID = "30000002-0000-0000-0000-000000000001";
export const WINTER_DEST_BERLIN_ID = "30000002-0000-0000-0000-000000000002";
export const WINTER_DEST_MADRID_ID = "30000002-0000-0000-0000-000000000003";
export const WINTER_DEST_BRUSSELS_ID = "30000002-0000-0000-0000-000000000004";
export const WINTER_DEST_BARCELONA_ID = "30000002-0000-0000-0000-000000000005";
export const WINTER_DEST_MANCHESTER_ID = "30000002-0000-0000-0000-000000000006";
export const WINTER_DEST_UTRECHT_ID = "30000002-0000-0000-0000-000000000007";
export const WINTER_DEST_PARIS_ID = "30000002-0000-0000-0000-000000000008";
export const WINTER_DEST_WROCLAW_ID = "30000002-0000-0000-0000-000000000009";
export const WINTER_DEST_LISBON_ID = "30000002-0000-0000-0000-000000000010";

// ─── Destination IDs — Uni Exchange ──────────────────────────────────────────

export const EXCHANGE_DEST_UTRECHT_ID = "30000003-0000-0000-0000-000000000001";
export const EXCHANGE_DEST_PARIS_ID = "30000003-0000-0000-0000-000000000002";
export const EXCHANGE_DEST_WROCLAW_ID = "30000003-0000-0000-0000-000000000003";
export const EXCHANGE_DEST_LISBON_ID = "30000003-0000-0000-0000-000000000004";

// ─── User IDs ────────────────────────────────────────────────────────────────
// Spring: users 01–05 | Winter: 06–10 | Exchange: 11–15

export const USER_ANNA_ID = "40000000-0000-0000-0000-000000000001";   // Spring — Anna Kowalski
export const USER_MARCO_ID = "40000000-0000-0000-0000-000000000002";  // Spring — Marco Rodriguez
export const USER_KLAUS_ID = "40000000-0000-0000-0000-000000000003";  // Spring — Klaus Mueller
export const USER_SOPHIE_ID = "40000000-0000-0000-0000-000000000004"; // Spring — Sophie Martin
export const USER_JAN_ID = "40000000-0000-0000-0000-000000000005";    // Spring — Jan Nowak

export const USER_EMMA_ID = "40000000-0000-0000-0000-000000000006";   // Winter — Emma Johnson
export const USER_CARLOS_ID = "40000000-0000-0000-0000-000000000007"; // Winter — Carlos Garcia
export const USER_HANS_ID = "40000000-0000-0000-0000-000000000008";   // Winter — Hans Weber
export const USER_MARIE_ID = "40000000-0000-0000-0000-000000000009";  // Winter — Marie Dubois
export const USER_PIOTR_ID = "40000000-0000-0000-0000-000000000010";  // Winter — Piotr Wisniewski

export const USER_LENA_ID = "40000000-0000-0000-0000-000000000011";      // Exchange — Lena Schmidt
export const USER_PIERRE_ID = "40000000-0000-0000-0000-000000000012";    // Exchange — Pierre Leblanc
export const USER_KATARZYNA_ID = "40000000-0000-0000-0000-000000000013"; // Exchange — Katarzyna Wrobel
export const USER_ANA_ID = "40000000-0000-0000-0000-000000000014";       // Exchange — Ana Santos
export const USER_TOM_ID = "40000000-0000-0000-0000-000000000015";       // Exchange — Tom Brown

// ─── Slot IDs — Spring (10 slots: 0–4 registered, 5–9 open) ─────────────────

export const SPRING_SLOT_IDS = [
  "50000001-0000-0000-0000-000000000001",
  "50000001-0000-0000-0000-000000000002",
  "50000001-0000-0000-0000-000000000003",
  "50000001-0000-0000-0000-000000000004",
  "50000001-0000-0000-0000-000000000005",
  "50000001-0000-0000-0000-000000000006",
  "50000001-0000-0000-0000-000000000007",
  "50000001-0000-0000-0000-000000000008",
  "50000001-0000-0000-0000-000000000009",
  "50000001-0000-0000-0000-000000000010",
] as const;

// ─── Slot IDs — Winter (10 slots: 0–4 registered, 5–9 open) ─────────────────

export const WINTER_SLOT_IDS = [
  "50000002-0000-0000-0000-000000000001",
  "50000002-0000-0000-0000-000000000002",
  "50000002-0000-0000-0000-000000000003",
  "50000002-0000-0000-0000-000000000004",
  "50000002-0000-0000-0000-000000000005",
  "50000002-0000-0000-0000-000000000006",
  "50000002-0000-0000-0000-000000000007",
  "50000002-0000-0000-0000-000000000008",
  "50000002-0000-0000-0000-000000000009",
  "50000002-0000-0000-0000-000000000010",
] as const;

// ─── Slot IDs — Exchange (10 slots: 0–4 registered, 5–9 open) ───────────────

export const EXCHANGE_SLOT_IDS = [
  "50000003-0000-0000-0000-000000000001",
  "50000003-0000-0000-0000-000000000002",
  "50000003-0000-0000-0000-000000000003",
  "50000003-0000-0000-0000-000000000004",
  "50000003-0000-0000-0000-000000000005",
  "50000003-0000-0000-0000-000000000006",
  "50000003-0000-0000-0000-000000000007",
  "50000003-0000-0000-0000-000000000008",
  "50000003-0000-0000-0000-000000000009",
  "50000003-0000-0000-0000-000000000010",
] as const;

// ─── Registration IDs ────────────────────────────────────────────────────────

export const SPRING_REG_IDS = [
  "60000001-0000-0000-0000-000000000001", // Anna
  "60000001-0000-0000-0000-000000000002", // Marco
  "60000001-0000-0000-0000-000000000003", // Klaus
  "60000001-0000-0000-0000-000000000004", // Sophie
  "60000001-0000-0000-0000-000000000005", // Jan
] as const;

export const WINTER_REG_IDS = [
  "60000002-0000-0000-0000-000000000001", // Emma
  "60000002-0000-0000-0000-000000000002", // Carlos
  "60000002-0000-0000-0000-000000000003", // Hans
  "60000002-0000-0000-0000-000000000004", // Marie
  "60000002-0000-0000-0000-000000000005", // Piotr
] as const;

export const EXCHANGE_REG_IDS = [
  "60000003-0000-0000-0000-000000000001", // Lena
  "60000003-0000-0000-0000-000000000002", // Pierre
  "60000003-0000-0000-0000-000000000003", // Katarzyna
  "60000003-0000-0000-0000-000000000004", // Ana
  "60000003-0000-0000-0000-000000000005", // Tom
] as const;

// ─── Stage Enrollment IDs ────────────────────────────────────────────────────

export const SPRING_ENROLLMENT_IDS = [
  "70000001-0000-0000-0000-000000000001",
  "70000001-0000-0000-0000-000000000002",
  "70000001-0000-0000-0000-000000000003",
  "70000001-0000-0000-0000-000000000004",
  "70000001-0000-0000-0000-000000000005",
] as const;

export const WINTER_ENROLLMENT_IDS = [
  "70000002-0000-0000-0000-000000000001",
  "70000002-0000-0000-0000-000000000002",
  "70000002-0000-0000-0000-000000000003",
  "70000002-0000-0000-0000-000000000004",
  "70000002-0000-0000-0000-000000000005",
] as const;

export const EXCHANGE_ENROLLMENT_IDS = [
  "70000003-0000-0000-0000-000000000001",
  "70000003-0000-0000-0000-000000000002",
  "70000003-0000-0000-0000-000000000003",
  "70000003-0000-0000-0000-000000000004",
  "70000003-0000-0000-0000-000000000005",
] as const;

// ─── Student profiles ─────────────────────────────────────────────────────────
//
// Destination preference lists only include destinations that each student
// is eligible for based on their language and level/slot availability.
//
// Spring/Winter slot availability reference:
//   London Uni     — 5 master, 5 bachelor, 0 any  — English
//   Berlin Uni     — 1 master, 1 bachelor, 1 any  — German
//   Madrid Uni     — 2 master, 0 bachelor, 0 any  — Spanish or English
//   Brussels Uni   — 0 master, 2 bachelor, 0 any  — English
//   Barcelona Uni  — 0 master, 0 bachelor, 3 any  — Spanish or English
//   Manchester Uni — 1 master, 1 bachelor, 0 any  — English
//   Utrecht Uni    — 0 master, 0 bachelor, 3 any  — German
//   Paris Uni      — 0 master, 0 bachelor, 3 any  — French or English
//   Wrocław Uni    — 5 master, 0 bachelor, 0 any  — Polish
//   Lisbon Uni     — 0 master, 5 bachelor, 0 any  — Portuguese

export type StudentProfile = {
  userId: string;
  fullName: string;
  email: string;
  enrollmentId: string;
  level: "bachelor" | "master";
  spokenLanguages: string[];
  /** Ordered destination IDs (first preference first) */
  springPreferences: string[];
  winterPreferences: string[];
  exchangePreferences: string[];
  averageResult: string; // numeric string e.g. "5.5"
  additionalActivities: number;
  recommendationLetters: number;
  /** Offset in ms from SEED_DATE_D0 for registration completion timestamp */
  registrationCompletedOffsetMs: number;
};

export const STUDENT_PROFILES: StudentProfile[] = [
  // ── Spring slot 0 / Winter N/A / Exchange N/A ──────────────────────────────
  {
    userId: USER_ANNA_ID,
    fullName: "Anna Kowalski",
    email: "anna.kowalski@student.edu",
    enrollmentId: "100001",
    level: "bachelor",
    spokenLanguages: ["English"],
    // bachelor + English → eligible: London (5b), Brussels (2b), Manchester (1b),
    //                                 Barcelona (3any), Paris (3any/Eng)
    springPreferences: [
      SPRING_DEST_LONDON_ID,
      SPRING_DEST_BRUSSELS_ID,
      SPRING_DEST_MANCHESTER_ID,
      SPRING_DEST_BARCELONA_ID,
      SPRING_DEST_PARIS_ID,
    ],
    winterPreferences: [],
    exchangePreferences: [],
    averageResult: "5.5",
    additionalActivities: 3,
    recommendationLetters: 5,
    registrationCompletedOffsetMs: -2 * 24 * 60 * 60 * 1000, // 2 days before D0
  },
  // ── Spring slot 1 ─────────────────────────────────────────────────────────
  {
    userId: USER_MARCO_ID,
    fullName: "Marco Rodriguez",
    email: "marco.rodriguez@student.edu",
    enrollmentId: "100002",
    level: "master",
    spokenLanguages: ["Spanish", "English"],
    // master + Spanish/English → eligible: Madrid (2m), London (5m), Manchester (1m),
    //                                       Barcelona (3any/Spa), Paris (3any/Eng)
    springPreferences: [
      SPRING_DEST_MADRID_ID,
      SPRING_DEST_BARCELONA_ID,
      SPRING_DEST_LONDON_ID,
      SPRING_DEST_MANCHESTER_ID,
      SPRING_DEST_PARIS_ID,
    ],
    winterPreferences: [],
    exchangePreferences: [],
    averageResult: "4.0",
    additionalActivities: 2,
    recommendationLetters: 3,
    registrationCompletedOffsetMs: -1 * 24 * 60 * 60 * 1000,
  },
  // ── Spring slot 2 ─────────────────────────────────────────────────────────
  {
    userId: USER_KLAUS_ID,
    fullName: "Klaus Mueller",
    email: "klaus.mueller@student.edu",
    enrollmentId: "100003",
    level: "master",
    spokenLanguages: ["German"],
    // master + German → eligible: Berlin (1m), Utrecht (3any/Ger)
    springPreferences: [
      SPRING_DEST_BERLIN_ID,
      SPRING_DEST_UTRECHT_ID,
    ],
    winterPreferences: [],
    exchangePreferences: [],
    averageResult: "5.0",
    additionalActivities: 4,
    recommendationLetters: 7,
    registrationCompletedOffsetMs: -3 * 24 * 60 * 60 * 1000,
  },
  // ── Spring slot 3 ─────────────────────────────────────────────────────────
  {
    userId: USER_SOPHIE_ID,
    fullName: "Sophie Martin",
    email: "sophie.martin@student.edu",
    enrollmentId: "100004",
    level: "bachelor",
    spokenLanguages: ["French", "English"],
    // bachelor + French/English → eligible: Paris (3any/Fr), London (5b/Eng),
    //                                        Brussels (2b/Eng), Manchester (1b/Eng),
    //                                        Barcelona (3any/Eng)
    springPreferences: [
      SPRING_DEST_PARIS_ID,
      SPRING_DEST_BRUSSELS_ID,
      SPRING_DEST_LONDON_ID,
      SPRING_DEST_BARCELONA_ID,
      SPRING_DEST_MANCHESTER_ID,
    ],
    winterPreferences: [],
    exchangePreferences: [],
    averageResult: "3.5",
    additionalActivities: 1,
    recommendationLetters: 2,
    registrationCompletedOffsetMs: -12 * 60 * 60 * 1000, // 12 hours before D0
  },
  // ── Spring slot 4 ─────────────────────────────────────────────────────────
  {
    userId: USER_JAN_ID,
    fullName: "Jan Nowak",
    email: "jan.nowak@student.edu",
    enrollmentId: "100005",
    level: "master",
    spokenLanguages: ["Polish"],
    // master + Polish → eligible: Wrocław (5m)
    springPreferences: [
      SPRING_DEST_WROCLAW_ID,
    ],
    winterPreferences: [],
    exchangePreferences: [],
    averageResult: "6.0",
    additionalActivities: 4,
    recommendationLetters: 8,
    registrationCompletedOffsetMs: -4 * 24 * 60 * 60 * 1000,
  },
  // ── Winter slot 0 ─────────────────────────────────────────────────────────
  {
    userId: USER_EMMA_ID,
    fullName: "Emma Johnson",
    email: "emma.johnson@student.edu",
    enrollmentId: "100006",
    level: "bachelor",
    spokenLanguages: ["English"],
    springPreferences: [],
    // bachelor + English → London, Brussels, Manchester, Barcelona, Paris
    winterPreferences: [
      WINTER_DEST_LONDON_ID,
      WINTER_DEST_MANCHESTER_ID,
      WINTER_DEST_BRUSSELS_ID,
      WINTER_DEST_BARCELONA_ID,
      WINTER_DEST_PARIS_ID,
    ],
    exchangePreferences: [],
    averageResult: "4.5",
    additionalActivities: 2,
    recommendationLetters: 4,
    registrationCompletedOffsetMs: -2 * 24 * 60 * 60 * 1000,
  },
  // ── Winter slot 1 ─────────────────────────────────────────────────────────
  {
    userId: USER_CARLOS_ID,
    fullName: "Carlos Garcia",
    email: "carlos.garcia@student.edu",
    enrollmentId: "100007",
    level: "master",
    spokenLanguages: ["Spanish", "English"],
    springPreferences: [],
    // master + Spanish/English → Barcelona, Madrid, London, Manchester, Paris
    winterPreferences: [
      WINTER_DEST_BARCELONA_ID,
      WINTER_DEST_MADRID_ID,
      WINTER_DEST_LONDON_ID,
      WINTER_DEST_MANCHESTER_ID,
      WINTER_DEST_PARIS_ID,
    ],
    exchangePreferences: [],
    averageResult: "5.0",
    additionalActivities: 3,
    recommendationLetters: 6,
    registrationCompletedOffsetMs: -1 * 24 * 60 * 60 * 1000,
  },
  // ── Winter slot 2 ─────────────────────────────────────────────────────────
  {
    userId: USER_HANS_ID,
    fullName: "Hans Weber",
    email: "hans.weber@student.edu",
    enrollmentId: "100008",
    level: "master",
    spokenLanguages: ["German"],
    springPreferences: [],
    // master + German → Utrecht, Berlin
    winterPreferences: [
      WINTER_DEST_UTRECHT_ID,
      WINTER_DEST_BERLIN_ID,
    ],
    exchangePreferences: [],
    averageResult: "3.0",
    additionalActivities: 1,
    recommendationLetters: 3,
    registrationCompletedOffsetMs: -3 * 24 * 60 * 60 * 1000,
  },
  // ── Winter slot 3 ─────────────────────────────────────────────────────────
  {
    userId: USER_MARIE_ID,
    fullName: "Marie Dubois",
    email: "marie.dubois@student.edu",
    enrollmentId: "100009",
    level: "bachelor",
    spokenLanguages: ["French", "English"],
    springPreferences: [],
    // bachelor + French/English → Paris, Brussels, London, Barcelona, Manchester
    winterPreferences: [
      WINTER_DEST_PARIS_ID,
      WINTER_DEST_BRUSSELS_ID,
      WINTER_DEST_LONDON_ID,
      WINTER_DEST_BARCELONA_ID,
      WINTER_DEST_MANCHESTER_ID,
    ],
    exchangePreferences: [],
    averageResult: "4.8",
    additionalActivities: 2,
    recommendationLetters: 5,
    registrationCompletedOffsetMs: -18 * 60 * 60 * 1000,
  },
  // ── Winter slot 4 ─────────────────────────────────────────────────────────
  {
    userId: USER_PIOTR_ID,
    fullName: "Piotr Wisniewski",
    email: "piotr.wisniewski@student.edu",
    enrollmentId: "100010",
    level: "master",
    spokenLanguages: ["Polish"],
    springPreferences: [],
    // master + Polish → Wrocław
    winterPreferences: [
      WINTER_DEST_WROCLAW_ID,
    ],
    exchangePreferences: [],
    averageResult: "5.5",
    additionalActivities: 3,
    recommendationLetters: 7,
    registrationCompletedOffsetMs: -4 * 24 * 60 * 60 * 1000,
  },
  // ── Exchange slot 0 ───────────────────────────────────────────────────────
  {
    userId: USER_LENA_ID,
    fullName: "Lena Schmidt",
    email: "lena.schmidt@student.edu",
    enrollmentId: "100011",
    level: "bachelor",
    spokenLanguages: ["German", "English"],
    springPreferences: [],
    winterPreferences: [],
    // bachelor + German/English → Utrecht (3any/Ger), Paris (3any/Eng)
    exchangePreferences: [
      EXCHANGE_DEST_UTRECHT_ID,
      EXCHANGE_DEST_PARIS_ID,
    ],
    averageResult: "4.2",
    additionalActivities: 2,
    recommendationLetters: 3,
    registrationCompletedOffsetMs: -2 * 24 * 60 * 60 * 1000,
  },
  // ── Exchange slot 1 ───────────────────────────────────────────────────────
  {
    userId: USER_PIERRE_ID,
    fullName: "Pierre Leblanc",
    email: "pierre.leblanc@student.edu",
    enrollmentId: "100012",
    level: "master",
    spokenLanguages: ["French", "Portuguese"],
    springPreferences: [],
    winterPreferences: [],
    // master + French/Portuguese → Paris (3any/Fr), Lisbon (2any/Por)
    exchangePreferences: [
      EXCHANGE_DEST_PARIS_ID,
      EXCHANGE_DEST_LISBON_ID,
    ],
    averageResult: "5.1",
    additionalActivities: 3,
    recommendationLetters: 6,
    registrationCompletedOffsetMs: -1 * 24 * 60 * 60 * 1000,
  },
  // ── Exchange slot 2 ───────────────────────────────────────────────────────
  {
    userId: USER_KATARZYNA_ID,
    fullName: "Katarzyna Wrobel",
    email: "katarzyna.wrobel@student.edu",
    enrollmentId: "100013",
    level: "bachelor",
    spokenLanguages: ["Polish"],
    springPreferences: [],
    winterPreferences: [],
    // bachelor + Polish → Wrocław (2any/Polish)
    exchangePreferences: [
      EXCHANGE_DEST_WROCLAW_ID,
    ],
    averageResult: "3.8",
    additionalActivities: 1,
    recommendationLetters: 2,
    registrationCompletedOffsetMs: -3 * 24 * 60 * 60 * 1000,
  },
  // ── Exchange slot 3 ───────────────────────────────────────────────────────
  {
    userId: USER_ANA_ID,
    fullName: "Ana Santos",
    email: "ana.santos@student.edu",
    enrollmentId: "100014",
    level: "master",
    spokenLanguages: ["Portuguese", "English"],
    springPreferences: [],
    winterPreferences: [],
    // master + Portuguese/English → Lisbon (2any/Por), Paris (3any/Eng)
    exchangePreferences: [
      EXCHANGE_DEST_LISBON_ID,
      EXCHANGE_DEST_PARIS_ID,
    ],
    averageResult: "5.5",
    additionalActivities: 4,
    recommendationLetters: 5,
    registrationCompletedOffsetMs: -6 * 60 * 60 * 1000,
  },
  // ── Exchange slot 4 ───────────────────────────────────────────────────────
  {
    userId: USER_TOM_ID,
    fullName: "Tom Brown",
    email: "tom.brown@student.edu",
    enrollmentId: "100015",
    level: "bachelor",
    spokenLanguages: ["German", "French"],
    springPreferences: [],
    winterPreferences: [],
    // bachelor + German/French → Utrecht (3any/Ger), Paris (3any/Fr)
    exchangePreferences: [
      EXCHANGE_DEST_PARIS_ID,
      EXCHANGE_DEST_UTRECHT_ID,
    ],
    averageResult: "4.0",
    additionalActivities: 2,
    recommendationLetters: 4,
    registrationCompletedOffsetMs: -4 * 24 * 60 * 60 * 1000,
  },
];
