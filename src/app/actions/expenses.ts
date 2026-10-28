"use server";

import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { expenses, expenseShares, memberships, settlements } from "@/db/schema";
import { isUuid, requirePeriod } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_IMPORT_ROWS = 5000;
const MAX_AMOUNT_CENTS = 100_000_000;

async function memberIdsOf(householdId: string) {
  const rows = await getDb()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.householdId, householdId));
  return rows.map((r) => r.userId);
}

/** Résout le choix "moi seul" / "tout le monde" / liste précise en ids de membres. */
function resolveParticipants(
  choice: "me" | "all" | string[],
  userId: string,
  memberIds: string[],
): string[] | null {
  if (choice === "me") return [userId];
  if (choice === "all") return memberIds;
  const ids = [...new Set(choice)];
  if (ids.length === 0 || ids.some((id) => !memberIds.includes(id))) return null;
  return ids;
}

export type ImportRow = { date: string; description: string; amountCents: number; currency: string };

/** Tolérance d'un jour autour des bornes : la date ISO est en UTC, les bornes en heure locale. */
function isNearPeriod(date: Date, period: { startDate: string; endDate: string }) {
  const day = 24 * 60 * 60 * 1000;
  return (
    date.getTime() >= new Date(`${period.startDate}T00:00:00Z`).getTime() - day &&
    date.getTime() < new Date(`${period.endDate}T00:00:00Z`).getTime() + 2 * day
  );
}

export async function importExpenses(
  householdId: string,
  periodId: string,
  rows: ImportRow[],
  participants: "me" | "all",
): Promise<ActionResult> {
  const { user, period } = await requirePeriod(householdId, periodId);
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "Aucune ligne à importer." };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: `Maximum ${MAX_IMPORT_ROWS} lignes par import.` };

  const values = [];
  for (const row of rows) {
    const date = new Date(row?.date);
    const description = typeof row?.description === "string" ? row.description.trim().slice(0, 300) : "";
    const amountCents = row?.amountCents;
    const currency = row?.currency;
    if (
      Number.isNaN(date.getTime()) ||
      !description ||
      !Number.isInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents > MAX_AMOUNT_CENTS ||
      typeof currency !== "string" ||
      !CURRENCY_RE.test(currency)
    ) {
      return { ok: false, error: "Le fichier contient une ligne invalide." };
    }
    if (!isNearPeriod(date, period)) return { ok: false, error: "Une dépense est en dehors des dates du compte." };
    const externalHash = createHash("sha256")
      .update([user.id, date.toISOString(), description, amountCents, currency].join("|"))
      .digest("hex");
    values.push({
      householdId,
      periodId,
      payerId: user.id,
      date,
      description,
      amountCents,
      currency,
      source: "revolut" as const,
      externalHash,
    });
  }

  const memberIds = await memberIdsOf(householdId);
  const shareUserIds = resolveParticipants(participants === "me" ? "me" : "all", user.id, memberIds)!;
  const db = getDb();
  let inserted = 0;
  for (let i = 0; i < values.length; i += 500) {
    const created = await db
      .insert(expenses)
      .values(values.slice(i, i + 500))
      .onConflictDoNothing()
      .returning({ id: expenses.id });
    if (created.length > 0) {
      await db
        .insert(expenseShares)
        .values(created.flatMap((e) => shareUserIds.map((userId) => ({ expenseId: e.id, userId }))));
    }
    inserted += created.length;
  }

  revalidatePath(`/h/${householdId}`, "layout");
  const duplicates = values.length - inserted;
  return {
    ok: true,
    message:
      `${inserted} dépense${inserted > 1 ? "s" : ""} importée${inserted > 1 ? "s" : ""}` +
      (duplicates > 0
        ? `, ${duplicates} déjà présente${duplicates > 1 ? "s" : ""} (dans ce compte ou un autre) ignorée${duplicates > 1 ? "s" : ""}.`
        : "."),
  };
}

/** Lit description, montant et date ("AAAA-MM-JJ") d'un formulaire de dépense. */
function readExpenseFields(
  formData: FormData,
  period: { startDate: string; endDate: string },
): { error: string } | { description: string; amountCents: number; date: Date } {
  const description = String(formData.get("description") ?? "").trim().slice(0, 300);
  const amountCents = parseAmountToCents(String(formData.get("amount") ?? ""));
  const rawDate = String(formData.get("date") ?? "");
  // Midi UTC : le jour reste le même quel que soit le fuseau de l'utilisateur.
  const date = new Date(`${rawDate}T12:00:00Z`);

  if (!description) return { error: "Ajoute une description." };
  if (amountCents === null || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
    return { error: "Montant invalide." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(date.getTime())) return { error: "Date invalide." };
  if (rawDate < period.startDate || rawDate > period.endDate) return { error: "La date doit être dans la période du compte." };
  return { description, amountCents, date };
}

export async function addManualExpense(householdId: string, periodId: string, formData: FormData): Promise<ActionResult> {
  const { user, period } = await requirePeriod(householdId, periodId);
  const fields = readExpenseFields(formData, period);
  if ("error" in fields) return { ok: false, error: fields.error };
  const { description, amountCents, date } = fields;
  const participantIds = formData.getAll("participants").map(String);

  const shareUserIds = resolveParticipants(participantIds, user.id, await memberIdsOf(householdId));
  if (!shareUserIds) return { ok: false, error: "Choisis au moins une personne concernée." };

  const db = getDb();
  const [expense] = await db
    .insert(expenses)
    .values({ householdId, periodId, payerId: user.id, date, description, amountCents, currency: "EUR", source: "manual" })
    .returning({ id: expenses.id });
  await db.insert(expenseShares).values(shareUserIds.map((userId) => ({ expenseId: expense.id, userId })));

  revalidatePath(`/h/${householdId}`, "layout");
  return { ok: true };
}

const NOT_EDITABLE = "Tu ne peux modifier que tes propres dépenses.";

/** Vérifie que toutes les dépenses appartiennent à ce compte et ont été payées par l'utilisateur. */
async function ownExpenseIds(periodId: string, userId: string, expenseIds: unknown) {
  if (!Array.isArray(expenseIds) || expenseIds.length === 0 || !expenseIds.every(isUuid)) return null;
  const ids = [...new Set(expenseIds)];
  const rows = await getDb()
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      and(
        eq(expenses.periodId, periodId),
        eq(expenses.payerId, userId),
        inArray(expenses.id, ids),
      ),
    );
  return rows.length === ids.length ? ids : null;
}

export async function updateExpense(
  householdId: string,
  periodId: string,
  expenseId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { user, period } = await requirePeriod(householdId, periodId);
  const ids = await ownExpenseIds(periodId, user.id, [expenseId]);
  if (!ids) return { ok: false, error: NOT_EDITABLE };
  const fields = readExpenseFields(formData, period);
  if ("error" in fields) return { ok: false, error: fields.error };

  await getDb().update(expenses).set(fields).where(eq(expenses.id, expenseId));
  revalidatePath(`/h/${householdId}`, "layout");
  return { ok: true };
}

export async function setExpenseParticipants(
  householdId: string,
  periodId: string,
  expenseIds: string[],
  participants: "me" | "all" | string[],
): Promise<ActionResult> {
  const { user } = await requirePeriod(householdId, periodId);
  const ids = await ownExpenseIds(periodId, user.id, expenseIds);
  if (!ids) return { ok: false, error: NOT_EDITABLE };

  const shareUserIds = resolveParticipants(participants, user.id, await memberIdsOf(householdId));
  if (!shareUserIds) return { ok: false, error: "Choisis au moins une personne concernée." };

  const db = getDb();
  await db.batch([
    db.delete(expenseShares).where(inArray(expenseShares.expenseId, ids)),
    db.insert(expenseShares).values(ids.flatMap((expenseId) => shareUserIds.map((userId) => ({ expenseId, userId })))),
  ]);

  revalidatePath(`/h/${householdId}`, "layout");
  return { ok: true };
}

export async function deleteExpenses(householdId: string, periodId: string, expenseIds: string[]): Promise<ActionResult> {
  const { user } = await requirePeriod(householdId, periodId);
  const ids = await ownExpenseIds(periodId, user.id, expenseIds);
  if (!ids) return { ok: false, error: NOT_EDITABLE };

  await getDb().delete(expenses).where(inArray(expenses.id, ids));
  revalidatePath(`/h/${householdId}`, "layout");
  return { ok: true };
}

export async function recordSettlement(
  householdId: string,
  periodId: string,
  fromUserId: string,
  toUserId: string,
  amountCents: number,
  currency: string,
): Promise<ActionResult> {
  await requirePeriod(householdId, periodId);
  const memberIds = await memberIdsOf(householdId);
  if (
    fromUserId === toUserId ||
    !memberIds.includes(fromUserId) ||
    !memberIds.includes(toUserId) ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > MAX_AMOUNT_CENTS ||
    !CURRENCY_RE.test(currency)
  ) {
    return { ok: false, error: "Remboursement invalide." };
  }
  await getDb().insert(settlements).values({ householdId, periodId, fromUserId, toUserId, amountCents, currency });
  revalidatePath(`/h/${householdId}`, "layout");
  return { ok: true };
}

export async function deleteSettlement(householdId: string, periodId: string, settlementId: string): Promise<ActionResult> {
  await requirePeriod(householdId, periodId);
  if (!isUuid(settlementId)) return { ok: false, error: "Remboursement introuvable." };
  await getDb()
    .delete(settlements)
    .where(and(eq(settlements.id, settlementId), eq(settlements.periodId, periodId)));
  revalidatePath(`/h/${householdId}`, "layout");
  return { ok: true };
}
