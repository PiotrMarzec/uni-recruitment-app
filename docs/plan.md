# University International Trip Recruitment — Project Plan

## 1. Overview

A web application that supports university recruitment for students wanting to participate in international trips. Admins create recruitments with slots, destinations, and staged workflows. Students register via unique links (distributed physically at the university office), complete a multi-step form, and get assigned to travel destinations based on scores and preferences.

**Tech stack (implemented):**
- Next.js 15 (App Router), TypeScript
- PostgreSQL + Drizzle ORM
- iron-session (OTP-based, passwordless auth)
- Tailwind CSS + shadcn/ui
- Resend (production) / SMTP (development) for email
- next-intl for internationalization (`[locale]` route segment)
- Custom WebSocket server for real-time dashboard updates

---

## 2. User Roles

### 2.1 Admin
- First admin created via CLI; subsequent admins invited from the admin panel (or CLI)
- Has access to the admin panel after OTP login
- Manages recruitments, stages, slots, and destinations
- Approves assignment results
- Can trigger supplementary stages
- Can be disabled (access revoked) by another admin; disabled admins cannot log in

### 2.2 Student
- Registers via a unique slot link (QR code or URL)
- Has a university enrollment ID (6-digit number, not starting with 0)
- Completes a multi-step registration flow
- Can update data until the initial stage ends

### 2.3 Teacher
- Accesses a secure management link (HMAC-signed, no login required)
- Views student registration data and enters academic scores

### 2.4 Common User Properties
- ID (UUID)
- Full name (single UTF-8 text field)
- Email address

### 2.5 Authentication
- Passwordless, no social logins
- Login via one-time code (6 alphanumeric characters, ambiguous characters excluded) sent to email
- Code expires after 10 minutes; single use only
- Used for both admin login and student registration verification

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
| max_destination_choices | integer | Max destinations a student can rank (≥1) |
| eligible_levels | array of enum | Subset of all student levels allowed to register |
| archived_at | datetime, nullable | Set when admin archives the recruitment; null = not archived |

**Recruitment status** is derived (not stored), computed from dates and archived_at:
- `upcoming` — start_date is in the future
- `current` — between start_date and end_date (or no end_date yet passed)
- `completed` — end_date has passed and not archived
- `archived` — archived_at is set

Only archived recruitments can be deleted (hard delete with cascade).

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
| type | enum | `initial`, `admin`, `supplementary`, `verification` |
| status | enum | `pending`, `active`, `completed` |

**Stage ordering rules:**
- Exactly one `initial` stage (always order 0)
- One `admin` stage immediately after the initial stage (order 1)
- One `verification` stage immediately after the admin stage (order 2)
- Zero or more supplementary rounds, each consisting of: `supplementary` → `admin` → `verification`
- Valid sequence example: `initial → admin → verification → supplementary → admin → verification → supplementary → admin → verification`

### 3.3 Slot
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key, used in links |
| recruitment_id | UUID | FK → Recruitment |
| number | integer | Auto-increment from 0, per recruitment |
| status | enum | `open`, `registration_started`, `registered` |
| student_id | UUID, nullable | FK → User (student) |
| student_registration_link | string | Derived from slot ID |
| teacher_management_link | string | Derived from slot ID + HMAC signature |

**Slot status meaning:**
- `open` — no student has started
- `registration_started` — student began the form but hasn't completed it yet
- `registered` — student completed all steps

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
| level | enum | `bachelor_1`, `bachelor_2`, `bachelor_3`, `master_1`, `master_2`, `master_3` |
| spoken_languages | array of enum | Same language enum as destinations |
| destination_preferences | ordered array of UUID | Ordered list of destination IDs (1st choice first) |
| average_result | float, nullable | 0.0–6.0, one decimal place (entered by teacher) |
| additional_activities | integer, nullable | 0–4 (entered by teacher) |
| recommendation_letters | integer, nullable | 0–10 (entered by teacher) |
| notes | text, nullable | Internal admin notes on this registration (max 5000 chars) |
| registration_completed | boolean | Whether the student finished all steps |
| registration_completed_at | datetime, nullable | Timestamp of completion (used as tiebreaker) |

**Note on student level:** The level enum is granular (year of study). For assignment and slot matching, `bachelor_*` maps to the bachelor slot pool and `master_*` to the master slot pool.

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
| destination_id | UUID, nullable | FK → Destination (null = unassigned) |
| score | float | Computed: `3 × average_result + additional_activities + recommendation_letters` |
| approved | boolean | Admin approval status |

### 3.8 Supplementary Token
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| registration_id | UUID | FK → Student Registration Data |
| stage_id | UUID | FK → Stage (the supplementary stage) |
| token | string | Unique secure token sent in supplementary email |
| expires_at | datetime | Token expiry (tied to supplementary stage end date) |

### 3.9 Admin
| Field | Type | Notes |
|---|---|---|
| user_id | UUID | PK + FK → User (cascade delete) |
| first_login_at | datetime, nullable | Set on first successful OTP login |
| disabled_at | datetime, nullable | Set when another admin disables this account; null = active |

A disabled admin's session is invalidated on next request (session check reads `disabled_at`).

### 3.10 Email Queue
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| from | string | Sender address |
| to | string | Recipient address |
| subject | string | Email subject line |
| html | string | Full HTML body |
| status | enum | `pending`, `processing`, `sent`, `failed` |
| attempts | integer | Number of delivery attempts made |
| error | string, nullable | Last error message on failure |
| created_at | datetime | When the email was enqueued |
| processed_at | datetime, nullable | When delivery was last attempted |

All outbound emails are written to this table first and delivered asynchronously by a background worker (retries on failure). The admin panel has a read-only email log view backed by this table.

---

## 4. Key Business Rules

### 4.1 Destination Visibility for Students
A student sees a destination only if:
1. **Language match (flexible):** The student speaks at least ONE of the destination's required languages
2. **Slot availability:** The destination has available slots for the student's level (bachelor/master) OR has available "any level" slots
3. **Recruitment eligibility:** The recruitment's `eligible_levels` includes the student's chosen level

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
Run when an admin manually triggers assignment for an admin stage:

1. Lock slots for students who already have non-cancelled assignments (supplementary re-run only)
2. Build list of eligible students (completed registrations only)
3. Rank all students by score descending
4. **Tiebreaker (automatic):** Among equal-score students, earlier `registration_completed_at` wins
5. **Tiebreaker (manual):** If two equal-score students compete for the last slot at a destination where only one can be assigned, the algorithm detects this as a **tie** and stops. It returns a `TieInfo` payload to the admin UI without saving any results. The admin reviews both students' full data (scores, level, languages, notes, outcomes for each scenario) and picks a winner. The algorithm then re-runs with the designated winner prioritised, skipping tie detection for that pair.
6. For each student (highest score first):
   a. Try to assign their 1st preference destination
   b. Check if slots remain for their level; if not, check "any" pool
   c. If 1st preference full, try 2nd preference, and so on
   d. If no preference can be satisfied, student is unassigned (destination_id = null)
7. Present results to admin for manual review and approval
8. Admin approval sends emails automatically

**Tie detection detail:** During step 6, before consuming a slot for student A, the algorithm simulates consumption and checks whether any subsequent student B with the **same score** also wants that destination but would be left without a slot after A takes it. If so, a `TieInfo` is returned containing: both students' full profiles, the contested destination, and the downstream outcome for each student under each scenario (what their next eligible destination would be if they lose the contested spot). No results are saved until the tie is resolved.

### 4.5 Supplementary Round Assignment
- All students who did NOT cancel retain their existing assignments (locked, excluded from re-run)
- Students who cancelled lose their slot (destination slot becomes open again)
- Students can optionally submit new destination preferences via supplementary token link
- Re-run assignment algorithm ONLY for unassigned + cancelled students competing for freed/remaining slots
- Previously unassigned students also participate

---

## 5. Stage Lifecycle & Transitions

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  INITIAL STAGE (auto-starts at start_date)                         │
│  ├─ Students register via slot links                                │
│  ├─ Students can update their data                                  │
│  ├─ Teachers can enter data via management links                    │
│  └─ Closes at end_date (triggers transition to admin stage)         │
│         │                                                           │
│         ▼                                                           │
│  ADMIN STAGE (auto-starts when initial closes)                      │
│  ├─ Students can no longer edit their data                          │
│  ├─ Teachers can still enter/update data                            │
│  ├─ Does NOT auto-complete at end_date (end_date is informational)  │
│  ├─ Admin manually runs assignment algorithm                        │
│  ├─ Admin reviews and approves results (emails auto-sent)           │
│  ├─ Admin manually marks stage as complete                          │
│  └─ Results saved + assigned/unassigned emails sent to students     │
│         │                                                           │
│         ▼                                                           │
│  VERIFICATION STAGE (auto-starts when admin stage completes)        │
│  ├─ Teachers can still edit student registration data               │
│  ├─ Admin can run the assignment algorithm (separate assignments)   │
│  ├─ Students cannot update their registration                       │
│  ├─ Students see their assignment from previous admin stage         │
│  ├─ Students see their score values from previous admin stage       │
│  ├─ Does NOT auto-complete at end_date (manual action only)         │
│  ├─ Admin manually ends verification (approves current results)     │
│  └─ Ending activates next supplementary stage (if exists)           │
│         │                                                           │
│         ▼  (optional, admin-initiated)                              │
│  SUPPLEMENTARY STAGE                                                │
│  ├─ Email sent to all enrolled students with supplementary link     │
│  ├─ Students can cancel their assignment (slot freed)               │
│  ├─ Students can optionally update destination preferences          │
│  ├─ Students cannot update spoken languages or study level          │
│  ├─ Closes at end_date (triggers transition to next admin stage)    │
│  └─ Subsequent admin stage auto-activates                           │
│         │                                                           │
│         ▼                                                           │
│  ADMIN STAGE (repeat)                                               │
│  ├─ Locked assignments preserved (from previous verification)       │
│  ├─ Re-run assignment for freed/remaining slots only                │
│  └─ Admin approves → emails → verification → done (or another      │
│     supplementary round)                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Stage start/end rules

**Automatic start:** All stage types (initial, admin, supplementary, verification) start automatically when their defined `start_date` is reached, provided the previous stage (by order) is completed and no other stage in the same recruitment is currently active. A background cron job checks every minute for pending stages whose start date has passed.

**Automatic end:** Only `initial` and `supplementary` stages end automatically when their `end_date` passes. This triggers an automatic transition to the next stage (admin).

**Manual-only end:** `admin` and `verification` stages do NOT end automatically when their `end_date` passes. The `end_date` on these stages is informational only — they require explicit admin action to complete.

### Date adjustments

- **Manual start:** When an admin manually activates a pending stage, its `start_date` is adjusted to the current date/time.
- **Manual end:** When an admin manually ends or completes a stage, its `end_date` is adjusted to the current date/time. The next stage (if any) is automatically activated with its `start_date` also set to the current date/time.
- **Recruitment date sync:** The recruitment's `start_date` and `end_date` are always kept in sync with the initial stage's `start_date` and the last verification stage's `end_date`, respectively. This synchronization happens automatically whenever any stage date changes.

### Automated transitions
- Initial → Admin: triggered automatically when initial stage `end_date` passes; completion email sent to students
- Admin → Verification: triggered when admin stage is completed; enrolls all students
- Supplementary → Admin: triggered automatically when supplementary stage `end_date` passes

### Manual transitions
- Admin stage completion: admin clicks "Complete Stage" in admin panel (sends assigned/unassigned emails, activates verification)
- Verification stage completion: admin clicks "End Verification" (approves results, activates next supplementary if exists)
- Starting a supplementary stage: admin initiates from admin panel (sends supplementary emails with token links)
- Admin can also manually activate a `pending` stage before its scheduled start date

### Verification stage default dates
- Start date: equal to the admin stage end date
- End date: 3 business days after start date at 18:00

### Student Registration Welcome Page — Stage-based visibility

| Stage | Registration Status | Can Register/Update | Assignment Shown | Score Shown |
|---|---|---|---|---|
| Before recruitment starts | — | No | No | No |
| Initial registration | New or Completed | Yes (start/update) | No | No |
| Initial admin | Completed | No | No | No |
| Initial verification | Completed | No | From previous admin stage (or "No assignment") | From previous admin stage |
| Supplementary registration | New or Completed | Yes (update destinations only) | From previous verification stage (or "No assignment"); shows "Assignment cancelled" if student updated preferences | From previous verification stage |
| Supplementary admin | New or Completed | No | From previous verification stage (or "No assignment"); shows "Assignment cancelled" if student updated preferences during supplementary | From previous verification stage |
| Supplementary verification | Completed | No | From previous admin stage (or "No assignment") | From previous admin stage |
| Recruitment over / no active stage | Completed | No | From last verification stage (or "No assignment") | From last verification stage |

### Supplementary stage — preference update rules

- Students who update their preferred destinations during a supplementary stage **lose their current assignment** and see an "Assignment cancelled" indicator on the welcome screen.
- This cancelled status persists through the subsequent admin stage until the next assignment algorithm run.
- Students who do **not** update their preferred destinations are **guaranteed to keep their current assignment** in the next admin stage — their assignments are locked and excluded from the algorithm re-run.

---

## 6. Emails

| Trigger | Recipient | Content |
|---|---|---|
| OTP requested | User (admin or student) | 6-character one-time login code |
| Registration completed | Student | Summary: enrollment ID, level, language preferences, destination choices |
| Initial stage closes | Student | Confirmation that registration period ended; admin stage end date (informational) |
| Admin stage completed | Student (assigned) | Their personal destination assignment and description |
| Admin stage completed | Student (unassigned) | Notification of non-assignment; supplementary stage option if applicable |
| Supplementary stage started | Student | Current assignment status + secure token link to cancel/update preferences, with warning about losing current assignment if re-applying |
| Admin invited | New admin | Link to admin panel login |

---

## 7. Feature Breakdown by Area

### 7.1 Admin Panel

**Recruitment Management**
- Create recruitment (automatically creates initial + first admin stage)
- List all recruitments with status indicators
- Edit recruitment details (name, description, dates, max destination choices, eligible levels)
- CRUD for stages within a recruitment (with ordering rule validation)
- Bulk add slots (auto-increment numbering)
- CRUD for destinations within a recruitment (name, description, slot counts by level, required languages)

**Admin Management**
- Dedicated `/admin/admins` page lists all admins with status (active / disabled), first login date
- Invite new admins by email from the admins page or dashboard
- Invited admin receives email with admin panel link; logs in via OTP
- Existing user with admin row = admin (no separate password)
- Admins can be disabled (access revoked) by any active admin; disabled admins are blocked on their next request
- `GET /api/admin/session` — lightweight session check endpoint used by the layout to detect session invalidation

**Bulk PDF Generation**
- Per recruitment: generate a PDF with 2 pages per slot
  - Page 1: Student Registration — "STUDENT REGISTRATION" + recruitment name + slot number, registration link as text + QR code
  - Page 2: Teacher Management — "TEACHER MANAGEMENT" + recruitment name + slot number, management link as text + QR code
- Pages ordered: [slot 0 student, slot 0 teacher, slot 1 student, slot 1 teacher, ...]

**Live Stage Dashboard**
- Per stage: real-time page showing registered students (newest first), open/started/registered slot counts
- Updates pushed via WebSocket whenever a student advances a step or completes registration
- Shows: total slots, registered count, registration_started count, open count

**Applications View**
- Per admin stage: table of all registrations (completed and incomplete)
- Shows student info, score, assigned destination (if any), completion status
- Admin can trigger assignment algorithm from this view
- Real-time updates via WebSocket

**Stage Management**
- Manually activate a pending stage
- Complete an admin stage (triggers assignment approval emails)
- Review assignment results; approve or re-run
- Initiate supplementary stages
- View historical assignment results

**Recruitment Management (additions)**
- Recruitments can be archived / unarchived; archived recruitments are visually separated on the dashboard
- Hard delete is available only for archived recruitments; cascades to all related stages, slots, destinations, and registrations (and orphaned users who have no other registrations are also cleaned up)
- Dashboard shows recruitment status badges: `upcoming`, `current`, `completed`, `archived`

**Admin Notes**
- Admins can attach free-text notes (max 5000 chars) to any student registration from the applications view
- Notes are stored in the `notes` column of the registrations table
- Notes are visible in the applications view and are included in the assignment algorithm context (surfaced in tie-resolution UI)
- Notes are audited via the standard registration update audit event

**Email Log**
- `/admin/email-log` page shows all outbound emails with status, recipient, subject, timestamps
- Filterable by status (`pending`, `processing`, `sent`, `failed`) and searchable by recipient or subject
- Backed by the `email_queue` table; all emails are enqueued before delivery

**Audit Log**
- View full audit trail with filters (recruitment, actor type, action type, date range)
- Searchable by email or resource ID
- Each entry shows actor, action, resource, IP, timestamp
- Expandable JSON details (before/after diffs for edits)

### 7.2 Student Registration Flow (Single Page)

A single-page, multi-step wizard accessible via the unique slot link. The page first displays a **welcome screen** before the student begins entering data.

**Welcome screen:** Shown before step 1. Displays recruitment details (name, description, dates), slot number, and a "Start Registration" button. If the slot is already registered and the initial stage is still active, the welcome screen offers an "Edit Registration" option instead.

| Step | Fields | Notes |
|---|---|---|
| 1 | Email, email consent checkbox, privacy policy consent checkbox | Privacy policy is a static external link |
| 2 | One-time code verification | Code sent to the email from step 1 |
| 3 | Full name, university enrollment ID (6 digits, no leading 0) | |
| 4 | Level: bachelor or master year (radio: bachelor_1/2/3, master_1/2/3) | |
| 5 | Spoken languages (checkboxes) | |
| 6 | Destination preferences (ranked 1..N) | Filtered by language + available slots + eligible levels; max N = recruitment's `max_destination_choices` |
| 7 (summary) | Read-only summary of all data | Checkbox: "I reviewed all the above data, and it's all correct" + "Complete Registration" button |

**UX requirements:**
- All previously entered data remains visible as user progresses
- Back navigation to any previous step with ability to edit
- If student changes level or languages in earlier steps, destination list in step 6 updates reactively
- After completion: "Process completed" confirmation screen
- Student can revisit the link and update any data until initial stage end date
- Slot status transitions: `open` → `registration_started` on step 1, `registration_started` → `registered` on completion

**Supplementary registration lock:** When a student accesses their registration via a supplementary token link, steps 4 (level) and 5 (spoken languages) are read-only and cannot be changed. Only destination preferences can be updated.

### 7.3 Teacher Management View

Accessed via teacher management link (no login required, secured by HMAC signature).

**Displays:**
- Slot status (open / registration started / registered)
- All student-entered data (even if registration is incomplete)
- Score fields (average result, additional activities, recommendation letters)

**Teacher can edit:**
- Any student-entered field, including spoken languages
- Average result (float, 0.0–6.0, one decimal)
- Additional activities count (integer, 0–4)
- Recommendation letters count (integer, 0–10)
- All teacher edits are audited and broadcast to the admin dashboard in real time

### 7.4 Supplementary Stage — Student View

When a supplementary stage is active, students receive an email with a secure token link. On visiting the link:
- Student sees their current assignment (if any)
- Option to cancel the current assignment (slot freed for re-allocation)
- Option to update destination preferences (replaces previous list entirely)
- Warning: submitting new preferences cancels the existing assignment
- Token is tied to the supplementary stage and expires at the stage end date

---

## 8. Pages / Routes Summary

| Route | Access | Description |
|---|---|---|
| `/` | Public | Landing page |
| `/admin/login` | Public | Admin login: email → OTP verification |
| `/admin/dashboard` | Admin | List of all recruitments with status badges; invite admin button |
| `/admin/admins` | Admin | List all admins; disable admins; invite new admin |
| `/admin/recruitment/:id` | Admin | Recruitment detail: stages, slots, destinations |
| `/admin/recruitment/:id/stage/:stageId` | Admin | Live stage dashboard (real-time WebSocket updates) |
| `/admin/recruitment/:id/applications/:stageId` | Admin | All applications with scores and notes; run assignment (with tie resolution UI) |
| `/admin/recruitment/:id/results/:stageId` | Admin | Assignment results review and approval |
| `/admin/audit` | Admin | Global audit log with filtering |
| `/admin/email-log` | Admin | Outbound email log (status, recipient, subject, timestamps) |
| `/register/:slotId` | Public | Student registration wizard (welcome screen + 6 steps) |
| `/manage/:slotId/:signature` | Public | Teacher management view (HMAC-protected) |
| `/supplementary/:token` | Public (token-gated) | Supplementary stage: cancel assignment / update preferences |

---

## 9. Background Jobs / Scheduled Tasks

| Task | Trigger | Action |
|---|---|---|
| Stage transition: initial → admin | Initial stage `end_date` passes | Mark initial stage completed; auto-activate next admin stage; send initial-stage-closed emails to enrolled students |
| Stage transition: supplementary → admin | Supplementary stage `end_date` passes | Mark supplementary stage completed; auto-activate next admin stage |
| OTP cleanup | Periodic | Remove expired one-time codes |
| Email worker | Continuous (background) | Polls `email_queue` for `pending` entries; delivers via SMTP/Resend; updates status to `sent` or `failed`; retries on failure |

---

## 10. API Routes Summary

### Authentication
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/otp/send` | POST | Issue OTP to email |
| `/api/auth/otp/verify` | POST | Verify OTP, create session |
| `/api/auth/logout` | POST | Clear session |

### Student Registration
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/registration/[slotId]` | GET | Slot info, recruitment details, current registration state |
| `/api/registration/[slotId]/step` | POST | Advance registration step (1–6) |
| `/api/registration/[slotId]/complete` | POST | Complete registration, send confirmation email, broadcast WebSocket event |
| `/api/registration/[slotId]/destinations` | GET | Filtered destinations for student's level and languages |

### Teacher Management
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/teacher/[slotId]/[signature]` | GET | Get registration data (HMAC-verified) |
| `/api/teacher/[slotId]/[signature]` | PATCH | Update student scores; audit + broadcast |

### Admin — Recruitments
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/admin/recruitments` | GET | List all recruitments |
| `/api/admin/recruitments` | POST | Create recruitment (auto-creates initial + admin stages) |
| `/api/admin/recruitments/[id]` | GET | Get recruitment with stages, slots, destinations |
| `/api/admin/recruitments/[id]` | PATCH | Update recruitment details |
| `/api/admin/recruitments/[id]/stages` | GET/POST | List stages; add supplementary + paired admin stage |
| `/api/admin/recruitments/[id]/slots` | GET/POST | List slots; bulk add N slots |
| `/api/admin/recruitments/[id]/destinations/[destId]` | GET/PATCH/DELETE | Manage individual destination |
| `/api/admin/recruitments/[id]/eligible-levels` | GET/PATCH | Get/update eligible levels |
| `/api/admin/recruitments/[id]/pdf` | GET | Generate bulk PDF of all slot links |

### Admin — Stages
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/admin/stages/[id]/activate` | POST | Manually activate a pending stage |
| `/api/admin/stages/[id]/dashboard` | GET | Live dashboard data (counts, recent registrations) |
| `/api/admin/stages/[id]/applications` | GET | All registrations for this stage with scores/assignments |
| `/api/admin/stages/[id]/assign` | POST | Run assignment algorithm |
| `/api/admin/stages/[id]/approve` | POST | Approve results; auto-email assigned/unassigned students |
| `/api/admin/stages/[id]/complete` | POST | Mark admin stage completed; transition to next stage |
| `/api/admin/stages/[id]/results` | GET | Get assignment results with counts |

### Admin — Other
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/admin/admins` | GET | List all admins with status |
| `/api/admin/admins` | POST | Invite new admin; send invite email |
| `/api/admin/admins/[id]` | PATCH | Disable an admin account (sets `disabled_at`) |
| `/api/admin/session` | GET | Check current admin session (used for invalidation detection) |
| `/api/admin/registrations/[id]` | GET | Get registration details |
| `/api/admin/registrations/[id]` | PATCH | Update registration fields including `notes` |
| `/api/admin/recruitments/[id]/archive` | POST | Archive or unarchive a recruitment (`{ action: "archive" \| "unarchive" }`) |
| `/api/admin/recruitments/[id]` | DELETE | Hard-delete an archived recruitment (cascades) |
| `/api/admin/audit` | GET | Audit log with filtering |
| `/api/admin/email-queue` | GET | Email log with status/search filtering |
| `/api/admin/supplementary/start` | POST | Activate supplementary stage; generate tokens; email all students |

### Supplementary
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/supplementary/[token]` | GET | Verify token, return registration for re-editing |

---

## 11. Real-Time WebSocket Events

The live stage dashboard and applications view receive push events via WebSocket. Events are scoped per stage ID.

| Event | When Emitted | Payload |
|---|---|---|
| `registration_update` | Student completes registration | Updated slot counts (registered, started, open) |
| `registration_step_update` | Student advances a step | Individual registration row update |
| `slot_status_update` | Slot status changes | Updated open/started slot counts |
| `application_row_update` | Admin or teacher edits application | Full updated application row |
| `application_assignments_update` | Assignment algorithm runs | All assignments + counts |
| `stage_completed` | Stage marked complete | Cleanup signal for subscribed dashboards |

---

## 12. Audit Log

### 12.1 Overview
Every meaningful action in the system is recorded in an append-only audit log. Entries are immutable — they can never be edited or deleted. The log is viewable from the admin panel with filtering and search capabilities.

### 12.2 Audit Log Entry
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| timestamp | datetime | When the action occurred (UTC) |
| actor_type | enum | `admin`, `student`, `teacher`, `system` |
| actor_id | UUID, nullable | FK → User (null for `system` and `teacher` actions) |
| actor_label | string | Human-readable identifier (e.g. email, "System", "Teacher via slot #12") |
| action | string | Machine-readable action key |
| resource_type | string | Entity type affected |
| resource_id | UUID | ID of the affected entity |
| recruitment_id | UUID, nullable | FK → Recruitment (for easy filtering) |
| details | JSON | Structured payload with before/after values or contextual data |
| ip_address | string, nullable | Request IP address |

### 12.3 Tracked Actions

**Admin actions:**
- `recruitment.created`, `recruitment.updated`, `recruitment.archived`, `recruitment.unarchived`, `recruitment.deleted`
- `stage.created`, `stage.updated`, `stage.completed`, `stage.transitioned`
- `slot.added`, `slot.removed`
- `destination.created`, `destination.updated`, `destination.removed`
- `assignment.computed`, `assignment.approved`
- `supplementary_stage.started`
- `bulk_pdf.generated`
- `admin.invited`, `admin.disabled`

**Student actions:**
- `registration.step_completed` (step number in details)
- `registration.completed`
- `registration.updated` (changed fields in details)
- `assignment.cancelled` (supplementary stage cancellation)
- `preferences.updated` (supplementary stage preference change)

**Teacher actions:**
- `teacher.scores_entered` (average result, activities, letters with before/after values)

**System actions:**
- `otp.issued`, `otp.verified`, `otp.expired`
- `email.sent` (recipient, template, recruitment context)

### 12.4 Admin Panel — Audit Log View
- Filterable by: recruitment, action type, actor type, date range, resource type
- Searchable by: actor label (email), resource ID
- Sorted by timestamp descending (most recent first)
- Each entry expandable to show full JSON details (before/after diffs for edits)

---

## 13. Security Model

| Mechanism | Coverage |
|---|---|
| OTP (6-char, 10 min, single-use) | Admin login; student identity verification |
| HMAC-signed teacher links | Teacher management access without a login session |
| iron-session cookies (HttpOnly) | Admin and student sessions stored separately to avoid cross-role collision |
| Admin session invalidation | `disabled_at` checked on each request; disabled admins are immediately locked out even with a valid cookie |
| Zod input validation | All API routes |
| Audit trail | All actor-triggered actions with IP address |
| Email consent capture | Privacy and email marketing opt-in per registration |
| Recruitment hard-delete guard | Only archived recruitments may be deleted; prevents accidental data loss |

---

## 14. Edge Cases & Validation Rules

- **Enrollment ID:** exactly 6 digits, first digit 1–9
- **OTP:** 6 alphanumeric characters (no ambiguous chars: 0, O, I, 1, L), expires after 10 minutes, single use
- **Stage dates:** each stage's start date must be ≥ previous stage's end date
- **Slot link reuse:** if a student visits a registration link for an already-registered slot, show the current data (allow edits if within initial stage)
- **Teacher link with no student data:** teacher sees empty form, can still pre-fill data
- **Assignment with missing teacher data:** treat null scores as 0 (score = 0 + 0 + 0 = 0)
- **No valid destinations:** if after filtering a student has zero eligible destinations, they cannot complete step 6 — show an appropriate message
- **Destination slots exhausted mid-registration:** validate slot availability at the moment of final submission. If a destination becomes full between display and submission, show an error and ask the student to re-pick.
- **Concurrent registrations:** slot assignment is atomic (DB-level locking or optimistic concurrency) to prevent two students claiming the same slot
- **Admin stage end date:** informational only — the stage doesn't auto-complete; it is up to the admin
- **Supplementary token expiry:** token is invalidated when the supplementary stage ends; expired tokens return an appropriate error page
- **Re-applying in supplementary:** submitting new preferences via supplementary link cancels the existing assignment; student is warned before confirming
