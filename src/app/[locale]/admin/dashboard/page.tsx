"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Plus, Eye } from "lucide-react";
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


interface Recruitment {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  maxDestinationChoices: number;
  createdAt: string;
}

export default function AdminDashboardPage() {
  const t = useTranslations("admin.dashboard");
  const tc = useTranslations("common");
  const tr = useTranslations("admin.recruitment");

  const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    maxDestinationChoices: 3,
    eligibleLevels: [...STUDENT_LEVELS] as StudentLevel[],
    initialStage: { startDate: "", endDate: "" },
    adminStage: { startDate: "", endDate: "" },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchRecruitments();
  }, []);

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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create recruitment");
        return;
      }

      setCreateOpen(false);
      setForm({ name: "", description: "", maxDestinationChoices: 3, eligibleLevels: [...STUDENT_LEVELS], initialStage: { startDate: "", endDate: "" }, adminStage: { startDate: "", endDate: "" } });
      await fetchRecruitments();
    } finally {
      setSaving(false);
    }
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
      ) : recruitments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">{t("noRecruitments")}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {recruitments.map((rec) => (
            <Card key={rec.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{rec.name}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {rec.description || t("noDescription")}
                    </CardDescription>
                  </div>
                  <Link href={`/admin/recruitment/${rec.id}`}>
                    <Button variant="outline" size="sm" className="text-blue-600 border-blue-600 hover:bg-blue-50">
                      <Eye className="mr-1 h-4 w-4" />{t("view")}
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>
                    {formatDateShort(rec.startDate)} — {formatDateShort(rec.endDate)}
                  </span>
                  <span>{t("maxDestinations", { count: rec.maxDestinationChoices })}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
