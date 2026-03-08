"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserCheck } from "lucide-react";
import { getStageName } from "@/lib/stage-name";
import { SUPPORTED_LANGUAGES } from "@/db/schema/destinations";
import { STUDENT_LEVELS, STUDENT_LEVEL_LABELS, StudentLevel } from "@/db/schema/registrations";

interface Destination {
  id: string;
  name: string;
}

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

interface EditState {
  fullName: string;
  enrollmentId: string;
  level: string;
  spokenLanguages: string[];
  destinationPrefs: string[];
  averageResult: string;
  additionalActivities: string;
  recommendationLetters: string;
}

type Tab = "completed" | "incomplete";

export default function ApplicationsPage() {
  const params = useParams();
  const router = useRouter();
  const recruitmentId = params.id as string;
  const stageId = params.stageId as string;

  const [stageName, setStageName] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [incompleteApplications, setIncompleteApplications] = useState<Application[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [maxDestChoices, setMaxDestChoices] = useState(3);
  const [hasAssignments, setHasAssignments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("completed");
  const [editingRows, setEditingRows] = useState<Map<string, EditState>>(new Map());
  // Ref kept in sync so the WS message handler always reads current editing state
  // without closing over a stale value.
  const editingRowsRef = useRef<Map<string, EditState>>(new Map());
  editingRowsRef.current = editingRows;
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [lastAssignResult, setLastAssignResult] = useState<{ assigned: number; unassigned: number } | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    fetchApplications();
    connectWebSocket();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [stageId]);

  function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", stageId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // ── A single registration row was edited by another admin ────────────
        if (msg.type === "application_row_update" && msg.stageId === stageId) {
          const updated: Application = msg.application;

          // Skip if the local admin is currently editing this row
          if (editingRowsRef.current.has(updated.registrationId)) return;

          const patchList = (list: Application[]): Application[] => {
            const idx = list.findIndex((a) => a.registrationId === updated.registrationId);
            if (idx < 0) return list;
            const next = [...list];
            next[idx] = updated;
            return next;
          };

          setApplications((prev) => patchList(prev));
          setIncompleteApplications((prev) => patchList(prev));
        }

        // ── Assignment algorithm was run by another admin ────────────────────
        if (msg.type === "application_assignments_update" && msg.stageId === stageId) {
          const assignmentMap = new Map<string, { assignedDestinationId: string | null; assignedDestinationName: string | null }>(
            msg.assignments.map((a: { registrationId: string; assignedDestinationId: string | null; assignedDestinationName: string | null }) => [
              a.registrationId,
              { assignedDestinationId: a.assignedDestinationId, assignedDestinationName: a.assignedDestinationName },
            ])
          );

          // Only update the Assigned column — never touches fields being edited
          const applyAssignments = (list: Application[]): Application[] =>
            list.map((app) => {
              const asgn = assignmentMap.get(app.registrationId);
              if (!asgn) return { ...app, assignedDestinationId: null, assignedDestinationName: null };
              return { ...app, assignedDestinationId: asgn.assignedDestinationId, assignedDestinationName: asgn.assignedDestinationName };
            });

          setApplications((prev) => applyAssignments(prev));
          setIncompleteApplications((prev) => applyAssignments(prev));
          setHasAssignments(msg.hasAssignments);
          setLastAssignResult({ assigned: msg.assigned, unassigned: msg.unassigned });
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (mountedRef.current) {
        reconnectTimerRef.current = setTimeout(connectWebSocket, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }

  async function fetchApplications() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stages/${stageId}/applications`);
      if (res.ok) {
        const data = await res.json();
        setStageName(getStageName(data.stage));
        setApplications(data.applications);
        setIncompleteApplications(data.incompleteApplications);
        setDestinations(data.destinations);
        setMaxDestChoices(data.maxDestinationChoices ?? 3);
        setHasAssignments(data.hasAssignments ?? false);
      }
    } finally {
      setLoading(false);
    }
  }

  function startEdit(app: Application) {
    const prefs = app.destinationPreferences;
    const destPrefs = Array.from({ length: maxDestChoices }, (_, i) => prefs[i] ?? "");
    setEditingRows((prev) =>
      new Map(prev).set(app.registrationId, {
        fullName: app.studentName,
        enrollmentId: app.enrollmentId ?? "",
        level: (app.level ?? STUDENT_LEVELS[0]) as StudentLevel,
        spokenLanguages: [...app.spokenLanguages],
        destinationPrefs: destPrefs,
        averageResult: app.averageResult !== null ? String(app.averageResult) : "",
        additionalActivities:
          app.additionalActivities !== null ? String(app.additionalActivities) : "",
        recommendationLetters:
          app.recommendationLetters !== null ? String(app.recommendationLetters) : "",
      })
    );
  }

  function cancelEdit(registrationId: string) {
    setEditingRows((prev) => {
      const next = new Map(prev);
      next.delete(registrationId);
      return next;
    });
  }

  function updateEdit(registrationId: string, patch: Partial<EditState>) {
    setEditingRows((prev) => {
      const curr = prev.get(registrationId);
      if (!curr) return prev;
      return new Map(prev).set(registrationId, { ...curr, ...patch });
    });
  }

  function updateDestPref(registrationId: string, index: number, value: string) {
    setEditingRows((prev) => {
      const curr = prev.get(registrationId);
      if (!curr) return prev;
      const prefs = [...curr.destinationPrefs];
      const deduped = prefs.map((p, j) =>
        j !== index && p === value && value !== "" ? "" : p
      );
      deduped[index] = value;
      return new Map(prev).set(registrationId, { ...curr, destinationPrefs: deduped });
    });
  }

  async function saveRow(app: Application) {
    const edit = editingRows.get(app.registrationId);
    if (!edit) return;

    setSavingRows((prev) => new Set(prev).add(app.registrationId));

    const body: Record<string, unknown> = {};

    if (edit.fullName !== app.studentName) body.fullName = edit.fullName;
    if (edit.enrollmentId !== (app.enrollmentId ?? "")) body.enrollmentId = edit.enrollmentId;
    if (edit.level !== (app.level ?? STUDENT_LEVELS[0])) body.level = edit.level;

    if ([...edit.spokenLanguages].sort().join() !== [...app.spokenLanguages].sort().join()) {
      body.spokenLanguages = edit.spokenLanguages;
    }

    const newPrefs = edit.destinationPrefs.filter(Boolean);
    if (JSON.stringify(newPrefs) !== JSON.stringify(app.destinationPreferences)) {
      body.destinationPreferences = newPrefs;
    }

    const newAvg = edit.averageResult !== "" ? parseFloat(edit.averageResult) : null;
    if (newAvg !== app.averageResult) body.averageResult = newAvg;

    const newActivities =
      edit.additionalActivities !== "" ? parseInt(edit.additionalActivities) : null;
    if (newActivities !== app.additionalActivities) body.additionalActivities = newActivities;

    const newLetters =
      edit.recommendationLetters !== "" ? parseInt(edit.recommendationLetters) : null;
    if (newLetters !== app.recommendationLetters) body.recommendationLetters = newLetters;

    try {
      const res = await fetch(`/api/admin/registrations/${app.registrationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        cancelEdit(app.registrationId);
        await fetchApplications();
      }
    } finally {
      setSavingRows((prev) => {
        const next = new Set(prev);
        next.delete(app.registrationId);
        return next;
      });
    }
  }

  async function assignStudents() {
    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/stages/${stageId}/assign`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLastAssignResult({ assigned: data.assigned, unassigned: data.unassigned });
        await fetchApplications();
      }
    } finally {
      setAssigning(false);
    }
  }

  async function completeStage() {
    if (!confirm("Complete this stage? The current assignments will be finalized.")) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/admin/stages/${stageId}/complete`, { method: "POST" });
      if (res.ok) {
        alert("Stage completed!");
        router.push(`/admin/recruitment/${recruitmentId}`);
      }
    } finally {
      setCompleting(false);
    }
  }

  function renderGrid(rows: Application[], emptyMessage: string) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-3 font-medium whitespace-nowrap">Slot</th>
              <th className="text-left p-3 font-medium min-w-[120px]">Name</th>
              <th className="text-left p-3 font-medium whitespace-nowrap">Enrollment ID</th>
              <th className="text-left p-3 font-medium min-w-[100px]">Level</th>
              <th className="text-left p-3 font-medium min-w-[100px]">Languages</th>
              <th className="text-left p-3 font-medium min-w-[140px]">Destinations</th>
              <th className="text-left p-3 font-medium whitespace-nowrap">Avg Result</th>
              <th className="text-left p-3 font-medium min-w-[80px]">Activities</th>
              <th className="text-left p-3 font-medium min-w-[70px]">Letters</th>
              <th className="text-left p-3 font-medium min-w-[60px]">Score</th>
              <th className="text-left p-3 font-medium min-w-[100px]">Assigned</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-8 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((app) => {
              const edit = editingRows.get(app.registrationId);
              const saving = savingRows.has(app.registrationId);

              if (edit) {
                return (
                  <tr key={app.registrationId} className="border-b bg-blue-50/40">
                    <td className="p-3 font-mono text-muted-foreground align-top">
                      #{app.slotNumber}
                    </td>
                    <td className="p-3 align-top">
                      <Input
                        value={edit.fullName}
                        onChange={(e) =>
                          updateEdit(app.registrationId, { fullName: e.target.value })
                        }
                        className="h-7 w-full"
                      />
                    </td>
                    <td className="p-3 align-top">
                      <Input
                        value={edit.enrollmentId}
                        onChange={(e) =>
                          updateEdit(app.registrationId, { enrollmentId: e.target.value })
                        }
                        className="h-7 w-24 font-mono"
                        maxLength={6}
                        pattern="[1-9][0-9]{5}"
                      />
                    </td>
                    <td className="p-3 align-top">
                      <select
                        value={edit.level}
                        onChange={(e) =>
                          updateEdit(app.registrationId, {
                            level: e.target.value as StudentLevel,
                          })
                        }
                        className="border rounded px-2 py-1 text-sm bg-background"
                      >
                        {STUDENT_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>{STUDENT_LEVEL_LABELS[lvl]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex flex-col gap-0.5">
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <label
                            key={lang}
                            className="flex items-center gap-1.5 text-xs cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={edit.spokenLanguages.includes(lang)}
                              onChange={(e) => {
                                const langs = e.target.checked
                                  ? [...edit.spokenLanguages, lang]
                                  : edit.spokenLanguages.filter((l) => l !== lang);
                                updateEdit(app.registrationId, { spokenLanguages: langs });
                              }}
                            />
                            {lang}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex flex-col gap-1">
                        {edit.destinationPrefs.map((pref, i) => (
                          <select
                            key={i}
                            value={pref}
                            onChange={(e) =>
                              updateDestPref(app.registrationId, i, e.target.value)
                            }
                            className="border rounded px-2 py-1 text-xs bg-background w-full"
                          >
                            <option value="">— {i + 1}. choice —</option>
                            {destinations.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      <Input
                        type="number"
                        min={0}
                        max={6}
                        step={0.1}
                        value={edit.averageResult}
                        onChange={(e) =>
                          updateEdit(app.registrationId, { averageResult: e.target.value })
                        }
                        className="h-7 w-full"
                        placeholder="0.0"
                      />
                    </td>
                    <td className="p-3 align-top">
                      <Input
                        type="number"
                        min={0}
                        max={4}
                        step={1}
                        value={edit.additionalActivities}
                        onChange={(e) =>
                          updateEdit(app.registrationId, {
                            additionalActivities: e.target.value,
                          })
                        }
                        className="h-7 w-full"
                        placeholder="0"
                      />
                    </td>
                    <td className="p-3 align-top">
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        step={1}
                        value={edit.recommendationLetters}
                        onChange={(e) =>
                          updateEdit(app.registrationId, {
                            recommendationLetters: e.target.value,
                          })
                        }
                        className="h-7 w-full"
                        placeholder="0"
                      />
                    </td>
                    <td className="p-3 font-mono text-muted-foreground align-top">
                      {app.score.toFixed(1)}
                    </td>
                    <td className="p-3 align-top text-sm">
                      {app.assignedDestinationName ? (
                        <Badge variant="success" className="whitespace-nowrap">
                          {app.assignedDestinationName}
                        </Badge>
                      ) : app.assignedDestinationId === null && lastAssignResult ? (
                        <span className="text-amber-500 font-medium">Unassigned</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          onClick={() => saveRow(app)}
                          disabled={saving}
                          className="whitespace-nowrap"
                        >
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelEdit(app.registrationId)}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }

              const missingScores =
                app.averageResult === null ||
                app.additionalActivities === null ||
                app.recommendationLetters === null;

              return (
                <tr
                  key={app.registrationId}
                  className={`border-b hover:bg-muted/20 ${missingScores ? "bg-amber-50/30" : ""}`}
                >
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
                      <span className="text-amber-500 font-medium">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {app.additionalActivities !== null ? (
                      app.additionalActivities
                    ) : (
                      <span className="text-amber-500 font-medium">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {app.recommendationLetters !== null ? (
                      app.recommendationLetters
                    ) : (
                      <span className="text-amber-500 font-medium">—</span>
                    )}
                  </td>
                  <td className="p-3 font-mono">{app.score.toFixed(1)}</td>
                  <td className="p-3">
                    {app.assignedDestinationName ? (
                      <Badge variant="success" className="whitespace-nowrap">
                        {app.assignedDestinationName}
                      </Badge>
                    ) : app.assignedDestinationId === null && lastAssignResult ? (
                      <span className="text-amber-500 font-medium text-sm">Unassigned</span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => startEdit(app)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) {
    return <AdminLayout><p>Loading...</p></AdminLayout>;
  }

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Recruitment", href: `/admin/recruitment/${recruitmentId}` },
        { label: "Review Applications" },
      ]}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Review Applications</h1>
          <p className="text-muted-foreground">{stageName}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastAssignResult && (
            <p className="text-sm text-muted-foreground">
              Last run: <span className="text-green-600 font-medium">{lastAssignResult.assigned} assigned</span>
              {lastAssignResult.unassigned > 0 && (
                <span className="text-amber-600 font-medium">, {lastAssignResult.unassigned} unassigned</span>
              )}
            </p>
          )}
          <Button
            onClick={assignStudents}
            disabled={assigning || completing || editingRows.size > 0}
            title={editingRows.size > 0 ? "Save or cancel pending edits first" : undefined}
          >
            <UserCheck className="w-4 h-4 mr-1.5" />{assigning ? "Assigning..." : "Assign Students"}
          </Button>
          {hasAssignments && (
            <Button
              variant="destructive"
              onClick={completeStage}
              disabled={completing || assigning || editingRows.size > 0}
            >
              {completing ? "Completing..." : "Complete Stage"}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <nav className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab("completed")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "completed"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Completed registrations
            <span className="text-xs bg-muted rounded-full px-2 py-0.5">
              {applications.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("incomplete")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "incomplete"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Not completed registrations
            <span className="text-xs bg-muted rounded-full px-2 py-0.5">
              {incompleteApplications.length}
            </span>
          </button>
          <div className="ml-auto pb-3 flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm text-muted-foreground">
              {connected ? "Live" : "Reconnecting..."}
            </span>
          </div>
        </nav>
      </div>

      {activeTab === "completed" &&
        renderGrid(applications, "No completed registrations yet")}
      {activeTab === "incomplete" &&
        renderGrid(incompleteApplications, "No incomplete registrations")}
    </AdminLayout>
  );
}
