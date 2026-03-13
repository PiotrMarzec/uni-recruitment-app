"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Plus, Eye, Archive, ArchiveRestore, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STUDENT_LEVELS, STUDENT_LEVEL_LABELS, StudentLevel } from "@/db/schema/registrations";
import type { RecruitmentStatus } from "@/db/schema/recruitments";

interface StageInfo {
  name: string;
  startDate: string;
  endDate: string;
  type: "initial" | "admin" | "supplementary" | "verification";
}

interface Recruitment {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  maxDestinationChoices: number;
  createdAt: string;
  status: RecruitmentStatus;
  destinationNames: string[];
  totalSlots: number;
  openSlots: number;
  registeredSlots: number;
  activeStage: StageInfo | null;
  nextStage: StageInfo | null;
}

function nextBusinessDay(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDefaultStageDates() {
  const now = new Date();

  const initialStart = nextBusinessDay(now);
  initialStart.setHours(9, 0, 0, 0);

  const initialEnd = addBusinessDays(initialStart, 5);
  initialEnd.setHours(16, 0, 0, 0);

  const adminStart = nextBusinessDay(initialEnd);
  adminStart.setHours(9, 0, 0, 0);

  const adminEnd = addBusinessDays(adminStart, 2);
  adminEnd.setHours(14, 0, 0, 0);

  const verificationStart = new Date(adminEnd);
  const verificationEnd = addBusinessDays(verificationStart, 3);
  verificationEnd.setHours(18, 0, 0, 0);

  return {
    initialStage: {
      startDate: toDatetimeLocal(initialStart),
      endDate: toDatetimeLocal(initialEnd),
    },
    adminStage: {
      startDate: toDatetimeLocal(adminStart),
      endDate: toDatetimeLocal(adminEnd),
    },
    verificationStage: {
      startDate: toDatetimeLocal(verificationStart),
      endDate: toDatetimeLocal(verificationEnd),
    },
  };
}

const STATUS_LABELS: Record<RecruitmentStatus, string> = {
  current: "Current",
  upcoming: "Upcoming",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_COLORS: Record<RecruitmentStatus, string> = {
  current: "bg-green-100 text-green-800 border-green-200",
  upcoming: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-gray-100 text-gray-700 border-gray-200",
  archived: "bg-amber-100 text-amber-800 border-amber-200",
};

const STATUS_BORDER: Record<RecruitmentStatus, string> = {
  current: "border-2 border-green-400",
  upcoming: "border-2 border-blue-400",
  completed: "border-2 border-gray-300",
  archived: "border-2 border-amber-400",
};

export default function AdminDashboardPage() {
  const t = useTranslations("admin.dashboard");
  const tc = useTranslations("common");
  const tr = useTranslations("admin.recruitment");

  const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Recruitment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const defaultEligibleLevels: StudentLevel[] = ["bachelor_2", "master_1"];

  const [form, setForm] = useState(() => ({
    name: "",
    description: "",
    maxDestinationChoices: 3,
    eligibleLevels: defaultEligibleLevels,
    ...getDefaultStageDates(),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchRecruitments();
  }, []);

  useEffect(() => {
    if (createOpen) {
      setForm((f) => ({ ...f, ...getDefaultStageDates() }));
    }
  }, [createOpen]);

  async function fetchRecruitments() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/recruitments");
      if (res.ok) {
        const data = await res.json();
        setRecruitments(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createRecruitment(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/recruitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          maxDestinationChoices: form.maxDestinationChoices,
          eligibleLevels: form.eligibleLevels,
          initialStage: {
            startDate: new Date(form.initialStage.startDate).toISOString(),
            endDate: new Date(form.initialStage.endDate).toISOString(),
          },
          adminStage: {
            startDate: new Date(form.adminStage.startDate).toISOString(),
            endDate: new Date(form.adminStage.endDate).toISOString(),
          },
          verificationStage: {
            startDate: new Date(form.verificationStage.startDate).toISOString(),
            endDate: new Date(form.verificationStage.endDate).toISOString(),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create recruitment");
        return;
      }

      setCreateOpen(false);
      setForm({ name: "", description: "", maxDestinationChoices: 3, eligibleLevels: defaultEligibleLevels, ...getDefaultStageDates() });
      await fetchRecruitments();
    } finally {
      setSaving(false);
    }
  }

  async function setArchived(id: string, action: "archive" | "unarchive") {
    await fetch(`/api/admin/recruitments/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await fetchRecruitments();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/recruitments/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await fetchRecruitments();
    } finally {
      setDeleting(false);
    }
  }

  const activeRecruitments = recruitments.filter((r) => r.status !== "archived");
  const archivedRecruitments = recruitments.filter((r) => r.status === "archived");

  function RecruitmentCard({ rec }: { rec: Recruitment }) {
    const borderClass =
      rec.status === "current" && rec.activeStage?.type === "admin"
        ? "border-2 border-blue-400"
        : STATUS_BORDER[rec.status];
    return (
      <Card key={rec.id} className={`group hover:shadow-md transition-shadow ${borderClass}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-lg">{rec.name}</CardTitle>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[rec.status]}`}>
                  {STATUS_LABELS[rec.status]}
                </span>
              </div>
              <CardDescription className="mt-1 line-clamp-2">
                {rec.description || t("noDescription")}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {rec.status === "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-amber-600 border-amber-600 hover:bg-amber-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setArchived(rec.id, "archive")}
                >
                  <Archive className="mr-1 h-4 w-4" />
                  Archive
                </Button>
              )}
              {rec.status === "archived" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-green-600 border-green-600 hover:bg-green-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setArchived(rec.id, "unarchive")}
                  >
                    <ArchiveRestore className="mr-1 h-4 w-4" />
                    Unarchive
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setDeleteTarget(rec)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </>
              )}
              <Link href={`/admin/recruitment/${rec.id}`}>
                <Button variant="outline" size="sm" className="text-blue-600 border-blue-600 hover:bg-blue-50">
                  <Eye className="mr-1 h-4 w-4" />{t("view")}
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-1">
          <div className="flex gap-4 text-sm text-muted-foreground flex-wrap">
            <span>
              {formatDateShort(rec.startDate)} — {formatDateShort(rec.endDate)}
            </span>
            {rec.destinationNames.length > 0 && (
              <span>{rec.destinationNames.join(", ")}</span>
            )}
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Total slots: {rec.totalSlots}</span>
            <span>Registered: {rec.registeredSlots}</span>
            <span>Remaining: {rec.openSlots}</span>
          </div>
          {(rec.activeStage || rec.nextStage) && (
            <div className="text-sm text-muted-foreground">
              {rec.activeStage ? (
                <span className={rec.activeStage.type === "admin" ? "text-blue-700" : "text-green-700"}>
                  Active: {rec.activeStage.name} ({formatDateShort(rec.activeStage.startDate)} — {formatDateShort(rec.activeStage.endDate)})
                </span>
              ) : rec.nextStage ? (
                <span>
                  Next: {rec.nextStage.name} ({formatDateShort(rec.nextStage.startDate)} — {formatDateShort(rec.nextStage.endDate)})
                </span>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700 text-white"><Plus className="mr-1 h-4 w-4" />{t("createRecruitment")}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("createRecruitment")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={createRecruitment} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{tr("fields.name")}</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>{tr("fields.description")}</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{tr("fields.maxChoices")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.maxDestinationChoices}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, maxDestinationChoices: parseInt(e.target.value) }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("eligibleLevels")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {STUDENT_LEVELS.map((level) => (
                      <label key={level} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.eligibleLevels.includes(level)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              eligibleLevels: e.target.checked
                                ? [...f.eligibleLevels, level]
                                : f.eligibleLevels.filter((l) => l !== level),
                            }))
                          }
                        />
                        {STUDENT_LEVEL_LABELS[level]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">{t("initialStage")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{tr("fields.startDate")}</Label>
                    <Input
                      type="datetime-local"
                      value={form.initialStage.startDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, initialStage: { ...f.initialStage, startDate: e.target.value } }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{tr("fields.endDate")}</Label>
                    <Input
                      type="datetime-local"
                      value={form.initialStage.endDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, initialStage: { ...f.initialStage, endDate: e.target.value } }))
                      }
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">{t("adminStage")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{tr("fields.startDate")}</Label>
                    <Input
                      type="datetime-local"
                      value={form.adminStage.startDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, adminStage: { ...f.adminStage, startDate: e.target.value } }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{tr("fields.endDate")}</Label>
                    <Input
                      type="datetime-local"
                      value={form.adminStage.endDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, adminStage: { ...f.adminStage, endDate: e.target.value } }))
                      }
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">{t("verificationStage")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{tr("fields.startDate")}</Label>
                    <Input
                      type="datetime-local"
                      value={form.verificationStage.startDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, verificationStage: { ...f.verificationStage, startDate: e.target.value } }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{tr("fields.endDate")}</Label>
                    <Input
                      type="datetime-local"
                      value={form.verificationStage.endDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, verificationStage: { ...f.verificationStage, endDate: e.target.value } }))
                      }
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("verificationEndDateHelper")}</p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? tc("loading") : tc("create")}
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{tc("loading")}</p>
      ) : (
        <div className="space-y-8">
          {/* Active Recruitments Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4">
              Recruitments{" "}
              <span className="text-sm font-normal text-muted-foreground">({activeRecruitments.length})</span>
            </h2>
            {activeRecruitments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>{t("noRecruitments")}</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {activeRecruitments.map((rec) => (
                  <RecruitmentCard key={rec.id} rec={rec} />
                ))}
              </div>
            )}
          </section>

          {/* Archived Section */}
          <section>
            <button
              className="flex items-center gap-2 text-lg font-semibold mb-4 hover:text-muted-foreground transition-colors"
              onClick={() => setArchivedOpen((o) => !o)}
              type="button"
            >
              {archivedOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              Archived{" "}
              <span className="text-sm font-normal text-muted-foreground">({archivedRecruitments.length})</span>
            </button>
            {archivedOpen && (
              archivedRecruitments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No archived recruitments.
                </div>
              ) : (
                <div className="grid gap-4">
                  {archivedRecruitments.map((rec) => (
                    <RecruitmentCard key={rec.id} rec={rec} />
                  ))}
                </div>
              )
            )}
          </section>
        </div>
      )}
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-700">Permanently delete recruitment?</h2>
            <p className="text-sm text-muted-foreground">
              You are about to permanently delete <span className="font-medium text-foreground">&ldquo;{deleteTarget.name}&rdquo;</span>.
            </p>
            <p className="text-sm text-muted-foreground">
              This will irreversibly remove:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>All recruitment stages and results</li>
              <li>All student registration data and preferences</li>
              <li>All slots, destinations, and requirements</li>
              <li>Student accounts no longer participating in any other recruitment</li>
            </ul>
            <p className="text-sm font-medium text-red-600">This action cannot be undone.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleting}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
