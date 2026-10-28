"use client";

import { useState, useTransition } from "react";
import { createPeriod, deletePeriod, updatePeriod } from "@/app/actions/periods";
import { addDays, capitalize, fromDateInput, monthRange, periodLabel, startOfWeek, toDateInput } from "@/lib/periods";

type Kind = "month" | "months" | "week" | "custom";

const KINDS: [Kind, string][] = [
  ["month", "Un mois"],
  ["months", "Plusieurs mois"],
  ["week", "Une semaine"],
  ["custom", "Dates libres"],
];

const MONTH_NAMES = Array.from({ length: 12 }, (_, m) =>
  capitalize(new Date(2000, m, 1).toLocaleDateString("fr-FR", { month: "long" })),
);

type YearMonth = { year: number; month: number };

function MonthPicker({ value, onChange }: { value: YearMonth; onChange: (v: YearMonth) => void }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 4 + i);
  return (
    <div className="flex gap-2">
      <select
        value={value.month}
        onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
        className="input"
      >
        {MONTH_NAMES.map((name, m) => (
          <option key={m} value={m}>
            {name}
          </option>
        ))}
      </select>
      <select
        value={value.year}
        onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
        className="input w-28"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CreatePeriodForm({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <NewPeriodForm householdId={householdId} onCancel={() => setOpen(false)} />
  ) : (
    <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
      + Nouveau compte
    </button>
  );
}

/** Rendu seulement après un clic : les dates par défaut viennent donc du fuseau du navigateur. */
function NewPeriodForm({ householdId, onCancel }: { householdId: string; onCancel: () => void }) {
  const today = new Date();
  const current = { year: today.getFullYear(), month: today.getMonth() };
  const previous = { year: current.month === 0 ? current.year - 1 : current.year, month: (current.month + 11) % 12 };

  const [kind, setKind] = useState<Kind>("month");
  const [month, setMonth] = useState<YearMonth>(current);
  const [fromMonth, setFromMonth] = useState<YearMonth>(previous);
  const [toMonth, setToMonth] = useState<YearMonth>(current);
  const [weekDay, setWeekDay] = useState(toDateInput(addDays(today, -7)));
  const [customStart, setCustomStart] = useState(toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(toDateInput(today));
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  let start = "";
  let end = "";
  if (kind === "month") {
    const r = monthRange(month.year, month.month);
    [start, end] = [toDateInput(r.start), toDateInput(r.end)];
  } else if (kind === "months") {
    [start, end] = [
      toDateInput(monthRange(fromMonth.year, fromMonth.month).start),
      toDateInput(monthRange(toMonth.year, toMonth.month).end),
    ];
  } else if (kind === "week" && weekDay) {
    const monday = startOfWeek(fromDateInput(weekDay));
    [start, end] = [toDateInput(monday), toDateInput(addDays(monday, 6))];
  } else if (kind === "custom") {
    [start, end] = [customStart, customEnd];
  }
  const valid = Boolean(start && end && start <= end);
  const label = customLabel ?? (valid ? periodLabel(start, end) : "");

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createPeriod(householdId, label, start, end);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section className="card space-y-4">
      <h2 className="font-medium">Nouveau compte</h2>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5 text-sm">
        {KINDS.map(([value, name]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setKind(value);
              setCustomLabel(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 ${kind === value ? "bg-accent-soft font-medium text-accent" : "text-muted"}`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-2 text-sm">
        {kind === "month" && <MonthPicker value={month} onChange={(v) => (setMonth(v), setCustomLabel(null))} />}
        {kind === "months" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-muted">De</span>
              <MonthPicker value={fromMonth} onChange={(v) => (setFromMonth(v), setCustomLabel(null))} />
            </label>
            <label className="space-y-1">
              <span className="text-muted">À</span>
              <MonthPicker value={toMonth} onChange={(v) => (setToMonth(v), setCustomLabel(null))} />
            </label>
          </div>
        )}
        {kind === "week" && (
          <label className="block space-y-1">
            <span className="text-muted">Un jour de la semaine</span>
            <input
              type="date"
              value={weekDay}
              onChange={(e) => (setWeekDay(e.target.value), setCustomLabel(null))}
              className="input"
            />
          </label>
        )}
        {kind === "custom" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-muted">Du</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => (setCustomStart(e.target.value), setCustomLabel(null))}
                className="input"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted">Au</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => (setCustomEnd(e.target.value), setCustomLabel(null))}
                className="input"
              />
            </label>
          </div>
        )}
        {start && end && !valid && <p className="text-danger">La date de début doit précéder la date de fin.</p>}
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted">Nom du compte</span>
        <input value={label} onChange={(e) => setCustomLabel(e.target.value)} maxLength={80} className="input" />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={pending || !valid || !label.trim()} onClick={submit}>
          {pending ? "…" : "Créer le compte"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={pending}>
          Annuler
        </button>
      </div>
    </section>
  );
}

export function PeriodSettings({
  householdId,
  periodId,
  label,
  startDate,
  endDate,
  expenseCount,
}: {
  householdId: string;
  periodId: string;
  label: string;
  startDate: string;
  endDate: string;
  expenseCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    const warning =
      expenseCount > 0
        ? `Supprimer « ${label} » et ses ${expenseCount} dépense${expenseCount > 1 ? "s" : ""} ? C'est définitif.`
        : `Supprimer « ${label} » ?`;
    if (!confirm(warning)) return;
    startTransition(async () => {
      await deletePeriod(householdId, periodId);
    });
  }

  if (!editing) {
    return (
      <div className="flex gap-2">
        <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
          Modifier
        </button>
        <button type="button" className="btn-danger" onClick={remove} disabled={pending}>
          Supprimer
        </button>
      </div>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await updatePeriod(
            householdId,
            periodId,
            String(formData.get("label")),
            String(formData.get("start")),
            String(formData.get("end")),
          );
          if (result.ok) {
            setError(null);
            setEditing(false);
          } else {
            setError(result.error);
          }
        })
      }
      className="card flex w-full flex-wrap items-end gap-2 text-sm"
    >
      <label className="min-w-48 flex-1 space-y-1">
        <span className="text-muted">Nom</span>
        <input name="label" required maxLength={80} defaultValue={label} className="input" />
      </label>
      <label className="space-y-1">
        <span className="text-muted">Du</span>
        <input name="start" type="date" required defaultValue={startDate} className="input" />
      </label>
      <label className="space-y-1">
        <span className="text-muted">Au</span>
        <input name="end" type="date" required defaultValue={endDate} className="input" />
      </label>
      <button className="btn-primary" disabled={pending}>
        Enregistrer
      </button>
      <button type="button" className="btn-ghost" onClick={() => setEditing(false)} disabled={pending}>
        Annuler
      </button>
      {error && <p className="w-full text-danger">{error}</p>}
    </form>
  );
}
