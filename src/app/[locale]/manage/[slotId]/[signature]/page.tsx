"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TeacherData {
  slot: { id: string; number: number; status: string };
  registration: {
    id: string;
    fullName: string | null;
    enrollmentId: string | null;
    level: string | null;
    spokenLanguages: string[];
    destinationPreferences: string[];
    averageResult: string | null;
    additionalActivities: number | null;
    recommendationLetters: number | null;
  } | null;
  student: { fullName: string; email: string } | null;
}

export default function TeacherManagePage() {
  const params = useParams();
  const slotId = params.slotId as string;
  const signature = params.signature as string;

  const [data, setData] = useState<TeacherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [averageResult, setAverageResult] = useState("");
  const [additionalActivities, setAdditionalActivities] = useState("");
  const [recommendationLetters, setRecommendationLetters] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch(`/api/teacher/${slotId}/${signature}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to load");
          return;
        }
        const d: TeacherData = await res.json();
        setData(d);
        if (d.registration) {
          setAverageResult(d.registration.averageResult ?? "");
          setAdditionalActivities(d.registration.additionalActivities != null ? String(d.registration.additionalActivities) : "");
          setRecommendationLetters(d.registration.recommendationLetters != null ? String(d.registration.recommendationLetters) : "");
        }
      })
      .finally(() => setLoading(false));
  }, [slotId, signature]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaved(false);
    setSaving(true);
    try {
      const body: Record<string, number | null> = {};
      if (averageResult !== "") body.averageResult = parseFloat(averageResult);
      if (additionalActivities !== "") body.additionalActivities = parseInt(additionalActivities, 10);
      if (recommendationLetters !== "") body.recommendationLetters = parseInt(recommendationLetters, 10);

      const res = await fetch(`/api/teacher/${slotId}/${signature}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        setSaveError(result.error || "Failed to save");
      } else {
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  if (data.slot.status !== "registered" || !data.registration) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="font-medium">No completed registration for this slot.</p>
            <p className="text-muted-foreground text-sm mt-1">Slot #{data.slot.number} — status: {data.slot.status}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const reg = data.registration;

  return (
    <div className="min-h-screen bg-muted/10 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Teacher Management</h1>
          <p className="text-muted-foreground text-sm">Slot #{data.slot.number}</p>
        </div>

        {/* Student info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{data.student?.fullName || reg.fullName || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{data.student?.email || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Enrollment ID</span>
              <span>{reg.enrollmentId || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Level</span>
              <span className="capitalize">{reg.level || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Languages</span>
              <span>{reg.spokenLanguages?.join(", ") || "—"}</span>
            </div>
            {reg.destinationPreferences?.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1">Destination preferences</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  {reg.destinationPreferences.map((name) => (
                    <li key={name} className="text-xs text-muted-foreground">{name}</li>
                  ))}
                </ol>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scores form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <Label>Average Result <span className="text-muted-foreground font-normal">(0–6)</span></Label>
                <Input
                  type="number"
                  min="0"
                  max="6"
                  step="0.01"
                  placeholder="e.g. 4.5"
                  value={averageResult}
                  onChange={(e) => setAverageResult(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Additional Activities <span className="text-muted-foreground font-normal">(0–4)</span></Label>
                <Input
                  type="number"
                  min="0"
                  max="4"
                  step="1"
                  placeholder="e.g. 2"
                  value={additionalActivities}
                  onChange={(e) => setAdditionalActivities(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Recommendation Letters <span className="text-muted-foreground font-normal">(0–10)</span></Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  placeholder="e.g. 1"
                  value={recommendationLetters}
                  onChange={(e) => setRecommendationLetters(e.target.value)}
                />
              </div>

              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
              {saved && <p className="text-sm text-green-600">Scores saved successfully.</p>}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving..." : "Save Scores"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
