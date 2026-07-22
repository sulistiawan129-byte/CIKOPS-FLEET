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
  // Gasoline/Toll/Parking/Others/Total columns as the main table. Each
  // claim item gets exactly one row, using its already-computed total
  // (e.g. "100000+10000" → 110000), placed in the column matching its
  // type and left blank elsewhere. We show the final total per item,
  // not the underlying addition breakdown. ──
  lines.push(escapeCsv("RINCIAN"));
  lines.push(["GASOLINE", "TOLL", "PARKING", "OTHERS", "TOTAL"].map(escapeCsv).join(","));

  const rincianRows: { gasoline: number; toll: number; parking: number; others: number }[] = [];
  claims.forEach((c) => {
    c.items.forEach((item) => {
      const bucket = bucketForType(item.type);
      rincianRows.push({
        gasoline: bucket === "gasoline" ? item.total : 0,
        toll: bucket === "toll" ? item.total : 0,
        parking: bucket === "parking" ? item.total : 0,
        others: bucket === "others" ? item.total : 0,
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
