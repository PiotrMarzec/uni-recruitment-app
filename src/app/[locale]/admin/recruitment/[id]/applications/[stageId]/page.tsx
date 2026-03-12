"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCheck, Square } from "lucide-react";
import { getStageName } from "@/lib/stage-name";
import { RegistrationsGrid } from "@/components/admin/registrations-grid";
import type { TieInfo, TieStudent } from "@/lib/algorithm/assignment";

// ── Tiebreaker modal ──────────────────────────────────────────────────────────

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
}: {
  student: TieStudent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tt: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tresults: any;
  destinations: Destination[];
}) {
  const destMap = new Map(destinations.map((d) => [d.id, d.name]));
  return (
    <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
      <p className="font-semibold text-base">{student.fullName}</p>
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
    </div>
  );
}

function TiebreakerModal({
  tie,
  tt,
  tresults,
  assigning,
  onChoose,
  onCancel,
}: {
  tie: TieInfo;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tt: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tresults: any;
  assigning: boolean;
  onChoose: (winnerId: string) => void;
  onCancel: () => void;
}) {
  const allDestIds = [
    ...new Set([
      ...tie.studentA.destinationPreferences,
      ...tie.studentB.destinationPreferences,
    ]),
  ];
  const destList: Destination[] = allDestIds.map((id) => ({
    id,
    name:
      tie.studentA.destinationNames[tie.studentA.destinationPreferences.indexOf(id)] ??
      tie.studentB.destinationNames[tie.studentB.destinationPreferences.indexOf(id)] ??
      id,
  }));

  function outcomeText(outcome: {
    destinationId: string | null;
    destinationName: string | null;
  }) {
    if (outcome.destinationId && outcome.destinationName) {
      return tt("loserOutcomeAssigned", { destination: outcome.destinationName });
    }
    return tt("loserOutcomeUnassigned");
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-xl max-w-3xl w-full shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="p-6 border-b">
          <h2 className="text-lg font-bold text-destructive">{tt("title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {tt("description", {
              studentA: tie.studentA.fullName,
              studentB: tie.studentB.fullName,
              score: tie.studentA.score.toFixed(1),
              destination: tie.destinationName,
            })}
          </p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StudentCard student={tie.studentA} tt={tt} tresults={tresults} destinations={destList} />
          <StudentCard student={tie.studentB} tt={tt} tresults={tresults} destinations={destList} />
        </div>
        <div className="p-6 border-t grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 space-y-3">
            <p className="font-medium text-sm">{tt("winLabel", { name: tie.studentA.fullName })}</p>
            <p className="text-xs text-muted-foreground">{outcomeText(tie.outcomeIfAWins)}</p>
            <Button
              className="w-full"
              onClick={() => onChoose(tie.studentA.registrationId)}
              disabled={assigning}
            >
              {assigning ? tt("resolving") : tt("winLabel", { name: tie.studentA.fullName })}
            </Button>
          </div>
          <div className="border rounded-lg p-4 space-y-3">
            <p className="font-medium text-sm">{tt("winLabel", { name: tie.studentB.fullName })}</p>
            <p className="text-xs text-muted-foreground">{outcomeText(tie.outcomeIfBWins)}</p>
            <Button
              className="w-full"
              onClick={() => onChoose(tie.studentB.registrationId)}
              disabled={assigning}
            >
              {assigning ? tt("resolving") : tt("winLabel", { name: tie.studentB.fullName })}
            </Button>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={assigning}>
            Cancel
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
  const tt = useTranslations("admin.applications.tiebreaker");
  const tc = useTranslations("common");
  const td = useTranslations("admin.dashboard");
  const tr = useTranslations("admin.recruitment");
  const tresults = useTranslations("admin.results");

  const recruitmentId = params.id as string;
  const stageId = params.stageId as string;

  const [stageName, setStageName] = useState("");
  const [hasAssignments, setHasAssignments] = useState(false);
  const [hasNextSupplementary, setHasNextSupplementary] = useState(true);
  const [showNoSupplementaryWarning, setShowNoSupplementaryWarning] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [lastAssignResult, setLastAssignResult] = useState<{
    assigned: number;
    unassigned: number;
  } | null>(null);
  const [pendingTie, setPendingTie] = useState<TieInfo | null>(null);
  const [hasEditing, setHasEditing] = useState(false);

  function handleDataLoad(info: {
    hasAssignments: boolean;
    hasNextSupplementary: boolean;
    stage: { type: string; order: number } | null;
  }) {
    setHasAssignments(info.hasAssignments);
    setHasNextSupplementary(info.hasNextSupplementary);
    if (info.stage) setStageName(getStageName(info.stage));
  }

  async function assignStudents(tiebreakerWinnerId?: string) {
    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/stages/${stageId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tiebreakerWinnerId ? { tiebreakerWinnerId } : {}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tie) {
          setPendingTie(data.tie as TieInfo);
        } else {
          setPendingTie(null);
          setHasAssignments(true);
          setLastAssignResult({ assigned: data.assigned, unassigned: data.unassigned });
        }
      }
    } finally {
      setAssigning(false);
    }
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
        { label: tr("breadcrumb"), href: `/admin/recruitment/${recruitmentId}` },
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
            onClick={() => assignStudents()}
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

      {/* Tiebreaker modal */}
      {pendingTie && (
        <TiebreakerModal
          tie={pendingTie}
          tt={tt}
          tresults={tresults}
          assigning={assigning}
          onChoose={(winnerId) => {
            setPendingTie(null);
            assignStudents(winnerId);
          }}
          onCancel={() => setPendingTie(null)}
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
