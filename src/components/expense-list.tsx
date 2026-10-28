"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { deleteExpenses, setExpenseParticipants, updateExpense } from "@/app/actions/expenses";
import { formatMoney } from "@/lib/money";
import { toDateInput } from "@/lib/periods";

type Member = { id: string; name: string };

export type ExpenseItem = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  currency: string;
  payerId: string;
  source: "revolut" | "manual";
  shareIds: string[];
};

type Filter = "all" | "mine" | "shared" | "personal";
type Update = { ids: string[]; shareIds?: string[]; deleted?: true };

const PAGE_SIZE = 100;

export function ExpenseList({
  householdId,
  periodId,
  range,
  expenses,
  members,
  currentUserId,
}: {
  householdId: string;
  periodId: string;
  range: { start: string; end: string };
  expenses: ExpenseItem[];
  members: Member[];
  currentUserId: string;
}) {
  const [items, applyUpdate] = useOptimistic(expenses, (state, update: Update) =>
    update.deleted
      ? state.filter((e) => !update.ids.includes(e.id))
      : state.map((e) => (update.ids.includes(e.id) ? { ...e, shareIds: update.shareIds! } : e)),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customIds, setCustomIds] = useState<string[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const memberIds = members.map((m) => m.id);
  const nameOf = (id: string) => (id === currentUserId ? "Moi" : (members.find((m) => m.id === id)?.name ?? "Ancien membre"));
  const isPersonal = (e: ExpenseItem) => e.shareIds.length === 1 && e.shareIds[0] === e.payerId;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (q && !e.description.toLowerCase().includes(q)) return false;
      if (filter === "mine") return e.payerId === currentUserId;
      if (filter === "shared") return !isPersonal(e);
      if (filter === "personal") return isPersonal(e);
      return true;
    });
  }, [items, filter, search, currentUserId]);

  const shown = visible.slice(0, limit);
  const selectable = shown.filter((e) => e.payerId === currentUserId);
  const allSelected = selectable.length > 0 && selectable.every((e) => selected.has(e.id));

  function run(update: Update, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      applyUpdate(update);
      const result = await action();
      if (!result.ok) setError(result.error ?? "Une erreur est survenue.");
    });
  }

  function setParticipants(ids: string[], participants: "me" | "all" | string[]) {
    const shareIds = participants === "me" ? [currentUserId] : participants === "all" ? memberIds : participants;
    if (shareIds.length === 0) return;
    run({ ids, shareIds }, () => setExpenseParticipants(householdId, periodId, ids, participants));
  }

  function toggleMember(e: ExpenseItem, userId: string) {
    const next = e.shareIds.includes(userId) ? e.shareIds.filter((id) => id !== userId) : [...e.shareIds, userId];
    if (next.length > 0) setParticipants([e.id], next);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulk(participants: "me" | "all" | string[]) {
    setParticipants([...selected], participants);
    setSelected(new Set());
    setCustomIds(null);
  }

  function deleteSelected() {
    const ids = [...selected];
    if (!confirm(`Supprimer ${ids.length} dépense${ids.length > 1 ? "s" : ""} ?`)) return;
    run({ ids, deleted: true }, () => deleteExpenses(householdId, periodId, ids));
    setSelected(new Set());
  }

  const filters: [Filter, string][] = [
    ["all", "Toutes"],
    ["mine", "Mes dépenses"],
    ["shared", "Partagées"],
    ["personal", "Perso"],
  ];

  return (
    <section className="card space-y-4 p-0">
      <div className="flex flex-wrap items-center gap-2 px-5 pt-5">
        <h2 className="mr-auto font-medium">Dépenses</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className="input w-40 py-1.5"
        />
        <div className="flex rounded-lg border border-border p-0.5 text-sm">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-md px-2.5 py-1 ${filter === value ? "bg-accent-soft font-medium text-accent" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mx-5 space-y-2 rounded-lg border border-accent bg-accent-soft p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 font-medium">
              {selected.size} sélectionnée{selected.size > 1 ? "s" : ""} — concerne :
            </span>
            <button type="button" className="btn-ghost bg-card py-1" onClick={() => applyBulk("me")}>
              Moi seul
            </button>
            <button type="button" className="btn-ghost bg-card py-1" onClick={() => applyBulk("all")}>
              Toute la coloc
            </button>
            <button
              type="button"
              className="btn-ghost bg-card py-1"
              onClick={() => setCustomIds(customIds ? null : [currentUserId])}
            >
              Certaines personnes…
            </button>
            <span className="ml-auto flex gap-2">
              <button type="button" className="btn-danger bg-card py-1" onClick={deleteSelected}>
                Supprimer
              </button>
              <button type="button" className="btn-ghost bg-card py-1" onClick={() => setSelected(new Set())}>
                Annuler
              </button>
            </span>
          </div>
          {customIds && (
            <div className="flex flex-wrap items-center gap-3">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={customIds.includes(m.id)}
                    onChange={() =>
                      setCustomIds((ids) => (ids!.includes(m.id) ? ids!.filter((x) => x !== m.id) : [...ids!, m.id]))
                    }
                  />
                  {nameOf(m.id)}
                </label>
              ))}
              <button
                type="button"
                className="btn-primary py-1"
                disabled={customIds.length === 0}
                onClick={() => applyBulk(customIds)}
              >
                Appliquer
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="px-5 text-sm text-danger">{error}</p>}

      {visible.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">
          {items.length === 0 ? "Aucune dépense dans ce compte. Importe un relevé Revolut ou ajoute une dépense." : "Aucun résultat."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 py-2 pl-5">
                  <input
                    type="checkbox"
                    aria-label="Sélectionner mes dépenses visibles"
                    checked={allSelected}
                    disabled={selectable.length === 0}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((e) => e.id)))}
                  />
                </th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 pr-3 font-medium">Concerne</th>
                <th className="py-2 pr-5 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const mine = e.payerId === currentUserId;
                if (editingId === e.id) {
                  return (
                    <EditRow
                      key={e.id}
                      expense={e}
                      onDone={(error) => {
                        setError(error);
                        if (!error) setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                      householdId={householdId}
                      periodId={periodId}
                      range={range}
                    />
                  );
                }
                return (
                  <tr key={e.id} className={`border-b border-border last:border-0 ${isPersonal(e) ? "text-muted" : ""}`}>
                    <td className="py-2 pl-5 align-top">
                      {mine && (
                        <input
                          type="checkbox"
                          aria-label="Sélectionner"
                          checked={selected.has(e.id)}
                          onChange={() => toggleSelected(e.id)}
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 align-top text-muted">
                      {new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <div>{e.description}</div>
                      <div className="text-xs text-muted">
                        Payé par {nameOf(e.payerId)}
                        {e.source === "manual" && " · saisie manuelle"}
                        {mine && (
                          <>
                            {" · "}
                            <button type="button" className="underline hover:text-foreground" onClick={() => setEditingId(e.id)}>
                              modifier
                            </button>
                          </>
                        )}
                      </div>

                    </td>
                    <td className="py-2 pr-3 align-top">
                      {mine ? (
                        <div className="flex flex-wrap gap-1">
                          {members.map((m) => {
                            const on = e.shareIds.includes(m.id);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                title={on ? "Retirer" : "Ajouter"}
                                onClick={() => toggleMember(e, m.id)}
                                className={`rounded-full border px-2 py-0.5 text-xs transition ${
                                  on
                                    ? "border-accent bg-accent-soft text-accent"
                                    : "border-border text-muted line-through opacity-60"
                                }`}
                              >
                                {nameOf(m.id)}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs">{participantsLabel(e, memberIds, nameOf)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-5 text-right align-top font-mono">
                      {formatMoney(e.amountCents, e.currency)}
                      {!isPersonal(e) && e.shareIds.length > 1 && (
                        <div className="text-xs text-muted">
                          {formatMoney(Math.round(e.amountCents / e.shareIds.length), e.currency)} / pers.
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > limit && (
        <div className="px-5 pb-5">
          <button type="button" className="btn-ghost w-full" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Afficher plus ({visible.length - limit} restantes)
          </button>
        </div>
      )}
    </section>
  );
}

function EditRow({
  householdId,
  periodId,
  range,
  expense,
  onDone,
  onCancel,
}: {
  householdId: string;
  periodId: string;
  range: { start: string; end: string };
  expense: ExpenseItem;
  onDone: (error: string | null) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <tr className="border-b border-border bg-accent-soft">
      <td colSpan={5} className="px-5 py-3">
        <form
          action={(formData) =>
            startTransition(async () => {
              const result = await updateExpense(householdId, periodId, expense.id, formData);
              onDone(result.ok ? null : result.error);
            })
          }
          className="flex flex-wrap items-center gap-2"
        >
          <input
            name="date"
            type="date"
            required
            min={range.start}
            max={range.end}
            defaultValue={toDateInput(new Date(expense.date))}
            className="input w-auto py-1.5"
          />
          <input
            name="description"
            required
            maxLength={300}
            defaultValue={expense.description}
            className="input min-w-40 flex-1 py-1.5"
          />
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={(expense.amountCents / 100).toFixed(2).replace(".", ",")}
            className="input w-28 py-1.5 text-right font-mono"
          />
          <button className="btn-primary py-1.5" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </button>
          <button type="button" className="btn-ghost bg-card py-1.5" onClick={onCancel} disabled={pending}>
            Annuler
          </button>
        </form>
      </td>
    </tr>
  );
}

function participantsLabel(e: ExpenseItem, memberIds: string[], nameOf: (id: string) => string) {
  if (e.shareIds.length === 1 && e.shareIds[0] === e.payerId) return "Perso";
  if (memberIds.every((id) => e.shareIds.includes(id))) return "Toute la coloc";
  return e.shareIds.map(nameOf).join(", ");
}
