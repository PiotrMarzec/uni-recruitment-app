"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, UserX } from "lucide-react";

interface AdminAccount {
  userId: string;
  fullName: string;
  email: string;
  status: "invited" | "active" | "disabled";
}

const STATUS_BADGE: Record<AdminAccount["status"], { label: string; className: string }> = {
  invited: { label: "Invited", className: "bg-amber-100 text-amber-800 border-amber-300" },
  active: { label: "Active", className: "bg-green-100 text-green-800 border-green-300" },
  disabled: { label: "Disabled", className: "bg-gray-100 text-gray-500 border-gray-300" },
};

export default function AdminsPage() {
  const tc = useTranslations("common");

  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabling, setDisabling] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", fullName: "" });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/admins");
      if (res.ok) setAdmins(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  async function disableAdmin(userId: string) {
    setDisabling(userId);
    try {
      await fetch(`/api/admin/admins/${userId}`, { method: "PATCH" });
      await fetchAdmins();
    } finally {
      setDisabling(null);
    }
  }

  async function inviteAdmin(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess(false);
    setInviteSaving(true);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      if (!res.ok) {
        const data = await res.json();
        setInviteError(data.error || "Failed to invite admin");
        return;
      }
      setInviteSuccess(true);
      setInviteForm({ email: "", fullName: "" });
      await fetchAdmins();
    } finally {
      setInviteSaving(false);
    }
  }

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Admins" },
      ]}
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Accounts</h1>
        <Dialog
          open={inviteOpen}
          onOpenChange={(open) => {
            setInviteOpen(open);
            if (!open) {
              setInviteError("");
              setInviteSuccess(false);
              setInviteForm({ email: "", fullName: "" });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700 text-white">
              <Plus className="w-4 h-4 mr-2" />Add New Admin
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Admin</DialogTitle>
            </DialogHeader>
            {inviteSuccess ? (
              <div className="py-4 text-center space-y-4">
                <p className="text-sm text-green-600">Invitation sent successfully.</p>
                <Button onClick={() => setInviteOpen(false)}>Close</Button>
              </div>
            ) : (
              <form onSubmit={inviteAdmin} className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={inviteForm.fullName}
                    onChange={(e) => setInviteForm((f) => ({ ...f, fullName: e.target.value }))}
                    placeholder="Jane Smith"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="jane@example.com"
                    required
                  />
                </div>
                {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                    {tc("cancel")}
                  </Button>
                  <Button type="submit" disabled={inviteSaving}>
                    {inviteSaving ? tc("loading") : "Send Invite"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{tc("loading")}</p>
      ) : admins.length === 0 ? (
        <p className="text-muted-foreground">No admin accounts found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Full Name</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => {
                const badge = STATUS_BADGE[admin.status];
                return (
                  <tr key={admin.userId} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="p-3 font-medium">{admin.fullName}</td>
                    <td className="p-3 text-muted-foreground">{admin.email}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-xs ${badge.className}`}>
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      {admin.status !== "disabled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                          disabled={disabling === admin.userId}
                          onClick={() => disableAdmin(admin.userId)}
                        >
                          <UserX className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
