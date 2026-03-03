import { broadcastToStage } from "./server";

export interface RegistrationEvent {
  type: "registration_update";
  stageId: string;
  registeredCount: number;
  openSlotsCount: number;
  latestRegistration?: {
    studentName: string;
    slotNumber: number;
    completedAt: string;
  };
}

export function broadcastRegistrationUpdate(event: RegistrationEvent): void {
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
