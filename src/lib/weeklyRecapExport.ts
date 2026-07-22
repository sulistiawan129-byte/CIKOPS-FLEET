/** Export utilities for the Claims "Weekly Recap" table (per-driver,
 *  per-week breakdown by category: Gasoline / Toll / Parking / Other).
 *  Values here are always the already-computed totals per category
 *  (e.g. "100000+10000" → 110000) — never the raw addition expression.
 *
 *  Both Excel and PDF share the same header format used by Finance's
 *  official recap documents:
 *    PT. FRISIAN FLAG INDONESIA
 *    REKAPITULASI BIAYA OPERASIONAL KENDARAAN {year}
 *    [Section title]                          Total Claim   Rp X
 *
 *  A claim may be split into two sections — one for the configured
 *  "Driver User" list (separate budgeting, same list used by the
 *  existing "Export Tanda Terima" feature), and one combined section
 *  for every other driver. */

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

export interface WeeklyRecapSection {
  /** e.g. "TANDA TERIMA — DRIVER USER" or "TANDA TERIMA" */
  title: string;
  rows: WeeklyRecapRow[];
  grandTotal: WeeklyRecapGrandTotal;
}

const COMPANY_NAME = "PT. FRISIAN FLAG INDONESIA";

function recapDocTitle(): string {
  return `REKAPITULASI BIAYA OPERASIONAL KENDARAAN ${new Date().getFullYear()}`;
}

function safeFileLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n));
}

/* ════════════════════════════════════════════════════════════
   EXCEL EXPORT (.xlsx) — via ExcelJS (supports real cell styling)
════════════════════════════════════════════════════════════ */

const HEADER_FILL = "FFD9E2F3"; // light blue-gray, matches the reference doc
const TABLE_HEAD_FILL = "FF2E5BFF";
const BORDER_COLOR = "FF1F2937";

export async function exportWeeklyRecapToExcel(
  sections: WeeklyRecapSection[],
  periodLabel: string
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "CIKOPS Fleet OS";
  wb.created = new Date();

  const colWidths = [10, 24, 15, 15, 15, 15, 16];
  const numCols = colWidths.length;

  sections.forEach((section, idx) => {
    if (section.rows.length === 0 && sections.length > 1) return; // skip empty split section

    const sheetName = (idx === 0 && sections.length > 1 ? "Driver User" : sections.length > 1 ? "Lainnya" : "Weekly Recap").slice(0, 31);
    const ws = wb.addWorksheet(sheetName);
    ws.columns = colWidths.map((w) => ({ width: w }));

    // Row 1 — Company name
    ws.mergeCells(1, 1, 1, numCols);
    const r1 = ws.getCell(1, 1);
    r1.value = COMPANY_NAME;
    r1.font = { bold: true, size: 13 };
    r1.alignment = { horizontal: "center", vertical: "middle" };
    r1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    ws.getRow(1).height = 22;

    // Row 2 — Document title
    ws.mergeCells(2, 1, 2, numCols);
    const r2 = ws.getCell(2, 1);
    r2.value = recapDocTitle();
    r2.font = { bold: true, size: 11 };
    r2.alignment = { horizontal: "center", vertical: "middle" };
    r2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    ws.getRow(2).height = 20;

    // Row 3 — Section title (left) + Total Claim (right)
    ws.mergeCells(3, 1, 3, numCols - 2);
    const r3title = ws.getCell(3, 1);
    r3title.value = section.title;
    r3title.font = { bold: true, size: 11 };
    r3title.alignment = { horizontal: "left", vertical: "middle" };

    const r3label = ws.getCell(3, numCols - 1);
    r3label.value = "Total Claim";
    r3label.font = { bold: true, size: 10.5 };
    r3label.alignment = { horizontal: "right", vertical: "middle" };

    const r3value = ws.getCell(3, numCols);
    r3value.value = `Rp ${fmtRp(section.grandTotal.total)}`;
    r3value.font = { bold: true, size: 11 };
    r3value.alignment = { horizontal: "right", vertical: "middle" };
    ws.getRow(3).height = 20;

    // Row 4 — Periode
    ws.mergeCells(4, 1, 4, numCols);
    const r4 = ws.getCell(4, 1);
    r4.value = `Periode: ${periodLabel}`;
    r4.font = { italic: true, size: 9.5, color: { argb: "FF555555" } };
    r4.alignment = { horizontal: "left", vertical: "middle" };

    ws.addRow([]); // row 5 spacer

    // Row 6 — table header
    const headerRow = ws.addRow(["Minggu", "Driver", "Gasoline", "Toll", "Parking", "Other", "Total"]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TABLE_HEAD_FILL } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: BORDER_COLOR } },
        bottom: { style: "thin", color: { argb: BORDER_COLOR } },
        left: { style: "thin", color: { argb: BORDER_COLOR } },
        right: { style: "thin", color: { argb: BORDER_COLOR } },
      };
    });

    // Data rows
    section.rows.forEach((r) => {
      const row = ws.addRow([r.weekLabel, r.driver, r.gasoline, r.toll, r.parking, r.other, r.total]);
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFDDDDDD" } },
          bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
          left: { style: "thin", color: { argb: "FFDDDDDD" } },
          right: { style: "thin", color: { argb: "FFDDDDDD" } },
        };
        if (colNumber >= 3) {
          cell.numFmt = "#,##0";
          cell.alignment = { horizontal: "right" };
        }
      });
    });

    // Grand total row
    const totalRow = ws.addRow([
      "",
      "Grand Total",
      section.grandTotal.gasoline,
      section.grandTotal.toll,
      section.grandTotal.parking,
      section.grandTotal.other,
      section.grandTotal.total,
    ]);
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F4F8" } };
      cell.border = {
        top: { style: "double", color: { argb: BORDER_COLOR } },
      };
      if (colNumber >= 3) {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right" };
      }
    });

    if (section.rows.length === 0) {
      ws.addRow(["-", "Tidak ada data klaim pada periode/kelompok ini", "", "", "", "", ""]);
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `CIKOPS_WeeklyRecap_Klaim_${safeFileLabel(periodLabel)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════
   PDF EXPORT — same house style as the main Report export
════════════════════════════════════════════════════════════ */

type RGB = [number, number, number];
const COLOR_NAVY: RGB = [11, 30, 77];
const COLOR_BRAND: RGB = [46, 91, 255];
const COLOR_GRAY: RGB = [100, 110, 130];
const COLOR_LIGHT_BG: RGB = [247, 249, 253];
const COLOR_HEADER_BG: RGB = [217, 226, 243];

export async function exportWeeklyRecapToPdf(
  sections: WeeklyRecapSection[],
  periodLabel: string
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;

  const visibleSections = sections.filter((s) => s.rows.length > 0 || sections.length === 1);

  visibleSections.forEach((section, idx) => {
    if (idx > 0) doc.addPage();

    // Header block — company name + doc title, shaded background
    doc.setFillColor(...COLOR_HEADER_BG);
    doc.rect(marginX, 30, pageWidth - marginX * 2, 46, "F");
    doc.setTextColor(...COLOR_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(COMPANY_NAME, pageWidth / 2, 48, { align: "center" });
    doc.setFontSize(10.5);
    doc.text(recapDocTitle(), pageWidth / 2, 65, { align: "center" });

    // Section title (left) + Total Claim (right)
    const rowY = 92;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(20, 26, 50);
    doc.text(section.title, marginX, rowY);
    doc.setFontSize(9.5);
    doc.text("Total Claim", pageWidth - marginX - 100, rowY, { align: "right" });
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_BRAND);
    doc.text(`Rp ${fmtRp(section.grandTotal.total)}`, pageWidth - marginX, rowY, { align: "right" });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_GRAY);
    doc.text(`Periode: ${periodLabel}`, marginX, rowY + 14);

    const bodyRows = section.rows.map((r) => [
      r.weekLabel,
      r.driver,
      `Rp ${fmtRp(r.gasoline)}`,
      `Rp ${fmtRp(r.toll)}`,
      `Rp ${fmtRp(r.parking)}`,
      `Rp ${fmtRp(r.other)}`,
      `Rp ${fmtRp(r.total)}`,
    ]);

    autoTable(doc, {
      startY: rowY + 24,
      margin: { left: marginX, right: marginX },
      head: [["Minggu", "Driver", "Gasoline", "Toll", "Parking", "Other", "Total"]],
      body:
        bodyRows.length > 0
          ? bodyRows
          : [["-", "Tidak ada data klaim pada periode/kelompok ini", "", "", "", "", ""]],
      foot: [
        [
          "",
          "Grand Total",
          `Rp ${fmtRp(section.grandTotal.gasoline)}`,
          `Rp ${fmtRp(section.grandTotal.toll)}`,
          `Rp ${fmtRp(section.grandTotal.parking)}`,
          `Rp ${fmtRp(section.grandTotal.other)}`,
          `Rp ${fmtRp(section.grandTotal.total)}`,
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
    });
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_GRAY);
    doc.text(
      "CIKOPS Fleet OS — Rekap dibuat otomatis dari data sistem. Nominal per kategori adalah total penjumlahan (bukan rincian per struk).",
      marginX,
      pageHeight - 16
    );
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - marginX, pageHeight - 16, { align: "right" });
  }

  doc.save(`CIKOPS_WeeklyRecap_Klaim_${safeFileLabel(periodLabel)}.pdf`);
}
