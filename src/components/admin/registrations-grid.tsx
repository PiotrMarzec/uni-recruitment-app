"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@/db/schema/destinations";
import { STUDENT_LEVELS, STUDENT_LEVEL_LABELS, StudentLevel } from "@/db/schema/registrations";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Destination {
  id: string;
  name: string;
}

export interface RegistrationRow {
  registrationId: string;
  slotId: string;
  slotNumber: number;
  studentName: string | null;
  enrollmentId: string | null;
  level: string | null;
  spokenLanguages: string[];
  destinationPreferences: string[];
  destinationNames: string[];
  averageResult: number | null;
  additionalActivities: number | null;
  recommendationLetters: number | null;
  score: number;
  notes: string | null;
  registrationCompleted: boolean;
  updatedAt: string;
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
  notes: string;
}

export type SortKey = "slot" | "name" | "avgResult" | "score" | "updatedAt" | "status";
export type SortDir = "asc" | "desc";
export type StatusFilter = "all" | "completed" | "incomplete";

export interface RegistrationsGridDataLoad {
  hasAssignments: boolean;
  hasNextSupplementary: boolean;
  stage: { type: string; order: number } | null;
  recruitmentName: string | null;
}

export interface RegistrationsGridProps {
  recruitmentId: string;
  /** When provided, loads assignment results for this stage and enables live WS updates */
  stageId?: string;
  defaultSortKey?: SortKey;
  defaultSortDir?: SortDir;
  defaultStatusFilter?: StatusFilter;
  defaultSearchQuery?: string;
  /** Whether to show in-progress (started but not completed) registrations. Default: false */
  defaultShowStarted?: boolean;
  /** Called once when data is first loaded (and on each refresh) */
  onDataLoad?: (info: RegistrationsGridDataLoad) => void;
  /** Called when the user starts or finishes editing rows */
  onEditingChange?: (hasEditing: boolean) => void;
  /** Called when WS delivers an assignment update */
  onAssignmentsUpdate?: (hasAssignments: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RegistrationsGrid({
  recruitmentId,
  stageId,
  defaultSortKey = "slot",
  defaultSortDir = "asc",
  defaultStatusFilter = "all",
  defaultSearchQuery = "",
  defaultShowStarted = false,
  onDataLoad,
  onEditingChange,
  onAssignmentsUpdate,
}: RegistrationsGridProps) {
  const tc = useTranslations("common");
  const t = useTranslations("admin.applications");
  const tresults = useTranslations("admin.results");

  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [maxDestChoices, setMaxDestChoices] = useState(3);
  const [hasAssignments, setHasAssignments] = useState(false);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState(defaultSearchQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(defaultStatusFilter);
  const [showStarted, setShowStarted] = useState(defaultShowStarted);
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);

  const [editingRows, setEditingRows] = useState<Map<string, EditState>>(new Map());
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);

  const editingRowsRef = useRef<Map<string, EditState>>(new Map());
  editingRowsRef.current = editingRows;
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    if (stageId) connectWebSocket();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruitmentId, stageId]);

  useEffect(() => {
    onEditingChange?.(editingRows.size > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRows.size]);

  // ── Data fetching ───────────────────────────────────────────────────────────

  async function fetchData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const url = stageId
        ? `/api/admin/recruitments/${recruitmentId}/registrations?stageId=${stageId}`
        : `/api/admin/recruitments/${recruitmentId}/registrations`;
      const res = await fetch(url);
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setRows(data.registrations);
        setDestinations(data.destinations);
        setMaxDestChoices(data.maxDestinationChoices ?? 3);
        setHasAssignments(data.hasAssignments ?? false);
        onDataLoad?.({
          hasAssignments: data.hasAssignments ?? false,
          hasNextSupplementary: data.hasNextSupplementary ?? false,
          stage: data.stage ?? null,
          recruitmentName: data.recruitmentName ?? null,
        });
      }
    } finally {
      if (!silent && mountedRef.current) setLoading(false);
    }
  }

  // ── WebSocket ───────────────────────────────────────────────────────────────

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

        if (msg.type === "slot_status_update" && msg.stageId === stageId) {
          if (msg.startedSlot) {
            const { slotId, slotNumber, createdAt } = msg.startedSlot;
            setRows((prev) => {
              if (prev.some((r) => r.slotId === slotId)) return prev;
              const placeholder: RegistrationRow = {
                registrationId: slotId,
                slotId,
                slotNumber,
                studentName: null,
                enrollmentId: null,
                level: null,
                spokenLanguages: [],
                destinationPreferences: [],
                destinationNames: [],
                averageResult: null,
                additionalActivities: null,
                recommendationLetters: null,
                score: 0,
                notes: null,
                registrationCompleted: false,
                updatedAt: createdAt,
                assignedDestinationId: null,
                assignedDestinationName: null,
              };
              return [placeholder, ...prev];
            });
          }
        }

        if (msg.type === "registration_step_update" && msg.stageId === stageId) {
          fetchData(true);
        }

        if (msg.type === "application_row_update" && msg.stageId === stageId) {
          const updated: RegistrationRow = msg.application;
          if (editingRowsRef.current.has(updated.registrationId)) return;
          setRows((prev) => {
            const idx = prev.findIndex((r) => r.registrationId === updated.registrationId);
            if (idx < 0) return prev;
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
        }

        if (msg.type === "application_assignments_update" && msg.stageId === stageId) {
          const assignmentMap = new Map<
            string,
            { assignedDestinationId: string | null; assignedDestinationName: string | null }
          >(
            msg.assignments.map(
              (a: {
                registrationId: string;
                assignedDestinationId: string | null;
                assignedDestinationName: string | null;
              }) => [
                a.registrationId,
                {
                  assignedDestinationId: a.assignedDestinationId,
                  assignedDestinationName: a.assignedDestinationName,
                },
              ]
            )
          );

          setRows((prev) =>
            prev.map((row) => {
              const asgn = assignmentMap.get(row.registrationId);
              if (!asgn) return { ...row, assignedDestinationId: null, assignedDestinationName: null };
              return {
                ...row,
                assignedDestinationId: asgn.assignedDestinationId,
                assignedDestinationName: asgn.assignedDestinationName,
              };
            })
          );
          setHasAssignments(msg.hasAssignments);
          onAssignmentsUpdate?.(msg.hasAssignments);
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

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }

  // ── Inline editing ──────────────────────────────────────────────────────────

  function startEdit(row: RegistrationRow) {
    const prefs = row.destinationPreferences;
    const destPrefs = Array.from({ length: maxDestChoices }, (_, i) => prefs[i] ?? "");
    setEditingRows((prev) =>
      new Map(prev).set(row.registrationId, {
        fullName: row.studentName ?? "",
        enrollmentId: row.enrollmentId ?? "",
        level: (row.level ?? STUDENT_LEVELS[0]) as StudentLevel,
        spokenLanguages: [...row.spokenLanguages],
        destinationPrefs: destPrefs,
        averageResult: row.averageResult !== null ? String(row.averageResult) : "",
        additionalActivities: row.additionalActivities !== null ? String(row.additionalActivities) : "",
        recommendationLetters: row.recommendationLetters !== null ? String(row.recommendationLetters) : "",
        notes: row.notes ?? "",
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
      const deduped = prefs.map((p, j) => (j !== index && p === value && value !== "" ? "" : p));
      deduped[index] = value;
      return new Map(prev).set(registrationId, { ...curr, destinationPrefs: deduped });
    });
  }

  async function saveRow(row: RegistrationRow) {
    const edit = editingRows.get(row.registrationId);
    if (!edit) return;

    setSavingRows((prev) => new Set(prev).add(row.registrationId));
    const body: Record<string, unknown> = {};

    if (edit.fullName !== row.studentName) body.fullName = edit.fullName;
    if (edit.enrollmentId !== (row.enrollmentId ?? "")) body.enrollmentId = edit.enrollmentId;
    if (edit.level !== (row.level ?? STUDENT_LEVELS[0])) body.level = edit.level;
    if ([...edit.spokenLanguages].sort().join() !== [...row.spokenLanguages].sort().join())
      body.spokenLanguages = edit.spokenLanguages;

    const newPrefs = edit.destinationPrefs.filter(Boolean);
    if (JSON.stringify(newPrefs) !== JSON.stringify(row.destinationPreferences))
      body.destinationPreferences = newPrefs;

    const newAvg = edit.averageResult !== "" ? parseFloat(edit.averageResult) : null;
    if (newAvg !== row.averageResult) body.averageResult = newAvg;

    const newActivities = edit.additionalActivities !== "" ? parseInt(edit.additionalActivities) : null;
    if (newActivities !== row.additionalActivities) body.additionalActivities = newActivities;

    const newLetters = edit.recommendationLetters !== "" ? parseInt(edit.recommendationLetters) : null;
    if (newLetters !== row.recommendationLetters) body.recommendationLetters = newLetters;

    const newNotes = edit.notes.trim() !== "" ? edit.notes : null;
    if (newNotes !== row.notes) body.notes = newNotes;

    try {
      const res = await fetch(`/api/admin/registrations/${row.registrationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        cancelEdit(row.registrationId);
        await fetchData();
      }
    } finally {
      setSavingRows((prev) => {
        const next = new Set(prev);
        next.delete(row.registrationId);
        return next;
      });
    }
  }

  // ── Sort / filter ───────────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const completedCount = useMemo(() => rows.filter((r) => r.registrationCompleted).length, [rows]);
  const incompleteCount = useMemo(() => rows.filter((r) => !r.registrationCompleted).length, [rows]);

  const visibleRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let filtered = rows;

    if (!showStarted) filtered = filtered.filter((r) => r.registrationCompleted);
    if (statusFilter === "completed") filtered = filtered.filter((r) => r.registrationCompleted);
    else if (statusFilter === "incomplete") filtered = filtered.filter((r) => !r.registrationCompleted);

    if (q)
      filtered = filtered.filter(
        (r) =>
          (r.studentName ?? "").toLowerCase().includes(q) ||
          (r.enrollmentId ?? "").toLowerCase().includes(q)
      );

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "slot") cmp = a.slotNumber - b.slotNumber;
      else if (sortKey === "name") cmp = (a.studentName ?? "").localeCompare(b.studentName ?? "");
      else if (sortKey === "avgResult") cmp = (a.averageResult ?? -1) - (b.averageResult ?? -1);
      else if (sortKey === "score") cmp = a.score - b.score;
      else if (sortKey === "updatedAt")
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      else if (sortKey === "status")
        cmp = Number(a.registrationCompleted) - Number(b.registrationCompleted);
      const primary = sortDir === "asc" ? cmp : -cmp;
      if (primary === 0 && sortKey === "status")
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return primary;
    });
  }, [rows, searchQuery, statusFilter, showStarted, sortKey, sortDir]);

  // ── Render helpers ──────────────────────────────────────────────────────────

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col)
      return <ChevronsUpDown className="inline w-3.5 h-3.5 ml-0.5 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronUp className="inline w-3.5 h-3.5 ml-0.5" />
    ) : (
      <ChevronDown className="inline w-3.5 h-3.5 ml-0.5" />
    );
  }

  function SortTh({
    col,
    className,
    children,
  }: {
    col: SortKey;
    className?: string;
    children: React.ReactNode;
  }) {
    return (
      <th
        className={`text-left p-3 font-medium whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 ${className ?? ""}`}
        onClick={() => handleSort(col)}
      >
        {children}
        <SortIcon col={col} />
      </th>
    );
  }

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return <p className="text-muted-foreground text-sm">{tc("loading")}</p>;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or enrollment ID…"
            className="pl-8 w-64"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          {(["all", "completed", "incomplete"] as StatusFilter[]).map((f) => {
            const count =
              f === "all" ? rows.length : f === "completed" ? completedCount : incompleteCount;
            const label =
              f === "all" ? "All" : f === "completed" ? t("completedTab") : t("incompleteTab");
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
                  statusFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 py-0 leading-5 text-[10px] ${
                    statusFilter === f
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* In-progress toggle */}
        <button
          onClick={() => setShowStarted((v) => !v)}
          className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors flex items-center gap-1.5 ${
            showStarted
              ? "bg-amber-50 border-amber-300 text-amber-700"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="w-3 h-3" />
          In progress
          <span className={`rounded-full px-1.5 py-0 leading-5 text-[10px] ${showStarted ? "bg-amber-100" : "bg-muted"}`}>
            {incompleteCount}
          </span>
        </button>

        {/* Clear filters */}
        {(searchQuery || statusFilter !== "all") && (
          <button
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Clear filters
          </button>
        )}

        {/* Live indicator — only shown when WS is active */}
        {stageId && (
          <div className="ml-auto flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm text-muted-foreground">
              {connected ? t("live") : t("reconnecting")}
            </span>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <SortTh col="status" className="w-8 px-2">{" "}</SortTh>
              <SortTh col="slot">{tresults("slot")}</SortTh>
              <SortTh col="name" className="min-w-[120px]">{tc("name")}</SortTh>
              <th className="text-left p-3 font-medium whitespace-nowrap">{tresults("enrollmentId")}</th>
              <th className="text-left p-3 font-medium min-w-[100px]">{tresults("level")}</th>
              <th className="text-left p-3 font-medium min-w-[100px]">{tresults("languages")}</th>
              <th className="text-left p-3 font-medium min-w-[140px]">{tresults("destinations")}</th>
              <SortTh col="avgResult">{tresults("avgResult")}</SortTh>
              <th className="text-left p-3 font-medium min-w-[80px]">{tresults("activities")}</th>
              <th className="text-left p-3 font-medium min-w-[70px]">{tresults("letters")}</th>
              <SortTh col="score" className="min-w-[60px]">{tresults("score")}</SortTh>
              <th className="text-left p-3 font-medium min-w-[100px]">{tresults("approved")}</th>
              <SortTh col="updatedAt" className="min-w-[100px]">Last Edit</SortTh>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={14} className="p-8 text-center text-muted-foreground">
                  {t("noCompletedRegistrations")}
                </td>
              </tr>
            )}
            {visibleRows.map((row) => {
              const edit = editingRows.get(row.registrationId);
              const saving = savingRows.has(row.registrationId);

              const statusCell = (
                <td className="px-2 py-3 align-middle">
                  {row.registrationCompleted ? (
                    <span title="Completed">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </span>
                  ) : (
                    <span title="In progress">
                      <Clock className="w-4 h-4 text-amber-400" />
                    </span>
                  )}
                </td>
              );

              if (edit) {
                return (
                  <React.Fragment key={row.registrationId}>
                    <tr className="bg-blue-50/40">
                      {statusCell}
                      <td className="p-3 font-mono text-muted-foreground align-top">
                        #{row.slotNumber}
                      </td>
                      <td className="p-3 align-top">
                        <Input
                          value={edit.fullName}
                          onChange={(e) => updateEdit(row.registrationId, { fullName: e.target.value })}
                          className="h-7 w-full"
                        />
                      </td>
                      <td className="p-3 align-top">
                        <Input
                          value={edit.enrollmentId}
                          onChange={(e) => updateEdit(row.registrationId, { enrollmentId: e.target.value })}
                          className="h-7 w-24 font-mono"
                          maxLength={6}
                          pattern="[1-9][0-9]{5}"
                        />
                      </td>
                      <td className="p-3 align-top">
                        <select
                          value={edit.level}
                          onChange={(e) =>
                            updateEdit(row.registrationId, { level: e.target.value as StudentLevel })
                          }
                          className="border rounded px-2 py-1 text-sm bg-background"
                        >
                          {STUDENT_LEVELS.map((lvl) => (
                            <option key={lvl} value={lvl}>
                              {STUDENT_LEVEL_LABELS[lvl]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex flex-col gap-0.5">
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <label key={lang} className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={edit.spokenLanguages.includes(lang)}
                                onChange={(e) => {
                                  const langs = e.target.checked
                                    ? [...edit.spokenLanguages, lang]
                                    : edit.spokenLanguages.filter((l) => l !== lang);
                                  updateEdit(row.registrationId, { spokenLanguages: langs });
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
                              onChange={(e) => updateDestPref(row.registrationId, i, e.target.value)}
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
                          onChange={(e) => updateEdit(row.registrationId, { averageResult: e.target.value })}
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
                            updateEdit(row.registrationId, { additionalActivities: e.target.value })
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
                            updateEdit(row.registrationId, { recommendationLetters: e.target.value })
                          }
                          className="h-7 w-full"
                          placeholder="0"
                        />
                      </td>
                      <td className="p-3 font-mono text-muted-foreground align-top">
                        {row.score.toFixed(1)}
                      </td>
                      <td className="p-3 align-top text-sm">
                        {row.assignedDestinationName ? (
                          <Badge variant="success" className="whitespace-nowrap">
                            {row.assignedDestinationName}
                          </Badge>
                        ) : row.assignedDestinationId === null && hasAssignments ? (
                          <span className="text-amber-500 font-medium">{tresults("unassigned")}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.updatedAt).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                        })}
                        <br />
                        {new Date(row.updatedAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            onClick={() => saveRow(row)}
                            disabled={saving}
                            className="whitespace-nowrap"
                          >
                            {saving ? t("saving") : tc("save")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelEdit(row.registrationId)}
                            disabled={saving}
                          >
                            {tc("cancel")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b bg-blue-50/40">
                      <td colSpan={14} className="px-3 pb-3">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Notes
                        </label>
                        <textarea
                          value={edit.notes}
                          onChange={(e) => updateEdit(row.registrationId, { notes: e.target.value })}
                          rows={2}
                          className="w-full border rounded px-2 py-1 text-sm bg-background resize-y"
                          placeholder="Add notes…"
                        />
                      </td>
                    </tr>
                  </React.Fragment>
                );
              }

              const missingScores =
                row.averageResult === null ||
                row.additionalActivities === null ||
                row.recommendationLetters === null;

              return (
                <React.Fragment key={row.registrationId}>
                  <tr
                    className={`${row.notes ? "" : "border-b"} hover:bg-muted/20 ${missingScores ? "bg-amber-50/30" : ""}`}
                  >
                    {statusCell}
                    <td className="p-3 font-mono text-muted-foreground">#{row.slotNumber}</td>
                    <td className="p-3 font-medium">
                      {row.studentName ?? <span className="text-muted-foreground italic">—</span>}
                    </td>
                    <td className="p-3 font-mono">
                      {row.enrollmentId ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3">
                      {row.level ? (
                        <Badge variant="secondary">
                          {STUDENT_LEVEL_LABELS[row.level as StudentLevel] ?? row.level}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {row.spokenLanguages.length > 0 ? (
                          row.spokenLanguages.map((l) => (
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
                      {row.destinationNames.length > 0 ? (
                        <ol className="list-none space-y-0.5">
                          {row.destinationNames.map((name, i) => (
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
                      {row.averageResult !== null ? (
                        row.averageResult.toFixed(1)
                      ) : (
                        <span className="text-amber-500 font-medium">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.additionalActivities !== null ? (
                        row.additionalActivities
                      ) : (
                        <span className="text-amber-500 font-medium">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.recommendationLetters !== null ? (
                        row.recommendationLetters
                      ) : (
                        <span className="text-amber-500 font-medium">—</span>
                      )}
                    </td>
                    <td className="p-3 font-mono">{row.score.toFixed(1)}</td>
                    <td className="p-3">
                      {row.assignedDestinationName ? (
                        <Badge variant="success" className="whitespace-nowrap">
                          {row.assignedDestinationName}
                        </Badge>
                      ) : row.assignedDestinationId === null && hasAssignments ? (
                        <span className="text-amber-500 font-medium text-sm">
                          {tresults("unassigned")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.updatedAt).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })}
                      <br />
                      {new Date(row.updatedAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3">
                      {row.studentName !== null && (
                        <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                          {tc("edit")}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {row.notes && (
                    <tr
                      className={`border-b hover:bg-muted/20 ${missingScores ? "bg-amber-50/30" : ""}`}
                    >
                      <td colSpan={14} className="px-3 pb-2 pt-0">
                        <p className="text-xs text-muted-foreground font-medium mb-0.5">Notes</p>
                        <p className="text-sm whitespace-pre-wrap">{row.notes}</p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
