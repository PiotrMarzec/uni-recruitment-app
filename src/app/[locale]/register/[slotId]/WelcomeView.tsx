"use client";

import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { computeScore } from "@/lib/algorithm/score";
import { getStageName } from "@/lib/stage-name";

const STUDENT_LEVEL_LABELS: Record<string, string> = {
  bachelor_1: "Bachelor (1st year)",
  bachelor_2: "Bachelor (2nd year)",
  bachelor_3: "Bachelor (3rd year)",
  master_1: "Master (1st year)",
  master_2: "Master (2nd year)",
  master_3: "Master (3rd year)",
};

interface Stage {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  type: "initial" | "admin" | "supplementary" | "verification";
  status: "pending" | "active" | "completed";
  order: number;
}

interface WelcomeViewProps {
  recruitment: { name: string; description: string | null };
  allStages: Stage[];
  isRegistrationOpen: boolean;
  isVerificationStageActive?: boolean;
  isAdminStageActive?: boolean;
  registration: {
    level: string | null;
    spokenLanguages: string[];
    destinationPreferences: string[];
    enrollmentId: string | null;
    registrationCompleted: boolean;
    averageResult?: string | null;
    additionalActivities?: number | null;
    recommendationLetters?: number | null;
  } | null;
  student: { fullName: string; email: string } | null;
  destinationNames: string[];
  currentAssignment?: { destinationId: string; destinationName: string } | null;
  assignmentCancelled?: boolean;
  onProceed: () => void;
}

export default function WelcomeView({
  recruitment,
  allStages,
  isRegistrationOpen,
  isVerificationStageActive = false,
  isAdminStageActive = false,
  registration,
  student,
  destinationNames,
  currentAssignment,
  assignmentCancelled = false,
  onProceed,
}: WelcomeViewProps) {
  const t = useTranslations("registration.welcome");
  const troot = useTranslations();
  const locale = useLocale();

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const pendingSupplementaryStages = allStages.filter(
    (s) => s.type === "supplementary" && s.status === "pending"
  );

  // Determine which stage is currently active
  const activeStage = allStages.find((s) => s.status === "active");
  const isInitialActive = activeStage?.type === "initial";
  const isAdminActive = activeStage?.type === "admin";
  const isSupplementaryActive = activeStage?.type === "supplementary";

  // Determine score visibility based on current stage context
  // Show scores during: verification, supplementary, and when no stage is active (recruitment over)
  // Hide scores during: before recruitment, initial stage, admin stage
  const shouldShowScores = (() => {
    if (!registration) return false;
    if (isVerificationStageActive) return true;
    if (isSupplementaryActive) return true;
    if (isAdminActive) return true; // supplementary admin shows scores from prev verification
    if (!activeStage) return true; // recruitment over
    return false;
  })();

  const hasScores =
    shouldShowScores &&
    registration &&
    (registration.averageResult != null ||
      registration.additionalActivities != null ||
      registration.recommendationLetters != null);

  const computedScore = hasScores
    ? computeScore(
        registration!.averageResult ?? null,
        registration!.additionalActivities ?? null,
        registration!.recommendationLetters ?? null
      )
    : null;

  // Show assignment based on stage:
  // - verification: show assignment from previous admin stage
  // - supplementary: show assignment from previous verification stage
  // - supplementary admin: show current assignment if approved previously
  // - no active stage: show from last verification stage
  const shouldShowAssignment = (() => {
    if (isVerificationStageActive) return true;
    if (isSupplementaryActive) return true;
    if (isAdminActive) return true;
    if (!activeStage && !isInitialActive) return true; // recruitment over
    return false;
  })();

  const hasExistingRegistration = !!registration && !!student;

  return (
    <div className="space-y-6">
      {/* Recruitment info */}
      <Card>
        <CardHeader>
          <CardTitle>{recruitment.name}</CardTitle>
          {recruitment.description && (
            <CardDescription className="mt-1 whitespace-pre-wrap">
              {recruitment.description}
            </CardDescription>
          )}
        </CardHeader>
      </Card>

      {/* Registration completed banner */}
      {registration?.registrationCompleted && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-300 rounded-lg">
          <CheckCircle2 className="text-green-600 shrink-0" size={22} />
          <span className="text-sm font-medium text-green-800">{t("registrationCompleted")}</span>
        </div>
      )}

      {/* Assigned destination */}
      {shouldShowAssignment && currentAssignment && (
        <Card className="border-green-300 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-green-800">{t("assignedDestination")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold text-green-900">{currentAssignment.destinationName}</p>
          </CardContent>
        </Card>
      )}

      {/* Assignment cancelled (student updated preferences during supplementary) */}
      {shouldShowAssignment && !currentAssignment && assignmentCancelled && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-800">{t("assignmentCancelled")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-700">{t("assignmentCancelledDesc")}</p>
          </CardContent>
        </Card>
      )}

      {/* No assignment (student was not assigned to any destination) */}
      {shouldShowAssignment && !currentAssignment && !assignmentCancelled && registration?.registrationCompleted && (
        <Card className="border-muted bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">{t("noAssignment")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("noAssignmentDesc")}</p>
          </CardContent>
        </Card>
      )}

      {/* Stages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("stages")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {allStages.map((stage) => {
              const isActive = stage.status === "active";
              return (
                <div
                  key={stage.id}
                  className={`p-3 border rounded-lg ${
                    isActive ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm ${isActive ? "font-bold" : "font-medium"}`}>
                      {getStageName(stage, troot)}
                    </span>
                    {isActive && (
                      <Badge variant="default" className="text-xs">
                        {t("current")}
                      </Badge>
                    )}
                  </div>
                  {stage.description && (
                    <p className="text-xs text-muted-foreground mb-1">{stage.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(stage.startDate)} – {formatDate(stage.endDate)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Existing registration details */}
      {hasExistingRegistration && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("yourRegistration")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">{t("fieldName")}:</span>
                <span>{student!.fullName}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">{t("fieldEmail")}:</span>
                <span>{student!.email}</span>
              </div>
              {registration!.enrollmentId && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-36 shrink-0">{t("fieldEnrollmentId")}:</span>
                  <span>{registration!.enrollmentId}</span>
                </div>
              )}
              {registration!.level && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-36 shrink-0">{t("fieldLevel")}:</span>
                  <span>{STUDENT_LEVEL_LABELS[registration!.level] ?? registration!.level}</span>
                </div>
              )}
              {registration!.spokenLanguages.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-36 shrink-0">{t("fieldLanguages")}:</span>
                  <span>{registration!.spokenLanguages.join(", ")}</span>
                </div>
              )}
              {destinationNames.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-36 shrink-0">{t("fieldDestinations")}:</span>
                  <ol className="list-decimal list-inside space-y-0.5">
                    {destinationNames.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scoring details */}
      {hasScores && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("yourScore")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">{t("fieldAvgResult")}:</span>
                <span>{registration!.averageResult ?? 0}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">{t("fieldActivities")}:</span>
                <span>{registration!.additionalActivities ?? 0}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">{t("fieldLetters")}:</span>
                <span>{registration!.recommendationLetters ?? 0}</span>
              </div>
              <div className="flex gap-2 pt-1 border-t mt-1">
                <span className="text-muted-foreground w-36 shrink-0 font-medium">{t("fieldScore")}:</span>
                <span className="font-semibold">{computedScore?.toFixed(1)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action area */}
      {isRegistrationOpen ? (
        <Button
          onClick={onProceed}
          className={`w-full ${
            hasExistingRegistration
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {hasExistingRegistration ? t("updateRegistration") : t("startRegistration")}
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium">{t("registrationNotOpen")}</p>
            {pendingSupplementaryStages.map((s) => (
              <p key={s.id} className="text-sm text-muted-foreground">
                {t("supplementaryPlanned", {
                  name: s.name,
                  startDate: formatDate(s.startDate),
                  endDate: formatDate(s.endDate),
                })}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
