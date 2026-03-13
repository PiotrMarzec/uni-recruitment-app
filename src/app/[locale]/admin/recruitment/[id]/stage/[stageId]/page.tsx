"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { getStageName } from "@/lib/stage-name";
import { RegistrationsGrid } from "@/components/admin/registrations-grid";

interface DashboardData {
  stage: {
    id: string;
    status: string;
    type: string;
    order: number;
    endDate: string;
  };
  recruitmentName: string | null;
  stats: {
    totalSlots: number;
    openSlots: number;
    startedSlots: number;
    registeredSlots: number;
  };
}

export default function StageDashboardPage() {
  const params = useParams();
  const id = params.id as string;
  const stageId = params.stageId as string;
  const t = useTranslations("admin.stage");
  const tc = useTranslations("common");
  const td = useTranslations("admin.dashboard");
  const tr = useTranslations("admin.recruitment");
  const troot = useTranslations();

  const [data, setData] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data?.recruitmentName) {
      document.title = `Regie - ${data.recruitmentName} - ${t("liveDashboard")}`;
    }
  }, [data?.recruitmentName, t]);

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
                registeredSlots: message.registeredCount ?? prev.stats.registeredSlots,
              },
            };
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
    return <AdminLayout><p>{tc("loading")}</p></AdminLayout>;
  }

  return (
    <AdminLayout
      fullWidth
      breadcrumbs={[
        { label: td("breadcrumb"), href: "/admin/dashboard" },
        { label: data.recruitmentName || tr("breadcrumb"), href: `/admin/recruitment/${id}` },
        { label: getStageName(data.stage, troot) },
        { label: tr("stages.liveDashboard") },
      ]}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("liveDashboard")}</h1>
          <p className="text-muted-foreground">{getStageName(data.stage, troot)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm text-muted-foreground">
            {connected ? t("live") : t("reconnecting")}
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
        <span className="font-medium">{t("stageClosed")}</span>{" "}
        <span>{formatDate(data.stage.endDate)}</span>
      </div>

      {/* Registrations */}
      <RegistrationsGrid
        recruitmentId={id}
        stageId={stageId}
        defaultSortKey="status"
        defaultSortDir="asc"
        defaultStatusFilter="all"
        defaultSearchQuery=""
        defaultShowStarted={true}
      />
    </AdminLayout>
  );
}
