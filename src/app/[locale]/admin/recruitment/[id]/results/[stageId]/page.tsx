"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface AssignmentResult {
  id: string;
  registrationId: string;
  destinationId: string | null;
  score: string;
  approved: boolean;
  studentName: string;
  studentEmail: string;
  destinationName: string | null;
}

export default function AssignmentResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const stageId = params.stageId as string;
  const t = useTranslations("admin.results");

  const [results, setResults] = useState<AssignmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [nextStage, setNextStage] = useState<{ id: string; name: string } | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    fetchResults();
  }, [stageId]);

  async function fetchResults() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stages/${stageId}/results`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setApproved(data.every((r: AssignmentResult) => r.approved));
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
        alert(`Approved! ${data.emailsSent} emails sent.`);
        setApproved(true);
        if (data.nextStage) {
          setNextStage(data.nextStage);
        }
        await fetchResults();
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

  const assignedCount = results.filter((r) => r.destinationId).length;
  const unassignedCount = results.filter((r) => !r.destinationId).length;

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Recruitment", href: `/admin/recruitment/${id}` },
        { label: t("title") },
      ]}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {assignedCount} assigned, {unassignedCount} unassigned
          </p>
        </div>
        {!approved && (
          <Button onClick={approveAll} disabled={approving}>
            {approving ? "Approving..." : t("approve")}
          </Button>
        )}
        {approved && (
          <Badge variant="success">{t("approved")}</Badge>
        )}
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">{t("student")}</th>
                <th className="text-left p-3 font-medium">{t("destination")}</th>
                <th className="text-left p-3 font-medium">{t("score")}</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-3">
                    <div>{result.studentName}</div>
                    <div className="text-muted-foreground text-xs">{result.studentEmail}</div>
                  </td>
                  <td className="p-3">
                    {result.destinationName ? (
                      <span className="font-medium">{result.destinationName}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("unassigned")}</span>
                    )}
                  </td>
                  <td className="p-3 font-mono">{parseFloat(result.score).toFixed(1)}</td>
                  <td className="p-3">
                    {result.approved ? (
                      <Badge variant="success">Approved</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
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
            <DialogTitle>Activate Next Stage?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The next stage <strong>{nextStage?.name}</strong> is pending. Do you want to activate it now? Its start date will be set to the current time.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNextStage(null)}>
              Not Now
            </Button>
            <Button onClick={activateNextStage} disabled={activating}>
              {activating ? "Activating..." : "Activate Next Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
