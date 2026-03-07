"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SUPPORTED_LANGUAGES = ["English", "Spanish", "German", "French", "Polish", "Portuguese"] as const;

interface SlotInfo {
  slot: { id: string; number: number; status: string };
  recruitment: { id: string; name: string; maxDestinationChoices: number };
  initialStage: { id: string; status: string; endDate: string } | null;
  isInitialActive: boolean;
  isSupplementaryActive: boolean;
  currentAssignment: { destinationId: string; destinationName: string } | null;
  registration: {
    emailConsent: boolean;
    privacyConsent: boolean;
    level: string | null;
    spokenLanguages: string[];
    destinationPreferences: string[];
    enrollmentId: string | null;
    registrationCompleted: boolean;
  } | null;
  student: { fullName: string; email: string } | null;
}

interface Destination {
  id: string;
  name: string;
  description: string;
  requiredLanguages: string[];
  slotsBachelor: number;
  slotsMaster: number;
  slotsAny: number;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export default function RegisterPage() {
  const params = useParams();
  const slotId = params.slotId as string;
  const t = useTranslations("registration");
  const tc = useTranslations("common");

  const [slotInfo, setSlotInfo] = useState<SlotInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);

  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Form state
  const [email, setEmail] = useState("");
  const [emailConsent, setEmailConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [level, setLevel] = useState<"bachelor" | "master" | "">("");
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>([]);
  const [destinationPreferences, setDestinationPreferences] = useState<string[]>([]);
  const [availableDestinations, setAvailableDestinations] = useState<Destination[]>([]);
  const [destinationsLoading, setDestinationsLoading] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState("");
  const [assignmentLossConfirmed, setAssignmentLossConfirmed] = useState(false);
  // True once the student completes OTP verification in this page session.
  // Prevents changing email/name without re-verifying when a registration already exists.
  const [emailVerifiedThisSession, setEmailVerifiedThisSession] = useState(false);

  useEffect(() => {
    loadSlotInfo();
  }, [slotId]);

  async function loadSlotInfo() {
    setLoading(true);
    try {
      const res = await fetch(`/api/registration/${slotId}`);
      if (!res.ok) {
        setError(t("errors.slotNotFound"));
        return;
      }
      const data: SlotInfo = await res.json();
      setSlotInfo(data);

      // If already has registration, pre-fill form
      if (data.registration && data.student) {
        setEmail(data.student.email);
        setEmailConsent(data.registration.emailConsent);
        setPrivacyConsent(data.registration.privacyConsent);
        setFullName(data.student.fullName);
        setEnrollmentId(data.registration.enrollmentId || "");
        setLevel((data.registration.level as "bachelor" | "master") || "");
        setSpokenLanguages(data.registration.spokenLanguages || []);
        setDestinationPreferences(data.registration.destinationPreferences || []);

        if (data.registration.registrationCompleted) {
          if (!data.isInitialActive && !data.isSupplementaryActive) {
            setCompleted(true);
          } else {
            // Can still edit — start from step 1
            setCurrentStep(1);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadDestinations() {
    if (!slotId || !level || spokenLanguages.length === 0) return;
    setDestinationsLoading(true);
    try {
      const res = await fetch(
        `/api/registration/${slotId}/destinations?level=${level}&languages=${JSON.stringify(spokenLanguages)}`
      );
      if (res.ok) {
        const data = await res.json();
        setAvailableDestinations(data);
        // Filter preferences to only include available destinations
        setDestinationPreferences((prev) =>
          prev.filter((id) => data.some((d: Destination) => d.id === id))
        );
      }
    } finally {
      setDestinationsLoading(false);
    }
  }

  useEffect(() => {
    if (currentStep === 6) {
      loadDestinations();
    }
  }, [currentStep, level, spokenLanguages]);

  async function submitStep(step: Step, data: Record<string, unknown>) {
    setStepError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/registration/${slotId}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, ...data }),
      });

      const result = await res.json();

      if (!res.ok) {
        setStepError(result.error || "An error occurred");
        return false;
      }

      return true;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!privacyConsent) {
      setStepError(t("errors.privacyRequired"));
      return;
    }
    if (slotInfo?.isSupplementaryActive && slotInfo.currentAssignment && !assignmentLossConfirmed) {
      setStepError(t("errors.assignmentLossConfirmRequired"));
      return;
    }
    const ok = await submitStep(1, { email, emailConsent, privacyConsent });
    if (ok) setCurrentStep(2);
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submitStep(2, { email, code: otpCode });
    if (ok) {
      setEmailVerifiedThisSession(true);
      setCurrentStep(3);
    }
  }

  async function handleStep3(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submitStep(3, { fullName, enrollmentId });
    if (ok) setCurrentStep(4);
  }

  async function handleStep4(e: React.FormEvent) {
    e.preventDefault();
    if (!level) return;
    const ok = await submitStep(4, { level });
    if (ok) setCurrentStep(5);
  }

  async function handleStep5(e: React.FormEvent) {
    e.preventDefault();
    if (spokenLanguages.length === 0) {
      setStepError("Please select at least one language");
      return;
    }
    const ok = await submitStep(5, { spokenLanguages });
    if (ok) setCurrentStep(6);
  }

  async function handleStep6(e: React.FormEvent) {
    e.preventDefault();
    if (destinationPreferences.length === 0) {
      setStepError("Please select at least one destination");
      return;
    }
    const ok = await submitStep(6, { destinationPreferences });
    if (ok) setCurrentStep(7);
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmSummary) {
      setStepError("Please confirm all your information is correct");
      return;
    }

    setStepError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/registration/${slotId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json();
        setStepError(data.error || "An error occurred");
        return;
      }

      setCompleted(true);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleDestination(destId: string) {
    setDestinationPreferences((prev) => {
      if (prev.includes(destId)) {
        return prev.filter((id) => id !== destId);
      }
      if (prev.length >= (slotInfo?.recruitment.maxDestinationChoices || 3)) {
        return prev;
      }
      return [...prev, destId];
    });
  }

  function moveDestination(fromIndex: number, toIndex: number) {
    setDestinationPreferences((prev) => {
      const arr = [...prev];
      const [removed] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, removed);
      return arr;
    });
  }

  const destMap = Object.fromEntries(availableDestinations.map((d) => [d.id, d]));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>{tc("loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!slotInfo) return null;

  const registrationOpen = slotInfo.isInitialActive || slotInfo.isSupplementaryActive;

  if (completed || (!registrationOpen && slotInfo.registration?.registrationCompleted)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-green-600">{t("completed.title")}</CardTitle>
            <CardDescription>{t("completed.desc")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!registrationOpen) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="font-semibold">{t("initialStageClosed")}</p>
            <p className="text-muted-foreground text-sm mt-2">{t("initialStageClosedDesc")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stepLabels: [Step, string][] = [
    [1, t("steps.step1")],
    [2, t("steps.step2")],
    [3, t("steps.step3")],
    [4, t("steps.step4")],
    [5, t("steps.step5")],
    [6, t("steps.step6")],
    [7, t("steps.step7")],
  ];

  return (
    <div className="min-h-screen bg-muted/10 py-8 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{slotInfo.recruitment.name}</p>
          <Badge variant="outline" className="mt-2">Slot #{slotInfo.slot.number}</Badge>
        </div>

        {/* Supplementary stage assignment loss warning */}
        {slotInfo.isSupplementaryActive && slotInfo.currentAssignment && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-lg text-sm">
            <p className="font-semibold text-amber-800 mb-1">{t("supplementaryWarning.title")}</p>
            <p className="text-amber-700">
              {t("supplementaryWarning.message", { destination: slotInfo.currentAssignment.destinationName })}
            </p>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
          {stepLabels.map(([step, label]) => (
            <button
              key={step}
              onClick={() => step < currentStep && setCurrentStep(step)}
              disabled={step > currentStep}
              className={`flex-1 min-w-0 py-2 px-2 rounded text-xs font-medium transition-colors ${
                step === currentStep
                  ? "bg-primary text-primary-foreground"
                  : step < currentStep
                  ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {step}
            </button>
          ))}
        </div>

        {/* Step content */}
        <Card>
          <CardHeader>
            <CardTitle>{stepLabels.find(([s]) => s === currentStep)?.[1]}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Step 1: Email & consent */}
            {currentStep === 1 && (
              <form onSubmit={handleStep1} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("step1.emailLabel")}</Label>
                  <Input
                    type="email"
                    placeholder={t("step1.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    readOnly={!!slotInfo?.student}
                    className={slotInfo?.student ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}
                  />
                  {slotInfo?.student && (
                    <p className="text-xs text-muted-foreground">{t("step1.emailLockedNote")}</p>
                  )}
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailConsent}
                    onChange={(e) => setEmailConsent(e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm">{t("step1.emailConsentLabel")}</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyConsent}
                    onChange={(e) => setPrivacyConsent(e.target.checked)}
                    className="mt-1"
                    required
                  />
                  <span className="text-sm">
                    {t("step1.privacyLabel")}{" "}
                    <span className="text-primary">{t("step1.privacyLink")}</span>
                  </span>
                </label>
                {slotInfo.isSupplementaryActive && slotInfo.currentAssignment && (
                  <label className="flex items-start gap-2 cursor-pointer p-3 border border-amber-300 bg-amber-50 rounded-lg">
                    <input
                      type="checkbox"
                      checked={assignmentLossConfirmed}
                      onChange={(e) => setAssignmentLossConfirmed(e.target.checked)}
                      className="mt-1"
                    />
                    <span className="text-sm text-amber-800">
                      {t("supplementaryWarning.confirmLabel", {
                        assignment: slotInfo.currentAssignment.destinationName,
                      })}
                    </span>
                  </label>
                )}
                {stepError && <p className="text-sm text-destructive">{stepError}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? tc("loading") : t("step1.sendCode")}
                </Button>
              </form>
            )}

            {/* Step 2: OTP verification */}
            {currentStep === 2 && (
              <form onSubmit={handleStep2} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("step2.desc", { email })}
                </p>
                <div className="space-y-2">
                  <Label>{t("step2.codeLabel")}</Label>
                  <Input
                    type="text"
                    placeholder={t("step2.codePlaceholder")}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    required
                    className="text-center text-2xl tracking-widest font-mono"
                  />
                </div>
                {stepError && <p className="text-sm text-destructive">{stepError}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? tc("loading") : t("step2.verify")}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setCurrentStep(1)}>
                  ← {tc("back")}
                </Button>
              </form>
            )}

            {/* Step 3: Personal info */}
            {currentStep === 3 && (
              <form onSubmit={handleStep3} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("step3.nameLabel")}</Label>
                  <Input
                    placeholder={t("step3.namePlaceholder")}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    readOnly={!!slotInfo?.student && !emailVerifiedThisSession}
                    className={slotInfo?.student && !emailVerifiedThisSession ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}
                  />
                  {slotInfo?.student && !emailVerifiedThisSession && (
                    <p className="text-xs text-muted-foreground">{t("step3.nameLockedNote")}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t("step3.enrollmentLabel")}</Label>
                  <Input
                    placeholder={t("step3.enrollmentPlaceholder")}
                    value={enrollmentId}
                    onChange={(e) => setEnrollmentId(e.target.value)}
                    pattern="^[1-9]\d{5}$"
                    maxLength={6}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{t("step3.enrollmentHelp")}</p>
                </div>
                {stepError && <p className="text-sm text-destructive">{stepError}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? tc("loading") : tc("next")}
                </Button>
              </form>
            )}

            {/* Step 4: Level */}
            {currentStep === 4 && (
              <form onSubmit={handleStep4} className="space-y-4">
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/30">
                    <input
                      type="radio"
                      name="level"
                      value="bachelor"
                      checked={level === "bachelor"}
                      onChange={() => setLevel("bachelor")}
                    />
                    <span className="font-medium">{t("step4.bachelor")}</span>
                  </label>
                  <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/30">
                    <input
                      type="radio"
                      name="level"
                      value="master"
                      checked={level === "master"}
                      onChange={() => setLevel("master")}
                    />
                    <span className="font-medium">{t("step4.master")}</span>
                  </label>
                </div>
                {stepError && <p className="text-sm text-destructive">{stepError}</p>}
                <Button type="submit" className="w-full" disabled={!level || submitting}>
                  {submitting ? tc("loading") : tc("next")}
                </Button>
              </form>
            )}

            {/* Step 5: Languages */}
            {currentStep === 5 && (
              <form onSubmit={handleStep5} className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("step5.desc")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <label
                      key={lang}
                      className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                        spokenLanguages.includes(lang) ? "bg-primary/10 border-primary" : "hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={spokenLanguages.includes(lang)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSpokenLanguages((prev) => [...prev, lang]);
                          } else {
                            setSpokenLanguages((prev) => prev.filter((l) => l !== lang));
                          }
                        }}
                      />
                      <span className="text-sm font-medium">{lang}</span>
                    </label>
                  ))}
                </div>
                {stepError && <p className="text-sm text-destructive">{stepError}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? tc("loading") : tc("next")}
                </Button>
              </form>
            )}

            {/* Step 6: Destination preferences */}
            {currentStep === 6 && (
              <form onSubmit={handleStep6} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("step6.desc", { max: slotInfo.recruitment.maxDestinationChoices })}
                </p>

                {destinationsLoading ? (
                  <p className="text-muted-foreground text-sm p-3 bg-muted/30 rounded-lg">
                    {tc("loading")} possible destinations...
                  </p>
                ) : availableDestinations.length === 0 ? (
                  <p className="text-amber-600 text-sm p-3 bg-amber-50 rounded-lg">
                    {t("step6.noDestinations")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Selected preferences (ordered) */}
                    {destinationPreferences.length > 0 && (
                      <div className="space-y-2 mb-4">
                        <p className="text-xs text-muted-foreground font-medium uppercase">Your preferences (drag to reorder):</p>
                        {destinationPreferences.map((destId, index) => {
                          const dest = destMap[destId];
                          if (!dest) return null;
                          return (
                            <div
                              key={destId}
                              className="flex items-center gap-3 p-3 border rounded-lg bg-primary/5 border-primary/30"
                            >
                              <span className="text-lg font-bold text-primary min-w-[24px]">
                                {index + 1}
                              </span>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{dest.name}</p>
                                <p className="text-xs text-muted-foreground">{dest.requiredLanguages.join(", ")}</p>
                              </div>
                              <div className="flex gap-1">
                                {index > 0 && (
                                  <button type="button" onClick={() => moveDestination(index, index - 1)}
                                    className="text-muted-foreground hover:text-foreground p-1">▲</button>
                                )}
                                {index < destinationPreferences.length - 1 && (
                                  <button type="button" onClick={() => moveDestination(index, index + 1)}
                                    className="text-muted-foreground hover:text-foreground p-1">▼</button>
                                )}
                                <button type="button" onClick={() => toggleDestination(destId)}
                                  className="text-destructive hover:text-destructive/80 p-1 text-xs">✕</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Available destinations to add */}
                    <p className="text-xs text-muted-foreground font-medium uppercase">Available destinations:</p>
                    {availableDestinations
                      .filter((d) => !destinationPreferences.includes(d.id))
                      .map((dest) => (
                        <div
                          key={dest.id}
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-sm">{dest.name}</p>
                            <p className="text-xs text-muted-foreground">{dest.requiredLanguages.join(", ")}</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={destinationPreferences.length >= slotInfo.recruitment.maxDestinationChoices}
                            onClick={() => toggleDestination(dest.id)}
                          >
                            + Add
                          </Button>
                        </div>
                      ))}
                  </div>
                )}

                {stepError && <p className="text-sm text-destructive">{stepError}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || destinationPreferences.length === 0}
                >
                  {submitting ? tc("loading") : tc("next")}
                </Button>
              </form>
            )}

            {/* Step 7: Summary */}
            {currentStep === 7 && (
              <form onSubmit={handleComplete} className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("step7.desc")}</p>

                <div className="space-y-3 text-sm">
                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    <p className="font-semibold text-xs uppercase text-muted-foreground">{t("step7.contact")}</p>
                    <p>{email}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    <p className="font-semibold text-xs uppercase text-muted-foreground">{t("step7.personal")}</p>
                    <p><strong>Name:</strong> {fullName}</p>
                    <p><strong>Enrollment ID:</strong> {enrollmentId}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    <p className="font-semibold text-xs uppercase text-muted-foreground">{t("step7.level")}</p>
                    <p className="capitalize">{level}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    <p className="font-semibold text-xs uppercase text-muted-foreground">{t("step7.languages")}</p>
                    <p>{spokenLanguages.join(", ")}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    <p className="font-semibold text-xs uppercase text-muted-foreground">{t("step7.preferences")}</p>
                    <ol className="list-decimal list-inside space-y-1">
                      {destinationPreferences.map((id, i) => (
                        <li key={id}>{destMap[id]?.name || id}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <label className="flex items-start gap-2 cursor-pointer p-3 border rounded-lg">
                  <input
                    type="checkbox"
                    checked={confirmSummary}
                    onChange={(e) => setConfirmSummary(e.target.checked)}
                    className="mt-1"
                    required
                  />
                  <span className="text-sm">{t("step7.confirmLabel")}</span>
                </label>

                {stepError && <p className="text-sm text-destructive">{stepError}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!confirmSummary || submitting}
                >
                  {submitting ? tc("loading") : t("step7.complete")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
