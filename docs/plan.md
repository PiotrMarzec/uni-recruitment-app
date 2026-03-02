# University International Trip Recruitment — Project Plan

## 1. Overview

A web application that supports university recruitment for students wanting to participate in international trips. Admins create recruitments with slots, destinations, and staged workflows. Students register via unique links (distributed physically at the university office), complete a multi-step form, and get assigned to travel destinations based on scores and preferences.

---

## 2. User Roles

### 2.1 Admin
- Created via CLI (first admin; subsequent admins can be created from the admin panel or CLI)
- Has access to the admin panel after login
- Manages recruitments, stages, slots, and destinations
- Approves assignment results
- Can trigger supplementary stages

### 2.2 Student
- Registers via a unique slot link (QR code or URL)
- Has a university enrollment ID (6-digit number, not starting with 0)
- Completes a multi-step registration flow
- Can update data until the initial stage ends

### 2.3 Common User Properties
- ID (UUID)
- Full name (single UTF-8 text field)
- Email address

### 2.4 Authentication
- Passwordless, no social logins
- Login via one-time code (6 alphanumeric characters) sent to email
- Code is used for both admin login and student registration verification

---

## 3. Domain Model

### 3.1 Recruitment
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | string | |
| description | text | |
| start_date | datetime | |
| end_date | datetime | |
| max_destination_choices | integer | Max destinations a student can select (≥1) |

### 3.2 Stage
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| recruitment_id | UUID | FK → Recruitment |
| name | string | |
| description | text | |
| start_date | datetime | |
| end_date | datetime | |
| order | integer | Auto-increment starting from 0, per recruitment |
| type | enum | `initial`, `admin`, `supplementary` |
| status | enum | `pending`, `active`, `completed` |

**Stage ordering rules:**
- Exactly one `initial` stage (always order 0)
- At least one `admin` stage immediately after the initial stage
- Zero or more `supplementary` stages, each followed by an `admin` stage
- Valid sequence example: `initial → admin → supplementary → admin → supplementary → admin`

### 3.3 Slot
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key, used in links |
| recruitment_id | UUID | FK → Recruitment |
| number | integer | Auto-increment from 0, per recruitment |
| status | enum | `open`, `registered` |
| student_id | UUID, nullable | FK → User (student) |
| student_registration_link | string | Derived from slot ID |
| teacher_management_link | string | Derived from slot ID + HMAC signature |

**Teacher management link security:** The link is generated using slot ID + an HMAC signature computed with a predefined server secret. This prevents guessing/forging teacher links while keeping them usable without login.

### 3.4 Destination
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| recruitment_id | UUID | FK → Recruitment |
| name | string | |
| description | text | |
| slots_bachelor | integer | Slots reserved for bachelor students |
| slots_master | integer | Slots reserved for master students |
| slots_any | integer | Slots open to any student level |
| required_languages | array of enum | Subset of: English, Spanish, German, French, Polish, Portuguese |

### 3.5 Student Registration Data
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| slot_id | UUID | FK → Slot |
| student_id | UUID | FK → User |
| email_consent | boolean | Consent to email communication for this recruitment |
| privacy_consent | boolean | Consent to privacy policy |
| level | enum | `bachelor`, `master` |
| spoken_languages | array of enum | Same enum as destinations |
| destination_preferences | ordered array of UUID | Ordered list of destination IDs (1st choice first) |
| average_result | float, nullable | 0.0–6.0, one decimal place (entered by teacher) |
| additional_activities | integer, nullable | 0–4 (entered by teacher) |
| recommendation_letters | integer, nullable | 0–10 (entered by teacher) |
| registration_completed | boolean | Whether the student finished all steps |
| registration_completed_at | datetime, nullable | Timestamp of completion (used as tiebreaker) |

### 3.6 Stage Enrollment
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| stage_id | UUID | FK → Stage |
| registration_id | UUID | FK → Student Registration Data |
| assigned_destination_id | UUID, nullable | FK → Destination (set after assignment) |
| cancelled | boolean | Default false; set to true if student cancels in supplementary |

### 3.7 Assignment Result
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| stage_id | UUID | FK → Stage (the admin stage that produced this) |
| registration_id | UUID | FK → Student Registration Data |
| destination_id | UUID | FK → Destination |
| score | float | Computed: `3 × average_result + additional_activities + recommendation_letters` |
| approved | boolean | Admin approval status |

---

## 4. Key Business Rules

### 4.1 Destination Visibility for Students
A student sees a destination only if:
1. **Language match (flexible):** The student speaks at least ONE of the destination's required languages
2. **Slot availability:** The destination has available slots for the student's level (bachelor/master) OR has available "any level" slots

### 4.2 Slot Pool Logic
- Bachelor students first fill `slots_bachelor`, then overflow into `slots_any`
- Master students first fill `slots_master`, then overflow into `slots_any`
- A student with 0 level-specific slots but >0 "any" slots CAN still pick that destination

### 4.3 Score Calculation
```
score = 3 × average_result + additional_activities + recommendation_letters
```
- Max theoretical score: `3 × 6.0 + 4 + 10 = 32.0`
- If teacher data is missing (null), those fields contribute 0

### 4.4 Assignment Algorithm
Run after an admin stage is marked complete:

1. Rank all students by score descending
2. **Tiebreaker:** Earlier `registration_completed_at` wins
3. For each student (highest score first):
   a. Try to assign their 1st preference destination
   b. Check if slots remain for their level; if not, check "any" pool
   c. If 1st preference full, try 2nd preference, and so on
   d. If no preference can be satisfied, student is unassigned
4. Present results to admin for manual review and approval

### 4.5 Supplementary Round Assignment
- All students who did NOT cancel retain their existing assignments (locked)
- Students who cancelled lose their slot (destination slot becomes open again)
- Students can optionally submit new destination preferences (replaces previous list entirely)
- Re-run assignment algorithm ONLY for unassigned students competing for freed/remaining slots
- Students who were previously unassigned also participate

---

## 5. Stage Lifecycle & Transitions

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  INITIAL STAGE (auto-starts at start_date)                         │
│  ├─ Students register via slot links                                │
│  ├─ Students can update their data                                  │
│  ├─ Teachers can enter data via management links                    │
│  └─ Auto-closes at end_date                                         │
│         │                                                           │
│         ▼                                                           │
│  ADMIN STAGE (auto-starts when initial closes)                      │
│  ├─ Students can no longer edit their data                          │
│  ├─ Teachers can still enter/update data                            │
│  ├─ Does NOT auto-complete at end_date                              │
│  ├─ Admin manually marks as complete from admin panel               │
│  ├─ Assignment algorithm runs                                       │
│  ├─ Admin reviews and approves results                              │
│  └─ Results saved + emails sent to students                         │
│         │                                                           │
│         ▼  (optional, admin-initiated)                              │
│  SUPPLEMENTARY STAGE                                                │
│  ├─ Email sent to all students with cancellation link               │
│  ├─ Students can cancel assignment (slot freed)                     │
│  ├─ Students can optionally update destination preferences          │
│  ├─ Closes at end_date                                              │
│  └─ Subsequent admin stage starts                                   │
│         │                                                           │
│         ▼                                                           │
│  ADMIN STAGE (repeat)                                               │
│  ├─ Locked assignments preserved                                    │
│  ├─ Re-run assignment for freed/remaining slots only                │
│  └─ Admin approves → emails → done (or another supplementary)      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Automated transitions
- Initial → Admin: triggered automatically when initial stage `end_date` passes
- Supplementary → Admin: triggered automatically when supplementary `end_date` passes

### Manual transitions
- Admin stage completion: admin clicks "Complete Stage" in admin panel
- Starting a supplementary stage: admin initiates from admin panel

---

## 6. Emails

| Trigger | Recipient | Content |
|---|---|---|
| Registration completed | Student | Summary of all entered data |
| Initial stage closes | Student | Confirmation that registration is complete; whether they moved to admin stage; admin stage end date |
| Admin approves assignment | Student | Their personal destination assignment |
| Supplementary stage started | Student | Notification + cancellation link + option to update preferences |

---

## 7. Feature Breakdown by Area

### 7.1 Admin Panel

**Recruitment Management**
- CRUD for recruitments (create, list, edit — no delete for safety)
- CRUD for stages within a recruitment (with validation of ordering rules)
- Add/remove slots (with auto-increment numbering)
- CRUD for destinations within a recruitment

**Bulk PDF Generation**
- Per recruitment: generate a PDF with 2 pages per slot
  - Page 1: Student Registration — title "STUDENT REGISTRATION" + recruitment name + slot number, registration link as text + QR code
  - Page 2: Teacher Management — title "TEACHER MANAGEMENT" + recruitment name + slot number, management link as text + QR code
- Pages ordered: [slot 0 student, slot 0 teacher, slot 1 student, slot 1 teacher, ...]
- Based on single-page HTML templates rendered to PDF

**Live Stage Dashboard**
- Per stage: real-time updating page showing registered students (newest first) and open slot count
- Could use polling or WebSockets/SSE

**Stage Management**
- Complete an admin stage (triggers assignment algorithm)
- Review and approve/reject assignment results
- Initiate supplementary stages
- View historical results

**Audit Log**
- View full audit trail with filters (recruitment, actor, action type, date range)
- Search by email or resource ID
- Expand entries to see before/after diffs
- Export to CSV

### 7.2 Student Registration Flow (Single Page)

A single-page, multi-step wizard accessible via the unique slot link:

| Step | Fields | Notes |
|---|---|---|
| 1 | Email, email consent checkbox, privacy policy consent checkbox | Privacy policy is a static external link |
| 2 | One-time code verification | Code sent to the email from step 1 |
| 3 | Full name, university enrollment ID (6 digits, no leading 0) | |
| 4 | Level: bachelor or master (radio) | |
| 5 | Spoken languages (checkboxes) | |
| 6 | Destination preferences (ranked 1..N) | Filtered by language + available slots; max N = recruitment's `max_destination_choices` |
| 7 (summary) | Read-only summary of all data | Checkbox: "I reviewed all the above data, and it's all correct" + "Complete Registration" button |

**UX requirements:**
- All previously entered data remains visible as user progresses
- Back navigation to any previous step with ability to edit
- If student changes level or languages in earlier steps, destination list in step 6 must reactively update
- After completion: "Process completed" confirmation screen
- Student can revisit the link and update any data until initial stage end date

### 7.3 Teacher Management View

Accessed via teacher management link (no login required, secured by HMAC signature).

**Displays:**
- Slot status (open/registered)
- All student-entered data (even if registration is incomplete)

**Teacher can edit:**
- Any student-entered field
- Average result (float, 0.0–6.0, one decimal)
- Additional activities count (integer, 0–4)
- Recommendation letters count (integer, 0–10)

### 7.4 Supplementary Stage — Student View

When a supplementary stage is active, students receive an email with:
- A link to cancel their current assignment
- Option to submit new destination preferences (replaces old list entirely)

---

## 8. Pages / Routes Summary

| Route | Access | Description |
|---|---|---|
| `/admin/login` | Public | Admin login (email + OTP) |
| `/admin/dashboard` | Admin | List of recruitments |
| `/admin/recruitment/:id` | Admin | Recruitment detail: stages, slots, destinations |
| `/admin/recruitment/:id/stage/:stageId` | Admin | Live stage dashboard |
| `/admin/recruitment/:id/results/:stageId` | Admin | Assignment results review/approval |
| `/admin/audit` | Admin | Global audit log (filterable by recruitment) |
| `/register/:slotId` | Public | Student registration wizard |
| `/manage/:slotId/:signature` | Public | Teacher management view |
| `/supplementary/:token` | Student | Supplementary stage: cancel assignment / update preferences |

---

## 9. Background Jobs / Scheduled Tasks

| Task | Trigger | Action |
|---|---|---|
| Stage transition: initial → admin | Initial stage `end_date` passes | Move completed registrations to admin stage; send emails |
| Stage transition: supplementary → admin | Supplementary stage `end_date` passes | Lock changes; start admin stage |
| OTP cleanup | Periodic (e.g. every 15 min) | Remove expired one-time codes |

---

## 10. Audit Log

### 10.1 Overview
Every meaningful action in the system is recorded in an append-only audit log. Entries are immutable — they can never be edited or deleted. The log is viewable from the admin panel with filtering and search capabilities.

### 10.2 Audit Log Entry
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| timestamp | datetime | When the action occurred (UTC) |
| actor_type | enum | `admin`, `student`, `teacher`, `system` |
| actor_id | UUID, nullable | FK → User (null for `system` and `teacher` actions) |
| actor_label | string | Human-readable identifier (e.g. email, "System", "Teacher via slot #12") |
| action | string | Machine-readable action key (see below) |
| resource_type | string | Entity type affected (e.g. `recruitment`, `stage`, `slot`, `registration`, `assignment`) |
| resource_id | UUID | ID of the affected entity |
| recruitment_id | UUID, nullable | FK → Recruitment (for easy filtering by recruitment) |
| details | JSON | Structured payload with before/after values or contextual data |
| ip_address | string, nullable | Request IP address |

### 10.3 Tracked Actions

**Admin actions:**
- `recruitment.created`, `recruitment.updated`
- `stage.created`, `stage.updated`, `stage.completed`
- `slot.added`, `slot.removed`
- `destination.created`, `destination.updated`, `destination.removed`
- `assignment.approved`
- `supplementary_stage.started`
- `bulk_pdf.generated`

**Student actions:**
- `registration.step_completed` (with step number in details)
- `registration.completed`
- `registration.updated` (with changed fields in details)
- `assignment.cancelled` (supplementary stage cancellation)
- `preferences.updated` (supplementary stage preference change)

**Teacher actions:**
- `registration.teacher_edited` (with changed fields and before/after values)
- `teacher.scores_entered` (average result, activities, letters)

**System actions:**
- `stage.transitioned` (automatic stage transitions with from/to)
- `assignment.computed` (algorithm ran, summary of results in details)
- `email.sent` (recipient, template name, recruitment context)
- `otp.issued`, `otp.verified`, `otp.expired`

### 10.4 Admin Panel — Audit Log View
- Filterable by: recruitment, action type, actor type, date range, resource type
- Searchable by: actor label (email), resource ID
- Sorted by timestamp descending (most recent first)
- Each entry expandable to show full JSON details (before/after diffs for edits)
- Exportable to CSV

### 10.5 Design Considerations
- Append-only: no UPDATE or DELETE operations on the audit table
- The `details` JSON should capture before/after snapshots for any data modifications so changes are fully traceable
- Teacher actions are logged with the slot ID and signature hash as the actor identifier (since teachers don't authenticate)
- High-volume actions (like `email.sent` or `otp.issued`) should still be logged but can be filtered out in the default admin view

---

## 11. Open Design Decisions (for implementation phase)

These are intentionally left for the coding phase:

1. **Tech stack** — framework, database, ORM, email service
2. **Real-time updates** — polling vs WebSockets vs SSE for the live stage dashboard
3. **PDF generation approach** — server-side HTML-to-PDF (e.g. Puppeteer, wkhtmltopdf, weasyprint) or a dedicated library
4. **QR code library** — e.g. `qrcode` (Node), `qrcode.react`, `python-qrcode`
5. **Deployment** — hosting, CI/CD, environment management
6. **Email provider** — transactional email service (SendGrid, Resend, AWS SES, etc.)
7. **Rate limiting & abuse prevention** — OTP rate limits, registration link brute-force protection
8. **Internationalization** — Is the UI in English only or should it support Polish/other languages?
9. **Accessibility** — WCAG compliance level target

---

## 12. Edge Cases & Validation Rules

- **Enrollment ID:** exactly 6 digits, first digit 1–9
- **OTP:** 6 alphanumeric characters, expires after a defined period (e.g. 10 minutes), single use
- **Stage dates:** each stage's start date must be ≥ previous stage's end date
- **Slot link reuse:** if a student visits a registration link for an already-registered slot, show the current data (allow edits if within initial stage)
- **Teacher link with no student data:** teacher sees empty form, can still pre-fill data
- **Assignment with missing teacher data:** treat null scores as 0 (score = 0 + 0 + 0 = 0)
- **No valid destinations:** if after filtering a student has zero eligible destinations, they cannot complete step 6 — show an appropriate message
- **Destination slots exhausted mid-registration:** validate slot availability at the moment of final submission, not at step 6 display time. If a destination becomes full between display and submission, show an error and ask the student to re-pick.
- **Concurrent registrations:** ensure slot assignment is atomic (DB-level locking or optimistic concurrency) to prevent two students claiming the same slot
- **Admin stage end date:** informational only — the stage doesn't auto-complete; it's up to the admin
