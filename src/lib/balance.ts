export type BalanceExpense = {
  payerId: string;
  amountCents: number;
  currency: string;
  shareIds: string[];
};

export type BalanceSettlement = {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  currency: string;
};

export type MemberBalance = {
  userId: string;
  /** Total payé pour des dépenses partagées avec d'autres. */
  paidCents: number;
  /** Part de ces dépenses qui revient à ce membre. */
  shareCents: number;
  sentCents: number;
  receivedCents: number;
  /** > 0 : on lui doit de l'argent ; < 0 : il doit de l'argent. */
  netCents: number;
};

export type Transfer = { fromUserId: string; toUserId: string; amountCents: number };

export type CurrencyBalance = { currency: string; members: MemberBalance[]; transfers: Transfer[] };

/** Divise un montant en parts entières dont la somme est exactement le montant. */
function splitEvenly(amountCents: number, userIds: string[]): Map<string, number> {
  const sorted = [...userIds].sort();
  const base = Math.floor(amountCents / sorted.length);
  let remainder = amountCents - base * sorted.length;
  const parts = new Map<string, number>();
  for (const id of sorted) {
    parts.set(id, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return parts;
}

function emptyBalance(userId: string): MemberBalance {
  return { userId, paidCents: 0, shareCents: 0, sentCents: 0, receivedCents: 0, netCents: 0 };
}

export function computeBalances(
  memberIds: string[],
  expenses: BalanceExpense[],
  settlements: BalanceSettlement[],
): CurrencyBalance[] {
  const byCurrency = new Map<string, Map<string, MemberBalance>>();
  const entry = (currency: string, userId: string) => {
    let members = byCurrency.get(currency);
    if (!members) {
      members = new Map(memberIds.map((id) => [id, emptyBalance(id)]));
      byCurrency.set(currency, members);
    }
    let m = members.get(userId);
    if (!m) {
      m = emptyBalance(userId);
      members.set(userId, m);
    }
    return m;
  };

  for (const e of expenses) {
    if (e.shareIds.length === 0) continue;
    // Une dépense "moi seul" n'a aucun effet sur les comptes.
    if (e.shareIds.length === 1 && e.shareIds[0] === e.payerId) continue;
    entry(e.currency, e.payerId).paidCents += e.amountCents;
    for (const [userId, part] of splitEvenly(e.amountCents, e.shareIds)) {
      entry(e.currency, userId).shareCents += part;
    }
  }
  for (const s of settlements) {
    entry(s.currency, s.fromUserId).sentCents += s.amountCents;
    entry(s.currency, s.toUserId).receivedCents += s.amountCents;
  }

  const result: CurrencyBalance[] = [];
  for (const [currency, members] of byCurrency) {
    const list = [...members.values()];
    for (const m of list) m.netCents = m.paidCents - m.shareCents + m.sentCents - m.receivedCents;
    result.push({ currency, members: list, transfers: minimizeTransfers(list) });
  }
  return result.sort((a, b) =>
    a.currency === "EUR" ? -1 : b.currency === "EUR" ? 1 : a.currency.localeCompare(b.currency),
  );
}

/** Propose un nombre réduit de virements pour remettre tous les soldes à zéro. */
function minimizeTransfers(members: MemberBalance[]): Transfer[] {
  const debtors = members
    .filter((m) => m.netCents < 0)
    .map((m) => ({ id: m.userId, left: -m.netCents }))
    .sort((a, b) => b.left - a.left);
  const creditors = members
    .filter((m) => m.netCents > 0)
    .map((m) => ({ id: m.userId, left: m.netCents }))
    .sort((a, b) => b.left - a.left);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount > 0) transfers.push({ fromUserId: debtors[i].id, toUserId: creditors[j].id, amountCents: amount });
    debtors[i].left -= amount;
    creditors[j].left -= amount;
    if (debtors[i].left === 0) i++;
    if (creditors[j].left === 0) j++;
  }
  return transfers;
}
