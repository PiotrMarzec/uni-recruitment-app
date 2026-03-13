"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { STUDENT_LEVEL_LABELS, StudentLevel } from "@/db/schema/registrations";
import { getStageName } from "@/lib/stage-name";

interface Application {
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
}

export default function AssignmentResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const stageId = params.stageId as string;
  const t = useTranslations("admin.results");
  const tc = useTranslations("common");
  const td = useTranslations("admin.dashboard");
  const tr = useTranslations("admin.recruitment");
  const troot = useTranslations();

  const [stageName, setStageName] = useState("");
  const [recruitmentName, setRecruitmentName] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [nextStage, setNextStage] = useState<{ id: string; name: string } | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    fetchData();
  }, [stageId]);

  useEffect(() => {
    if (recruitmentName) {
      document.title = `Regie - ${recruitmentName} - ${t("title")}`;
    }
  }, [recruitmentName, t]);

  async function fetchData() {
    setLoading(true);
    try {
      const [appsRes, resultsRes] = await Promise.all([
        fetch(`/api/admin/stages/${stageId}/applications`),
        fetch(`/api/admin/stages/${stageId}/results`),
      ]);
      if (appsRes.ok) {
        const data = await appsRes.json();
        setStageName(data.stage ? getStageName(data.stage, troot) : "");
        setRecruitmentName(data.recruitmentName ?? "");
        setApplications(data.applications ?? []);
      }
      if (resultsRes.ok) {
        const results = await resultsRes.json();
        setApproved(results.length > 0 && results.every((r: { approved: boolean }) => r.approved));
      }
    } finally {
      setLoading(false);
    }
  }

  async function approveAll() {
    if (!confirm(t("approveConfirm"))) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/admin/stages/${stageId}/approve`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(t("emailsSent", { count: data.emailsSent }));
        setApproved(true);
        if (data.nextStage) {
          setNextStage(data.nextStage);
        }
        await fetchData();
      }
    } finally {
      setApproving(false);
    }
  }

  async function activateNextStage() {
    if (!nextStage) return;
    setActivating(true);
    try {
      const res = await fetch(`/api/admin/stages/${nextStage.id}/activate`, { method: "POST" });
      if (res.ok) {
        setNextStage(null);
      }
    } finally {
      setActivating(false);
    }
  }

  const assignedCount = applications.filter((a) => a.assignedDestinationId).length;
  const unassignedCount = applications.filter((a) => !a.assignedDestinationId).length;

  return (
    <AdminLayout
      breadcrumbs={[
        { label: td("breadcrumb"), href: "/admin/dashboard" },
        { label: recruitmentName || tr("breadcrumb"), href: `/admin/recruitment/${id}` },
        { label: t("title") },
      ]}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{stageName}</p>
          {!loading && (
            <p className="text-sm text-muted-foreground mt-1">
              {t("assignedCount", { assigned: assignedCount, unassigned: unassignedCount })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!approved && (
            <Button onClick={approveAll} disabled={approving}>
              {approving ? t("approving") : t("approve")}
            </Button>
          )}
          {approved && (
            <Badge variant="success">{t("approved")}</Badge>
          )}
        </div>
      </div>

      {loading ? (
        <p>{tc("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium whitespace-nowrap">{t("slot")}</th>
                <th className="text-left p-3 font-medium min-w-[120px]">{tc("name")}</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">{t("enrollmentId")}</th>
                <th className="text-left p-3 font-medium min-w-[100px]">{t("level")}</th>
                <th className="text-left p-3 font-medium min-w-[100px]">{t("languages")}</th>
                <th className="text-left p-3 font-medium min-w-[140px]">{t("destinations")}</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">{t("avgResult")}</th>
                <th className="text-left p-3 font-medium min-w-[80px]">{t("activities")}</th>
                <th className="text-left p-3 font-medium min-w-[70px]">{t("letters")}</th>
                <th className="text-left p-3 font-medium min-w-[60px]">{t("score")}</th>
                <th className="text-left p-3 font-medium min-w-[100px]">{t("approved")}</th>
              </tr>
            </thead>
            <tbody>
              {applications.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-muted-foreground">
                    {t("noResults")}
                  </td>
                </tr>
              )}
              {applications.map((app) => (
                <tr key={app.registrationId} className="border-b hover:bg-muted/20">
                  <td className="p-3 font-mono text-muted-foreground">#{app.slotNumber}</td>
                  <td className="p-3 font-medium">{app.studentName}</td>
                  <td className="p-3 font-mono">
                    {app.enrollmentId ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3">
                    {app.level ? (
                      <Badge variant="secondary">
                        {STUDENT_LEVEL_LABELS[app.level as StudentLevel] ?? app.level}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {app.spokenLanguages.length > 0 ? (
                        app.spokenLanguages.map((l) => (
                          <Badge key={l} variant="outline" className="text-xs">
                            {l}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {app.destinationNames.length > 0 ? (
                      <ol className="list-none space-y-0.5">
                        {app.destinationNames.map((name, i) => (
                          <li key={i} className="text-xs">
                            <span className="text-muted-foreground mr-1">{i + 1}.</span>
                            {name}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {app.averageResult !== null ? (
                      app.averageResult.toFixed(1)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {app.additionalActivities !== null ? (
                      app.additionalActivities
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {app.recommendationLetters !== null ? (
                      app.recommendationLetters
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 font-mono">{app.score.toFixed(1)}</td>
                  <td className="p-3">
                    {app.assignedDestinationName ? (
                      <Badge variant="success" className="whitespace-nowrap">
                        {app.assignedDestinationName}
                      </Badge>
                    ) : (
                      <span className="text-amber-500 font-medium text-sm">{t("unassigned")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!nextStage} onOpenChange={(open) => { if (!open) setNextStage(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("activateNextStageTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("activateNextStageDesc", { name: nextStage?.name ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNextStage(null)}>
              {t("notNow")}
            </Button>
            <Button onClick={activateNextStage} disabled={activating}>
              {activating ? t("activating") : t("activateNextStage")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
