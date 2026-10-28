import { parseAmountToCents } from "./money";

/** Une dépense extraite d'un relevé Revolut (CSV ou Excel). */
export type ParsedExpense = {
  date: string; // ISO
  description: string;
  /** Montant + frais, positif. */
  amountCents: number;
  currency: string;
  type: string;
  state: string;
  /** Pré-cochée à l'import (paiements par carte) ou non (virements, change…). */
  suggested: boolean;
};

/** Valeur d'une cellule : texte (CSV), nombre ou numéro de série de date (Excel). */
export type Cell = string | number | boolean | Date | null | undefined;

// Revolut exporte les en-têtes dans la langue de l'application.
const HEADER_ALIASES = {
  type: ["type"],
  started: ["started date", "date de début", "date de debut", "date"],
  completed: ["completed date", "date de fin", "date d'achèvement", "date de réalisation"],
  description: ["description"],
  amount: ["amount", "montant"],
  fee: ["fee", "frais"],
  currency: ["currency", "devise"],
  state: ["state", "état", "etat", "statut"],
} as const;

type Field = keyof typeof HEADER_ALIASES;

const EXCLUDED_STATES = /revert|declin|fail|annul|refus|rejet|rembours/i;
const NOT_A_PURCHASE = /transfer|virement|exchange|change|top.?up|recharg|atm|retrait/i;

// Octets 0x80–0x9F de Windows-1252, pour retrouver les octets UTF-8 d'origine.
const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89,
  "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
  "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/**
 * Les exports Revolut contiennent du texte UTF-8 relu en Windows-1252
 * ("Date de dÃ©but", "TERMINÃ‰") : on le remet d'aplomb quand c'est possible.
 */
export function fixMojibake(text: string) {
  if (!/[ÃÂ]/.test(text)) return text;
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const byte = code <= 0xff ? code : CP1252[ch];
    if (byte === undefined) return text;
    bytes.push(byte);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return text;
  }
}

function normalizeHeader(h: string) {
  return fixMojibake(h.replace(/^﻿/, "")).trim().toLowerCase();
}

function toText(value: Cell) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return fixMojibake(String(value)).replace(/ /g, " ").trim();
}

function toCents(value: Cell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  const text = toText(value);
  return text ? parseAmountToCents(text) : null;
}

/** Date Excel (numéro de série), Date, "2024-01-15 10:23:45" ou "15/01/2024 10:23" -> ISO, en heure locale. */
function toIsoDate(value: Cell): string | null {
  if (typeof value === "number" && value > 0) {
    // Le numéro de série encode l'heure affichée : on la reprend telle quelle en heure locale.
    const wall = new Date(Math.round((value - 25569) * 86400) * 1000);
    return new Date(
      wall.getUTCFullYear(),
      wall.getUTCMonth(),
      wall.getUTCDate(),
      wall.getUTCHours(),
      wall.getUTCMinutes(),
      wall.getUTCSeconds(),
    ).toISOString();
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();

  const raw = toText(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = iso;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s).toISOString();
  }
  const fr = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (fr) {
    const [, d, mo, y, h = "0", mi = "0", s = "0"] = fr;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s).toISOString();
  }
  return null;
}

export type RevolutParseResult =
  | { ok: true; expenses: ParsedExpense[]; skipped: number }
  | { ok: false; error: string };

/**
 * `rows` : lignes du relevé, la première étant les en-têtes.
 * Garde uniquement les sorties d'argent (montant négatif) qui n'ont pas été annulées.
 */
export function parseRevolutRows(rows: Cell[][]): RevolutParseResult {
  const amountAliases: readonly string[] = HEADER_ALIASES.amount;
  const headerIndex = rows.findIndex((r) => r.some((c) => amountAliases.includes(normalizeHeader(toText(c)))));
  if (headerIndex === -1) return notRevolut();
  const headers = rows[headerIndex].map((c) => normalizeHeader(toText(c)));

  const columns: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    const aliases: readonly string[] = HEADER_ALIASES[field];
    const index = headers.findIndex((h) => aliases.includes(h));
    if (index !== -1) columns[field] = index;
  }
  if (columns.amount === undefined || columns.description === undefined || (columns.started ?? columns.completed) === undefined) {
    return notRevolut();
  }

  const expenses: ParsedExpense[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((c) => toText(c) === "")) continue;
    const get = (f: Field): Cell => (columns[f] === undefined ? undefined : row[columns[f]!]);

    const amount = toCents(get("amount"));
    const fee = toCents(get("fee")) ?? 0;
    const date = toIsoDate(get("started")) ?? toIsoDate(get("completed"));
    const state = toText(get("state"));
    if (amount === null || amount >= 0 || !date || EXCLUDED_STATES.test(state)) {
      skipped++;
      continue;
    }
    const type = toText(get("type"));
    expenses.push({
      date,
      description: (toText(get("description")) || "(sans description)").slice(0, 300),
      amountCents: -amount + Math.abs(fee),
      currency: (toText(get("currency")) || "EUR").toUpperCase(),
      type,
      state,
      suggested: !NOT_A_PURCHASE.test(type),
    });
  }
  expenses.sort((a, b) => b.date.localeCompare(a.date));
  return { ok: true, expenses, skipped };
}

function notRevolut(): RevolutParseResult {
  return {
    ok: false,
    error: "Ce fichier ne ressemble pas à un relevé Revolut (colonnes Date, Description et Montant introuvables).",
  };
}

/** Lit un relevé .xlsx/.xls ou .csv en lignes de cellules. */
export async function readStatementFile(file: File): Promise<Cell[][]> {
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: "" });
  }
  const Papa = (await import("papaparse")).default;
  return new Promise((resolve, reject) =>
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: reject,
    }),
  );
}
