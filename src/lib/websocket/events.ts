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
