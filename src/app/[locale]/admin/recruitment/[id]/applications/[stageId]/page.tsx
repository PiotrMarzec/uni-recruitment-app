"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCheck, Square, Check } from "lucide-react";
import { getStageName } from "@/lib/stage-name";
import { RegistrationsGrid } from "@/components/admin/registrations-grid";
import type { ConflictInfo, ConflictStudent, ConflictResolution } from "@/lib/algorithm/assignment";

// ── Conflict modal ──────────────────────────────────────────────────────────

import { STUDENT_LEVEL_LABELS, StudentLevel } from "@/db/schema/registrations";

interface Destination {
  id: string;
  name: string;
}

function StudentCard({
  student,
  tt,
  tresults,
  destinations,
  selected,
  onToggle,
  disabled,
}: {
  student: ConflictStudent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tt: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tresults: any;
  destinations: Destination[];
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const destMap = new Map(destinations.map((d) => [d.id, d.name]));
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !selected}
      className={`relative border border-muted rounded-lg p-4 space-y-2 text-left w-full transition-colors ${
        selected
          ? "bg-green-50 outline outline-2 outline-green-500"
          : disabled
            ? "bg-muted/20 opacity-60 cursor-not-allowed"
            : "bg-muted/30 hover:bg-muted/50 cursor-pointer"
      }`}
    >
      <div className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center ${
        selected ? "bg-green-500" : "bg-transparent"
      }`}>
        {selected && <Check className="w-4 h-4 text-white" />}
      </div>
      <div>
        <p className="font-semibold text-base pr-8">{student.fullName}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">{tresults("level")}</span>
        <span>
          {student.level ? (
            <Badge variant="secondary">
              {STUDENT_LEVEL_LABELS[student.level as StudentLevel] ?? student.level}
            </Badge>
          ) : (
            "—"
          )}
        </span>
        <span className="text-muted-foreground">{tresults("languages")}</span>
        <span className="flex flex-wrap gap-1">
          {student.spokenLanguages.length > 0
            ? student.spokenLanguages.map((l) => (
                <Badge key={l} variant="outline" className="text-xs">
                  {l}
                </Badge>
              ))
            : "—"}
        </span>
        <span className="text-muted-foreground">{tresults("avgResult")}</span>
        <span>{student.averageResult.toFixed(1)}</span>
        <span className="text-muted-foreground">{tresults("activities")}</span>
        <span>{student.additionalActivities}</span>
        <span className="text-muted-foreground">{tresults("letters")}</span>
        <span>{student.recommendationLetters}</span>
        <span className="text-muted-foreground font-medium">{tresults("score")}</span>
        <span className="font-semibold">{student.score.toFixed(1)}</span>
        <span className="text-muted-foreground">{tt("preferences")}</span>
        <span>
          <ol className="list-none space-y-0.5">
            {student.destinationPreferences.map((id, i) => (
              <li key={id} className="text-xs">
                <span className="text-muted-foreground mr-1">{i + 1}.</span>
                {destMap.get(id) ?? id}
              </li>
            ))}
          </ol>
        </span>
      </div>
      {student.notes && (
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-0.5">{tt("notes")}</p>
          <p className="text-sm whitespace-pre-wrap">{student.notes}</p>
        </div>
      )}
    </button>
  );
}

function ConflictModal({
  conflict,
  tt,
  tresults,
  assigning,
  onResolve,
  onCancel,
}: {
  conflict: ConflictInfo;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tt: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tresults: any;
  assigning: boolean;
  onResolve: (winnerIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allDestIds = [
    ...new Set(conflict.students.flatMap((s) => s.destinationPreferences)),
  ];
  const destList: Destination[] = allDestIds.map((id) => {
    for (const s of conflict.students) {
      const idx = s.destinationPreferences.indexOf(id);
      if (idx !== -1) return { id, name: s.destinationNames[idx] };
    }
    return { id, name: id };
  });

  function toggleStudent(regId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(regId)) {
        next.delete(regId);
      } else if (next.size < conflict.availableSlots) {
        next.add(regId);
      }
      return next;
    });
  }

  const canConfirm = selectedIds.size === conflict.availableSlots;

  const slotTypeLabel =
    conflict.slotType === "bachelor"
      ? tt("bachelorSlots")
      : conflict.slotType === "master"
        ? tt("masterSlots")
        : tt("openSlots");

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-xl max-w-4xl w-full shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="p-6 border-b">
          <h2 className="text-lg font-bold text-destructive">{tt("title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {tt("description", {
              count: conflict.students.length,
              slots: conflict.availableSlots,
              slotType: slotTypeLabel,
              destination: conflict.destinationName,
            })}
          </p>
          <p className="text-sm font-medium mt-2">
            {tt("selectExactly", { count: conflict.availableSlots })}
            {" — "}
            <span className={canConfirm ? "text-green-600" : "text-amber-600"}>
              {tt("selected", { count: selectedIds.size, total: conflict.availableSlots })}
            </span>
          </p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          {conflict.students.map((student) => (
            <StudentCard
              key={student.registrationId}
              student={student}
              tt={tt}
              tresults={tresults}
              destinations={destList}
              selected={selectedIds.has(student.registrationId)}
              onToggle={() => toggleStudent(student.registrationId)}
              disabled={!selectedIds.has(student.registrationId) && selectedIds.size >= conflict.availableSlots}
            />
          ))}
        </div>
        <div className="p-6 border-t flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={assigning}>
            {tt("cancel")}
          </Button>
          <Button
            onClick={() => onResolve([...selectedIds])}
            disabled={!canConfirm || assigning}
          >
            {assigning ? tt("resolving") : tt("confirmSelection")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("admin.applications");
  const tt = useTranslations("admin.applications.conflict");
  const tc = useTranslations("common");
  const td = useTranslations("admin.dashboard");
  const tr = useTranslations("admin.recruitment");
  const tresults = useTranslations("admin.results");
  const troot = useTranslations();

  const recruitmentId = params.id as string;
  const stageId = params.stageId as string;

  const [stageName, setStageName] = useState("");
  const [recruitmentName, setRecruitmentName] = useState("");
  const [hasAssignments, setHasAssignments] = useState(false);
  const [hasNextSupplementary, setHasNextSupplementary] = useState(true);
  const [showNoSupplementaryWarning, setShowNoSupplementaryWarning] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [lastAssignResult, setLastAssignResult] = useState<{
    assigned: number;
    unassigned: number;
  } | null>(null);
  const [pendingConflict, setPendingConflict] = useState<ConflictInfo | null>(null);
  const [accumulatedResolutions, setAccumulatedResolutions] = useState<ConflictResolution[]>([]);
  const [hasEditing, setHasEditing] = useState(false);

  function handleDataLoad(info: {
    hasAssignments: boolean;
    hasNextSupplementary: boolean;
    stage: { type: string; order: number } | null;
    recruitmentName: string | null;
  }) {
    setHasAssignments(info.hasAssignments);
    setHasNextSupplementary(info.hasNextSupplementary);
    if (info.stage) setStageName(getStageName(info.stage, troot));
    if (info.recruitmentName) setRecruitmentName(info.recruitmentName);
  }

  useEffect(() => {
    if (recruitmentName) {
      document.title = `Regie - ${recruitmentName} - ${t("title")}`;
    }
  }, [recruitmentName, t]);

  async function assignStudents(resolutions?: ConflictResolution[]) {
    setAssigning(true);
    try {
      const body: Record<string, unknown> = {};
      if (resolutions && resolutions.length > 0) {
        body.conflictResolutions = resolutions;
      }
      const res = await fetch(`/api/admin/stages/${stageId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.conflict) {
          setPendingConflict(data.conflict as ConflictInfo);
        } else {
          setPendingConflict(null);
          setAccumulatedResolutions([]);
          setHasAssignments(true);
          setLastAssignResult({ assigned: data.assigned, unassigned: data.unassigned });
        }
      }
    } finally {
      setAssigning(false);
    }
  }

  function handleConflictResolve(winnerIds: string[]) {
    if (!pendingConflict) return;
    const newResolution: ConflictResolution = {
      destinationId: pendingConflict.destinationId,
      slotType: pendingConflict.slotType,
      winnerIds,
    };
    const updatedResolutions = [...accumulatedResolutions, newResolution];
    setAccumulatedResolutions(updatedResolutions);
    setPendingConflict(null);
    assignStudents(updatedResolutions);
  }

  async function completeStage() {
    if (!hasNextSupplementary) {
      setShowNoSupplementaryWarning(true);
      return;
    }
    await doCompleteStage();
  }

  async function doCompleteStage() {
    setCompleting(true);
    try {
      const res = await fetch(`/api/admin/stages/${stageId}/complete`, { method: "POST" });
      if (res.ok) {
        router.push(`/admin/recruitment/${recruitmentId}`);
      }
    } finally {
      setCompleting(false);
    }
  }

  return (
    <AdminLayout
      fullWidth
      breadcrumbs={[
        { label: td("breadcrumb"), href: "/admin/dashboard" },
        { label: recruitmentName || tr("breadcrumb"), href: `/admin/recruitment/${recruitmentId}` },
        { label: stageName },
        { label: t("title") },
      ]}
    >
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{stageName}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastAssignResult && (
            <p className="text-sm text-muted-foreground">
              {t("lastRun")}{" "}
              <span className="text-green-600 font-medium">
                {lastAssignResult.assigned} {t("assigned")}
              </span>
              {lastAssignResult.unassigned > 0 && (
                <span className="text-amber-600 font-medium">
                  , {lastAssignResult.unassigned} {t("unassigned")}
                </span>
              )}
            </p>
          )}
          <Button
            onClick={() => { setAccumulatedResolutions([]); assignStudents(); }}
            disabled={assigning || completing || hasEditing}
            title={hasEditing ? t("editPendingTitle") : undefined}
          >
            <UserCheck className="w-4 h-4 mr-1.5" />
            {assigning ? t("assigning") : t("assignStudents")}
          </Button>
          {hasAssignments && (
            <Button
              variant="destructive"
              onClick={completeStage}
              disabled={completing || assigning || hasEditing}
            >
              <Square className="w-4 h-4 mr-1.5" />
              {completing ? t("ending") : t("endStage")}
            </Button>
          )}
        </div>
      </div>

      {/* Registrations grid */}
      <RegistrationsGrid
        recruitmentId={recruitmentId}
        stageId={stageId}
        defaultSortKey="name"
        defaultSortDir="asc"
        defaultStatusFilter="all"
        defaultSearchQuery=""
        onDataLoad={handleDataLoad}
        onEditingChange={setHasEditing}
        onAssignmentsUpdate={(ha) => setHasAssignments(ha)}
      />

      {/* Conflict resolution modal */}
      {pendingConflict && (
        <ConflictModal
          conflict={pendingConflict}
          tt={tt}
          tresults={tresults}
          assigning={assigning}
          onResolve={handleConflictResolve}
          onCancel={() => { setPendingConflict(null); setAccumulatedResolutions([]); }}
        />
      )}

      {/* No-supplementary warning modal */}
      {showNoSupplementaryWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 max-w-lg w-full mx-4 shadow-lg">
            <h3 className="font-semibold text-base mb-2">{t("noSupplementaryTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t("noSupplementaryDesc")}</p>
            <div className="flex gap-2 justify-between">
              <Button
                variant="outline"
                onClick={() => setShowNoSupplementaryWarning(false)}
              >
                {tc("cancel")}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setShowNoSupplementaryWarning(false);
                    router.push(`/admin/recruitment/${recruitmentId}?addStage=1`);
                  }}
                >
                  {t("addSupplementaryStage")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    setShowNoSupplementaryWarning(false);
                    await doCompleteStage();
                  }}
                >
                  <Square className="w-4 h-4 mr-1.5" />
                  {t("endStageAnyway")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
