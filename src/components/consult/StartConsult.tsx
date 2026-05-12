"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Recorder } from "./Recorder";

type PatientOption = {
  id: string;
  full_name: string;
  preferred_language: string | null;
};

type Props = {
  patients: PatientOption[];
  preselectedPatientId?: string;
  consentText: string;
};

export function StartConsult({ patients, preselectedPatientId, consentText }: Props) {
  const router = useRouter();
  const [patientId, setPatientId] = useState(preselectedPatientId ?? patients[0]?.id ?? "");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [consented, setConsented] = useState(false);
  const [audio, setAudio] = useState<{ blob: Blob; duration: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRecord = Boolean(patientId) && consented;
  const canSubmit = Boolean(patientId) && consented && Boolean(audio) && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!audio || !patientId) return;

    setSubmitting(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("patient_id", patientId);
      fd.append("chief_complaint", chiefComplaint);
      fd.append("consent_text", consentText);
      fd.append("consent_agreed", "true");
      fd.append("duration_seconds", String(audio.duration));
      fd.append("audio", audio.blob, "consult.webm");

      const res = await fetch("/api/consult", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed: ${res.status}`);
      }
      const body = (await res.json()) as { consultId: string };
      router.push(`/app/consult/${body.consultId}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (patients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Add a patient first</CardTitle>
          <CardDescription>
            You need at least one patient on file before starting a consult.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push("/app/patients/new")}>Add patient</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Patient</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="patient">Select patient</Label>
            <Select
              id="patient"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              required
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.preferred_language ? ` · ${p.preferred_language}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc">Chief complaint (optional)</Label>
            <Input
              id="cc"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="e.g. fever and cough for 3 days"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient consent</CardTitle>
          <CardDescription>
            Read this aloud or hand the screen to the patient before tapping Start.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea readOnly value={consentText} className="min-h-32 bg-slate-50" />
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>The patient has read this consent and verbally agreed.</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recording</CardTitle>
          <CardDescription>
            Place the device between you and the patient. Stop when the consultation ends.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Recorder
            disabled={!canRecord}
            onRecorded={(blob, duration) => setAudio({ blob, duration })}
          />
          {!consented ? (
            <p className="text-xs text-slate-500">
              Capture consent above before you can start the recording.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? "Transcribing… this may take up to a minute" : "Transcribe & draft note"}
        </Button>
      </div>
    </form>
  );
}
