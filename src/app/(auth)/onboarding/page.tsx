"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClinicAction, type OnboardingState } from "./actions";

const REGIONS = [
  { code: "IN", label: "India" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "QA", label: "Qatar" },
  { code: "KW", label: "Kuwait" },
  { code: "BH", label: "Bahrain" },
  { code: "OM", label: "Oman" },
];

export default function OnboardingPage() {
  const [state, formAction, isPending] = useActionState<OnboardingState, FormData>(
    createClinicAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your clinic</CardTitle>
        <CardDescription>
          You can invite more clinicians from the clinic settings later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Clinic name</Label>
            <Input id="name" name="name" required placeholder="e.g. Sunrise Family Clinic" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="region">Region</Label>
            <Select id="region" name="region" defaultValue="IN">
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500">
              Drives prescription conventions, units, and language defaults.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City (optional)</Label>
            <Input id="city" name="city" placeholder="e.g. Bengaluru, Dubai" />
          </div>

          {state?.error ? (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating…" : "Create clinic"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
