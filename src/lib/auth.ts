import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { households, memberships, users } from "@/db/schema";
import { getSessionUserId } from "./session";

export type CurrentUser = { id: string; name: string; email: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await getSessionUserId();
  if (!isUuid(userId)) return null;
  const [user] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return user ?? null;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Vérifie que l'utilisateur connecté fait partie du compte ; sinon 404. */
export async function requireMembership(householdId: unknown) {
  const user = await requireUser();
  if (!isUuid(householdId)) notFound();
  const [row] = await getDb()
    .select({ id: households.id, name: households.name, inviteCode: households.inviteCode })
    .from(households)
    .innerJoin(memberships, eq(memberships.householdId, households.id))
    .where(and(eq(households.id, householdId), eq(memberships.userId, user.id)));
  if (!row) notFound();
  return { user, household: row };
}
