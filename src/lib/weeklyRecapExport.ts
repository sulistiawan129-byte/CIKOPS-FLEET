/** Export utilities for the Claims "Weekly Recap" table (per-driver,
 *  per-week breakdown by category: Gasoline / Toll / Parking / Other).
 *  Values here are always the already-computed totals per category
 *  (e.g. "100000+10000" → 110000) — never the raw addition expression. */

export interface WeeklyRecapRow {
  weekLabel: string;
  driver: string;
  gasoline: number;
  toll: number;
  parking: number;
  other: number;
  total: number;
}

export interface WeeklyRecapGrandTotal {
  gasoline: number;
  toll: number;
  parking: number;
  other: number;
  total: number;
}

function safeFileLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/* ════════════════════════════════════════════════════════════
   EXCEL EXPORT (.xlsx) — via SheetJS
════════════════════════════════════════════════════════════ */

export async function exportWeeklyRecapToExcel(
  rows: WeeklyRecapRow[],
  grandTotal: WeeklyRecapGrandTotal,
  periodLabel: string
): Promise<void> {
  const XLSX = await import("xlsx");

  const headers = ["Minggu", "Driver", "Gasoline", "Toll", "Parking", "Other", "Total"];
  const dataRows = rows.map((r) => [
    r.weekLabel,
    r.driver,
    r.gasoline,
    r.toll,
    r.parking,
    r.other,
    r.total,
  ]);
  const totalRow = ["", "Grand Total", grandTotal.gasoline, grandTotal.toll, grandTotal.parking, grandTotal.other, grandTotal.total];

  const aoa = [
    ["REKAP MINGGUAN KLAIM — CIKOPS FLEET OS"],
    [`Periode: ${periodLabel}`],
    [],
    headers,
    ...dataRows,
    totalRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = [
    { wch: 10 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];

  // Currency number format for the category + total columns
  const headerRowIdx = 4; // 1-indexed row of `headers` in the sheet (row 4 = index 3, +1 for 1-indexed)
  const firstDataRow = headerRowIdx + 1;
  const lastDataRow = firstDataRow + dataRows.length; // includes grand total row
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    for (let c = 2; c <= 6; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: r - 1, c });
      const cell = ws[cellRef];
      if (cell && typeof cell.v === "number") {
        cell.z = "#,##0";
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Weekly Recap");

  XLSX.writeFile(wb, `CIKOPS_WeeklyRecap_Klaim_${safeFileLabel(periodLabel)}.xlsx`);
}

/* ════════════════════════════════════════════════════════════
   PDF EXPORT — same house style as the main Report export
════════════════════════════════════════════════════════════ */

type RGB = [number, number, number];
const COLOR_NAVY: RGB = [11, 30, 77];
const COLOR_BRAND: RGB = [46, 91, 255];
const COLOR_GRAY: RGB = [100, 110, 130];
const COLOR_LIGHT_BG: RGB = [247, 249, 253];

function fmtRpPdf(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n));
}

export async function exportWeeklyRecapToPdf(
  rows: WeeklyRecapRow[],
  grandTotal: WeeklyRecapGrandTotal,
  periodLabel: string
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;

  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Header banner
  doc.setFillColor(...COLOR_NAVY);
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CIKOPS FLEET OPERATIONS", marginX, 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Rekap Mingguan Klaim — per Kategori", marginX, 44);
  doc.setFontSize(8);
  doc.text(`Periode ${periodLabel}`, pageWidth - marginX, 27, { align: "right" });
  doc.text(`Dibuat ${generatedAt}`, pageWidth - marginX, 40, { align: "right" });

  const bodyRows = rows.map((r) => [
    r.weekLabel,
    r.driver,
    `Rp ${fmtRpPdf(r.gasoline)}`,
    `Rp ${fmtRpPdf(r.toll)}`,
    `Rp ${fmtRpPdf(r.parking)}`,
    `Rp ${fmtRpPdf(r.other)}`,
    `Rp ${fmtRpPdf(r.total)}`,
  ]);

  autoTable(doc, {
    startY: 90,
    margin: { left: marginX, right: marginX },
    head: [["Minggu", "Driver", "Gasoline", "Toll", "Parking", "Other", "Total"]],
    body:
      bodyRows.length > 0
        ? bodyRows
        : [["-", "Tidak ada data klaim pada periode ini", "", "", "", "", ""]],
    foot: [
      [
        "",
        "Grand Total",
        `Rp ${fmtRpPdf(grandTotal.gasoline)}`,
        `Rp ${fmtRpPdf(grandTotal.toll)}`,
        `Rp ${fmtRpPdf(grandTotal.parking)}`,
        `Rp ${fmtRpPdf(grandTotal.other)}`,
        `Rp ${fmtRpPdf(grandTotal.total)}`,
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: COLOR_BRAND,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      halign: "right",
    },
    footStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      halign: "right",
    },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50], halign: "right" },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "left" },
    },
    alternateRowStyles: { fillColor: COLOR_LIGHT_BG },
    didDrawPage: () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...COLOR_GRAY);
      doc.text(
        "CIKOPS Fleet OS — Rekap dibuat otomatis dari data sistem. Nominal per kategori adalah total penjumlahan (bukan rincian per struk).",
        marginX,
        pageHeight - 16
      );
    },
  });

  doc.save(`CIKOPS_WeeklyRecap_Klaim_${safeFileLabel(periodLabel)}.pdf`);
}
