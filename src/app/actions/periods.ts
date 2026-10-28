"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { periods } from "@/db/schema";
import { requireMembership, requirePeriod } from "@/lib/auth";

type ActionResult = { ok: true } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readPeriodFields(label: unknown, startDate: unknown, endDate: unknown) {
  const name = typeof label === "string" ? label.trim().slice(0, 80) : "";
  if (!name) return { error: "Donne un nom au compte." };
  if (typeof startDate !== "string" || typeof endDate !== "string" || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return { error: "Dates invalides." };
  }
  if (startDate > endDate) return { error: "La date de début doit précéder la date de fin." };
  return { label: name, startDate, endDate };
}

export async function createPeriod(
  householdId: string,
  label: string,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const { user } = await requireMembership(householdId);
  const fields = readPeriodFields(label, startDate, endDate);
  if ("error" in fields) return { ok: false, error: fields.error! };

  const [period] = await getDb()
    .insert(periods)
    .values({ householdId, createdBy: user.id, ...fields })
    .returning({ id: periods.id });

  revalidatePath(`/h/${householdId}`);
  redirect(`/h/${householdId}/p/${period.id}`);
}

export async function updatePeriod(
  householdId: string,
  periodId: string,
  label: string,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  await requirePeriod(householdId, periodId);
  const fields = readPeriodFields(label, startDate, endDate);
  if ("error" in fields) return { ok: false, error: fields.error! };

  await getDb().update(periods).set(fields).where(eq(periods.id, periodId));
  revalidatePath(`/h/${householdId}`, "layout");
  return { ok: true };
}

/** Supprime le compte avec ses dépenses et ses remboursements. */
export async function deletePeriod(householdId: string, periodId: string) {
  await requirePeriod(householdId, periodId);
  await getDb()
    .delete(periods)
    .where(and(eq(periods.id, periodId), eq(periods.householdId, householdId)));
  revalidatePath(`/h/${householdId}`);
  redirect(`/h/${householdId}`);
}
