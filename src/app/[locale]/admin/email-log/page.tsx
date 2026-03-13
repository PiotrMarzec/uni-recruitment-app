"use client";

import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface EmailEntry {
  id: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  error: string | null;
  createdAt: string;
  processedAt: string | null;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  processing: "outline",
  sent: "default",
  failed: "destructive",
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  sent: "Sent",
  failed: "Failed",
};

/** Redact 6-digit OTP codes in HTML before displaying. */
function redactOtp(html: string): string {
  return html.replace(/\b\d{6}\b/g, "••••••");
}

/**
 * Renders email HTML safely inside a sandboxed iframe.
 * The sandbox attribute blocks scripts, form submissions, popups, and
 * same-origin access — preventing any XSS from injected email content.
 */
function SafeEmailPreview({ html }: { html: string }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(redactOtp(html));
    doc.close();

    // Auto-resize to content height
    const resize = () => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = iframe.contentDocument.body.scrollHeight + 16 + "px";
      }
    };
    resize();
    // Resize again after images/styles load
    iframe.addEventListener("load", resize);
    return () => iframe.removeEventListener("load", resize);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox=""
      className="w-full border rounded bg-white"
      style={{ minHeight: "100px", maxHeight: "384px" }}
      title="Email preview"
    />
  );
}

export default function EmailLogPage() {
  const [entries, setEntries] = useState<EmailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    fetchEntries();
  }, []);

  async function fetchEntries() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/admin/email-queue?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Email Log" },
      ]}
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Email Log</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <Input
          placeholder="Search by recipient or subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchEntries()}
          className="max-w-xs"
        />
        <select
          className="border rounded-md px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <Button onClick={fetchEntries}>Filter</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">No emails found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">To</th>
                <th className="text-left p-3 font-medium">Subject</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Sent at</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr
                    className="border-b hover:bg-muted/20 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="p-3 text-xs">{entry.to}</td>
                    <td className="p-3 text-xs">{entry.subject}</td>
                    <td className="p-3">
                      <Badge variant={statusVariant[entry.status] ?? "outline"} className="text-xs">
                        {statusLabel[entry.status] ?? entry.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {entry.processedAt ? formatDate(entry.processedAt) : "—"}
                    </td>
                    <td className="p-3 text-right text-xs text-muted-foreground">
                      {expandedId === entry.id ? "▲" : "▼"}
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr className="border-b bg-muted/10">
                      <td colSpan={6} className="p-4">
                        {entry.error && (
                          <p className="text-xs text-destructive mb-3 font-mono">
                            Error: {entry.error}
                          </p>
                        )}
                        <SafeEmailPreview html={entry.html} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
