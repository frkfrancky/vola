import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { expenses, expenseShares, memberships, periods, settlements, users } from "@/db/schema";
import { CreatePeriodForm } from "@/components/period-forms";
import { InviteBox } from "@/components/invite-box";
import { addTotal, StatTiles, type Totals } from "@/components/stat-tiles";
import { requireMembership } from "@/lib/auth";
import { computeBalances } from "@/lib/balance";
import { formatMoney } from "@/lib/money";
import { formatRange } from "@/lib/periods";

export default async function HouseholdPage({ params }: PageProps<"/h/[id]">) {
  const { id } = await params;
  const { user, household } = await requireMembership(id);
  const db = getDb();

  const [members, periodRows, expenseRows, shareRows, settlementRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.householdId, id))
      .orderBy(memberships.joinedAt),
    db
      .select()
      .from(periods)
      .where(eq(periods.householdId, id))
      .orderBy(desc(periods.startDate), desc(periods.createdAt)),
    db
      .select({
        id: expenses.id,
        periodId: expenses.periodId,
        payerId: expenses.payerId,
        amountCents: expenses.amountCents,
        currency: expenses.currency,
      })
      .from(expenses)
      .where(eq(expenses.householdId, id)),
    db
      .select({ expenseId: expenseShares.expenseId, userId: expenseShares.userId })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(eq(expenses.householdId, id)),
    db.select().from(settlements).where(eq(settlements.householdId, id)),
  ]);

  const sharesByExpense = new Map<string, string[]>();
  for (const s of shareRows) {
    const list = sharesByExpense.get(s.expenseId) ?? [];
    list.push(s.userId);
    sharesByExpense.set(s.expenseId, list);
  }

  const memberIds = members.map((m) => m.id);
  const sharedAll: Totals = {};
  const paidByMe: Totals = {};
  const myNet: Totals = {};
  const remainingAll: Totals = {};
  const summaries = periodRows.map((period) => {
    const periodExpenses = expenseRows
      .filter((e) => e.periodId === period.id)
      .map((e) => ({ ...e, shareIds: sharesByExpense.get(e.id) ?? [] }));
    const balances = computeBalances(
      memberIds,
      periodExpenses,
      settlementRows.filter((s) => s.periodId === period.id),
    );
    const sharedTotal = balances.map((b) => ({
      currency: b.currency,
      cents: b.members.reduce((sum, m) => sum + m.paidCents, 0),
    }));
    const remaining = balances
      .map((b) => ({ currency: b.currency, cents: b.transfers.reduce((sum, t) => sum + t.amountCents, 0) }))
      .filter((r) => r.cents > 0);
    for (const b of balances) {
      const me = b.members.find((m) => m.userId === user.id);
      addTotal(sharedAll, b.currency, b.members.reduce((sum, m) => sum + m.paidCents, 0));
      if (me) {
        addTotal(paidByMe, b.currency, me.paidCents);
        addTotal(myNet, b.currency, me.netCents);
      }
    }
    for (const r of remaining) addTotal(remainingAll, r.currency, r.cents);
    return { ...period, count: periodExpenses.length, sharedTotal, remaining };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:underline">
            ← Mes comptes
          </Link>
          <h1 className="text-2xl font-semibold">{household.name}</h1>
          <p className="text-sm text-muted">{members.map((m) => m.name).join(" · ")}</p>
        </div>
        <InviteBox code={household.inviteCode} />
      </div>

      {summaries.length > 0 && (
        <StatTiles
          stats={[
            {
              label: "Dépenses partagées",
              totals: sharedAll,
              hint: `sur ${summaries.length} compte${summaries.length > 1 ? "s" : ""}`,
            },
            { label: "Payé par moi", totals: paidByMe, hint: "pour des dépenses partagées" },
            {
              label: "Mon solde",
              totals: myNet,
              signed: true,
              hint: Object.values(myNet).some((c) => c !== 0) ? "tous comptes confondus" : "à l'équilibre",
            },
            {
              label: "Reste à régler",
              totals: remainingAll,
              tone: Object.keys(remainingAll).length > 0 ? "danger" : "accent",
              hint: Object.keys(remainingAll).length > 0 ? "entre tous les colocs" : "tout est réglé ✓",
            },
          ]}
        />
      )}

      <CreatePeriodForm householdId={id} />

      <section className="space-y-3">
        <h2 className="font-medium">Les comptes</h2>
        {summaries.length === 0 ? (
          <p className="text-sm text-muted">
            Aucun compte pour l&apos;instant. Crée-en un pour un mois, plusieurs mois ou une semaine, puis ajoutes-y
            tes dépenses.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {summaries.map((period) => (
              <li key={period.id}>
                <Link href={`/h/${id}/p/${period.id}`} className="card block space-y-2 transition hover:border-accent">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{period.label}</div>
                      <div className="text-xs text-muted">{formatRange(period.startDate, period.endDate)}</div>
                    </div>
                    <StatusBadge count={period.count} remaining={period.remaining.length > 0} />
                  </div>
                  <div className="font-mono text-2xl font-semibold tabular-nums">
                    {period.sharedTotal.length > 0
                      ? period.sharedTotal.map((r) => formatMoney(r.cents, r.currency)).join(" + ")
                      : formatMoney(0)}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">
                      {period.count} dépense{period.count > 1 ? "s" : ""} · partagé
                    </span>
                    {period.remaining.length > 0 && (
                      <span className="font-mono text-danger">
                        {period.remaining.map((r) => formatMoney(r.cents, r.currency)).join(" + ")} à régler
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ count, remaining }: { count: number; remaining: boolean }) {
  if (count === 0) return <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">Vide</span>;
  if (remaining)
    return <span className="rounded-full border border-danger px-2 py-0.5 text-xs text-danger">À régler</span>;
  return <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">Réglé ✓</span>;
}
