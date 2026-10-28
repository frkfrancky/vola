import { formatMoney } from "@/lib/money";

/** Montants par devise, ex. { EUR: 12000 }. */
export type Totals = Record<string, number>;

export function addTotal(totals: Totals, currency: string, cents: number) {
  totals[currency] = (totals[currency] ?? 0) + cents;
}

function formatTotals(totals: Totals, signed = false) {
  const entries = Object.entries(totals);
  if (entries.length === 0) return formatMoney(0);
  return entries
    .map(([currency, cents]) => `${signed && cents > 0 ? "+" : ""}${formatMoney(cents, currency)}`)
    .join(" + ");
}

export type Stat = {
  label: string;
  totals: Totals;
  hint?: string;
  /** Affiche le signe et colore en vert/rouge selon que le montant est positif ou négatif. */
  signed?: boolean;
  tone?: "accent" | "danger";
};

export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => {
        const sum = Object.values(stat.totals).reduce((a, b) => a + b, 0);
        const tone =
          stat.tone ?? (stat.signed && sum > 0 ? "accent" : stat.signed && sum < 0 ? "danger" : undefined);
        return (
          <div key={stat.label} className="card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{stat.label}</div>
            <div
              className={`mt-1 font-mono text-2xl font-semibold tabular-nums sm:text-3xl ${
                tone === "accent" ? "text-accent" : tone === "danger" ? "text-danger" : ""
              }`}
            >
              {formatTotals(stat.totals, stat.signed)}
            </div>
            {stat.hint && <div className="mt-1 text-xs text-muted">{stat.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}
