export function formatMoney(cents: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** "12,50" | "12.5" | "-3" -> centimes, ou null si invalide. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[\s ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
