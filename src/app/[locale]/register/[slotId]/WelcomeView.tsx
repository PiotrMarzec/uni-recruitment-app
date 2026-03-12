"use client";

import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
  type: "initial" | "admin" | "supplementary";
  status: "pending" | "active" | "completed";
  order: number;
}

interface WelcomeViewProps {
  recruitment: { name: string; description: string | null };
  allStages: Stage[];
  isRegistrationOpen: boolean;
  registration: {
    level: string | null;
    spokenLanguages: string[];
    destinationPreferences: string[];
    enrollmentId: string | null;
    registrationCompleted: boolean;
  } | null;
  student: { fullName: string; email: string } | null;
  destinationNames: string[];
  onProceed: () => void;
}

export default function WelcomeView({
  recruitment,
  allStages,
  isRegistrationOpen,
  registration,
  student,
  destinationNames,
  onProceed,
}: WelcomeViewProps) {
  const t = useTranslations("registration.welcome");
  const locale = useLocale();

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const pendingSupplementaryStages = allStages.filter(
    (s) => s.type === "supplementary" && s.status === "pending"
  );

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
                      {stage.name}
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
