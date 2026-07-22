import type { Claim } from "./types";

/** Maps our free-form claim item types onto the 4 fixed columns the
 *  official Finance "Tanda Terima" recap uses. Anything that isn't
 *  Gasoline/Toll/Parking falls into "Others" — this mirrors how the
 *  paper form only ever had those 4 columns. */
export function bucketForType(type: string): "gasoline" | "toll" | "parking" | "others" {
  const t = type.toLowerCase();
  if (t.includes("gas") || t.includes("bensin") || t.includes("bbm")) return "gasoline";
  if (t.includes("toll") || t.includes("tol")) return "toll";
  if (t.includes("park")) return "parking";
  return "others";
}

export interface DriverRowTotals {
  driverName: string;
  gasoline: number;
  toll: number;
  parking: number;
  others: number;
  total: number;
}

/** One row per driver, totals across all their claims in the given list. */
export function summarizeByDriver(claims: Claim[]): DriverRowTotals[] {
  const map = new Map<string, DriverRowTotals>();
  claims.forEach((c) => {
    const cur = map.get(c.driver_id) || { driverName: c.driverName, gasoline: 0, toll: 0, parking: 0, others: 0, total: 0 };
    c.items.forEach((item) => {
      const bucket = bucketForType(item.type);
      cur[bucket] += item.total;
    });
    cur.total += c.total;
    map.set(c.driver_id, cur);
  });
  return [...map.values()];
}

export interface RincianRow {
  gasoline: number;
  toll: number;
  parking: number;
  others: number;
  total: number;
}

/** One row PER CLAIM ITEM (i.e. per line in the claim form = one physical
 *  "lembar"/sheet of stapled receipts) — never merged with other items,
 *  even other items of the same category within the same claim, because
 *  each item was submitted as its own separate sheet. Each row shows the
 *  item's already-computed total (e.g. "100000+10000" → 110000) — never
 *  the raw addition expression. */
export function buildRincianRows(claims: Claim[]): RincianRow[] {
  const rows: RincianRow[] = [];
  claims.forEach((c) => {
    c.items.forEach((item) => {
      const bucket = bucketForType(item.type);
      const row: RincianRow = { gasoline: 0, toll: 0, parking: 0, others: 0, total: item.total };
      row[bucket] = item.total;
      rows.push(row);
    });
  });
  return rows;
}

export interface RecapGrandTotal {
  gasoline: number;
  toll: number;
  parking: number;
  others: number;
  total: number;
}

export function grandTotalOf(rows: DriverRowTotals[]): RecapGrandTotal {
  return {
    gasoline: rows.reduce((s, r) => s + r.gasoline, 0),
    toll: rows.reduce((s, r) => s + r.toll, 0),
    parking: rows.reduce((s, r) => s + r.parking, 0),
    others: rows.reduce((s, r) => s + r.others, 0),
    total: rows.reduce((s, r) => s + r.total, 0),
  };
}
