"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Prescription, PrescriptionItem, SoapNote } from "@/lib/db/types";

type Props = {
  consultId: string;
  status: "draft" | "recording" | "transcribing" | "review" | "finalized" | "cancelled";
  transcript: string | null;
  initialSoap: SoapNote | null;
  initialPrescription: Prescription | null;
  initialDoctorNotes: string | null;
  warnings: string[];
  finalized: boolean;
};

const EMPTY_RX_ITEM: PrescriptionItem = {
  drug: "",
  strength: "",
  dose: "",
  route: "",
  frequency: "",
  duration: "",
  instructions: "",
};

export function NoteEditor({
  consultId,
  status,
  transcript,
  initialSoap,
  initialPrescription,
  initialDoctorNotes,
  warnings,
  finalized,
}: Props) {
  const router = useRouter();
  const [soap, setSoap] = useState<SoapNote>(
    initialSoap ?? { subjective: "", objective: "", assessment: "", plan: "" },
  );
  const [rxItems, setRxItems] = useState<PrescriptionItem[]>(initialPrescription?.items ?? []);
  const [advice, setAdvice] = useState(initialPrescription?.advice ?? "");
  const [followUp, setFollowUp] = useState(initialPrescription?.follow_up ?? "");
  const [doctorNotes, setDoctorNotes] = useState(initialDoctorNotes ?? "");
  const [showTranscript, setShowTranscript] = useState(false);
  const [busy, setBusy] = useState<"save" | "finalize" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function persist(finalize: boolean) {
    setBusy(finalize ? "finalize" : "save");
    setError(null);
    try {
      const res = await fetch(`/api/consult/${consultId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          soap,
          prescription: { items: rxItems, advice, follow_up: followUp },
          doctor_notes: doctorNotes,
          finalize,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to save");
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function updateItem(idx: number, patch: Partial<PrescriptionItem>) {
    setRxItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setRxItems((items) => items.filter((_, i) => i !== idx));
  }

  function addItem() {
    setRxItems((items) => [...items, { ...EMPTY_RX_ITEM }]);
  }

  const readOnly = finalized;

  return (
    <div className="space-y-6">
      {warnings.length > 0 ? (
        <Card>
          <CardContent className="border-l-4 border-amber-400 bg-amber-50">
            <p className="mb-1 text-sm font-semibold text-amber-900">Scribe warnings</p>
            <ul className="list-inside list-disc text-sm text-amber-900">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Transcript</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowTranscript((v) => !v)}
            >
              {showTranscript ? "Hide" : "Show"}
            </Button>
          </div>
        </CardHeader>
        {showTranscript ? (
          <CardContent>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-sm text-slate-700">
              {transcript || (status === "transcribing" ? "Transcription in progress…" : "No transcript available.")}
            </pre>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SOAP note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["subjective", "objective", "assessment", "plan"] as const).map((key) => (
            <div key={key} className="space-y-1.5">
              <Label className="capitalize" htmlFor={`soap-${key}`}>
                {key}
              </Label>
              <Textarea
                id={`soap-${key}`}
                value={soap[key] ?? ""}
                onChange={(e) => setSoap({ ...soap, [key]: e.target.value })}
                readOnly={readOnly}
                className={readOnly ? "bg-slate-50" : ""}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prescription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rxItems.length === 0 ? (
            <p className="text-sm text-slate-500">No medications drafted.</p>
          ) : (
            rxItems.map((item, idx) => (
              <div
                key={idx}
                className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-6"
              >
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs" htmlFor={`drug-${idx}`}>
                    Drug
                  </Label>
                  <Input
                    id={`drug-${idx}`}
                    value={item.drug}
                    onChange={(e) => updateItem(idx, { drug: e.target.value })}
                    readOnly={readOnly}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Strength</Label>
                  <Input
                    value={item.strength ?? ""}
                    onChange={(e) => updateItem(idx, { strength: e.target.value })}
                    readOnly={readOnly}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Frequency</Label>
                  <Input
                    value={item.frequency ?? ""}
                    onChange={(e) => updateItem(idx, { frequency: e.target.value })}
                    readOnly={readOnly}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Duration</Label>
                  <Input
                    value={item.duration ?? ""}
                    onChange={(e) => updateItem(idx, { duration: e.target.value })}
                    readOnly={readOnly}
                  />
                </div>
                <div className="flex items-end justify-end">
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(idx)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="space-y-1 sm:col-span-6">
                  <Label className="text-xs">Instructions</Label>
                  <Input
                    value={item.instructions ?? ""}
                    onChange={(e) => updateItem(idx, { instructions: e.target.value })}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            ))
          )}
          {!readOnly ? (
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              Add medication
            </Button>
          ) : null}

          <div className="space-y-1.5 pt-2">
            <Label htmlFor="advice">Advice</Label>
            <Textarea
              id="advice"
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
              readOnly={readOnly}
              className={readOnly ? "bg-slate-50" : ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="follow_up">Follow-up</Label>
            <Input
              id="follow_up"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doctor&apos;s private notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={doctorNotes}
            onChange={(e) => setDoctorNotes(e.target.value)}
            placeholder="Notes not shared with the patient prescription."
            readOnly={readOnly}
            className={readOnly ? "bg-slate-50" : ""}
          />
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {finalized ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <Badge tone="success">Finalized</Badge>
          <span>This consultation is read-only.</span>
        </div>
      ) : (
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => persist(false)}
            disabled={busy !== null}
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </Button>
          <Button
            type="button"
            onClick={() => persist(true)}
            disabled={busy !== null}
          >
            {busy === "finalize" ? "Finalizing…" : "Finalize"}
          </Button>
        </div>
      )}
    </div>
  );
}
