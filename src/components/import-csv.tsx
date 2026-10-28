"use client";

import Papa from "papaparse";
import { useRef, useState, useTransition } from "react";
import { importExpenses } from "@/app/actions/expenses";
import { formatMoney } from "@/lib/money";
import { parseRevolutRows, type ParsedExpense } from "@/lib/revolut";

export function ImportCsv({ householdId }: { householdId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedExpense[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [participants, setParticipants] = useState<"all" | "me">("all");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setRows(null);
    setChecked(new Set());
    if (inputRef.current) inputRef.current.value = "";
  }

  function onFile(file: File) {
    setMessage(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed = parseRevolutRows(result.data, result.meta.fields ?? []);
        if (!parsed.ok) {
          setMessage({ type: "error", text: parsed.error });
          reset();
          return;
        }
        if (parsed.expenses.length === 0) {
          setMessage({ type: "error", text: "Aucune dépense trouvée dans ce fichier." });
          reset();
          return;
        }
        setRows(parsed.expenses);
        setChecked(new Set(parsed.expenses.flatMap((e, i) => (e.suggested ? [i] : []))));
      },
      error: () => setMessage({ type: "error", text: "Impossible de lire ce fichier." }),
    });
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
      const result = await importExpenses(householdId, selected, participants);
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
            Dans l&apos;app Revolut : Compte → Relevé → Excel/CSV. Les dépenses déjà importées sont ignorées.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
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
