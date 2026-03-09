"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface AuditEntry {
  id: string;
  timestamp: string;
  actorType: string;
  actorLabel: string;
  action: string;
  resourceType: string;
  resourceId: string;
  recruitmentId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
}

const actorColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  admin: "default",
  student: "secondary",
  teacher: "outline",
  system: "destructive",
};

export default function AuditLogPage() {
  const t = useTranslations("admin.audit");
  const tc = useTranslations("common");

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    actorType: "",
    dateFrom: "",
    dateTo: "",
  });

  useEffect(() => {
    fetchEntries();
  }, []);

  async function fetchEntries() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.actorType) params.set("actorType", filters.actorType);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);

    try {
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
      }
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.actorType) params.set("actorType", filters.actorType);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    params.set("format", "csv");
    window.open(`/api/admin/audit?${params.toString()}`, "_blank");
  }

  const td = useTranslations("admin.dashboard");

  return (
    <AdminLayout
      breadcrumbs={[
        { label: td("breadcrumb"), href: "/admin/dashboard" },
        { label: t("title") },
      ]}
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          {t("exportCsv")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <Input
          placeholder={tc("search")}
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="max-w-xs"
        />
        <select
          className="border rounded-md px-3 py-2 text-sm"
          value={filters.actorType}
          onChange={(e) => setFilters((f) => ({ ...f, actorType: e.target.value }))}
        >
          <option value="">{t("actorTypes.all")}</option>
          <option value="admin">{t("actorTypes.admin")}</option>
          <option value="student">{t("actorTypes.student")}</option>
          <option value="teacher">{t("actorTypes.teacher")}</option>
          <option value="system">{t("actorTypes.system")}</option>
        </select>
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          className="w-40"
        />
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          className="w-40"
        />
        <Button onClick={fetchEntries}>{tc("filter")}</Button>
      </div>

      {loading ? (
        <p>{tc("loading")}</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">{tc("noData")}</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">{t("timestamp")}</th>
                <th className="text-left p-3 font-medium">{t("actor")}</th>
                <th className="text-left p-3 font-medium">{t("action")}</th>
                <th className="text-left p-3 font-medium">{t("resource")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className="border-b hover:bg-muted/20 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(entry.timestamp)}
                    </td>
                    <td className="p-3">
                      <Badge variant={actorColors[entry.actorType] || "default"} className="text-xs mr-2">
                        {entry.actorType}
                      </Badge>
                      <span className="text-xs">{entry.actorLabel}</span>
                    </td>
                    <td className="p-3 font-mono text-xs">{entry.action}</td>
                    <td className="p-3 text-xs">
                      <span className="text-muted-foreground">{entry.resourceType}/</span>
                      <span className="font-mono">{entry.resourceId.slice(0, 8)}…</span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-xs text-muted-foreground">
                        {expandedId === entry.id ? "▲" : "▼"}
                      </span>
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr key={`${entry.id}-expanded`} className="border-b bg-muted/10">
                      <td colSpan={5} className="p-4">
                        <pre className="text-xs font-mono overflow-auto max-h-48 bg-muted p-3 rounded">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                        {entry.ipAddress && (
                          <p className="text-xs text-muted-foreground mt-2">IP: {entry.ipAddress}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
