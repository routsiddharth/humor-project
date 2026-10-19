// Pure helpers, safe on both sides of the server/client boundary.

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");

export function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.abs(n) >= 10_000 ? compact.format(n) : whole.format(n);
}

export function pct(part: number, total: number, digits = 0): string {
  if (!total) return "—";
  return `${((part / total) * 100).toFixed(digits)}%`;
}

export function fixed(n: number | null | undefined, digits = 2): string {
  return n == null ? "—" : n.toFixed(digits);
}

const TZ = "America/New_York";

export function date(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function ago(value: string | Date | null | undefined): string {
  if (!value) return "never";
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;
  const steps: [number, string][] = [[60, "s"], [60, "m"], [24, "h"], [30, "d"], [12, "mo"], [Infinity, "y"]];
  let v = seconds;
  for (const [size, unit] of steps) {
    if (v < size) return `${Math.max(1, Math.floor(v))}${unit} ago`;
    v /= size;
  }
  return "long ago";
}

export function fullName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Unnamed";
}

// Round a maximum up to a clean axis ceiling: 1, 2, 5 × 10^n.
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) if (step * pow >= max) return step * pow;
  return 10 * pow;
}
