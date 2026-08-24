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

const THEME = {
  CIK: { glow: "#3d7bff", soft: "rgba(61,123,255,0.12)", border: "rgba(61,123,255,0.35)", text: "#8ab4ff" },
  PRB: { glow: "#ffb340", soft: "rgba(255,179,64,0.12)", border: "rgba(255,179,64,0.35)", text: "#ffc873" },
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

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "17px 20px",
  borderRadius: 14,
  border: "1.5px solid rgba(61,123,255,0.4)",
  boxShadow: "0 0 14px rgba(61,123,255,0.14), inset 0 0 20px rgba(61,123,255,0.03)",
  background: "rgba(255,255,255,0.04)",
  fontSize: 17,
  color: "#f2f6fc",
  fontFamily: "inherit",
  outline: "none",
  fontWeight: 600,
};
const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 800, color: "rgba(226,234,248,0.55)", marginBottom: 9, display: "block", letterSpacing: "0.08em" };

export default function GatePage() {
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
  const activeTheme = selectedVehicle ? THEME[selectedVehicle.plant] : THEME.CIK;

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
    <div style={{ minHeight: "100vh", background: "#050b16", fontFamily: "-apple-system,'Segoe UI',sans-serif", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", top: -200, left: -150, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(61,123,255,0.18), transparent 70%)", filter: "blur(40px)", animation: "float1 18s ease-in-out infinite" }} />
      <div style={{ position: "fixed", bottom: -200, right: -150, width: 550, height: 550, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,179,64,0.14), transparent 70%)", filter: "blur(40px)", animation: "float2 22s ease-in-out infinite" }} />
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "28px 44px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(20px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: "rgba(61,123,255,0.1)", border: "1.5px solid rgba(61,123,255,0.5)", boxShadow: "0 0 24px rgba(61,123,255,0.45), inset 0 0 16px rgba(61,123,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
            <img src="/logo.png" alt="CIKOPS" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 0 8px rgba(61,123,255,0.6))" }} />
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "#fff" }}>Security Gate Control</div>
            <div style={{ fontSize: 14, color: "rgba(226,234,248,0.5)", marginTop: 3, letterSpacing: "0.02em" }}>CIKOPS FLEET — VEHICLE ACCESS LOG</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: THEME.CIK.text, fontFamily: "var(--font-mono, monospace)", textShadow: `0 0 20px ${THEME.CIK.glow}66` }}>{activeLogs.filter((l) => l.plant === "CIK").length}</div>
            <div style={{ fontSize: 11.5, color: "rgba(226,234,248,0.45)", fontWeight: 800, letterSpacing: "0.08em" }}>CIK KELUAR</div>
          </div>
          <div style={{ width: 1, height: 34, background: "rgba(255,255,255,0.1)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: THEME.PRB.text, fontFamily: "var(--font-mono, monospace)", textShadow: `0 0 20px ${THEME.PRB.glow}66` }}>{activeLogs.filter((l) => l.plant === "PRB").length}</div>
            <div style={{ fontSize: 11.5, color: "rgba(226,234,248,0.45)", fontWeight: 800, letterSpacing: "0.08em" }}>PRB CHECK-IN</div>
          </div>
          <div style={{ width: 1, height: 34, background: "rgba(255,255,255,0.1)" }} />
          <div style={{ textAlign: "center", fontFamily: "var(--font-mono, monospace)" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{clock || "--:--:--"}</div>
            <div style={{ fontSize: 11, color: "rgba(226,234,248,0.4)", fontWeight: 700, letterSpacing: "0.06em" }}>WAKTU SERVER</div>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1460, margin: "0 auto", padding: "36px 44px", display: "grid", gridTemplateColumns: "440px 1fr", gap: 30, alignItems: "start" }}>

        <div
          style={{
            background: "rgba(255,255,255,0.035)",
            backdropFilter: "blur(24px)",
            borderRadius: 24,
            border: `1.5px solid ${selectedVehicle ? activeTheme.border : "rgba(255,255,255,0.09)"}`,
            padding: 32,
            position: "sticky",
            top: 28,
            boxShadow: selectedVehicle ? `0 0 60px ${activeTheme.soft}, 0 20px 50px rgba(0,0,0,0.4)` : "0 20px 50px rgba(0,0,0,0.4)",
            transition: "border-color 0.3s ease, box-shadow 0.3s ease",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(61,123,255,0.15)", border: "1px solid rgba(61,123,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#8ab4ff" }}>+</span>
            Catat Kendaraan
          </div>

          {error && (
            <div style={{ padding: "13px 16px", borderRadius: 12, background: "rgba(255,107,99,0.12)", border: "1px solid rgba(255,107,99,0.3)", color: "#ff9d97", fontSize: 14, fontWeight: 600, marginBottom: 18 }}>{error}</div>
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
              style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.04em", border: vehicleId ? `1.5px solid ${activeTheme.border}` : inputStyle.border, boxShadow: vehicleId ? `0 0 0 3px ${activeTheme.soft}` : inputStyle.boxShadow }}
            />
            {showVehicleDropdown && vehicleSearch.trim() !== "" && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8, background: "#0d1a2e", backdropFilter: "blur(20px)", borderRadius: 16, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", maxHeight: 300, overflowY: "auto", zIndex: 30, border: "1px solid rgba(255,255,255,0.1)" }}>
                {filteredVehicles.length === 0 ? (
                  <div style={{ padding: 18, color: "rgba(226,234,248,0.4)", fontSize: 15, textAlign: "center" }}>Tidak ditemukan</div>
                ) : (
                  filteredVehicles.map((v) => (
                    <div
                      key={v.id}
                      onMouseDown={() => pickVehicle(v)}
                      style={{ padding: "15px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 18, color: "#fff", fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.03em" }}>{v.nopol}</span>
                        <span style={{ fontSize: 13.5, color: "rgba(226,234,248,0.45)", marginLeft: 10 }}>{v.jenis}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 11px", borderRadius: 8, background: THEME[v.plant].soft, color: THEME[v.plant].text, border: `1px solid ${THEME[v.plant].border}` }}>{v.plant}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>DRIVER</label>
              <button type="button" onClick={() => setUseManualDriver((v) => !v)} style={{ background: "none", border: "none", color: "#8ab4ff", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0 }}>
                {useManualDriver ? "Pilih dari daftar" : "Ketik manual"}
              </button>
            </div>
            {useManualDriver ? (
              <input className="neon-field" value={driverManual} onChange={(e) => setDriverManual(e.target.value)} placeholder="Nama driver" style={inputStyle} />
            ) : (
              <select className="neon-field" value={driverId} onChange={(e) => setDriverId(e.target.value)} style={inputStyle}>
                <option value="" style={{ background: "#0d1a2e" }}>-- Pilih Driver --</option>
                {drivers.map((d) => <option key={d.id} value={d.id} style={{ background: "#0d1a2e" }}>{d.nama}</option>)}
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
              background: canSubmit ? `linear-gradient(135deg, ${activeTheme.glow}, ${activeTheme.glow}bb)` : "rgba(255,255,255,0.06)",
              color: canSubmit ? "#050b16" : "rgba(226,234,248,0.3)", fontWeight: 800, fontSize: 17, letterSpacing: "0.02em",
              cursor: canSubmit ? "pointer" : "not-allowed",
              boxShadow: canSubmit ? `0 0 40px ${activeTheme.glow}55, 0 10px 24px rgba(0,0,0,0.3)` : "none",
              transition: "all 0.15s ease",
            }}
            onMouseDown={(e) => canSubmit && (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {submitting ? "MENYIMPAN..." : selectedVehicle?.plant === "PRB" ? "CATAT CHECK-IN →" : "CATAT KELUAR →"}
          </button>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Aktivitas Gate</div>
            <input className="neon-field" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "11px 16px", fontSize: 14 }} />
          </div>

          {loadingLogs ? (
            <div style={{ padding: 70, textAlign: "center", color: "rgba(226,234,248,0.4)", fontSize: 16, background: "rgba(255,255,255,0.03)", borderRadius: 22, border: "1px solid rgba(255,255,255,0.07)" }}>Memuat data...</div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "rgba(226,234,248,0.5)", marginBottom: 14, letterSpacing: "0.08em" }}>
                SEDANG AKTIF ({activeLogs.length})
              </div>
              {activeLogs.length === 0 ? (
                <div style={{ padding: 34, textAlign: "center", color: "rgba(226,234,248,0.35)", fontSize: 15, background: "rgba(255,255,255,0.03)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", marginBottom: 32 }}>Tidak ada kendaraan aktif.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18, marginBottom: 36 }}>
                  {activeLogs.map((l) => {
                    const theme = THEME[l.plant];
                    return (
                      <div
                        key={l.id}
                        style={{
                          background: "rgba(255,255,255,0.035)", backdropFilter: "blur(20px)", borderRadius: 20, padding: 24,
                          border: `1.5px solid ${theme.border}`, boxShadow: `0 0 30px ${theme.soft}, 0 10px 30px rgba(0,0,0,0.3)`,
                          transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `0 0 50px ${theme.soft}, 0 18px 40px rgba(0,0,0,0.4)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 0 30px ${theme.soft}, 0 10px 30px rgba(0,0,0,0.3)`; }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.03em", textShadow: `0 0 20px ${theme.glow}55` }}>{l.nopol}</div>
                          <span style={{ fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 9, background: theme.soft, color: theme.text, border: `1px solid ${theme.border}` }}>{l.plant}</span>
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: "#e8edf7", marginBottom: 5 }}>{l.driverName}</div>
                        {l.tujuan && <div style={{ fontSize: 14, color: "rgba(226,234,248,0.5)", marginBottom: 14 }}>{l.tujuan}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: theme.glow, boxShadow: `0 0 10px ${theme.glow}`, animation: "gatePulse 1.6s ease-in-out infinite" }} />
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: theme.text, letterSpacing: "0.03em" }}>
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

              <div style={{ fontSize: 13.5, fontWeight: 800, color: "rgba(226,234,248,0.5)", marginBottom: 14, letterSpacing: "0.08em" }}>
                SELESAI ({doneLogs.length})
              </div>
              {doneLogs.length === 0 ? (
                <div style={{ padding: 34, textAlign: "center", color: "rgba(226,234,248,0.35)", fontSize: 15, background: "rgba(255,255,255,0.03)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)" }}>Belum ada yang selesai.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
                  {doneLogs.map((l) => {
                    const theme = THEME[l.plant];
                    return (
                      <div key={l.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 16, padding: 18, border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.75)", fontFamily: "var(--font-mono, monospace)" }}>{l.nopol}</div>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 7, background: theme.soft, color: theme.text }}>{l.plant}</span>
                        </div>
                        <div style={{ fontSize: 14, color: "rgba(226,234,248,0.55)", marginBottom: 7 }}>{l.driverName}</div>
                        <div style={{ fontSize: 13, color: "rgba(226,234,248,0.35)", fontFamily: "var(--font-mono, monospace)" }}>{fmtJam(l.timeOut)} to {fmtJam(l.timeIn)}</div>
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
        select option { background: #0d1a2e; color: #fff; }
        .neon-field { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .neon-field:hover { border-color: rgba(61,123,255,0.65) !important; box-shadow: 0 0 18px rgba(61,123,255,0.22), inset 0 0 20px rgba(61,123,255,0.05) !important; }
        .neon-field:focus { border-color: #3d7bff !important; box-shadow: 0 0 0 3px rgba(61,123,255,0.22), 0 0 28px rgba(61,123,255,0.4), inset 0 0 20px rgba(61,123,255,0.06) !important; }
        input::placeholder { color: rgba(226,234,248,0.3); }
      `}</style>
    </div>
  );
}
