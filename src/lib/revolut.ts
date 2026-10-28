import { parseAmountToCents } from "./money";

/** Une dépense extraite d'un relevé CSV Revolut. */
export type ParsedExpense = {
  date: string; // ISO
  description: string;
  amountCents: number; // positif
  currency: string;
  type: string;
  state: string;
  /** Pré-cochée à l'import (paiements par carte) ou non (virements, change…). */
  suggested: boolean;
};

// Revolut exporte les en-têtes dans la langue de l'application.
const HEADER_ALIASES = {
  type: ["type"],
  started: ["started date", "date de début", "date de debut", "date"],
  completed: ["completed date", "date de fin", "date d'achèvement", "date de réalisation"],
  description: ["description"],
  amount: ["amount", "montant"],
  currency: ["currency", "devise"],
  state: ["state", "état", "etat", "statut"],
} as const;

type Field = keyof typeof HEADER_ALIASES;

const EXCLUDED_STATES = /revert|declin|fail|annul|refus|rejet|rembours/i;
const NOT_A_PURCHASE = /transfer|virement|exchange|change|top.?up|recharg|atm|retrait/i;

function normalizeHeader(h: string) {
  return h.replace(/^﻿/, "").trim().toLowerCase();
}

/** "2024-01-15 10:23:45" (heure locale) ou "15/01/2024 10:23" -> ISO. */
function parseRevolutDate(raw: string): string | null {
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = iso;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s).toISOString();
  }
  const fr = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (fr) {
    const [, d, mo, y, h = "0", mi = "0"] = fr;
    return new Date(+y, +mo - 1, +d, +h, +mi).toISOString();
  }
  return null;
}

export type RevolutParseResult =
  | { ok: true; expenses: ParsedExpense[]; skipped: number }
  | { ok: false; error: string };

/** Garde uniquement les sorties d'argent (montant négatif) qui n'ont pas été annulées. */
export function parseRevolutRows(rows: Record<string, string>[], headers: string[]): RevolutParseResult {
  const columns: Partial<Record<Field, string>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    const aliases: readonly string[] = HEADER_ALIASES[field];
    columns[field] = headers.find((h) => aliases.includes(normalizeHeader(h)));
  }
  if (!columns.amount || !columns.description || !(columns.started || columns.completed)) {
    return {
      ok: false,
      error: "Ce fichier ne ressemble pas à un relevé Revolut (colonnes Date, Description et Montant introuvables).",
    };
  }

  const expenses: ParsedExpense[] = [];
  let skipped = 0;
  for (const row of rows) {
    const get = (f: Field) => {
      const col = columns[f];
      return col ? (row[col] ?? "").trim() : "";
    };
    const amount = parseAmountToCents(get("amount"));
    const date = parseRevolutDate(get("started") || get("completed"));
    const state = get("state");
    if (amount === null || amount >= 0 || !date || EXCLUDED_STATES.test(state)) {
      skipped++;
      continue;
    }
    const type = get("type");
    expenses.push({
      date,
      description: (get("description") || "(sans description)").slice(0, 300),
      amountCents: -amount,
      currency: (get("currency") || "EUR").toUpperCase(),
      type,
      state,
      suggested: !NOT_A_PURCHASE.test(type),
    });
  }
  expenses.sort((a, b) => b.date.localeCompare(a.date));
  return { ok: true, expenses, skipped };
}
