"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type Step = "email" | "code";

export default function AdminLoginPage() {
  const t = useTranslations("admin.login");
  const router = useRouter();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("adminLoginEmail");
    if (saved) setEmail(saved);
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "admin" }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("invalidEmail"));
        return;
      }

      localStorage.setItem("adminLoginEmail", email);
      setStep("code");
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, role: "admin" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("invalidCode"));
        setLoading(false);
        return;
      }

      if (!data.isAdmin) {
        setError(t("notAdmin"));
        setLoading(false);
        return;
      }

      router.push("/admin/dashboard");
    } catch {
      setError(t("errorGeneric"));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
      <div className="flex items-center gap-3 mb-6">
          <img src="/favicon.svg" alt="Regie" width={48} height={48} />
          <span className="text-3xl font-bold">Regie</span>
        </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" ? (
            <form onSubmit={sendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "..." : t("sendCode")}
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("codeSent")}
              </p>
              <div className="space-y-2">
                <Label htmlFor="code">{t("codeLabel")}</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder={t("codePlaceholder")}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : t("verify")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep("email")}
              >
                ← {t("emailLabel")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
