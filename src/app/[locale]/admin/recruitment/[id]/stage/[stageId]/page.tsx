"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface DashboardData {
  stage: {
    id: string;
    name: string;
    status: string;
    type: string;
    endDate: string;
  };
  stats: {
    totalSlots: number;
    openSlots: number;
    startedSlots: number;
    registeredSlots: number;
  };
  recentRegistrations: Array<{
    slotId: string;
    slotNumber: number;
    studentName: string;
    studentEmail: string;
    completedAt: string | null;
    updatedAt: string;
    registrationCompleted: boolean;
    teacherManagementLink: string;
  }>;
}

export default function StageDashboardPage() {
  const params = useParams();
  const id = params.id as string;
  const stageId = params.stageId as string;
  const t = useTranslations("admin.stage");

  const [data, setData] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    fetchDashboard();
    connectWebSocket();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [stageId]);

  async function fetchDashboard() {
    const res = await fetch(`/api/admin/stages/${stageId}/dashboard`);
    if (res.ok) {
      const d = await res.json();
      setData(d);
    }
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", stageId }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "slot_status_update" && message.stageId === stageId) {
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              stats: {
                ...prev.stats,
                openSlots: message.openSlotsCount,
                startedSlots: message.startedSlotsCount,
              },
            };
          });
        }

        if (message.type === "registration_update" && message.stageId === stageId) {
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              stats: {
                ...prev.stats,
                openSlots: message.openSlotsCount,
                startedSlots: message.startedSlotsCount,
                registeredSlots: prev.stats.registeredSlots + 1,
              },
            };
          });
        }

        if (message.type === "registration_step_update" && message.stageId === stageId) {
          setData((prev) => {
            if (!prev) return prev;
            const incoming = message.registration;
            const idx = prev.recentRegistrations.findIndex((r) => r.slotId === incoming.slotId);
            const updated = idx >= 0
              ? prev.recentRegistrations.map((r, i) => (i === idx ? incoming : r))
              : [incoming, ...prev.recentRegistrations];
            const sorted = [...updated].sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            return { ...prev, recentRegistrations: sorted.slice(0, 50) };
          });
        }
      } catch {
        // Ignore
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

  if (!data) {
    return <AdminLayout><p>Loading...</p></AdminLayout>;
  }

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Recruitment", href: `/admin/recruitment/${id}` },
        { label: t("liveDashboard") },
      ]}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("liveDashboard")}</h1>
          <p className="text-muted-foreground">{data.stage.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm text-muted-foreground">
            {connected ? "Live" : "Reconnecting..."}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold">{data.stats.registeredSlots}</div>
            <p className="text-sm text-muted-foreground mt-1">{t("registered")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold text-yellow-500">{data.stats.startedSlots}</div>
            <p className="text-sm text-muted-foreground mt-1">{t("inProgress")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold text-green-600">{data.stats.openSlots}</div>
            <p className="text-sm text-muted-foreground mt-1">{t("openSlots")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold text-muted-foreground">{data.stats.totalSlots}</div>
            <p className="text-sm text-muted-foreground mt-1">{t("totalSlots")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Stage closes at */}
      <div className="mb-6 p-4 bg-muted/30 rounded-lg text-sm">
        <span className="font-medium">Stage closes:</span>{" "}
        <span>{formatDate(data.stage.endDate)}</span>
      </div>

      {/* Recent registrations */}
      <Card>
        <CardHeader>
          <CardTitle>{t("recentRegistrations")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentRegistrations.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noRegistrations")}</p>
          ) : (
            <div className="space-y-2">
              {data.recentRegistrations.map((reg) => (
                <div
                  key={reg.slotId}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${reg.registrationCompleted ? "bg-green-500" : "bg-yellow-400"}`} />
                    <div>
                      <span className="font-medium">{reg.studentName}</span>
                      <span className="text-muted-foreground text-sm ml-2">
                        — Slot #{reg.slotNumber}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="text-right space-y-0.5">
                      <div>Updated: {formatDate(reg.updatedAt)}</div>
                      {reg.completedAt && (
                        <div>Completed: {formatDate(reg.completedAt)}</div>
                      )}
                    </div>
                    {reg.registrationCompleted && (
                      <a
                        href={reg.teacherManagementLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline whitespace-nowrap"
                      >
                        Manage
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
