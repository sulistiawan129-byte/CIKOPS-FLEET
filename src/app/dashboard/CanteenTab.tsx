"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useLang } from "@/lib/providers";
import { getAllCanteenReports, deleteCanteenReport } from "@/lib/api";
import type { CanteenReport } from "@/lib/types";

/* ════════════════════════════════════════════════════════════
   CANTEEN DASHBOARD — self-contained (own styles/helpers), covering:
     - Period filter: Day / Week / Month / Custom
     - Snack / Meal / Overall summary cards (Ordered, Consumed,
       Leftover, Efficiency)
     - Auto-generated text analysis
     - Daily trend chart per category, Bar/Line toggle
     - Period summary block per category
     - CSV export
     - Daily detail list (existing feature, kept)
   Daily entry itself now lives on the public /canteen page — this
   tab is admin/read-only + delete, matching the Locker module split.
════════════════════════════════════════════════════════════ */

type PeriodMode = "day" | "week" | "month" | "custom";

interface DayAgg {
  date: string;
  snackOrder: number;
  snackLeftover: number;
  snackConsumed: number;
  mealOrder: number;
  mealLeftover: number;
  mealConsumed: number;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekRangeOf(dateStr: string): { from: string; to: string } {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toISO(monday), to: toISO(sunday) };
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

function fmtDateShort(iso: string, lang: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

function fmtDateFull(iso: string, lang: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function toDayAgg(r: CanteenReport): DayAgg {
  const snackOrder = r.snackOrder[0] + r.snackOrder[1] + r.snackOrder[2];
  const snackLeftover = r.snackLeftover[0] + r.snackLeftover[1] + r.snackLeftover[2];
  const mealOrder = r.mealOrder[0] + r.mealOrder[1] + r.mealOrder[2];
  const mealLeftover = r.mealLeftover[0] + r.mealLeftover[1] + r.mealLeftover[2];
  return {
    date: r.reportDate,
    snackOrder,
    snackLeftover,
    snackConsumed: Math.max(0, snackOrder - snackLeftover),
    mealOrder,
    mealLeftover,
    mealConsumed: Math.max(0, mealOrder - mealLeftover),
  };
}

function effOf(consumed: number, order: number): number {
  return order > 0 ? (consumed / order) * 100 : 0;
}

function healthLabel(eff: number, lang: string): string {
  if (eff >= 97) return lang === "en" ? "Excellent" : "Sangat Baik";
  if (eff >= 90) return lang === "en" ? "Good" : "Baik";
  if (eff >= 80) return lang === "en" ? "Normal" : "Cukup";
  return lang === "en" ? "Needs Attention" : "Perlu Perhatian";
}

const cardStyle: CSSProperties = {
  background: "linear-gradient(180deg, var(--surface2), var(--surface))",
  border: "1px solid var(--border2)",
  borderRadius: "var(--r2)",
  boxShadow: "var(--shadow-md)",
};

export default function CanteenTab() {
  const { lang, t } = useLang();
  const now = new Date();

  const [allRows, setAllRows] = useState<CanteenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CanteenReport | null>(null);
  const [chartMode, setChartMode] = useState<"bar" | "line">("line");

  const [mode, setMode] = useState<PeriodMode>("month");
  const [dayValue, setDayValue] = useState(toISO(now));
  const [monthValue, setMonthValue] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return toISO(d);
  });
  const [customTo, setCustomTo] = useState(toISO(now));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAllRows(await getAllCanteenReports());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data kantin");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteCanteenReport(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus laporan");
    }
  }

  // ── Resolve the active [from, to] range + label from the selected mode ──
  const { rangeFrom, rangeTo, periodLabel } = useMemo(() => {
    if (mode === "day") {
      return { rangeFrom: dayValue, rangeTo: dayValue, periodLabel: fmtDateFull(dayValue, lang) };
    }
    if (mode === "week") {
      const { from, to } = weekRangeOf(dayValue);
      return { rangeFrom: from, rangeTo: to, periodLabel: `${fmtDateShort(from, lang)} – ${fmtDateShort(to, lang)}` };
    }
    if (mode === "custom") {
      return { rangeFrom: customFrom, rangeTo: customTo, periodLabel: `${fmtDateShort(customFrom, lang)} – ${fmtDateShort(customTo, lang)}` };
    }
    // month
    const from = `${monthValue}-01`;
    const [y, m] = monthValue.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${monthValue}-${String(lastDay).padStart(2, "0")}`;
    const label = new Date(y, m - 1, 1).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { month: "long", year: "numeric" });
    return { rangeFrom: from, rangeTo: to, periodLabel: label };
  }, [mode, dayValue, monthValue, customFrom, customTo, lang]);

  const filteredRows = useMemo(
    () => allRows.filter((r) => r.reportDate >= rangeFrom && r.reportDate <= rangeTo),
    [allRows, rangeFrom, rangeTo]
  );

  const dayAggs = useMemo(() => filteredRows.map(toDayAgg).sort((a, b) => (a.date < b.date ? -1 : 1)), [filteredRows]);

  const totals = useMemo(() => {
    const snackOrder = dayAggs.reduce((s, d) => s + d.snackOrder, 0);
    const snackLeftover = dayAggs.reduce((s, d) => s + d.snackLeftover, 0);
    const snackConsumed = dayAggs.reduce((s, d) => s + d.snackConsumed, 0);
    const mealOrder = dayAggs.reduce((s, d) => s + d.mealOrder, 0);
    const mealLeftover = dayAggs.reduce((s, d) => s + d.mealLeftover, 0);
    const mealConsumed = dayAggs.reduce((s, d) => s + d.mealConsumed, 0);
    const snackEff = effOf(snackConsumed, snackOrder);
    const mealEff = effOf(mealConsumed, mealOrder);
    const overallOrder = snackOrder + mealOrder;
    const overallConsumed = snackConsumed + mealConsumed;
    const overallEff = effOf(overallConsumed, overallOrder);
    return { snackOrder, snackLeftover, snackConsumed, snackEff, mealOrder, mealLeftover, mealConsumed, mealEff, overallOrder, overallConsumed, overallEff };
  }, [dayAggs]);

  const autoAnalysis = useMemo(() => {
    if (dayAggs.length === 0) {
      return lang === "en" ? "No data recorded for this period yet." : "Belum ada data tercatat pada periode ini.";
    }
    const snackPeak = dayAggs.reduce((best, d) => (d.snackLeftover > best.snackLeftover ? d : best), dayAggs[0]);
    const mealPeak = dayAggs.reduce((best, d) => (d.mealLeftover > best.mealLeftover ? d : best), dayAggs[0]);
    const label = healthLabel(totals.overallEff, lang);
    if (lang === "en") {
      return `${periodLabel} — Snack ${totals.snackEff.toFixed(2)}% (peak leftover ${fmtRp(snackPeak.snackLeftover)} on ${fmtDateShort(snackPeak.date, lang)}) · Meal ${totals.mealEff.toFixed(2)}% (peak leftover ${fmtRp(mealPeak.mealLeftover)} on ${fmtDateShort(mealPeak.date, lang)}) · Overall ${totals.overallEff.toFixed(1)}% — ${label}.`;
    }
    return `${periodLabel} — Snack ${totals.snackEff.toFixed(2)}% (leftover tertinggi ${fmtRp(snackPeak.snackLeftover)} pada ${fmtDateShort(snackPeak.date, lang)}) · Meal ${totals.mealEff.toFixed(2)}% (leftover tertinggi ${fmtRp(mealPeak.mealLeftover)} pada ${fmtDateShort(mealPeak.date, lang)}) · Overall ${totals.overallEff.toFixed(1)}% — ${label}.`;
  }, [dayAggs, totals, periodLabel, lang]);

  function handleExportCsv() {
    const headers = ["Tanggal", "Snack Order", "Snack Leftover", "Snack Consumed", "Meal Order", "Meal Leftover", "Meal Consumed"];
    const lines = [headers.join(",")];
    dayAggs.forEach((d) => {
      lines.push([d.date, d.snackOrder, d.snackLeftover, d.snackConsumed, d.mealOrder, d.mealLeftover, d.mealConsumed].join(","));
    });
    lines.push("");
    lines.push(["TOTAL", totals.snackOrder, totals.snackLeftover, totals.snackConsumed, totals.mealOrder, totals.mealLeftover, totals.mealConsumed].join(","));
    const csvContent = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Canteen_Report_${rangeFrom}_to_${rangeTo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const inputStyle: CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t1)", fontSize: 13, fontFamily: "var(--font)" };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "var(--t3)" }}>{t.actionLoading}</div>;

  return (
    <div>
      {/* ── Period filter bar ── */}
      <div className="statPop" style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {(["day", "week", "month", "custom"] as PeriodMode[]).map((m) => (
            <button
              key={m}
              className="tabPill"
              onClick={() => setMode(m)}
              style={{
                padding: "7px 16px", borderRadius: "var(--pill)", border: mode === m ? "none" : "1px solid var(--border2)",
                background: mode === m ? "linear-gradient(135deg, var(--green), #0d8a4f)" : "transparent",
                color: mode === m ? "#fff" : "var(--t2)", fontWeight: 700, fontSize: 12.5, cursor: "pointer",
              }}
            >
              {m === "day" ? (lang === "en" ? "Day" : "Harian") : m === "week" ? (lang === "en" ? "Week" : "Mingguan") : m === "month" ? (lang === "en" ? "Month" : "Bulanan") : (lang === "en" ? "Custom" : "Kustom")}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={handleExportCsv} style={{ padding: "8px 16px", borderRadius: "var(--pill)", border: "1px solid var(--green)", background: "var(--green-soft)", color: "var(--green)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
            ⬇ CSV
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {(mode === "day" || mode === "week") && (
            <input className="premiumInput" style={inputStyle} type="date" value={dayValue} onChange={(e) => setDayValue(e.target.value)} />
          )}
          {mode === "month" && (
            <input className="premiumInput" style={inputStyle} type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
          )}
          {mode === "custom" && (
            <>
              <input className="premiumInput" style={inputStyle} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span style={{ color: "var(--t3)" }}>s/d</span>
              <input className="premiumInput" style={inputStyle} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
          <span style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600 }}>
            {lang === "en" ? "Period" : "Periode"}: <strong style={{ color: "var(--t1)" }}>{periodLabel}</strong>
          </span>
        </div>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      {/* ── Category cards: Snack / Meal ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <CategoryCard
          icon="🥐" title="Snack" color="var(--green)"
          ordered={totals.snackOrder} consumed={totals.snackConsumed} leftover={totals.snackLeftover} eff={totals.snackEff}
          lang={lang}
        />
        <CategoryCard
          icon="🍱" title="Meal" color="var(--brand)"
          ordered={totals.mealOrder} consumed={totals.mealConsumed} leftover={totals.mealLeftover} eff={totals.mealEff}
          lang={lang}
        />
      </div>

      {/* ── Overall ── */}
      <div className="statPop" style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Overall</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <MiniStat label={lang === "en" ? "Total Ordered" : "Total Order"} value={fmtRp(totals.overallOrder)} />
          <MiniStat label={lang === "en" ? "Total Consumed" : "Total Terpakai"} value={fmtRp(totals.overallConsumed)} color="var(--green)" />
          <MiniStat label={lang === "en" ? "Overall Efficiency" : "Efisiensi Keseluruhan"} value={`${totals.overallEff.toFixed(1)}%`} color={totals.overallEff >= 95 ? "var(--green)" : totals.overallEff >= 85 ? "var(--orange)" : "var(--red)"} />
        </div>
      </div>

      {/* ── Auto analysis ── */}
      <div className="statPop" style={{ ...cardStyle, borderLeft: "3px solid var(--gold)", padding: "14px 18px", marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)", marginBottom: 4 }}>💡 {lang === "en" ? "Auto Analysis" : "Analisis Otomatis"}</div>
        <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.6 }}>{autoAnalysis}</div>
      </div>

      {/* ── Trend charts ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <div style={{ display: "flex", borderRadius: "var(--pill)", border: "1px solid var(--border2)", padding: 3, gap: 2 }}>
          {(["bar", "line"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setChartMode(m)}
              style={{
                padding: "5px 14px", borderRadius: "var(--pill)", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700,
                background: chartMode === m ? "var(--brand)" : "transparent", color: chartMode === m ? "#fff" : "var(--t3)",
              }}
            >
              {m === "bar" ? (lang === "en" ? "Bar" : "Batang") : (lang === "en" ? "Line" : "Garis")}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 18 }}>
        <TrendChartCard
          title={lang === "en" ? "Snack — Daily Trend" : "Snack — Tren Harian"}
          data={dayAggs.map((d) => ({ label: fmtDateShort(d.date, lang), ordered: d.snackOrder, consumed: d.snackConsumed, leftover: d.snackLeftover }))}
          mode={chartMode}
          colors={{ ordered: "var(--t3)", consumed: "var(--green)", leftover: "var(--red)" }}
          lang={lang}
        />
        <TrendChartCard
          title={lang === "en" ? "Meal — Daily Trend" : "Meal — Tren Harian"}
          data={dayAggs.map((d) => ({ label: fmtDateShort(d.date, lang), ordered: d.mealOrder, consumed: d.mealConsumed, leftover: d.mealLeftover }))}
          mode={chartMode}
          colors={{ ordered: "var(--t3)", consumed: "var(--brand)", leftover: "var(--red)" }}
          lang={lang}
        />
      </div>

      {/* ── Period summary blocks ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <PeriodSummaryCard title={`🥐 Snack — ${lang === "en" ? "Period Summary" : "Ringkasan Periode"}`} periodLabel={periodLabel} order={totals.snackOrder} consumed={totals.snackConsumed} leftover={totals.snackLeftover} eff={totals.snackEff} days={dayAggs.length} lang={lang} />
        <PeriodSummaryCard title={`🍱 Meal — ${lang === "en" ? "Period Summary" : "Ringkasan Periode"}`} periodLabel={periodLabel} order={totals.mealOrder} consumed={totals.mealConsumed} leftover={totals.mealLeftover} eff={totals.mealEff} days={dayAggs.length} lang={lang} />
      </div>

      {/* ── Daily detail ── */}
      <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
        <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--t1)" }}>
          {lang === "en" ? "Daily Detail" : "Detail Harian"}
        </div>
        {filteredRows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--t3)", fontSize: 12 }}>{t.actionNoDataYet}</div>
        ) : (
          filteredRows.slice().reverse().map((r) => {
            const d = toDayAgg(r);
            return (
              <div key={r.id} className="rowHover" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 18px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ minWidth: 100, fontSize: 12.5, fontWeight: 700, color: "var(--t1)" }}>{fmtDateFull(r.reportDate, lang)}</div>
                <div style={{ flex: 1, fontSize: 11.5, color: "var(--t3)" }}>🥐 {fmtRp(d.snackOrder)} order · sisa {fmtRp(d.snackLeftover)}</div>
                <div style={{ flex: 1, fontSize: 11.5, color: "var(--t3)" }}>🍱 {fmtRp(d.mealOrder)} order · sisa {fmtRp(d.mealLeftover)}</div>
                <button onClick={() => setConfirmDelete(r)} style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer", fontSize: 13 }}>🗑️</button>
              </div>
            );
          })
        )}
      </div>

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: 20 }} onClick={() => setConfirmDelete(null)}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center", maxWidth: 360, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this report?" : "Hapus laporan ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{fmtDateFull(confirmDelete.reportDate, lang)}</strong> {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Pieces
════════════════════════════════════════════════════════════ */

function CategoryCard({
  icon, title, color, ordered, consumed, leftover, eff, lang,
}: { icon: string; title: string; color: string; ordered: number; consumed: number; leftover: number; eff: number; lang: string }) {
  return (
    <div className="statPop" style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--t1)", marginBottom: 12 }}>{icon} {title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MiniStat label={lang === "en" ? "Ordered" : "Order"} value={fmtRp(ordered)} />
          <MiniStat label={lang === "en" ? "Consumed" : "Terpakai"} value={fmtRp(consumed)} color={color} />
          <MiniStat label={lang === "en" ? "Leftover" : "Sisa"} value={fmtRp(leftover)} color="var(--red)" />
          <MiniStat label={lang === "en" ? "Efficiency" : "Efisiensi"} value={`${eff.toFixed(2)}%`} color={eff >= 95 ? "var(--green)" : eff >= 85 ? "var(--orange)" : "var(--red)"} />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--bg2)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || "var(--t1)", fontFamily: "var(--mono)" }}>{value}</div>
    </div>
  );
}

function PeriodSummaryCard({
  title, periodLabel, order, consumed, leftover, eff, days, lang,
}: { title: string; periodLabel: string; order: number; consumed: number; leftover: number; eff: number; days: number; lang: string }) {
  const avgPerDay = days > 0 ? leftover / days : 0;
  return (
    <div className="statPop" style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: "var(--t3)", marginBottom: 12 }}>{periodLabel}</div>
      <SummaryLine label={lang === "en" ? "Total Ordered" : "Total Order"} value={fmtRp(order)} />
      <SummaryLine label={lang === "en" ? "Total Consumed" : "Total Terpakai"} value={fmtRp(consumed)} color="var(--green)" />
      <SummaryLine label={lang === "en" ? "Total Leftover" : "Total Sisa"} value={fmtRp(leftover)} color="var(--red)" />
      <SummaryLine label={lang === "en" ? "Avg Leftover / Day" : "Rata-rata Sisa / Hari"} value={fmtRp(avgPerDay)} />
      <SummaryLine label={lang === "en" ? "Efficiency" : "Efisiensi"} value={`${eff.toFixed(2)}%`} color={eff >= 95 ? "var(--green)" : eff >= 85 ? "var(--orange)" : "var(--red)"} last />
    </div>
  );
}

function SummaryLine({ label, value, color, last }: { label: string; value: string; color?: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5, borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <span style={{ color: "var(--t3)" }}>{label}</span>
      <strong style={{ color: color || "var(--t1)" }}>{value}</strong>
    </div>
  );
}

function TrendChartCard({
  title, data, mode, colors, lang,
}: {
  title: string;
  data: { label: string; ordered: number; consumed: number; leftover: number }[];
  mode: "bar" | "line";
  colors: { ordered: string; consumed: string; leftover: string };
  lang: string;
}) {
  const legend = [
    { key: "ordered", label: lang === "en" ? "Ordered" : "Order", color: colors.ordered },
    { key: "consumed", label: lang === "en" ? "Consumed" : "Terpakai", color: colors.consumed },
    { key: "leftover", label: lang === "en" ? "Leftover" : "Sisa", color: colors.leftover },
  ];

  return (
    <div className="statPop" style={{ ...cardStyle, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{title}</div>
        <div style={{ display: "flex", gap: 12 }}>
          {legend.map((l) => (
            <span key={l.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: "inline-block" }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: "var(--t3)", fontSize: 12 }}>
          {lang === "en" ? "No data yet" : "Belum ada data"}
        </div>
      ) : mode === "line" ? (
        <LineTrend data={data} colors={colors} />
      ) : (
        <BarTrend data={data} colors={colors} />
      )}
    </div>
  );
}

function LineTrend({ data, colors }: { data: { label: string; ordered: number; consumed: number; leftover: number }[]; colors: { ordered: string; consumed: string; leftover: string } }) {
  const chartW = 640, chartH = 160, pad = 30;
  const maxVal = Math.max(...data.map((d) => Math.max(d.ordered, d.consumed, d.leftover)), 1);
  const pt = (v: number, i: number) => {
    const x = pad + (data.length > 1 ? (i / (data.length - 1)) * (chartW - pad * 2) : 0);
    const y = chartH - pad - (v / maxVal) * (chartH - pad * 2 - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const orderedPts = data.map((d, i) => pt(d.ordered, i)).join(" ");
  const consumedPts = data.map((d, i) => pt(d.consumed, i)).join(" ");
  const leftoverPts = data.map((d, i) => pt(d.leftover, i)).join(" ");

  const step = Math.max(1, Math.ceil(data.length / 8));

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad} x2={chartW - pad} y1={pad + f * (chartH - pad * 2 - 10)} y2={pad + f * (chartH - pad * 2 - 10)} stroke="var(--border)" strokeWidth={1} />
      ))}
      <polyline points={orderedPts} fill="none" stroke={colors.ordered} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.6} />
      <polyline points={consumedPts} fill="none" stroke={colors.consumed} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={leftoverPts} fill="none" stroke={colors.leftover} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
      {data.map((d, i) => {
        if (i % step !== 0 && i !== data.length - 1) return null;
        const x = pad + (data.length > 1 ? (i / (data.length - 1)) * (chartW - pad * 2) : 0);
        return (
          <text key={i} x={x} y={chartH - 8} textAnchor="middle" fontSize={9.5} fill="var(--t3)">{d.label}</text>
        );
      })}
    </svg>
  );
}

function BarTrend({ data, colors }: { data: { label: string; ordered: number; consumed: number; leftover: number }[]; colors: { ordered: string; consumed: string; leftover: string } }) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.ordered, d.consumed, d.leftover)), 1);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, minWidth: data.length * 46 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100 }}>
              <div title={`Order: ${d.ordered}`} style={{ width: 8, height: `${Math.max(2, (d.ordered / maxVal) * 100)}px`, background: colors.ordered, opacity: 0.6, borderRadius: "3px 3px 0 0" }} />
              <div title={`Consumed: ${d.consumed}`} style={{ width: 8, height: `${Math.max(2, (d.consumed / maxVal) * 100)}px`, background: colors.consumed, borderRadius: "3px 3px 0 0" }} />
              <div title={`Leftover: ${d.leftover}`} style={{ width: 8, height: `${Math.max(2, (d.leftover / maxVal) * 100)}px`, background: colors.leftover, opacity: 0.8, borderRadius: "3px 3px 0 0" }} />
            </div>
            <span style={{ fontSize: 9.5, color: "var(--t3)", whiteSpace: "nowrap" }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
