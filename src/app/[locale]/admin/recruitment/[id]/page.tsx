"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Square, Play, Circle, ClipboardList } from "lucide-react";
import { formatDate, formatDateShort } from "@/lib/utils";
import { getStageName } from "@/lib/stage-name";
import { SUPPORTED_LANGUAGES } from "@/db/schema/destinations";
import { STUDENT_LEVELS, STUDENT_LEVEL_LABELS, StudentLevel } from "@/db/schema/registrations";

interface Stage {
  id: string;
  name: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  order: number;
}

interface Slot {
  id: string;
  number: number;
  status: string;
  studentRegistrationLink: string;
  teacherManagementLink: string;
}

interface Destination {
  id: string;
  name: string;
  description: string;
  slotsBachelor: number;
  slotsMaster: number;
  slotsAny: number;
  requiredLanguages: string[];
}

interface Recruitment {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  maxDestinationChoices: number;
  stages: Stage[];
  slots: Slot[];
  destinations: Destination[];
}

type Tab = "overview" | "stages" | "slots" | "destinations" | "requirements";

interface LevelStat {
  completedRegistrations: number;
  totalSlots: number;
}

interface EligibleLevelsData {
  eligibleLevels: StudentLevel[];
  levelStats: Record<StudentLevel, LevelStat>;
}

const stageStatusColors: Record<string, "default" | "success" | "warning" | "secondary" | "outline"> = {
  pending: "secondary",
  active: "success",
  completed: "outline",
};

export default function RecruitmentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const t = useTranslations("admin.recruitment");
  const tc = useTranslations("common");

  const [activeTab, setActiveTab] = useState<Tab>("stages");
  const [recruitment, setRecruitment] = useState<Recruitment | null>(null);
  const [loading, setLoading] = useState(true);

  // Add slots form
  const [addSlotsCount, setAddSlotsCount] = useState(10);
  const [addingSlots, setAddingSlots] = useState(false);

  // Add destination form
  const [destDialogOpen, setDestDialogOpen] = useState(false);
  const [destForm, setDestForm] = useState({
    name: "",
    description: "",
    slotsBachelor: 0,
    slotsMaster: 0,
    slotsAny: 0,
    requiredLanguages: [] as string[],
  });
  const [savingDest, setSavingDest] = useState(false);

  // Edit destination form
  const [editDestDialogOpen, setEditDestDialogOpen] = useState(false);
  const [editingDestId, setEditingDestId] = useState<string | null>(null);
  const [editDestForm, setEditDestForm] = useState({
    name: "",
    description: "",
    slotsBachelor: 0,
    slotsMaster: 0,
    slotsAny: 0,
    requiredLanguages: [] as string[],
  });
  const [savingEditDest, setSavingEditDest] = useState(false);

  // Requirements tab state
  const [eligibleLevelsData, setEligibleLevelsData] = useState<EligibleLevelsData | null>(null);
  const [eligibleLevelsDraft, setEligibleLevelsDraft] = useState<StudentLevel[]>([]);
  const [eligibleLevelsDirty, setEligibleLevelsDirty] = useState(false);
  const [savingEligibleLevels, setSavingEligibleLevels] = useState(false);
  const [eligibleLevelsLoading, setEligibleLevelsLoading] = useState(false);
  const [removedLevelsWithRegs, setRemovedLevelsWithRegs] = useState<StudentLevel[]>([]);
  const [showRemoveWarning, setShowRemoveWarning] = useState(false);

  // No supplementary stage warning
  const [showNoSupplementaryWarning, setShowNoSupplementaryWarning] = useState(false);
  const [pendingCompleteStageId, setPendingCompleteStageId] = useState<string | null>(null);

  // Add stage form
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [stageForm, setStageForm] = useState({
    description: "",
    supplementaryStage: { startDate: "", endDate: "" },
    adminStage: { startDate: "", endDate: "" },
  });
  const [savingStage, setSavingStage] = useState(false);

  useEffect(() => {
    fetchRecruitment();
    fetchEligibleLevels();
  }, [id]);

  useEffect(() => {
    if (activeTab === "requirements") {
      fetchEligibleLevels();
    }
  }, [activeTab]);

  async function fetchEligibleLevels() {
    setEligibleLevelsLoading(true);
    try {
      const res = await fetch(`/api/admin/recruitments/${id}/eligible-levels`);
      if (res.ok) {
        const data: EligibleLevelsData = await res.json();
        setEligibleLevelsData(data);
        setEligibleLevelsDraft([...data.eligibleLevels]);
        setEligibleLevelsDirty(false);
      }
    } finally {
      setEligibleLevelsLoading(false);
    }
  }

  async function fetchRecruitment() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/recruitments/${id}`);
      if (res.ok) {
        const data = await res.json();
        // Parse destination languages
        data.destinations = (data.destinations || []).map((d: Destination & { requiredLanguages: string | string[] }) => ({
          ...d,
          requiredLanguages: typeof d.requiredLanguages === "string"
            ? JSON.parse(d.requiredLanguages)
            : d.requiredLanguages,
        }));
        setRecruitment(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function addSlots() {
    setAddingSlots(true);
    try {
      const res = await fetch(`/api/admin/recruitments/${id}/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: addSlotsCount }),
      });
      if (res.ok) {
        await fetchRecruitment();
      }
    } finally {
      setAddingSlots(false);
    }
  }

  async function deleteSlot(slotId: string) {
    if (!confirm("Remove this slot?")) return;
    await fetch(`/api/admin/recruitments/${id}/slots/${slotId}`, { method: "DELETE" });
    await fetchRecruitment();
  }

  async function addDestination(e: React.FormEvent) {
    e.preventDefault();
    setSavingDest(true);
    try {
      const res = await fetch(`/api/admin/recruitments/${id}/destinations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(destForm),
      });
      if (res.ok) {
        setDestDialogOpen(false);
        setDestForm({ name: "", description: "", slotsBachelor: 0, slotsMaster: 0, slotsAny: 0, requiredLanguages: [] });
        await fetchRecruitment();
      }
    } finally {
      setSavingDest(false);
    }
  }

  async function deleteDestination(destId: string) {
    if (!confirm("Remove this destination?")) return;
    await fetch(`/api/admin/recruitments/${id}/destinations/${destId}`, { method: "DELETE" });
    await fetchRecruitment();
  }

  function openEditDestination(dest: Destination) {
    setEditingDestId(dest.id);
    setEditDestForm({
      name: dest.name,
      description: dest.description,
      slotsBachelor: dest.slotsBachelor,
      slotsMaster: dest.slotsMaster,
      slotsAny: dest.slotsAny,
      requiredLanguages: [...dest.requiredLanguages],
    });
    setEditDestDialogOpen(true);
  }

  async function saveEditDestination(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDestId) return;
    setSavingEditDest(true);
    try {
      const res = await fetch(`/api/admin/recruitments/${id}/destinations/${editingDestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDestForm),
      });
      if (res.ok) {
        setEditDestDialogOpen(false);
        setEditingDestId(null);
        await fetchRecruitment();
      }
    } finally {
      setSavingEditDest(false);
    }
  }

  async function addStage(e: React.FormEvent) {
    e.preventDefault();
    setSavingStage(true);
    try {
      const res = await fetch(`/api/admin/recruitments/${id}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: stageForm.description,
          supplementaryStage: {
            startDate: new Date(stageForm.supplementaryStage.startDate).toISOString(),
            endDate: new Date(stageForm.supplementaryStage.endDate).toISOString(),
          },
          adminStage: {
            startDate: new Date(stageForm.adminStage.startDate).toISOString(),
            endDate: new Date(stageForm.adminStage.endDate).toISOString(),
          },
        }),
      });
      if (res.ok) {
        setStageDialogOpen(false);
        setStageForm({
          description: "",
          supplementaryStage: { startDate: "", endDate: "" },
          adminStage: { startDate: "", endDate: "" },
        });
        await fetchRecruitment();
      }
    } finally {
      setSavingStage(false);
    }
  }

  async function doSaveEligibleLevels() {
    setSavingEligibleLevels(true);
    try {
      const res = await fetch(`/api/admin/recruitments/${id}/eligible-levels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eligibleLevels: eligibleLevelsDraft }),
      });
      if (res.ok) {
        await fetchEligibleLevels();
      }
    } finally {
      setSavingEligibleLevels(false);
    }
  }

  async function downloadPdf() {
    window.open(`/api/admin/recruitments/${id}/pdf`, "_blank");
  }

  async function completeStage(stageId: string) {
    // Check if there are any subsequent supplementary stages planned
    const stage = recruitment?.stages.find((s) => s.id === stageId);
    if (stage) {
      const hasNextSupplementary = recruitment!.stages.some(
        (s) => s.type === "supplementary" && s.order > stage.order && s.status === "pending"
      );
      if (!hasNextSupplementary) {
        setPendingCompleteStageId(stageId);
        setShowNoSupplementaryWarning(true);
        return;
      }
    }
    await doCompleteStage(stageId);
  }

  async function doCompleteStage(stageId: string) {
    const res = await fetch(`/api/admin/stages/${stageId}/complete`, { method: "POST" });
    if (res.ok) {
      await fetchRecruitment();
    }
  }

  async function endStage(stageId: string) {
    if (!confirm("End this stage now? The end date will be set to now and the next stage will become active.")) return;
    const res = await fetch(`/api/admin/stages/${stageId}/end`, { method: "POST" });
    if (res.ok) {
      await fetchRecruitment();
    }
  }

  async function activateStageNow(stage: Stage) {
    if (!confirm(`Activate "${getStageName(stage)}" now? Its start date will be set to now.`)) return;
    const sortedStages = [...(recruitment?.stages ?? [])].sort((a, b) => a.order - b.order);
    const prevStage = sortedStages.findLast((s) => s.order < stage.order);
    if (prevStage && prevStage.status === "active") {
      // End the previous active stage — it will auto-activate this one with startDate=now
      const res = await fetch(`/api/admin/stages/${prevStage.id}/end`, { method: "POST" });
      if (res.ok) await fetchRecruitment();
    } else {
      // No active predecessor — directly activate this pending stage
      const res = await fetch(`/api/admin/stages/${stage.id}/activate`, { method: "POST" });
      if (res.ok) await fetchRecruitment();
    }
  }

  if (loading || !recruitment) {
    return <AdminLayout><p>Loading...</p></AdminLayout>;
  }

  const tabs: Tab[] = ["overview", "stages", "slots", "destinations", "requirements"];

  const tabLabels: Record<Tab, string> = {
    overview: t("tabs.overview"),
    stages: `${t("tabs.stages")} (${recruitment.stages.length})`,
    slots: `${t("tabs.slots")} (${recruitment.slots.filter((s) => s.status !== "open").length}/${recruitment.slots.length})`,
    destinations: `${t("tabs.destinations")} (${recruitment.destinations.length})`,
    requirements: eligibleLevelsData
      ? `Requirements (${eligibleLevelsData.eligibleLevels.length})`
      : "Requirements",
  };

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: recruitment.name },
      ]}
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{recruitment.name}</h1>
        <p className="text-muted-foreground mt-1">{recruitment.description}</p>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start Date</span>
                <span>{formatDate(recruitment.startDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">End Date</span>
                <span>{formatDate(recruitment.endDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Destinations</span>
                <span>{recruitment.maxDestinationChoices}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Stats</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stages</span>
                <span>{recruitment.stages.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Slots</span>
                <span>{recruitment.slots.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Open Slots</span>
                <span>{recruitment.slots.filter((s) => s.status === "open").length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destinations</span>
                <span>{recruitment.destinations.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stages tab */}
      {activeTab === "stages" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("stages.title")}</h2>
            <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                  <Plus className="w-3.5 h-3.5 mr-1" />{t("stages.addStage")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("stages.addStage")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={addStage} className="space-y-5">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Supplementary Stage</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input
                          type="datetime-local"
                          value={stageForm.supplementaryStage.startDate}
                          onChange={(e) => setStageForm(f => ({ ...f, supplementaryStage: { ...f.supplementaryStage, startDate: e.target.value } }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input
                          type="datetime-local"
                          value={stageForm.supplementaryStage.endDate}
                          onChange={(e) => setStageForm(f => ({ ...f, supplementaryStage: { ...f.supplementaryStage, endDate: e.target.value } }))}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-semibold">Admin Stage</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input
                          type="datetime-local"
                          value={stageForm.adminStage.startDate}
                          onChange={(e) => setStageForm(f => ({ ...f, adminStage: { ...f.adminStage, startDate: e.target.value } }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input
                          type="datetime-local"
                          value={stageForm.adminStage.endDate}
                          onChange={(e) => setStageForm(f => ({ ...f, adminStage: { ...f.adminStage, endDate: e.target.value } }))}
                          required
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">The recruitment end date will be updated to match this stage&apos;s end date.</p>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setStageDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={savingStage}>Add Stages</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {recruitment.stages.length === 0 ? (
            <p className="text-muted-foreground">{t("stages.noStages")}</p>
          ) : (
            <div className="space-y-3">
              {(() => {
                const sorted = [...recruitment.stages].sort((a, b) => a.order - b.order);
                const firstPendingId = sorted.find((s) => s.status === "pending")?.id;
                return sorted.map((stage) => (
                  <Card key={stage.id}>
                    <CardContent className="pt-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {getStageName(stage)}
                          </span>
                          <Badge variant={stageStatusColors[stage.status] || "default"}>
                            {stage.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(stage.startDate)} — {formatDate(stage.endDate)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {stage.id === firstPendingId && (
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => activateStageNow(stage)}>
                            <Play className="w-3.5 h-3.5 mr-1" />Activate Now
                          </Button>
                        )}
                        {(stage.type === "initial" || stage.type === "supplementary") && stage.status === "active" && (
                          <Link href={`/admin/recruitment/${id}/stage/${stage.id}`}>
                            <Button size="sm" className="bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border border-yellow-200">
                              <Circle className="w-2.5 h-2.5 mr-1.5 fill-green-500 text-green-500" />Live Dashboard
                            </Button>
                          </Link>
                        )}
                        {(stage.type === "initial" || stage.type === "supplementary") && stage.status === "active" && (
                          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => endStage(stage.id)}>
                            <Square className="w-3.5 h-3.5 mr-1" />End Stage
                          </Button>
                        )}
                        {stage.type === "admin" && stage.status === "active" && (
                          <>
                            <Link href={`/admin/recruitment/${id}/applications/${stage.id}`}>
                              <Button size="sm">
                                <ClipboardList className="w-3.5 h-3.5 mr-1" />Review Applications
                              </Button>
                            </Link>
                            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => completeStage(stage.id)}>
                              <Square className="w-3.5 h-3.5 mr-1" />End Stage
                            </Button>
                          </>
                        )}
                        {stage.type === "admin" && stage.status === "completed" && (
                          <Link href={`/admin/recruitment/${id}/results/${stage.id}`}>
                            <Button size="sm" variant="outline">{t("stages.viewResults")}</Button>
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* Slots tab */}
      {activeTab === "slots" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("slots.title")}</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={downloadPdf}>
                {t("slots.downloadPdf")}
              </Button>
              <Input
                type="number"
                min={1}
                max={500}
                value={addSlotsCount}
                onChange={(e) => setAddSlotsCount(parseInt(e.target.value) || 1)}
                className="w-20 h-9"
              />
              <Button size="sm" onClick={addSlots} disabled={addingSlots}>
                {addingSlots ? "Adding..." : t("slots.addSlots")}
              </Button>
            </div>
          </div>

          {recruitment.slots.length === 0 ? (
            <p className="text-muted-foreground">{t("slots.noSlots")}</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Slot #</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Registration Link</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {recruitment.slots.map((slot) => (
                    <tr key={slot.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-3 font-mono">#{slot.number}</td>
                      <td className="p-3">
                        <Badge variant={slot.status === "open" ? "success" : "default"}>
                          {slot.status}
                        </Badge>
                      </td>
                      <td className="p-3 max-w-xs">
                        <a
                          href={slot.studentRegistrationLink}
                          className="text-primary hover:underline truncate block"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {slot.studentRegistrationLink}
                        </a>
                      </td>
                      <td className="p-3 text-right">
                        {slot.status === "open" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteSlot(slot.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            Remove
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Destinations tab */}
      {activeTab === "destinations" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("destinations.title")}</h2>
            <Dialog open={destDialogOpen} onOpenChange={setDestDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">{t("destinations.addDestination")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("destinations.addDestination")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={addDestination} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={destForm.name} onChange={(e) => setDestForm(f => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={destForm.description} onChange={(e) => setDestForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Bachelor Slots</Label>
                      <Input type="number" min={0} value={destForm.slotsBachelor} onChange={(e) => setDestForm(f => ({ ...f, slotsBachelor: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Master Slots</Label>
                      <Input type="number" min={0} value={destForm.slotsMaster} onChange={(e) => setDestForm(f => ({ ...f, slotsMaster: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Open Slots</Label>
                      <Input type="number" min={0} value={destForm.slotsAny} onChange={(e) => setDestForm(f => ({ ...f, slotsAny: parseInt(e.target.value) || 0 }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Required Languages</Label>
                    <div className="flex flex-wrap gap-2">
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <label key={lang} className="flex items-center gap-1 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={destForm.requiredLanguages.includes(lang)}
                            onChange={(e) =>
                              setDestForm(f => ({
                                ...f,
                                requiredLanguages: e.target.checked
                                  ? [...f.requiredLanguages, lang]
                                  : f.requiredLanguages.filter(l => l !== lang),
                              }))
                            }
                          />
                          {lang}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDestDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={savingDest}>Add</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {recruitment.destinations.length === 0 ? (
            <p className="text-muted-foreground">{t("destinations.noDestinations")}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {recruitment.destinations.map((dest) => (
                <Card key={dest.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{dest.name}</CardTitle>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDestination(dest)}
                          className="h-auto py-1"
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteDestination(dest.id)}
                          className="text-destructive hover:text-destructive h-auto py-1"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{dest.description}</p>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="flex gap-4">
                      <span>Bachelor: <strong>{dest.slotsBachelor}</strong></span>
                      <span>Master: <strong>{dest.slotsMaster}</strong></span>
                      <span>Open: <strong>{dest.slotsAny}</strong></span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {dest.requiredLanguages.map((lang) => (
                        <Badge key={lang} variant="secondary" className="text-xs">{lang}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requirements tab */}
      {activeTab === "requirements" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Eligible Student Levels</h2>
          </div>

          {eligibleLevelsLoading || !eligibleLevelsData ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Select which student levels are eligible to apply for this recruitment.
              </p>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Level</th>
                      <th className="text-right p-3 font-medium">Completed registrations</th>
                      <th className="text-right p-3 font-medium">Total destination slots</th>
                      <th className="text-center p-3 font-medium">Eligible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STUDENT_LEVELS.map((level) => {
                      const stats = eligibleLevelsData.levelStats[level] ?? { completedRegistrations: 0, totalSlots: 0 };
                      const checked = eligibleLevelsDraft.includes(level);
                      return (
                        <tr key={level} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-3 font-medium">{STUDENT_LEVEL_LABELS[level]}</td>
                          <td className="p-3 text-right">{stats.completedRegistrations}</td>
                          <td className="p-3 text-right">{stats.totalSlots}</td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...eligibleLevelsDraft, level]
                                  : eligibleLevelsDraft.filter((l) => l !== level);
                                setEligibleLevelsDraft(next);
                                setEligibleLevelsDirty(true);
                              }}
                              className="w-4 h-4 cursor-pointer"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {eligibleLevelsDirty && (
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEligibleLevelsDraft([...eligibleLevelsData.eligibleLevels]);
                      setEligibleLevelsDirty(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={savingEligibleLevels}
                    onClick={async () => {
                      // Check if any removed level has completed registrations
                      const removed = eligibleLevelsData.eligibleLevels.filter(
                        (l) => !eligibleLevelsDraft.includes(l)
                      );
                      const levelsWithRegs = removed.filter(
                        (l) => (eligibleLevelsData.levelStats[l]?.completedRegistrations ?? 0) > 0
                      );
                      if (levelsWithRegs.length > 0) {
                        setRemovedLevelsWithRegs(levelsWithRegs);
                        setShowRemoveWarning(true);
                        return;
                      }
                      await doSaveEligibleLevels();
                    }}
                  >
                    {savingEligibleLevels ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Warning dialog: no subsequent supplementary stages */}
      {showNoSupplementaryWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="font-semibold text-base mb-2">No further supplementary stages planned</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Ending this stage will end the whole recruitment. If you plan any further supplementary stages add them before completing this admin stage.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNoSupplementaryWarning(false);
                  setPendingCompleteStageId(null);
                  setStageDialogOpen(true);
                }}
              >
                Add Supplementary Stage
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setShowNoSupplementaryWarning(false);
                  if (pendingCompleteStageId) {
                    await doCompleteStage(pendingCompleteStageId);
                  }
                  setPendingCompleteStageId(null);
                }}
              >
                End Stage Anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Warning dialog for removing levels with registrations */}
      {showRemoveWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="font-semibold text-base mb-2">Warning: Completed Registrations Exist</h3>
            <p className="text-sm text-muted-foreground mb-3">
              The following levels you are removing already have completed registrations:
            </p>
            <ul className="text-sm font-medium mb-4 space-y-1">
              {removedLevelsWithRegs.map((l) => (
                <li key={l} className="flex justify-between">
                  <span>{STUDENT_LEVEL_LABELS[l]}</span>
                  <span className="text-muted-foreground">
                    {eligibleLevelsData?.levelStats[l]?.completedRegistrations} registrations
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground mb-4">
              Those registrations will remain unchanged, but students with these levels will no longer be eligible to apply.
              Do you want to continue?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowRemoveWarning(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setShowRemoveWarning(false);
                  await doSaveEligibleLevels();
                }}
              >
                Continue anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit destination dialog */}
      <Dialog open={editDestDialogOpen} onOpenChange={setEditDestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Destination</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEditDestination} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editDestForm.name} onChange={(e) => setEditDestForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editDestForm.description} onChange={(e) => setEditDestForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Bachelor Slots</Label>
                <Input type="number" min={0} value={editDestForm.slotsBachelor} onChange={(e) => setEditDestForm(f => ({ ...f, slotsBachelor: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Master Slots</Label>
                <Input type="number" min={0} value={editDestForm.slotsMaster} onChange={(e) => setEditDestForm(f => ({ ...f, slotsMaster: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Open Slots</Label>
                <Input type="number" min={0} value={editDestForm.slotsAny} onChange={(e) => setEditDestForm(f => ({ ...f, slotsAny: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Required Languages</Label>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <label key={lang} className="flex items-center gap-1 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editDestForm.requiredLanguages.includes(lang)}
                      onChange={(e) =>
                        setEditDestForm(f => ({
                          ...f,
                          requiredLanguages: e.target.checked
                            ? [...f.requiredLanguages, lang]
                            : f.requiredLanguages.filter(l => l !== lang),
                        }))
                      }
                    />
                    {lang}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditDestDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingEditDest}>Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
