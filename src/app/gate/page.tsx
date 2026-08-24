"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import type { CSSProperties } from "react";
import {
  getActiveVehiclesForGate,
  getActiveDriversForGate,
  getGateLogsPublic,
  openGateCheckpoint,
  closeGateCheckpoint,
} from "@/lib/api";
import type { GateVehicleOption, GateDriverOption, VehicleGateLog } from "@/lib/types";

type Mode = "dark" | "light";

/* ── Warna per plant (CIK/PRB) — konstan di kedua mode, karena semua
   pakai alpha/transparansi jadi otomatis menyesuaikan latar ── */
const PLANT_THEME = {
  CIK: { glow: "#3d7bff", soft: "rgba(61,123,255,0.12)", border: "rgba(61,123,255,0.35)", text: "#3d7bff" },
  PRB: { glow: "#ffb340", soft: "rgba(255,179,64,0.12)", border: "rgba(255,179,64,0.35)", text: "#d98314" },
} as const;
const PLANT_THEME_DARK_TEXT = { CIK: "#8ab4ff", PRB: "#ffc873" };

/* ── Palet halaman per mode ── */
interface PagePalette {
  bg: string; orb1: string; orb2: string; dotPattern: string; headerBorder: string;
  textPrimary: string; textSecondary: string; textTertiary: string; textMuted: string;
  divider: string; cardBg: string; cardBorderDefault: string; inputBg: string; inputText: string;
  dropdownBg: string; dropdownBorder: string; dropdownHoverBg: string;
  doneCardBg: string; doneCardBorder: string; doneTextPrimary: string; doneTextSecondary: string; doneTextTertiary: string;
  emptyStateBg: string; emptyStateBorder: string; driverNameText: string;
  submitDisabledBg: string; submitDisabledText: string; plateTextColor: string;
}

const PAGE: Record<Mode, PagePalette> = {
  dark: {
    bg: "#050b16",
    orb1: "rgba(61,123,255,0.18)",
    orb2: "rgba(255,179,64,0.14)",
    dotPattern: "rgba(255,255,255,0.025)",
    headerBorder: "rgba(255,255,255,0.07)",
    textPrimary: "#fff",
    textSecondary: "rgba(226,234,248,0.5)",
    textTertiary: "rgba(226,234,248,0.45)",
    textMuted: "rgba(226,234,248,0.35)",
    divider: "rgba(255,255,255,0.1)",
    cardBg: "rgba(255,255,255,0.035)",
    cardBorderDefault: "rgba(255,255,255,0.09)",
    inputBg: "rgba(255,255,255,0.04)",
    inputText: "#f2f6fc",
    dropdownBg: "#0d1a2e",
    dropdownBorder: "rgba(255,255,255,0.1)",
    dropdownHoverBg: "rgba(255,255,255,0.04)",
    doneCardBg: "rgba(255,255,255,0.02)",
    doneCardBorder: "rgba(255,255,255,0.06)",
    doneTextPrimary: "rgba(255,255,255,0.75)",
    doneTextSecondary: "rgba(226,234,248,0.55)",
    doneTextTertiary: "rgba(226,234,248,0.35)",
    emptyStateBg: "rgba(255,255,255,0.03)",
    emptyStateBorder: "rgba(255,255,255,0.07)",
    driverNameText: "#e8edf7",
    submitDisabledBg: "rgba(255,255,255,0.06)",
    submitDisabledText: "rgba(226,234,248,0.3)",
    plateTextColor: "#fff",
  },
  light: {
    bg: "#eef2f9",
    orb1: "rgba(61,123,255,0.10)",
    orb2: "rgba(255,179,64,0.09)",
    dotPattern: "rgba(15,40,71,0.035)",
    headerBorder: "rgba(15,40,71,0.08)",
    textPrimary: "#0f2847",
    textSecondary: "#5b6b85",
    textTertiary: "#7c8aa0",
    textMuted: "#98a4b8",
    divider: "rgba(15,40,71,0.1)",
    cardBg: "#ffffff",
    cardBorderDefault: "rgba(15,40,71,0.09)",
    inputBg: "#f6f8fc",
    inputText: "#0f2847",
    dropdownBg: "#ffffff",
    dropdownBorder: "rgba(15,40,71,0.1)",
    dropdownHoverBg: "#f6f8fc",
    doneCardBg: "#fbfcfe",
    doneCardBorder: "rgba(15,40,71,0.07)",
    doneTextPrimary: "#334862",
    doneTextSecondary: "#5b6b85",
    doneTextTertiary: "#98a4b8",
    emptyStateBg: "#ffffff",
    emptyStateBorder: "rgba(15,40,71,0.08)",
    driverNameText: "#1f2d47",
    submitDisabledBg: "#e1e7f1",
    submitDisabledText: "#a0aabb",
    plateTextColor: "#0f2847",
  },
} as const;

function actionLabel(plant: "CIK" | "PRB", done: boolean): string {
  if (plant === "CIK") return done ? "SUDAH KEMBALI" : "SEDANG KELUAR";
  return done ? "SUDAH CHECK-OUT" : "SEDANG CHECK-IN";
}
function controlLabel(plant: "CIK" | "PRB"): string {
  return plant === "CIK" ? "Catat Kembali" : "Catat Check-Out";
}
function fmtJam(iso: string | null): string {
  if (!iso) return "-:-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function liveDuration(iso: string | null, tick: number): string {
  if (!iso) return "";
  void tick;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}j ${mins % 60}m`;
}
function getInputStyle(m: PagePalette): CSSProperties {
  return {
    width: "100%",
    padding: "17px 20px",
    borderRadius: 14,
    border: "1.5px solid rgba(61,123,255,0.4)",
    boxShadow: "0 0 14px rgba(61,123,255,0.14), inset 0 0 20px rgba(61,123,255,0.03)",
    background: m.inputBg,
    fontSize: 17,
    color: m.inputText,
    fontFamily: "inherit",
    outline: "none",
    fontWeight: 600,
  };
}

export default function GatePage() {
  const [mode, setMode] = useState<Mode>("dark");
  const [vehicles, setVehicles] = useState<GateVehicleOption[]>([]);
  const [drivers, setDrivers] = useState<GateDriverOption[]>([]);
  const [logs, setLogs] = useState<VehicleGateLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState("");

  const [tanggal, setTanggal] = useState(todayStr());
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [useManualDriver, setUseManualDriver] = useState(false);
  const [driverManual, setDriverManual] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyLogId, setBusyLogId] = useState<string | null>(null);
  const vehicleInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("gate-theme") : null;
    if (saved === "light" || saved === "dark") setMode(saved);
  }, []);

  function toggleMode() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    try { window.localStorage.setItem("gate-theme", next); } catch {}
  }

  const M = PAGE[mode];
  const inputStyle = getInputStyle(M);
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 800, color: M.textSecondary, marginBottom: 9, display: "block", letterSpacing: "0.08em" };
  const plantText = (p: "CIK" | "PRB") => (mode === "dark" ? PLANT_THEME_DARK_TEXT[p] : PLANT_THEME[p].text);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      setLogs(await getGateLogsPublic(tanggal));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar");
    } finally {
      setLoadingLogs(false);
    }
  }, [tanggal]);

  useEffect(() => {
    getActiveVehiclesForGate().then(setVehicles).catch(() => {});
    getActiveDriversForGate().then(setDrivers).catch(() => {});
  }, []);

  useEffect(() => {
    loadLogs();
    const poll = setInterval(loadLogs, 15000);
    const tickTimer = setInterval(() => setTick((t) => t + 1), 30000);
    const clockTimer = setInterval(() => setClock(new Date().toLocaleTimeString("id-ID")), 1000);
    return () => { clearInterval(poll); clearInterval(tickTimer); clearInterval(clockTimer); };
  }, [loadLogs]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (vehicleInputRef.current && !vehicleInputRef.current.contains(e.target as Node)) setShowVehicleDropdown(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const filteredVehicles = vehicles.filter((v) => v.nopol.toLowerCase().includes(vehicleSearch.toLowerCase()));
  const driverOk = useManualDriver ? driverManual.trim() !== "" : driverId !== "";
  const canSubmit = vehicleId !== "" && driverOk && !submitting;
  const activePlant = selectedVehicle ? PLANT_THEME[selectedVehicle.plant] : PLANT_THEME.CIK;

  function pickVehicle(v: GateVehicleOption) {
    setVehicleId(v.id);
    setVehicleSearch(`${v.nopol} — ${v.jenis}`);
    setShowVehicleDropdown(false);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const now = new Date();
      const [y, m, d] = tanggal.split("-").map(Number);
      const ts = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
      await openGateCheckpoint({
        vehicleId,
        driverId: useManualDriver ? null : driverId,
        driverNameManual: useManualDriver ? driverManual.trim() : null,
        tujuan: tujuan.trim(),
        timestamp: ts,
      });
      setVehicleId(""); setVehicleSearch(""); setDriverId(""); setUseManualDriver(false); setDriverManual(""); setTujuan("");
      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencatat data");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleControl(log: VehicleGateLog) {
    setBusyLogId(log.id);
    setError("");
    try {
      await closeGateCheckpoint(log.vehicleId);
      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencatat data");
    } finally {
      setBusyLogId(null);
    }
  }

  const activeLogs = logs.filter((l) => l.status !== "DONE");
  const doneLogs = logs.filter((l) => l.status === "DONE");

  return (
    <div style={{ minHeight: "100vh", background: M.bg, fontFamily: "-apple-system,'Segoe UI',sans-serif", position: "relative", overflow: "hidden", transition: "background 0.3s ease" }}>
      <div style={{ position: "fixed", top: -200, left: -150, width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${M.orb1}, transparent 70%)`, filter: "blur(40px)", animation: "float1 18s ease-in-out infinite" }} />
      <div style={{ position: "fixed", bottom: -200, right: -150, width: 550, height: 550, borderRadius: "50%", background: `radial-gradient(circle, ${M.orb2}, transparent 70%)`, filter: "blur(40px)", animation: "float2 22s ease-in-out infinite" }} />
      <div style={{ position: "fixed", inset: 0, backgroundImage: `radial-gradient(circle, ${M.dotPattern} 1px, transparent 1px)`, backgroundSize: "28px 28px", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, borderBottom: `1px solid ${M.headerBorder}`, padding: "28px 44px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(20px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: "rgba(61,123,255,0.1)", border: "1.5px solid rgba(61,123,255,0.5)", boxShadow: "0 0 24px rgba(61,123,255,0.45), inset 0 0 16px rgba(61,123,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
            <img src="/logo.png" alt="CIKOPS" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 0 8px rgba(61,123,255,0.6))" }} />
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: M.textPrimary }}>Security Gate Control</div>
            <div style={{ fontSize: 14, color: M.textSecondary, marginTop: 3, letterSpacing: "0.02em" }}>CIKOPS FLEET — VEHICLE ACCESS LOG</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: plantText("CIK"), fontFamily: "var(--font-mono, monospace)", textShadow: `0 0 20px ${PLANT_THEME.CIK.glow}66` }}>{activeLogs.filter((l) => l.plant === "CIK").length}</div>
            <div style={{ fontSize: 11.5, color: M.textTertiary, fontWeight: 800, letterSpacing: "0.08em" }}>CIK KELUAR</div>
          </div>
          <div style={{ width: 1, height: 34, background: M.divider }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: plantText("PRB"), fontFamily: "var(--font-mono, monospace)", textShadow: `0 0 20px ${PLANT_THEME.PRB.glow}66` }}>{activeLogs.filter((l) => l.plant === "PRB").length}</div>
            <div style={{ fontSize: 11.5, color: M.textTertiary, fontWeight: 800, letterSpacing: "0.08em" }}>PRB CHECK-IN</div>
          </div>
          <div style={{ width: 1, height: 34, background: M.divider }} />
          <div style={{ textAlign: "center", fontFamily: "var(--font-mono, monospace)" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: M.textPrimary }}>{clock || "--:--:--"}</div>
            <div style={{ fontSize: 11, color: M.textMuted, fontWeight: 700, letterSpacing: "0.06em" }}>WAKTU SERVER</div>
          </div>
          <div style={{ width: 1, height: 34, background: M.divider }} />
          <button
            onClick={toggleMode}
            title={mode === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
            style={{
              width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${M.cardBorderDefault}`,
              background: M.cardBg, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "transform 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {mode === "dark" ? "\u2600" : "\u25D1"}
          </button>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1460, margin: "0 auto", padding: "36px 44px", display: "grid", gridTemplateColumns: "440px 1fr", gap: 30, alignItems: "start" }}>

        <div
          style={{
            background: M.cardBg,
            backdropFilter: "blur(24px)",
            borderRadius: 24,
            border: `1.5px solid ${selectedVehicle ? activePlant.border : M.cardBorderDefault}`,
            padding: 32,
            position: "sticky",
            top: 28,
            boxShadow: selectedVehicle ? `0 0 60px ${activePlant.soft}, 0 20px 50px rgba(0,0,0,0.25)` : "0 20px 50px rgba(0,0,0,0.2)",
            transition: "border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: M.textPrimary, marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(61,123,255,0.15)", border: "1px solid rgba(61,123,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#3d7bff" }}>+</span>
            Catat Kendaraan
          </div>

          {error && (
            <div style={{ padding: "13px 16px", borderRadius: 12, background: "rgba(255,107,99,0.12)", border: "1px solid rgba(255,107,99,0.3)", color: "#e0483f", fontSize: 14, fontWeight: 600, marginBottom: 18 }}>{error}</div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>TANGGAL</label>
            <input className="neon-field" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ marginBottom: 20, position: "relative" }} ref={vehicleInputRef}>
            <label style={labelStyle}>KENDARAAN — KETIK PLAT NOMOR</label>
            <input
              className="neon-field"
              value={vehicleSearch}
              onChange={(e) => { setVehicleSearch(e.target.value); setVehicleId(""); setShowVehicleDropdown(true); }}
              onFocus={() => setShowVehicleDropdown(true)}
              placeholder="Ketik nomor polisi... contoh: B 1234"
              style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.04em", border: vehicleId ? `1.5px solid ${activePlant.border}` : inputStyle.border, boxShadow: vehicleId ? `0 0 0 3px ${activePlant.soft}` : inputStyle.boxShadow }}
            />
            {showVehicleDropdown && vehicleSearch.trim() !== "" && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8, background: M.dropdownBg, backdropFilter: "blur(20px)", borderRadius: 16, boxShadow: "0 20px 50px rgba(0,0,0,0.35)", maxHeight: 300, overflowY: "auto", zIndex: 30, border: `1px solid ${M.dropdownBorder}` }}>
                {filteredVehicles.length === 0 ? (
                  <div style={{ padding: 18, color: M.textMuted, fontSize: 15, textAlign: "center" }}>Tidak ditemukan</div>
                ) : (
                  filteredVehicles.map((v) => (
                    <div
                      key={v.id}
                      onMouseDown={() => pickVehicle(v)}
                      style={{ padding: "15px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${M.dropdownBorder}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = M.dropdownHoverBg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 18, color: M.textPrimary, fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.03em" }}>{v.nopol}</span>
                        <span style={{ fontSize: 13.5, color: M.textTertiary, marginLeft: 10 }}>{v.jenis}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 11px", borderRadius: 8, background: PLANT_THEME[v.plant].soft, color: plantText(v.plant), border: `1px solid ${PLANT_THEME[v.plant].border}` }}>{v.plant}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>DRIVER</label>
              <button type="button" onClick={() => setUseManualDriver((v) => !v)} style={{ background: "none", border: "none", color: "#3d7bff", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0 }}>
                {useManualDriver ? "Pilih dari daftar" : "Ketik manual"}
              </button>
            </div>
            {useManualDriver ? (
              <input className="neon-field" value={driverManual} onChange={(e) => setDriverManual(e.target.value)} placeholder="Nama driver" style={inputStyle} />
            ) : (
              <select className="neon-field" value={driverId} onChange={(e) => setDriverId(e.target.value)} style={inputStyle}>
                <option value="" style={{ background: M.dropdownBg, color: M.textPrimary }}>-- Pilih Driver --</option>
                {drivers.map((d) => <option key={d.id} value={d.id} style={{ background: M.dropdownBg, color: M.textPrimary }}>{d.nama}</option>)}
              </select>
            )}
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>TUJUAN {selectedVehicle?.plant === "PRB" ? "/ KEPERLUAN" : ""}</label>
            <input
              className="neon-field"
              value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              placeholder={selectedVehicle?.plant === "PRB" ? "Contoh: Pengiriman barang" : "Contoh: Antar dokumen ke PRB"}
              style={inputStyle}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              width: "100%", padding: 19, borderRadius: 16, border: "none",
              background: canSubmit ? `linear-gradient(135deg, ${activePlant.glow}, ${activePlant.glow}bb)` : M.submitDisabledBg,
              color: canSubmit ? "#050b16" : M.submitDisabledText, fontWeight: 800, fontSize: 17, letterSpacing: "0.02em",
              cursor: canSubmit ? "pointer" : "not-allowed",
              boxShadow: canSubmit ? `0 0 40px ${activePlant.glow}55, 0 10px 24px rgba(0,0,0,0.25)` : "none",
              transition: "all 0.15s ease",
            }}
            onMouseDown={(e) => canSubmit && (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {submitting ? "MENYIMPAN..." : selectedVehicle?.plant === "PRB" ? "CATAT CHECK-IN \u2192" : "CATAT KELUAR \u2192"}
          </button>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: M.textPrimary }}>Aktivitas Gate</div>
            <input className="neon-field" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "11px 16px", fontSize: 14 }} />
          </div>

          {loadingLogs ? (
            <div style={{ padding: 70, textAlign: "center", color: M.textMuted, fontSize: 16, background: M.emptyStateBg, borderRadius: 22, border: `1px solid ${M.emptyStateBorder}` }}>Memuat data...</div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: M.textSecondary, marginBottom: 14, letterSpacing: "0.08em" }}>
                SEDANG AKTIF ({activeLogs.length})
              </div>
              {activeLogs.length === 0 ? (
                <div style={{ padding: 34, textAlign: "center", color: M.textMuted, fontSize: 15, background: M.emptyStateBg, borderRadius: 20, border: `1px solid ${M.emptyStateBorder}`, marginBottom: 32 }}>Tidak ada kendaraan aktif.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18, marginBottom: 36 }}>
                  {activeLogs.map((l) => {
                    const theme = PLANT_THEME[l.plant];
                    return (
                      <div
                        key={l.id}
                        style={{
                          background: M.cardBg, backdropFilter: "blur(20px)", borderRadius: 20, padding: 24,
                          border: `1.5px solid ${theme.border}`, boxShadow: `0 0 30px ${theme.soft}, 0 10px 30px rgba(0,0,0,0.2)`,
                          transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `0 0 50px ${theme.soft}, 0 18px 40px rgba(0,0,0,0.3)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 0 30px ${theme.soft}, 0 10px 30px rgba(0,0,0,0.2)`; }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div style={{ fontSize: 26, fontWeight: 800, color: M.plateTextColor, fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.03em", textShadow: `0 0 20px ${theme.glow}55` }}>{l.nopol}</div>
                          <span style={{ fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 9, background: theme.soft, color: plantText(l.plant), border: `1px solid ${theme.border}` }}>{l.plant}</span>
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: M.driverNameText, marginBottom: 5 }}>{l.driverName}</div>
                        {l.tujuan && <div style={{ fontSize: 14, color: M.textSecondary, marginBottom: 14 }}>{l.tujuan}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: theme.glow, boxShadow: `0 0 10px ${theme.glow}`, animation: "gatePulse 1.6s ease-in-out infinite" }} />
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: plantText(l.plant), letterSpacing: "0.03em" }}>
                            {actionLabel(l.plant, false)} · {liveDuration(l.timeOut || l.timeIn, tick)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleControl(l)}
                          disabled={busyLogId === l.id}
                          style={{
                            width: "100%", padding: "15px", borderRadius: 13, border: "none",
                            background: "linear-gradient(135deg,#2fd894,#17a673)", color: "#052b1e", fontWeight: 800, fontSize: 15.5,
                            cursor: busyLogId === l.id ? "wait" : "pointer", opacity: busyLogId === l.id ? 0.6 : 1,
                            boxShadow: "0 8px 20px rgba(47,216,148,0.3)",
                          }}
                        >
                          {busyLogId === l.id ? "Menyimpan..." : `Selesai — ${controlLabel(l.plant)}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: 13.5, fontWeight: 800, color: M.textSecondary, marginBottom: 14, letterSpacing: "0.08em" }}>
                SELESAI ({doneLogs.length})
              </div>
              {doneLogs.length === 0 ? (
                <div style={{ padding: 34, textAlign: "center", color: M.textMuted, fontSize: 15, background: M.emptyStateBg, borderRadius: 20, border: `1px solid ${M.emptyStateBorder}` }}>Belum ada yang selesai.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
                  {doneLogs.map((l) => {
                    const theme = PLANT_THEME[l.plant];
                    return (
                      <div key={l.id} style={{ background: M.doneCardBg, borderRadius: 16, padding: 18, border: `1px solid ${M.doneCardBorder}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: M.doneTextPrimary, fontFamily: "var(--font-mono, monospace)" }}>{l.nopol}</div>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 7, background: theme.soft, color: plantText(l.plant) }}>{l.plant}</span>
                        </div>
                        <div style={{ fontSize: 14, color: M.doneTextSecondary, marginBottom: 7 }}>{l.driverName}</div>
                        <div style={{ fontSize: 13, color: M.doneTextTertiary, fontFamily: "var(--font-mono, monospace)" }}>{fmtJam(l.timeOut)} to {fmtJam(l.timeIn)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes gatePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.65); } }
        @keyframes float1 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(60px,40px); } }
        @keyframes float2 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-50px,50px); } }
        .neon-field { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .neon-field:hover { border-color: rgba(61,123,255,0.65) !important; box-shadow: 0 0 18px rgba(61,123,255,0.22), inset 0 0 20px rgba(61,123,255,0.05) !important; }
        .neon-field:focus { border-color: #3d7bff !important; box-shadow: 0 0 0 3px rgba(61,123,255,0.22), 0 0 28px rgba(61,123,255,0.4), inset 0 0 20px rgba(61,123,255,0.06) !important; }
        input::placeholder { color: ${mode === "dark" ? "rgba(226,234,248,0.3)" : "#a6b2c4"}; }
      `}</style>
    </div>
  );
}
