import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { expenses, expenseShares, memberships, settlements, users } from "@/db/schema";
import { AddExpenseForm } from "@/components/add-expense-form";
import { BalancePanel } from "@/components/balance-panel";
import { ExpenseList, type ExpenseItem } from "@/components/expense-list";
import { ImportCsv } from "@/components/import-csv";
import { PeriodSettings } from "@/components/period-forms";
import { addTotal, StatTiles, type Totals } from "@/components/stat-tiles";
import { requirePeriod } from "@/lib/auth";
import { computeBalances } from "@/lib/balance";
import { formatRange } from "@/lib/periods";

export default async function PeriodPage({ params }: PageProps<"/h/[id]/p/[periodId]">) {
  const { id, periodId } = await params;
  const { user, household, period } = await requirePeriod(id, periodId);
  const db = getDb();

  const [members, expenseRows, shareRows, settlementRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.householdId, id))
      .orderBy(memberships.joinedAt),
    db
      .select()
      .from(expenses)
      .where(eq(expenses.periodId, periodId))
      .orderBy(desc(expenses.date), desc(expenses.createdAt)),
    db
      .select({ expenseId: expenseShares.expenseId, userId: expenseShares.userId })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(eq(expenses.periodId, periodId)),
    db.select().from(settlements).where(eq(settlements.periodId, periodId)).orderBy(desc(settlements.createdAt)),
  ]);

  const sharesByExpense = new Map<string, string[]>();
  for (const s of shareRows) {
    const list = sharesByExpense.get(s.expenseId) ?? [];
    list.push(s.userId);
    sharesByExpense.set(s.expenseId, list);
  }

  const items: ExpenseItem[] = expenseRows.map((e) => ({
    id: e.id,
    date: e.date.toISOString(),
    description: e.description,
    amountCents: e.amountCents,
    currency: e.currency,
    payerId: e.payerId,
    source: e.source,
    shareIds: sharesByExpense.get(e.id) ?? [],
  }));

  const balances = computeBalances(
    members.map((m) => m.id),
    items,
    settlementRows,
  );
  const range = { start: period.startDate, end: period.endDate };

  const total: Totals = {};
  for (const e of items) addTotal(total, e.currency, e.amountCents);
  const shared: Totals = {};
  const myShare: Totals = {};
  const myNet: Totals = {};
  for (const b of balances) {
    addTotal(shared, b.currency, b.members.reduce((sum, m) => sum + m.paidCents, 0));
    const me = b.members.find((m) => m.userId === user.id);
    if (me) {
      addTotal(myShare, b.currency, me.shareCents);
      addTotal(myNet, b.currency, me.netCents);
    }
  }
  const net = Object.values(myNet).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/h/${id}`} className="text-sm text-muted hover:underline">
            ← {household.name}
          </Link>
          <h1 className="text-2xl font-semibold">{period.label}</h1>
          <p className="text-sm text-muted">{formatRange(period.startDate, period.endDate)}</p>
        </div>
        <PeriodSettings
          householdId={id}
          periodId={periodId}
          label={period.label}
          startDate={period.startDate}
          endDate={period.endDate}
          expenseCount={items.length}
        />
      </div>

      <StatTiles
        stats={[
          { label: "Total des dépenses", totals: total, hint: `${items.length} dépense${items.length > 1 ? "s" : ""}` },
          { label: "Dépenses partagées", totals: shared, hint: "hors dépenses perso" },
          { label: "Ma part", totals: myShare, hint: "ce que je dois payer au total" },
          {
            label: "Mon solde",
            totals: myNet,
            signed: true,
            hint: net > 0 ? "on me doit" : net < 0 ? "je dois" : "à l'équilibre",
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <ImportCsv householdId={id} periodId={periodId} range={range} />
            <AddExpenseForm
              householdId={id}
              periodId={periodId}
              range={range}
              members={members}
              currentUserId={user.id}
            />
          </div>
          <ExpenseList
            householdId={id}
            periodId={periodId}
            range={range}
            expenses={items}
            members={members}
            currentUserId={user.id}
          />
        </div>
        <BalancePanel
          householdId={id}
          periodId={periodId}
          title="Bilan du compte"
          balances={balances}
          members={members}
          currentUserId={user.id}
          settlements={settlementRows.map((s) => ({
            id: s.id,
            fromUserId: s.fromUserId,
            toUserId: s.toUserId,
            amountCents: s.amountCents,
            currency: s.currency,
            createdAt: s.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
