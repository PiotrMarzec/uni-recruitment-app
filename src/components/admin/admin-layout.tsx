"use client";

import { useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { ClipboardList, Mail, Users, LogOut } from "lucide-react";

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
  fullWidth?: boolean;
}

export function AdminLayout({ children, breadcrumbs, fullWidth }: AdminLayoutProps) {
  const t = useTranslations("admin");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/session").then((res) => {
      if (res.status === 401) {
        fetch("/api/auth/logout", { method: "POST" }).finally(() => {
          router.push("/admin/login");
        });
      }
    });
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
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
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/audit"><ClipboardList className="w-4 h-4 mr-2" />Audit Log</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/email-log"><Mail className="w-4 h-4 mr-2" />Email Log</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/admins"><Users className="w-4 h-4 mr-2" />Admins</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
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
      <main className={`${fullWidth ? "w-full" : "max-w-7xl mx-auto"} px-4 sm:px-6 lg:px-8 py-8`}>
        {children}
      </main>
    </div>
  );
}
