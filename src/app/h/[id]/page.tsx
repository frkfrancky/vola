import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses, expenseShares, memberships, settlements, users } from "@/db/schema";
import { AddExpenseForm } from "@/components/add-expense-form";
import { BalancePanel } from "@/components/balance-panel";
import { ExpenseList, type ExpenseItem } from "@/components/expense-list";
import { ImportCsv } from "@/components/import-csv";
import { InviteBox } from "@/components/invite-box";
import { requireMembership } from "@/lib/auth";
import { computeBalances } from "@/lib/balance";

export default async function HouseholdPage({ params }: PageProps<"/h/[id]">) {
  const { id } = await params;
  const { user, household } = await requireMembership(id);
  const db = getDb();

  const [members, expenseRows, shareRows, settlementRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.householdId, id))
      .orderBy(memberships.joinedAt),
    db.select().from(expenses).where(eq(expenses.householdId, id)).orderBy(desc(expenses.date), desc(expenses.createdAt)),
    db
      .select({ expenseId: expenseShares.expenseId, userId: expenseShares.userId })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(eq(expenses.householdId, id)),
    db.select().from(settlements).where(eq(settlements.householdId, id)).orderBy(desc(settlements.createdAt)),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{household.name}</h1>
          <p className="text-sm text-muted">{members.map((m) => m.name).join(" · ")}</p>
        </div>
        <InviteBox code={household.inviteCode} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6 min-w-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <ImportCsv householdId={id} />
            <AddExpenseForm householdId={id} members={members} currentUserId={user.id} />
          </div>
          <ExpenseList householdId={id} expenses={items} members={members} currentUserId={user.id} />
        </div>
        <BalancePanel
          householdId={id}
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
