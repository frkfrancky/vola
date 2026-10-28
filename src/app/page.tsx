import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { households, memberships, users } from "@/db/schema";
import { CreateHouseholdForm, JoinHouseholdForm } from "@/components/household-forms";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <Landing />;

  const db = getDb();
  const mine = await db
    .select({ id: households.id, name: households.name })
    .from(households)
    .innerJoin(memberships, eq(memberships.householdId, households.id))
    .where(eq(memberships.userId, user.id))
    .orderBy(households.createdAt);

  const members =
    mine.length > 0
      ? await db
          .select({ householdId: memberships.householdId, name: users.name })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            inArray(
              memberships.householdId,
              mine.map((h) => h.id),
            ),
          )
      : [];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Mes comptes</h1>
        {mine.length === 0 ? (
          <p className="text-muted">Tu ne fais encore partie d&apos;aucun compte. Crée-en un ou rejoins celui de tes colocs.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {mine.map((h) => (
              <li key={h.id}>
                <Link href={`/h/${h.id}`} className="card block transition hover:border-accent">
                  <div className="font-medium">{h.name}</div>
                  <div className="mt-1 text-sm text-muted">
                    {members
                      .filter((m) => m.householdId === h.id)
                      .map((m) => m.name)
                      .join(", ")}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <CreateHouseholdForm />
        <JoinHouseholdForm />
      </section>
    </div>
  );
}

function Landing() {
  return (
    <div className="mx-auto max-w-2xl py-12 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Les comptes de la coloc, sans prise de tête.</h1>
      <p className="mt-4 text-lg text-muted">
        Importe ton relevé Revolut, indique ce qui est perso ou partagé, et Vola calcule qui doit combien à qui.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/register" className="btn-primary">
          Créer un compte
        </Link>
        <Link href="/login" className="btn-ghost">
          Se connecter
        </Link>
      </div>
    </div>
  );
}
