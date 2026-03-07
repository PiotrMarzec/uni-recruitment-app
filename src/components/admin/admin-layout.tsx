"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList, UserPlus, LogOut } from "lucide-react";

const LOCALE_LABELS: Record<string, string> = {
  en: "EN", pl: "PL", de: "DE", fr: "FR", es: "ES", it: "IT",
};

function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex gap-1">
      {routing.locales.map((loc) => (
        <button
          key={loc}
          onClick={() => router.replace(pathname, { locale: loc })}
          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
            loc === locale
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {LOCALE_LABELS[loc]}
        </button>
      ))}
    </div>
  );
}

interface AdminLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function AdminLayout({ children, breadcrumbs }: AdminLayoutProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", fullName: "" });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
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
    } finally {
      setInviteSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/10">
      {/* Top nav */}
      <header className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/admin/dashboard" className="font-semibold text-lg">
            University Recruitment
          </Link>
          <nav className="flex items-center gap-4">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/audit"><ClipboardList className="w-4 h-4 mr-2" />Audit Log</Link>
            </Button>
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
                <Button variant="ghost" size="sm"><UserPlus className="w-4 h-4 mr-2" />Invite New Admin</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite New Admin</DialogTitle>
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
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />{t("login.logout")}
            </Button>
          </nav>
        </div>
      </header>

      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="border-b bg-background/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center gap-2 text-sm">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground">/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} className="text-muted-foreground hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
