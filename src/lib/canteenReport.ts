export interface CanteenDayAgg {
  date: string;
  snackOrder: number;
  snackLeftover: number;
  snackConsumed: number;
  mealOrder: number;
  mealLeftover: number;
  mealConsumed: number;
}

export interface CanteenTotals {
  snackOrder: number;
  snackLeftover: number;
  snackConsumed: number;
  snackEff: number;
  mealOrder: number;
  mealLeftover: number;
  mealConsumed: number;
  mealEff: number;
  overallOrder: number;
  overallConsumed: number;
  overallEff: number;
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

/* ════════════════════════════════════════════════════════════
   PDF EXPORT — jsPDF + jspdf-autotable, same libraries/pattern
   already used by lib/report.ts for the Tasks report.
════════════════════════════════════════════════════════════ */

type RGB = [number, number, number];
const COLOR_NAVY: RGB = [11, 30, 77];
const COLOR_GREEN: RGB = [0, 184, 107];
const COLOR_BRAND: RGB = [46, 91, 255];
const COLOR_RED: RGB = [255, 59, 92];
const COLOR_GRAY: RGB = [100, 110, 130];
const COLOR_LIGHT_BG: RGB = [247, 249, 253];
const COLOR_LIGHT_BORDER: RGB = [222, 227, 240];

export async function exportCanteenToPdf(
  dayAggs: CanteenDayAgg[],
  totals: CanteenTotals,
  periodLabel: string,
  autoAnalysis: string,
  rangeFrom: string,
  rangeTo: string
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;

  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  function drawHeader() {
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(0, 0, pageWidth, 64, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("CIKOPS-FM — CANTEEN REPORT", marginX, 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Periode: ${periodLabel}`, marginX, 44);
    doc.setFontSize(8);
    doc.text(`Dibuat ${generatedAt}`, pageWidth - marginX, 27, { align: "right" });
  }

  function drawStatCard(x: number, y: number, w: number, h: number, label: string, value: string, accent: RGB) {
    doc.setFillColor(...accent);
    doc.rect(x, y, w, 3, "F");
    doc.setDrawColor(...COLOR_LIGHT_BORDER);
    doc.setFillColor(...COLOR_LIGHT_BG);
    doc.rect(x, y + 3, w, h - 3, "FD");
    doc.setTextColor(...COLOR_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(value, x + 10, y + h / 2 + 4);
    doc.setTextColor(...COLOR_GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label, x + 10, y + h - 7);
  }

  function drawSectionTitle(x: number, y: number, text: string) {
    doc.setFillColor(...COLOR_BRAND);
    doc.rect(x, y - 9, 3, 11, "F");
    doc.setTextColor(...COLOR_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(text, x + 9, y);
  }

  function drawFooter() {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_GRAY);
    doc.text("CIKOPS-FM — Laporan dibuat otomatis dari data sistem", marginX, pageHeight - 16);
  }

  drawHeader();
  let y = 96;
  drawSectionTitle(marginX, y, "Ringkasan Snack");
  y += 16;

  const gap = 10;
  const snackCards: Array<[string, string, RGB]> = [
    ["Ordered", fmtRp(totals.snackOrder), COLOR_GRAY],
    ["Consumed", fmtRp(totals.snackConsumed), COLOR_GREEN],
    ["Leftover", fmtRp(totals.snackLeftover), COLOR_RED],
    ["Efficiency", `${totals.snackEff.toFixed(2)}%`, COLOR_GREEN],
  ];
  const cardW = (contentWidth - gap * (snackCards.length - 1)) / snackCards.length;
  const cardH = 50;
  snackCards.forEach(([label, value, accent], i) => drawStatCard(marginX + i * (cardW + gap), y, cardW, cardH, label, value, accent));
  y += cardH + 24;

  drawSectionTitle(marginX, y, "Ringkasan Meal");
  y += 16;
  const mealCards: Array<[string, string, RGB]> = [
    ["Ordered", fmtRp(totals.mealOrder), COLOR_GRAY],
    ["Consumed", fmtRp(totals.mealConsumed), COLOR_BRAND],
    ["Leftover", fmtRp(totals.mealLeftover), COLOR_RED],
    ["Efficiency", `${totals.mealEff.toFixed(2)}%`, COLOR_BRAND],
  ];
  mealCards.forEach(([label, value, accent], i) => drawStatCard(marginX + i * (cardW + gap), y, cardW, cardH, label, value, accent));
  y += cardH + 24;

  drawSectionTitle(marginX, y, "Overall");
  y += 16;
  const overallCards: Array<[string, string, RGB]> = [
    ["Total Ordered", fmtRp(totals.overallOrder), COLOR_GRAY],
    ["Total Consumed", fmtRp(totals.overallConsumed), COLOR_GREEN],
    ["Overall Efficiency", `${totals.overallEff.toFixed(1)}%`, COLOR_BRAND],
  ];
  const overallCardW = (contentWidth - gap * (overallCards.length - 1)) / overallCards.length;
  overallCards.forEach(([label, value, accent], i) => drawStatCard(marginX + i * (overallCardW + gap), y, overallCardW, cardH, label, value, accent));
  y += cardH + 22;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_GRAY);
  const analysisLines = doc.splitTextToSize(`Analisis: ${autoAnalysis}`, contentWidth);
  doc.text(analysisLines, marginX, y);

  drawFooter();

  // ── Halaman 2 — detail harian ──
  doc.addPage();
  drawHeader();
  y = 96;
  drawSectionTitle(marginX, y, "Detail Harian");

  const rows = dayAggs.map((d) => [
    d.date,
    fmtRp(d.snackOrder), fmtRp(d.snackLeftover), fmtRp(d.snackConsumed),
    fmtRp(d.mealOrder), fmtRp(d.mealLeftover), fmtRp(d.mealConsumed),
  ]);

  autoTable(doc, {
    startY: y + 14,
    margin: { left: marginX, right: marginX },
    head: [["Tanggal", "Snack Order", "Snack Sisa", "Snack Terpakai", "Meal Order", "Meal Sisa", "Meal Terpakai"]],
    body: rows.length > 0 ? rows : [["Tidak ada data pada periode ini", "", "", "", "", "", ""]],
    theme: "grid",
    headStyles: { fillColor: COLOR_BRAND, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [20, 26, 50] },
    alternateRowStyles: { fillColor: COLOR_LIGHT_BG },
    didDrawPage: () => drawFooter(),
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_GRAY);
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - marginX, pageHeight - 16, { align: "right" });
  }

  doc.save(`Canteen_Report_${rangeFrom}_to_${rangeTo}.pdf`);
}

/* ════════════════════════════════════════════════════════════
   PPTX EXPORT — pptxgenjs (NEW dependency — run `npm install
   pptxgenjs` before this compiles). Focuses on the visual summary +
   native charts, which is what a PPT deck is naturally good for; the
   full day-by-day table stays in the PDF/CSV export since PPTX
   tables don't paginate automatically the way a PDF table does.
════════════════════════════════════════════════════════════ */

export async function exportCanteenToPptx(
  dayAggs: CanteenDayAgg[],
  totals: CanteenTotals,
  periodLabel: string,
  autoAnalysis: string,
  rangeFrom: string,
  rangeTo: string
): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();

  const navy = "0B1E4D";
  const brand = "3D6FF2";
  const green = "17A673";
  const red = "E0483F";
  const gray = "64748B";

  // ── Slide 1: Title ──
  const s1 = pres.addSlide();
  s1.background = { color: navy };
  s1.addText("CIKOPS-FM", { x: 0.5, y: 1.6, w: 9, h: 0.6, fontSize: 20, bold: true, color: "FFFFFF" });
  s1.addText("Canteen Operations Report", { x: 0.5, y: 2.2, w: 9, h: 0.8, fontSize: 30, bold: true, color: "FFFFFF" });
  s1.addText(`Periode: ${periodLabel}`, { x: 0.5, y: 3.05, w: 9, h: 0.4, fontSize: 14, color: "C7D2FE" });
  s1.addText(
    `Dibuat ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`,
    { x: 0.5, y: 3.4, w: 9, h: 0.4, fontSize: 11, color: "94A3B8" }
  );

  // ── Slide 2: Summary table + auto analysis ──
  const s2 = pres.addSlide();
  s2.addText("Ringkasan Operasional", { x: 0.4, y: 0.3, w: 9, h: 0.5, fontSize: 22, bold: true, color: navy });

  const headStyle = { bold: true, fill: { color: navy }, color: "FFFFFF", fontSize: 11 };
  const summaryRows = [
    [
      { text: "Kategori", options: headStyle },
      { text: "Ordered", options: headStyle },
      { text: "Consumed", options: headStyle },
      { text: "Leftover", options: headStyle },
      { text: "Efficiency", options: headStyle },
    ],
    ["Snack", fmtRp(totals.snackOrder), fmtRp(totals.snackConsumed), fmtRp(totals.snackLeftover), `${totals.snackEff.toFixed(2)}%`],
    ["Meal", fmtRp(totals.mealOrder), fmtRp(totals.mealConsumed), fmtRp(totals.mealLeftover), `${totals.mealEff.toFixed(2)}%`],
    [
      { text: "Overall", options: { bold: true } },
      { text: fmtRp(totals.overallOrder), options: { bold: true } },
      { text: fmtRp(totals.overallConsumed), options: { bold: true } },
      "-",
      { text: `${totals.overallEff.toFixed(1)}%`, options: { bold: true } },
    ],
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s2.addTable(summaryRows as any, { x: 0.4, y: 1.0, w: 9.2, fontSize: 12, border: { type: "solid", color: "E2E8F0", pt: 0.5 } });

  s2.addText(`💡 ${autoAnalysis}`, {
    x: 0.4, y: 3.0, w: 9.2, h: 1.5, fontSize: 11, color: gray, italic: true,
    fill: { color: "F7FBFE" }, align: "left", valign: "top", margin: 10,
  });

  // ── Slides 3-4: trend charts (native PPTX charts, only if there's data) ──
  if (dayAggs.length > 0) {
    const labels = dayAggs.map((d) => d.date.slice(5));

    const s3 = pres.addSlide();
    s3.addText("Snack — Tren Harian", { x: 0.4, y: 0.3, w: 9, h: 0.5, fontSize: 20, bold: true, color: navy });
    s3.addChart(
      pres.ChartType.bar,
      [
        { name: "Ordered", labels, values: dayAggs.map((d) => d.snackOrder) },
        { name: "Consumed", labels, values: dayAggs.map((d) => d.snackConsumed) },
        { name: "Leftover", labels, values: dayAggs.map((d) => d.snackLeftover) },
      ],
      { x: 0.4, y: 1.0, w: 9.2, h: 4.2, barGrouping: "clustered", showLegend: true, legendPos: "b", chartColors: [gray, green, red] }
    );

    const s4 = pres.addSlide();
    s4.addText("Meal — Tren Harian", { x: 0.4, y: 0.3, w: 9, h: 0.5, fontSize: 20, bold: true, color: navy });
    s4.addChart(
      pres.ChartType.bar,
      [
        { name: "Ordered", labels, values: dayAggs.map((d) => d.mealOrder) },
        { name: "Consumed", labels, values: dayAggs.map((d) => d.mealConsumed) },
        { name: "Leftover", labels, values: dayAggs.map((d) => d.mealLeftover) },
      ],
      { x: 0.4, y: 1.0, w: 9.2, h: 4.2, barGrouping: "clustered", showLegend: true, legendPos: "b", chartColors: [gray, brand, red] }
    );
  }

  await pres.writeFile({ fileName: `Canteen_Report_${rangeFrom}_to_${rangeTo}.pptx` });
}
