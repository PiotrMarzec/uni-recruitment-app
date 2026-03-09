type SlotRow = { status: string; registrationCompleted: boolean | null };

/**
 * Derive dashboard stats from a list of slot rows (each left-joined with its
 * registration row so `registrationCompleted` may be null when no registration
 * exists yet).
 *
 * "Registered" is intentionally based on `registrationCompleted` rather than
 * slot status, because re-opening a completed registration link reverts the
 * slot to `registration_started` until the student re-submits.  Using the
 * completion flag avoids showing such slots as "In Progress" even though the
 * registration is fully done.
 */
export function computeSlotStats(rows: SlotRow[]) {
  const totalSlots = rows.length;
  const openSlots = rows.filter((s) => s.status === "open").length;
  const registeredSlots = rows.filter((s) => s.registrationCompleted === true).length;
  const startedSlots = rows.filter(
    (s) => s.status === "registration_started" && s.registrationCompleted !== true
  ).length;
  return { totalSlots, openSlots, registeredSlots, startedSlots };
}
