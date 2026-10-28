/** Les dates de compte sont des chaînes "AAAA-MM-JJ" (jours inclus, heure locale). */

export function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Lundi de la semaine de `d`. */
export function startOfWeek(d: Date) {
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
}

/** Premier et dernier jour d'un mois (`month` de 0 à 11). */
export function monthRange(year: number, month: number) {
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
}

export function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInput(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Jour local (AAAA-MM-JJ) d'une date ISO, pour la comparer aux bornes d'un compte. */
export function localDay(iso: string) {
  return toDateInput(new Date(iso));
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const month = (d: Date, withYear: boolean) =>
  capitalize(d.toLocaleDateString("fr-FR", withYear ? { month: "long", year: "numeric" } : { month: "long" }));
const day = (d: Date, withYear: boolean) =>
  d.toLocaleDateString("fr-FR", withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });

/** "Octobre 2026", "Août – Septembre 2026", "Semaine du 19 au 25 oct. 2026", "Du 3 oct. au 2 nov. 2026". */
export function periodLabel(startDate: string, endDate: string) {
  const s = fromDateInput(startDate);
  const e = fromDateInput(endDate);
  const sameYear = s.getFullYear() === e.getFullYear();
  const wholeMonths = s.getDate() === 1 && addDays(e, 1).getDate() === 1;

  if (wholeMonths) {
    if (sameYear && s.getMonth() === e.getMonth()) return month(s, true);
    return `${month(s, !sameYear)} – ${month(e, true)}`;
  }
  if (s.getDay() === 1 && addDays(s, 6).getTime() === e.getTime()) {
    return s.getMonth() === e.getMonth()
      ? `Semaine du ${s.getDate()} au ${day(e, true)}`
      : `Semaine du ${day(s, !sameYear)} au ${day(e, true)}`;
  }
  return `Du ${day(s, !sameYear)} au ${day(e, true)}`;
}

/** "1 oct. – 31 oct. 2026" */
export function formatRange(startDate: string, endDate: string) {
  const s = fromDateInput(startDate);
  const e = fromDateInput(endDate);
  return `${day(s, s.getFullYear() !== e.getFullYear())} – ${day(e, true)}`;
}
