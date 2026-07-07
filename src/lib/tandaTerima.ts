import type { Claim } from "./types";

function escapeCsv(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Maps our free-form claim item types onto the 4 fixed columns the
 *  official Finance "Tanda Terima" recap uses. Anything that isn't
 *  Gasoline/Toll/Parking falls into "Others" — this mirrors how the
 *  paper form only ever had those 4 columns. */
function bucketForType(type: string): "gasoline" | "toll" | "parking" | "others" {
  const t = type.toLowerCase();
  if (t.includes("gas") || t.includes("bensin") || t.includes("bbm")) return "gasoline";
  if (t.includes("toll") || t.includes("tol")) return "toll";
  if (t.includes("park")) return "parking";
  return "others";
}

interface DriverRowTotals {
  driverName: string;
  gasoline: number;
  toll: number;
  parking: number;
  others: number;
  total: number;
}

function summarizeByDriver(claims: Claim[]): DriverRowTotals[] {
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

/** Splits a claim expression like "194000+333000" into its individual
 *  numbers — the original paper form gives each underlying receipt its
 *  own row in the Rincian block, even when they were summed together
 *  as one claim line. Falls back to the item's stored total if the
 *  expression can't be cleanly split (e.g. it used *, /, or parens). */
function splitExprToNumbers(expr: string, fallbackTotal: number): number[] {
  const parts = expr.split("+").map((p) => p.trim()).filter(Boolean);
  const nums = parts.map((p) => Number(p)).filter((n) => !isNaN(n) && n >= 0);
  if (nums.length === 0 || nums.reduce((s, n) => s + n, 0) !== Math.round(fallbackTotal)) {
    // Expression wasn't pure "+" (had */-, parens, or didn't parse cleanly)
    // — safest fallback is one row with the item's actual computed total,
    // rather than guessing at a split that doesn't add up.
    return [fallbackTotal];
  }
  return nums;
}

function buildRecapSection(
  claims: Claim[],
  weekLabel: string,
  plant: string,
  sectionTitle: string
): string[] {
  const lines: string[] = [];
  const rows = summarizeByDriver(claims);
  const grand = rows.reduce(
    (acc, r) => ({
      gasoline: acc.gasoline + r.gasoline,
      toll: acc.toll + r.toll,
      parking: acc.parking + r.parking,
      others: acc.others + r.others,
      total: acc.total + r.total,
    }),
    { gasoline: 0, toll: 0, parking: 0, others: 0, total: 0 }
  );

  lines.push(escapeCsv("PT. FRISIAN FLAG INDONESIA"));
  lines.push(escapeCsv("REKAPITULASI BIAYA OPERASIONAL KENDARAAN " + new Date().getFullYear()));
  lines.push(escapeCsv(sectionTitle));
  lines.push("");
  lines.push(["Periode", ":", weekLabel].map(escapeCsv).join(","));
  lines.push(["Plant", ":", plant].map(escapeCsv).join(","));
  lines.push("");
  lines.push(["NO", "POLICE NO", "HOLDER", "DRIVER", "GASOLINE", "TOLL", "PARKING", "OTHERS", "TOTAL", "KET"].map(escapeCsv).join(","));

  if (rows.length === 0) {
    lines.push(["", "", "", "(tidak ada klaim minggu ini)", "", "", "", "", "", ""].map(escapeCsv).join(","));
  } else {
    rows.forEach((r, i) => {
      lines.push(
        [
          i + 1,
          "", // Police No — left blank, filled manually (vehicle isn't tracked per claim)
          r.driverName, // Holder — same as driver, since we don't track a separate "holder" role
          r.driverName,
          r.gasoline || "",
          r.toll || "",
          r.parking || "",
          r.others || "",
          r.total,
          "",
        ].map(escapeCsv).join(",")
      );
    });
  }

  lines.push(["", "", "", "Total", rows.length === 1 ? rows[0].gasoline : "", "", "", "", grand.total, ""].map(escapeCsv).join(","));
  lines.push(
    ["", "", "", "Grand Total", grand.gasoline, grand.toll, grand.parking, grand.others, grand.total, ""].map(escapeCsv).join(",")
  );
  lines.push("");

  // ── Rincian — matrix layout matching the original paper form: same
  // Gasoline/Toll/Parking/Others/Total columns as the main table, but
  // each individual receipt (each "+"-separated number) gets its own
  // row, placed in the column matching its type and left blank
  // elsewhere. This is what lets Finance see "527.000 Toll" was really
  // two separate receipts (194.000 + 333.000), not one lump sum. ──
  lines.push(escapeCsv("RINCIAN"));
  lines.push(["GASOLINE", "TOLL", "PARKING", "OTHERS", "TOTAL"].map(escapeCsv).join(","));

  const rincianRows: { gasoline: number; toll: number; parking: number; others: number }[] = [];
  claims.forEach((c) => {
    c.items.forEach((item) => {
      const bucket = bucketForType(item.type);
      const numbers = splitExprToNumbers(item.expr, item.total);
      numbers.forEach((n) => {
        rincianRows.push({
          gasoline: bucket === "gasoline" ? n : 0,
          toll: bucket === "toll" ? n : 0,
          parking: bucket === "parking" ? n : 0,
          others: bucket === "others" ? n : 0,
        });
      });
    });
  });

  rincianRows.forEach((r) => {
    const rowTotal = r.gasoline + r.toll + r.parking + r.others;
    lines.push(
      [r.gasoline || "", r.toll || "", r.parking || "", r.others || "", rowTotal].map(escapeCsv).join(",")
    );
  });
  lines.push(
    [grand.gasoline, grand.toll, grand.parking, grand.others, grand.total].map(escapeCsv).join(",")
  );

  return lines;
}

function downloadCsv(lines: string[], filename: string): void {
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Exports the week's claims as the official Finance "Tanda Terima" recap
 *  format — split into two files: one for the configured "Driver User"
 *  list (separate budgeting), and one combined file for everyone else. */
export function exportTandaTerima(
  weekClaims: Claim[],
  weekLabel: string,
  plant: string,
  driverUserIds: string[]
): void {
  const userClaims = weekClaims.filter((c) => driverUserIds.includes(c.driver_id));
  const otherClaims = weekClaims.filter((c) => !driverUserIds.includes(c.driver_id));

  const safeLabel = weekLabel.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (userClaims.length > 0) {
    const lines = buildRecapSection(userClaims, weekLabel, plant, "TANDA TERIMA — DRIVER USER");
    downloadCsv(lines, `TandaTerima_DriverUser_${safeLabel}.csv`);
  }

  const combinedLines = buildRecapSection(otherClaims, weekLabel, plant, "TANDA TERIMA");
  downloadCsv(combinedLines, `TandaTerima_${safeLabel}.csv`);
}
