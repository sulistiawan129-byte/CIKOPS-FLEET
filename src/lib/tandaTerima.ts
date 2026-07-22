import type { Claim } from "./types";
import { summarizeByDriver, buildRincianRows, grandTotalOf } from "./claimRecap";

function escapeCsv(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildRecapSection(
  claims: Claim[],
  weekLabel: string,
  plant: string,
  sectionTitle: string
): string[] {
  const lines: string[] = [];
  const rows = summarizeByDriver(claims);
  const grand = grandTotalOf(rows);

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

  // ── Rincian — one row per claim LINE ITEM (one physical "lembar"/sheet
  // of stapled receipts), never merged even with another item of the same
  // category in the same claim — each was submitted as its own sheet.
  // Each row shows that item's final total, never the raw addition
  // expression like "100000+10000". ──
  lines.push(escapeCsv("RINCIAN"));
  lines.push(["GASOLINE", "TOLL", "PARKING", "OTHERS", "TOTAL"].map(escapeCsv).join(","));

  const rincianRows = buildRincianRows(claims);
  rincianRows.forEach((r) => {
    lines.push(
      [r.gasoline || "", r.toll || "", r.parking || "", r.others || "", r.total].map(escapeCsv).join(",")
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
