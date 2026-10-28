import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { households, memberships, periods, users } from "@/db/schema";
import { getSession } from "./session";

export type CurrentUser = { id: string; name: string; email: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session || !isUuid(session.userId)) return null;
  const [user] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, passwordChangedAt: users.passwordChangedAt })
    .from(users)
    .where(eq(users.id, session.userId));
  if (!user) return null;
  // Un changement de mot de passe déconnecte les autres appareils.
  if (user.passwordChangedAt && session.issuedAt < Math.floor(user.passwordChangedAt.getTime() / 1000)) return null;
  return { id: user.id, name: user.name, email: user.email };
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
    .select({
      id: households.id,
      name: households.name,
      inviteCode: households.inviteCode,
    })
    .from(households)
    .innerJoin(memberships, eq(memberships.householdId, households.id))
    .where(and(eq(households.id, householdId), eq(memberships.userId, user.id)));
  if (!row) notFound();
  return { user, household: row };
}

/** Vérifie que l'utilisateur fait partie du compte partagé et que la période en fait partie. */
export async function requirePeriod(householdId: unknown, periodId: unknown) {
  const membership = await requireMembership(householdId);
  if (!isUuid(periodId)) notFound();
  const [period] = await getDb()
    .select()
    .from(periods)
    .where(and(eq(periods.id, periodId), eq(periods.householdId, membership.household.id)));
  if (!period) notFound();
  return { ...membership, period };
}
