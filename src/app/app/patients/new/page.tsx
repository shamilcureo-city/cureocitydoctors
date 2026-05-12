"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createPatientAction, type NewPatientState } from "./actions";

export default function NewPatientPage() {
  const [state, formAction, isPending] = useActionState<NewPatientState, FormData>(
    createPatientAction,
    null,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Add a patient</CardTitle>
          <CardDescription>
            Capture identifying details. You can edit them later. After saving you&apos;ll go
            straight into a consult.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mrn">MRN (optional)</Label>
              <Input id="mrn" name="mrn" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sex">Sex</Label>
              <Select id="sex" name="sex" defaultValue="unspecified">
                <option value="unspecified">Unspecified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date_of_birth">Date of birth</Label>
              <Input id="date_of_birth" name="date_of_birth" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="preferred_language">Preferred language</Label>
              <Input
                id="preferred_language"
                name="preferred_language"
                placeholder="e.g. English, Hindi, Arabic"
              />
            </div>

            {state?.error ? (
              <p className="sm:col-span-2 text-sm text-red-600" role="alert">
                {state.error}
              </p>
            ) : null}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save and start consult"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
