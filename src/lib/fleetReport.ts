import type { Claim, Overtime, Vehicle, Kantong, DriverTier, Plant } from "./types";

/* ════════════════════════════════════════════════════════════
   Period filtering — shared by both the UI (ReportsTab) and the
   export functions below, so what you see on screen always matches
   exactly what gets exported.
════════════════════════════════════════════════════════════ */
export type ReportPeriodMode = "month" | "range" | "year";

export interface ReportPeriod {
  mode: ReportPeriodMode;
  month: number; // 0-indexed, used when mode==="month"
  year: number; // used when mode==="month" or mode==="year"
  dateFrom: string; // yyyy-mm-dd, used when mode==="range"
  dateTo: string; // yyyy-mm-dd, used when mode==="range"
}

export function periodLabel(p: ReportPeriod, months: string[]): string {
  if (p.mode === "month") return `${months[p.month]} ${p.year}`;
  if (p.mode === "year") return String(p.year);
  return `${p.dateFrom} s/d ${p.dateTo}`;
}

function claimInPeriod(c: Claim, p: ReportPeriod): boolean {
  const d = new Date(c.periodDate);
  if (isNaN(d.getTime())) return false;
  if (p.mode === "month") return d.getMonth() === p.month && d.getFullYear() === p.year;
  if (p.mode === "year") return d.getFullYear() === p.year;
  const from = new Date(p.dateFrom);
  const to = new Date(p.dateTo);
  to.setHours(23, 59, 59, 999);
  return d >= from && d <= to;
}

function overtimeInPeriod(o: Overtime, p: ReportPeriod): boolean {
  // Overtime is stored per-month ("YYYY-MM"), not an exact date, so we
  // compare against the 1st of that month.
  const d = new Date(`${o.period}-01`);
  if (isNaN(d.getTime())) return false;
  if (p.mode === "month") return d.getMonth() === p.month && d.getFullYear() === p.year;
  if (p.mode === "year") return d.getFullYear() === p.year;
  const from = new Date(p.dateFrom);
  const to = new Date(p.dateTo);
  return d >= from && d <= to;
}

export interface FleetReportData {
  period: ReportPeriod;
  claims: Claim[];
  overtimes: Overtime[];
  vehicles: Vehicle[];
  kantong: Kantong | null;
  tiers: DriverTier[];
}

export function buildFleetReportData(
  period: ReportPeriod,
  allClaims: Claim[],
  allOvertimes: Overtime[],
  vehicles: Vehicle[],
  kantong: Kantong | null,
  tiers: DriverTier[]
): FleetReportData {
  return {
    period,
    claims: allClaims.filter((c) => claimInPeriod(c, period)),
    overtimes: allOvertimes.filter((o) => overtimeInPeriod(o, period)),
    vehicles,
    kantong,
    tiers,
  };
}

/* ════════════════════════════════════════════════════════════
   CSV EXPORT — three sections in one file (Claims / Overtime / Vehicles),
   separated by a blank line and a header row, so it opens cleanly in
   Excel/Sheets as one workbook.
════════════════════════════════════════════════════════════ */
function escapeCsv(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportFleetReportToCsv(data: FleetReportData, months: string[]): void {
  const lines: string[] = [];
  const label = periodLabel(data.period, months);

  lines.push(escapeCsv(`LAPORAN FLEETOS — ${label}`));
  lines.push("");

  lines.push(escapeCsv("=== KLAIM ==="));
  lines.push(["Periode", "Tanggal Pengajuan", "Driver", "Jenis", "Nominal"].map(escapeCsv).join(","));
  data.claims.forEach((c) => {
    c.items.forEach((item) => {
      lines.push([c.periodDate, c.submissionDate, c.driverName, item.type, item.total].map(escapeCsv).join(","));
    });
  });
  lines.push(["", "", "", "TOTAL", data.claims.reduce((s, c) => s + c.total, 0)].map(escapeCsv).join(","));
  lines.push("");

  lines.push(escapeCsv("=== OVERTIME ==="));
  lines.push(["Periode", "Driver", "Plant", "Jam", "Nominal", "Alasan"].map(escapeCsv).join(","));
  data.overtimes.forEach((o) => {
    lines.push([o.period, o.driverName, o.plant, o.hours, o.amount, o.reason].map(escapeCsv).join(","));
  });
  lines.push(["", "", "", "TOTAL", data.overtimes.reduce((s, o) => s + o.amount, 0), ""].map(escapeCsv).join(","));
  lines.push("");

  lines.push(escapeCsv("=== ARMADA (snapshot saat ini) ==="));
  lines.push(["Plat Nomor", "Tipe", "Status", "KIR", "Service", "STNK"].map(escapeCsv).join(","));
  data.vehicles.forEach((v) => {
    lines.push(
      [v.nopol, v.jenis, v.aktif ? "Aktif" : "Maintenance", v.kir_date, v.service_date, v.stnk_date]
        .map(escapeCsv)
        .join(",")
    );
  });

  if (data.kantong) {
    lines.push("");
    lines.push(escapeCsv("=== DANA OPERASIONAL (periode berjalan) ==="));
    lines.push(["Total Budget", "Alokasi Op Driver", "Alokasi Emergency", "Cash Available", "Claim Diajukan", "Claim Dibayar"].map(escapeCsv).join(","));
    lines.push(
      [data.kantong.totalBudget, data.kantong.allocOpDriver, data.kantong.allocEmergency, data.kantong.cashAvailable, data.kantong.claimSubmitted, data.kantong.claimPaid]
        .map(escapeCsv)
        .join(",")
    );
  }

  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `FleetOS_Report_${label.replace(/\s/g, "_")}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════
   PDF EXPORT — Sky & Gold themed, same jsPDF/autoTable stack already
   used by report.ts (Tasks report), so no new dependency is introduced.
════════════════════════════════════════════════════════════ */
type RGB = [number, number, number];
const NAVY: RGB = [20, 49, 92];
const BRAND: RGB = [0, 174, 239];
const GOLD: RGB = [216, 169, 78];
const GREEN: RGB = [26, 160, 107];
const ORANGE: RGB = [226, 134, 26];
const GRAY: RGB = [100, 112, 133];
const LIGHT_BG: RGB = [247, 250, 253];
const LIGHT_BORDER: RGB = [222, 232, 245];

export async function exportFleetReportToPdf(data: FleetReportData, months: string[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;
  const label = periodLabel(data.period, months);

  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function drawPageHeader(subtitle: string) {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, 64, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("CIKOPS FLEET OS", marginX, 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(subtitle, marginX, 44);
    doc.setFontSize(8);
    doc.text(`Periode ${label}`, pageWidth - marginX, 27, { align: "right" });
    doc.text(`Dibuat ${generatedAt}`, pageWidth - marginX, 40, { align: "right" });
  }

  function drawFooter() {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text("CIKOPS Fleet OS — Laporan gabungan seluruh modul, dibuat otomatis", marginX, pageHeight - 16);
  }

  function drawStatCard(x: number, y: number, w: number, h: number, lbl: string, value: string, accent: RGB) {
    doc.setFillColor(...accent);
    doc.rect(x, y, w, 3, "F");
    doc.setDrawColor(...LIGHT_BORDER);
    doc.setFillColor(...LIGHT_BG);
    doc.rect(x, y + 3, w, h - 3, "FD");
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(value, x + 12, y + h / 2 + 4);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(lbl, x + 12, y + h - 8);
  }

  function drawSectionTitle(x: number, y: number, text: string) {
    doc.setFillColor(...BRAND);
    doc.rect(x, y - 9, 3, 11, "F");
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(text, x + 9, y);
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n || 0));

  /* ── Page 1: Summary ── */
  drawPageHeader("Laporan Komprehensif — Klaim, Overtime, Armada, Dana Operasional");
  let y = 96;
  drawSectionTitle(marginX, y, "Ringkasan Keseluruhan");
  y += 18;

  const totalClaims = data.claims.reduce((s, c) => s + c.total, 0);
  const totalOtHours = data.overtimes.reduce((s, o) => s + o.hours, 0);
  const totalOtAmount = data.overtimes.reduce((s, o) => s + o.amount, 0);
  const activeVehicles = data.vehicles.filter((v) => v.aktif).length;
  const totalTierBudget = data.tiers.reduce((s, t) => s + t.amountPerMonth * t.activeDriverCount, 0);

  const cards: Array<[string, string, RGB]> = [
    ["Total Klaim", fmtRp(totalClaims), BRAND],
    ["Total Jam OT", `${new Intl.NumberFormat("id-ID").format(totalOtHours)} jam`, GOLD],
    ["Nominal OT", fmtRp(totalOtAmount), GOLD],
    ["Kendaraan Aktif", `${activeVehicles}/${data.vehicles.length}`, GREEN],
    ["Budget Driver/Bulan", fmtRp(totalTierBudget), NAVY],
  ];
  const gap = 8;
  const cardW = (contentWidth - gap * (cards.length - 1)) / cards.length;
  const cardH = 56;
  cards.forEach(([lbl, value, accent], i) => {
    drawStatCard(marginX + i * (cardW + gap), y, cardW, cardH, lbl, value, accent);
  });
  y += cardH + 26;

  if (data.kantong) {
    drawSectionTitle(marginX, y, "Dana Operasional (Periode Berjalan)");
    y += 14;
    const totalAlokasi = data.kantong.allocOpDriver + data.kantong.allocEmergency;
    const outstanding = totalAlokasi + data.kantong.cashAvailable + data.kantong.claimSubmitted + data.kantong.claimPaid;
    const gapVal = outstanding - data.kantong.totalBudget;
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Total Cash", "Alokasi Op Driver", "Alokasi Emergency", "Cash Available", "Claim Diajukan", "Claim Dibayar", "Outstanding", "GAP"]],
      body: [[
        fmtRp(data.kantong.totalBudget),
        fmtRp(data.kantong.allocOpDriver),
        fmtRp(data.kantong.allocEmergency),
        fmtRp(data.kantong.cashAvailable),
        fmtRp(data.kantong.claimSubmitted),
        fmtRp(data.kantong.claimPaid),
        fmtRp(outstanding),
        `${gapVal >= 0 ? "+" : ""}${fmtRp(gapVal)}`,
      ]],
      theme: "grid",
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26;
  }

  drawSectionTitle(marginX, y, "Perbandingan Overtime — CIK vs PRB");
  y += 14;
  const plants: Plant[] = ["CIK", "PRB"];
  const plantRows = plants.map((p) => {
    const rows = data.overtimes.filter((o) => o.plant === p);
    const hours = rows.reduce((s, o) => s + o.hours, 0);
    const amount = rows.reduce((s, o) => s + o.amount, 0);
    return [p, String(rows.length), `${hours} jam`, fmtRp(amount)];
  });
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Plant", "Jumlah Entri", "Total Jam", "Total Nominal"]],
    body: plantRows,
    theme: "grid",
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    alternateRowStyles: { fillColor: LIGHT_BG },
  });

  drawFooter();

  /* ── Page 2: Claims detail ── */
  doc.addPage();
  drawPageHeader("Detail Klaim");
  y = 96;
  drawSectionTitle(marginX, y, `Detail Klaim (${data.claims.length} entri)`);
  const claimRows: (string | number)[][] = [];
  data.claims.forEach((c) => {
    c.items.forEach((item, idx) => {
      claimRows.push([
        idx === 0 ? c.periodDate : "",
        idx === 0 ? c.driverName : "",
        item.type,
        item.expr,
        fmtRp(item.total),
      ]);
    });
  });
  autoTable(doc, {
    startY: y + 14,
    margin: { left: marginX, right: marginX },
    head: [["Periode", "Driver", "Jenis", "Rincian", "Nominal"]],
    body: claimRows.length > 0 ? claimRows : [["Tidak ada data klaim pada periode ini", "", "", "", ""]],
    foot: [["", "", "", "TOTAL", fmtRp(totalClaims)]],
    theme: "grid",
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    footStyles: { fillColor: LIGHT_BG, textColor: NAVY, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    alternateRowStyles: { fillColor: LIGHT_BG },
  });
  drawFooter();

  /* ── Page 3: Overtime detail ── */
  doc.addPage();
  drawPageHeader("Detail Overtime");
  y = 96;
  drawSectionTitle(marginX, y, `Detail Overtime (${data.overtimes.length} entri)`);
  const otRows = data.overtimes.map((o) => [o.period, o.driverName, o.plant, `${o.hours} jam`, fmtRp(o.amount), o.reason || "-"]);
  autoTable(doc, {
    startY: y + 14,
    margin: { left: marginX, right: marginX },
    head: [["Periode", "Driver", "Plant", "Jam", "Nominal", "Alasan"]],
    body: otRows.length > 0 ? otRows : [["Tidak ada data overtime pada periode ini", "", "", "", "", ""]],
    foot: [["", "", "", `${totalOtHours} jam`, fmtRp(totalOtAmount), ""]],
    theme: "grid",
    headStyles: { fillColor: GOLD, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    footStyles: { fillColor: LIGHT_BG, textColor: NAVY, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    alternateRowStyles: { fillColor: LIGHT_BG },
  });
  drawFooter();

  /* ── Page 4: Vehicles snapshot ── */
  doc.addPage();
  drawPageHeader("Snapshot Armada (kondisi saat ini)");
  y = 96;
  drawSectionTitle(marginX, y, `Daftar Kendaraan (${data.vehicles.length})`);
  const vehicleRows = data.vehicles.map((v) => [
    v.nopol,
    v.jenis || "-",
    v.aktif ? "Aktif" : "Maintenance",
    v.kir_date || "-",
    v.service_date || "-",
    v.stnk_date || "-",
  ]);
  autoTable(doc, {
    startY: y + 14,
    margin: { left: marginX, right: marginX },
    head: [["Plat Nomor", "Tipe", "Status", "KIR", "Service", "STNK"]],
    body: vehicleRows.length > 0 ? vehicleRows : [["Belum ada data kendaraan", "", "", "", "", ""]],
    theme: "grid",
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    alternateRowStyles: { fillColor: LIGHT_BG },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 2) {
        const status = hookData.cell.raw as string;
        if (status === "Maintenance") hookData.cell.styles.textColor = ORANGE;
        else if (status === "Aktif") hookData.cell.styles.textColor = GREEN;
      }
    },
  });
  drawFooter();

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - marginX, pageHeight - 16, { align: "right" });
  }

  doc.save(`FleetOS_Report_${label.replace(/\s/g, "_")}.pdf`);
}
