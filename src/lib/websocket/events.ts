// API routes run in Next.js's webpack module sandbox — a different module instance
// than the custom server. Calling broadcastToStage imported directly would hit an
// empty subscriptions Map. Instead we call the function registered in global by
// server.ts, which closes over the server's real subscriptions Map.
function broadcastToStage(stageId: string, data: object): void {
  const fn = (global as any).__broadcastToStage as
    | ((stageId: string, data: object) => void)
    | undefined;
  fn?.(stageId, data);
}

export interface RegistrationEvent {
  type: "registration_update";
  stageId: string;
  registeredCount: number;
  openSlotsCount: number;
  startedSlotsCount: number;
  latestRegistration?: {
    studentName: string;
    slotNumber: number;
    completedAt: string;
    teacherManagementLink: string;
  };
}

export function broadcastRegistrationUpdate(event: RegistrationEvent): void {
  broadcastToStage(event.stageId, event);
}

export interface RegistrationStepUpdateEvent {
  type: "registration_step_update";
  stageId: string;
  registration: {
    slotId: string;
    slotNumber: number;
    studentName: string;
    studentEmail: string;
    completedAt: string | null;
    updatedAt: string;
    registrationCompleted: boolean;
    teacherManagementLink: string;
    assignedDestination?: string | null;
  };
}

export function broadcastRegistrationStepUpdate(event: RegistrationStepUpdateEvent): void {
  broadcastToStage(event.stageId, event);
}

export interface SlotStatusUpdateEvent {
  type: "slot_status_update";
  stageId: string;
  openSlotsCount: number;
  startedSlotsCount: number;
  /** Present when a slot just transitioned to registration_started */
  startedSlot?: {
    slotId: string;
    slotNumber: number;
    createdAt: string;
    teacherManagementLink: string;
  };
}

export function broadcastSlotStatusUpdate(event: SlotStatusUpdateEvent): void {
  broadcastToStage(event.stageId, event);
}

export interface StageCompletedEvent {
  type: "stage_completed";
  stageId: string;
}

export function broadcastStageCompleted(stageId: string): void {
  broadcastToStage(stageId, {
    type: "stage_completed",
    stageId,
  });
}

// Sent when a single registration row is edited by an admin.
// The full updated application data is included so clients can patch the row
// in-place without reloading the entire grid.
export interface ApplicationRowUpdateEvent {
  type: "application_row_update";
  stageId: string;
  application: {
    registrationId: string;
    slotNumber: number;
    studentName: string;
    enrollmentId: string | null;
    level: string | null;
    spokenLanguages: string[];
    destinationPreferences: string[];
    destinationNames: string[];
    averageResult: number | null;
    additionalActivities: number | null;
    recommendationLetters: number | null;
    score: number;
    assignedDestinationId: string | null;
    assignedDestinationName: string | null;
    registrationCompleted: boolean;
  };
}

export function broadcastApplicationRowUpdate(event: ApplicationRowUpdateEvent): void {
  broadcastToStage(event.stageId, event);
}

// Sent when the assignment algorithm is run.
// Contains the updated assignment for every registration so the Assigned column
// can be refreshed without touching any other field.
export interface ApplicationAssignmentsUpdateEvent {
  type: "application_assignments_update";
  stageId: string;
  assignments: Array<{
    registrationId: string;
    assignedDestinationId: string | null;
    assignedDestinationName: string | null;
  }>;
  assigned: number;
  unassigned: number;
  hasAssignments: boolean;
}

export function broadcastApplicationAssignmentsUpdate(
  event: ApplicationAssignmentsUpdateEvent
): void {
  broadcastToStage(event.stageId, event);
}
