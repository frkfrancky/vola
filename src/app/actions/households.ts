"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { households, memberships } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import type { FormState } from "./auth";

function newInviteCode() {
  // Sans caractères ambigus (0/O, 1/I/L).
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

export async function createHousehold(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 60) return { error: "Donne un nom au compte (60 caractères max)." };

  const db = getDb();
  const [household] = await db
    .insert(households)
    .values({ name, inviteCode: newInviteCode() })
    .returning({ id: households.id });
  await db.insert(memberships).values({ householdId: household.id, userId: user.id });

  redirect(`/h/${household.id}`);
}

export async function joinHousehold(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();

  const db = getDb();
  const [household] = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.inviteCode, code));
  if (!household) return { error: "Code d'invitation inconnu." };

  await db
    .insert(memberships)
    .values({ householdId: household.id, userId: user.id })
    .onConflictDoNothing();

  redirect(`/h/${household.id}`);
}
