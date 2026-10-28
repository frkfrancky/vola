"use client";

import { useState, useTransition } from "react";
import { deleteSettlement, recordSettlement } from "@/app/actions/expenses";
import type { CurrencyBalance } from "@/lib/balance";
import { formatMoney } from "@/lib/money";

type Member = { id: string; name: string };
type Settlement = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  currency: string;
  createdAt: string;
};

export function BalancePanel({
  householdId,
  balances,
  members,
  settlements,
  currentUserId,
}: {
  householdId: string;
  balances: CurrencyBalance[];
  members: Member[];
  settlements: Settlement[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string) => (id === currentUserId ? "Moi" : (members.find((m) => m.id === id)?.name ?? "Ancien membre"));

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Une erreur est survenue.");
    });
  }

  const hasActivity = balances.some((b) => b.members.some((m) => m.paidCents > 0 || m.sentCents > 0));

  return (
    <aside className="space-y-6">
      <section className="card space-y-5">
        <h2 className="font-medium">Bilan des comptes</h2>
        {!hasActivity && <p className="text-sm text-muted">Rien à régler pour l&apos;instant.</p>}

        {hasActivity &&
          balances.map((b) => (
            <div key={b.currency} className="space-y-4">
              {balances.length > 1 && <h3 className="text-xs font-semibold uppercase text-muted">{b.currency}</h3>}
              <ul className="space-y-2 text-sm">
                {b.members.map((m) => (
                  <li key={m.userId} className="flex items-baseline justify-between gap-2">
                    <span>
                      {nameOf(m.userId)}
                      <span className="ml-2 text-xs text-muted">
                        a payé {formatMoney(m.paidCents, b.currency)} · sa part {formatMoney(m.shareCents, b.currency)}
                      </span>
                    </span>
                    <span
                      className={`font-mono font-medium ${
                        m.netCents > 0 ? "text-accent" : m.netCents < 0 ? "text-danger" : "text-muted"
                      }`}
                    >
                      {m.netCents > 0 ? "+" : ""}
                      {formatMoney(m.netCents, b.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Pour tout régler</h3>
                {b.transfers.length === 0 ? (
                  <p className="text-sm text-accent">Tout est à l&apos;équilibre ✓</p>
                ) : (
                  <ul className="space-y-2">
                    {b.transfers.map((t) => (
                      <li
                        key={`${t.fromUserId}-${t.toUserId}`}
                        className={`rounded-lg border p-3 text-sm ${
                          t.fromUserId === currentUserId || t.toUserId === currentUserId
                            ? "border-accent bg-accent-soft"
                            : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            <strong>{nameOf(t.fromUserId)}</strong> → <strong>{nameOf(t.toUserId)}</strong>
                          </span>
                          <span className="font-mono font-semibold">{formatMoney(t.amountCents, b.currency)}</span>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          className="mt-2 text-xs text-accent underline disabled:opacity-50"
                          onClick={() =>
                            run(() =>
                              recordSettlement(householdId, t.fromUserId, t.toUserId, t.amountCents, b.currency),
                            )
                          }
                        >
                          Marquer comme remboursé
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        {error && <p className="text-sm text-danger">{error}</p>}
      </section>

      {settlements.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-medium">Remboursements effectués</h2>
          <ul className="space-y-2 text-sm">
            {settlements.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span>
                  {nameOf(s.fromUserId)} → {nameOf(s.toUserId)}
                  <span className="ml-2 text-xs text-muted">{new Date(s.createdAt).toLocaleDateString("fr-FR")}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono">{formatMoney(s.amountCents, s.currency)}</span>
                  <button
                    type="button"
                    aria-label="Annuler ce remboursement"
                    title="Annuler ce remboursement"
                    disabled={pending}
                    className="text-muted hover:text-danger"
                    onClick={() => {
                      if (confirm("Annuler ce remboursement ?")) run(() => deleteSettlement(householdId, s.id));
                    }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
