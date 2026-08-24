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

/* ── Warna per plant — konsisten dipakai di seluruh halaman ── */
const PLANT_THEME = {
  CIK: { main: "#2f5fe0", soft: "#e8edff", text: "#1f44b8" },
  PRB: { main: "#e08a1a", soft: "#fdf1e0", text: "#b25700" },
} as const;

function actionLabel(plant: "CIK" | "PRB", done: boolean): string {
  if (plant === "CIK") return done ? "Sudah Kembali" : "Sedang Keluar";
  return done ? "Sudah Check-Out" : "Sedang Check-In";
}
function controlLabel(plant: "CIK" | "PRB"): string {
  return plant === "CIK" ? "Catat Kembali" : "Catat Check-Out";
}
function fmtJam(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function liveDuration(iso: string | null, tick: number): string {
  if (!iso) return "";
  void tick;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} menit`;
  return `${Math.floor(mins / 60)} jam ${mins % 60} menit`;
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "16px 18px",
  borderRadius: 14,
  border: "2px solid #e1e7f1",
  background: "#f6f8fc",
  fontSize: 17,
  color: "#0f2847",
  fontFamily: "inherit",
  outline: "none",
  fontWeight: 600,
};
const labelStyle: CSSProperties = { fontSize: 14, fontWeight: 800, color: "#435773", marginBottom: 8, display: "block", letterSpacing: "0.02em" };

export default function GatePage() {
  const [vehicles, setVehicles] = useState<GateVehicleOption[]>([]);
  const [drivers, setDrivers] = useState<GateDriverOption[]>([]);
  const [logs, setLogs] = useState<VehicleGateLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

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
    const clock = setInterval(() => setTick((t) => t + 1), 30000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [loadLogs]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (vehicleInputRef.current && !vehicleInputRef.current.contains(e.target as Node)) {
        setShowVehicleDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const filteredVehicles = vehicles.filter((v) => v.nopol.toLowerCase().includes(vehicleSearch.toLowerCase()));
  const driverOk = useManualDriver ? driverManual.trim() !== "" : driverId !== "";
  const canSubmit = vehicleId !== "" && driverOk && !submitting;

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
    <div style={{ minHeight: "100vh", background: "#eef2f9", fontFamily: "-apple-system,'Segoe UI',sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#0f2847,#0a1930)", padding: "26px 40px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 40 }}>🚧</div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>Security Gate Log</div>
            <div style={{ fontSize: 15, opacity: 0.65, marginTop: 2 }}>Pencatatan Keluar / Masuk Kendaraan — CIKOPS Fleet</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#7ba0ff" }}>{activeLogs.filter((l) => l.plant === "CIK").length}</div>
            <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 700 }}>CIK KELUAR</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#ffc477" }}>{activeLogs.filter((l) => l.plant === "PRB").length}</div>
            <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 700 }}>PRB CHECK-IN</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 40px", display: "grid", gridTemplateColumns: "420px 1fr", gap: 28, alignItems: "start" }}>

        <div style={{ background: "#fff", borderRadius: 22, boxShadow: "0 12px 36px rgba(15,40,71,0.1)", padding: 30, position: "sticky", top: 28 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0f2847", marginBottom: 22, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: "#e8edff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>+</span>
            Catat Kendaraan
          </div>

          {error && (
            <div style={{ padding: "12px 15px", borderRadius: 12, background: "#fbe9e8", color: "#e0483f", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{error}</div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>TANGGAL</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ marginBottom: 18, position: "relative" }} ref={vehicleInputRef}>
            <label style={labelStyle}>KENDARAAN — KETIK PLAT NOMOR</label>
            <input
              value={vehicleSearch}
              onChange={(e) => { setVehicleSearch(e.target.value); setVehicleId(""); setShowVehicleDropdown(true); }}
              onFocus={() => setShowVehicleDropdown(true)}
              placeholder="Ketik nomor polisi... contoh: B 1234"
              style={{ ...inputStyle, border: vehicleId ? `2px solid ${selectedVehicle ? PLANT_THEME[selectedVehicle.plant].main : "#e1e7f1"}` : "2px solid #e1e7f1" }}
            />
            {showVehicleDropdown && vehicleSearch.trim() !== "" && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, background: "#fff", borderRadius: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.18)", maxHeight: 280, overflowY: "auto", zIndex: 20, border: "1px solid #eef2f9" }}>
                {filteredVehicles.length === 0 ? (
                  <div style={{ padding: 16, color: "#a0aabb", fontSize: 15, textAlign: "center" }}>Tidak ditemukan</div>
                ) : (
                  filteredVehicles.map((v) => (
                    <div
                      key={v.id}
                      onMouseDown={() => pickVehicle(v)}
                      style={{ padding: "13px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f2f5fa" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 16, color: "#0f2847" }}>{v.nopol}</span>
                        <span style={{ fontSize: 13, color: "#7c8aa0", marginLeft: 8 }}>{v.jenis}</span>
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 7, background: PLANT_THEME[v.plant].soft, color: PLANT_THEME[v.plant].text }}>{v.plant}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>DRIVER</label>
              <button type="button" onClick={() => setUseManualDriver((v) => !v)} style={{ background: "none", border: "none", color: "#2f5fe0", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0 }}>
                {useManualDriver ? "Pilih dari daftar" : "Ketik manual"}
              </button>
            </div>
            {useManualDriver ? (
              <input value={driverManual} onChange={(e) => setDriverManual(e.target.value)} placeholder="Nama driver" style={inputStyle} />
            ) : (
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)} style={inputStyle}>
                <option value="">-- Pilih Driver --</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
              </select>
            )}
          </div>

          <div style={{ marginBottom: 26 }}>
            <label style={labelStyle}>TUJUAN {selectedVehicle?.plant === "PRB" ? "/ KEPERLUAN" : ""}</label>
            <input
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
              width: "100%", padding: 18, borderRadius: 16, border: "none",
              background: canSubmit ? `linear-gradient(135deg, ${selectedVehicle ? PLANT_THEME[selectedVehicle.plant].main : "#2f5fe0"}, ${selectedVehicle ? PLANT_THEME[selectedVehicle.plant].text : "#1f44b8"})` : "#e1e7f1",
              color: canSubmit ? "#fff" : "#a0aabb", fontWeight: 800, fontSize: 18, cursor: canSubmit ? "pointer" : "not-allowed",
              boxShadow: canSubmit ? `0 10px 24px ${selectedVehicle ? PLANT_THEME[selectedVehicle.plant].main : "#2f5fe0"}55` : "none",
              transition: "transform 0.15s ease",
            }}
            onMouseDown={(e) => canSubmit && (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {submitting ? "Menyimpan..." : selectedVehicle?.plant === "PRB" ? "🔵 CATAT CHECK-IN" : "🟠 CATAT KELUAR"}
          </button>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0f2847" }}>Aktivitas Hari Ini</div>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "10px 16px", fontSize: 14 }} />
          </div>

          {loadingLogs ? (
            <div style={{ padding: 60, textAlign: "center", color: "#a0aabb", fontSize: 16, background: "#fff", borderRadius: 20 }}>Memuat...</div>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#7c8aa0", marginBottom: 12, letterSpacing: "0.03em" }}>
                🟠 SEDANG KELUAR / CHECK-IN ({activeLogs.length})
              </div>
              {activeLogs.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "#a0aabb", fontSize: 15, background: "#fff", borderRadius: 18, marginBottom: 26 }}>Tidak ada kendaraan aktif.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginBottom: 30 }}>
                  {activeLogs.map((l) => {
                    const theme = PLANT_THEME[l.plant];
                    return (
                      <div
                        key={l.id}
                        style={{
                          background: "#fff", borderRadius: 18, padding: 20, boxShadow: "0 8px 24px rgba(15,40,71,0.08)",
                          borderLeft: `6px solid ${theme.main}`, transition: "transform 0.15s ease, box-shadow 0.15s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 14px 32px rgba(15,40,71,0.14)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(15,40,71,0.08)"; }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f2847" }}>{l.nopol}</div>
                          <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 8, background: theme.soft, color: theme.text }}>{l.plant}</span>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2d47", marginBottom: 4 }}>👤 {l.driverName}</div>
                        {l.tujuan && <div style={{ fontSize: 14, color: "#7c8aa0", marginBottom: 10 }}>📍 {l.tujuan}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.main, animation: "gatePulse 1.6s ease-in-out infinite" }} />
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: theme.text }}>
                            {actionLabel(l.plant, false)} · {liveDuration(l.timeOut || l.timeIn, tick)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleControl(l)}
                          disabled={busyLogId === l.id}
                          style={{
                            width: "100%", padding: "13px", borderRadius: 12, border: "none",
                            background: "linear-gradient(135deg,#17a673,#0f9c8f)", color: "#fff", fontWeight: 800, fontSize: 15,
                            cursor: busyLogId === l.id ? "wait" : "pointer", opacity: busyLogId === l.id ? 0.6 : 1,
                          }}
                        >
                          {busyLogId === l.id ? "Menyimpan..." : `✓ ${controlLabel(l.plant)}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: 14, fontWeight: 800, color: "#7c8aa0", marginBottom: 12, letterSpacing: "0.03em" }}>
                ✅ SELESAI HARI INI ({doneLogs.length})
              </div>
              {doneLogs.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "#a0aabb", fontSize: 15, background: "#fff", borderRadius: 18 }}>Belum ada yang selesai.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                  {doneLogs.map((l) => {
                    const theme = PLANT_THEME[l.plant];
                    return (
                      <div key={l.id} style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 4px 14px rgba(15,40,71,0.05)", borderLeft: `5px solid ${theme.main}`, opacity: 0.85 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color: "#0f2847" }}>{l.nopol}</div>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 7, background: theme.soft, color: theme.text }}>{l.plant}</span>
                        </div>
                        <div style={{ fontSize: 13.5, color: "#435773", marginBottom: 6 }}>{l.driverName}</div>
                        <div style={{ fontSize: 12.5, color: "#a0aabb" }}>{fmtJam(l.timeOut)} → {fmtJam(l.timeIn)}</div>
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
        @keyframes gatePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
