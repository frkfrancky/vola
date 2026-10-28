"use client";

import { useRef, useState, useTransition } from "react";
import { importExpenses } from "@/app/actions/expenses";
import { formatMoney } from "@/lib/money";
import { localDay } from "@/lib/periods";
import { parseRevolutRows, readStatementFile, type ParsedExpense } from "@/lib/revolut";

export function ImportCsv({
  householdId,
  periodId,
  range,
}: {
  householdId: string;
  periodId: string;
  range: { start: string; end: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedExpense[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [outOfRange, setOutOfRange] = useState(0);
  const [participants, setParticipants] = useState<"all" | "me">("all");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setRows(null);
    setChecked(new Set());
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(file: File) {
    setMessage(null);
    let cells;
    try {
      cells = await readStatementFile(file);
    } catch {
      setMessage({ type: "error", text: "Impossible de lire ce fichier." });
      reset();
      return;
    }
    const parsed = parseRevolutRows(cells);
    if (!parsed.ok) {
      setMessage({ type: "error", text: parsed.error });
      reset();
      return;
    }
    // Seules les dépenses comprises dans les dates du compte sont proposées.
    const inRange = parsed.expenses.filter((e) => {
      const day = localDay(e.date);
      return day >= range.start && day <= range.end;
    });
    if (inRange.length === 0) {
      setMessage({
        type: "error",
        text:
          parsed.expenses.length === 0
            ? "Aucune dépense trouvée dans ce fichier."
            : `Aucune des ${parsed.expenses.length} dépenses du fichier n'est dans les dates de ce compte.`,
      });
      reset();
      return;
    }
    setOutOfRange(parsed.expenses.length - inRange.length);
    setRows(inRange);
    setChecked(new Set(inRange.flatMap((e, i) => (e.suggested ? [i] : []))));
  }

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function submit() {
    if (!rows) return;
    const selected = rows
      .filter((_, i) => checked.has(i))
      .map(({ date, description, amountCents, currency }) => ({ date, description, amountCents, currency }));
    startTransition(async () => {
      const result = await importExpenses(householdId, periodId, selected, participants);
      if (result.ok) {
        setMessage({ type: "ok", text: result.message ?? "Import terminé." });
        reset();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <div className={`card space-y-3 ${rows ? "sm:col-span-2" : ""}`}>
      <h2 className="font-medium">Importer un relevé Revolut</h2>
      {!rows && (
        <>
          <p className="text-sm text-muted">
            Fichier .xlsx (ou .csv) exporté depuis Revolut. Seules les dépenses dans les dates du compte
            sont gardées, et celles déjà importées sont ignorées.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent"
          />
        </>
      )}

      {rows && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {checked.size} / {rows.length} dépenses sélectionnées
              {outOfRange > 0 && (
                <span className="text-muted"> · {outOfRange} hors des dates du compte, ignorées</span>
              )}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost py-1" onClick={() => setChecked(new Set(rows.map((_, i) => i)))}>
                Tout
              </button>
              <button type="button" className="btn-ghost py-1" onClick={() => setChecked(new Set())}>
                Rien
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => toggle(i)}
                    className={`cursor-pointer border-b border-border last:border-0 ${checked.has(i) ? "" : "opacity-50"}`}
                  >
                    <td className="w-8 px-2 py-1.5">
                      <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                      {new Date(r.date).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.description}
                      {r.type && <span className="ml-2 text-xs text-muted">{r.type}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">
                      {formatMoney(r.amountCents, r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span>Par défaut, ces dépenses concernent</span>
            <select
              value={participants}
              onChange={(e) => setParticipants(e.target.value as "all" | "me")}
              className="input w-auto py-1"
            >
              <option value="all">toute la coloc</option>
              <option value="me">moi seul</option>
            </select>
          </label>
          <p className="text-xs text-muted">Tu pourras ensuite ajuster chaque dépense individuellement.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={pending || checked.size === 0} onClick={submit}>
              {pending ? "Import…" : `Importer ${checked.size} dépense${checked.size > 1 ? "s" : ""}`}
            </button>
            <button type="button" className="btn-ghost" onClick={reset} disabled={pending}>
              Annuler
            </button>
          </div>
        </>
      )}

      {message && <p className={`text-sm ${message.type === "ok" ? "text-accent" : "text-danger"}`}>{message.text}</p>}
    </div>
  );
}
