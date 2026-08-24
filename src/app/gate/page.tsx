"use client";
import { useEffect, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  getGateDashboard,
  getActiveDriversForGate,
  openGateCheckpoint,
  closeGateCheckpoint,
} from "@/lib/api";
import type { GateDashboardRow, GateDriverOption } from "@/lib/types";

function actionLabel(plant: string, action: "OUT" | "IN" | "DONE"): string {
  if (action === "DONE") return plant === "CIK" ? "Kembali" : "Check-Out";
  return plant === "CIK" ? "Keluar" : "Check-In";
}
function actionColor(action: "OUT" | "IN" | "DONE"): string {
  return action === "DONE" ? "#17a673" : "#f08c1a";
}
function fmtJam(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function fmtDurasiSince(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}j ${mins % 60}m`;
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 10,
  border: "1.5px solid #e1e7f1",
  background: "#f6f8fc",
  fontSize: 14,
  color: "#0f2847",
  fontFamily: "inherit",
  outline: "none",
};

export default function GatePage() {
  const [rows, setRows] = useState<GateDashboardRow[]>([]);
  const [drivers, setDrivers] = useState<GateDriverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyVehicleId, setBusyVehicleId] = useState<string | null>(null);

  // Quick-open modal state (dipakai saat kendaraan standby diklik "Keluar"/"Check-In")
  const [openTarget, setOpenTarget] = useState<GateDashboardRow | null>(null);
  const [driverId, setDriverId] = useState("");
  const [useManualDriver, setUseManualDriver] = useState(false);
  const [driverManual, setDriverManual] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getGateDashboard();
      setRows(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data gate");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getActiveDriversForGate().then(setDrivers).catch(() => {});
    load();
    const interval = setInterval(load, 15000); // auto-refresh tiap 15 detik
    return () => clearInterval(interval);
  }, [load]);

  function openQuickForm(row: GateDashboardRow) {
    setOpenTarget(row);
    setDriverId("");
    setUseManualDriver(false);
    setDriverManual("");
    setTujuan("");
  }

  async function handleQuickOpenSubmit() {
    if (!openTarget) return;
    const driverOk = useManualDriver ? driverManual.trim() !== "" : driverId !== "";
    if (!driverOk) return;
    setSubmitting(true);
    try {
      await openGateCheckpoint({
        vehicleId: openTarget.vehicleId,
        driverId: useManualDriver ? null : driverId,
        driverNameManual: useManualDriver ? driverManual.trim() : null,
        tujuan: tujuan.trim(),
      });
      setOpenTarget(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mencatat data");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose(row: GateDashboardRow) {
    setBusyVehicleId(row.vehicleId);
    try {
      await closeGateCheckpoint(row.vehicleId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mencatat data");
    } finally {
      setBusyVehicleId(null);
    }
  }

  const activeRows = rows.filter((r) => r.nextAction === "DONE");
  const standbyRows = rows.filter((r) => r.nextAction !== "DONE");

  return (
    <div style={{ minHeight: "100vh", background: "#f6f8fc", fontFamily: "-apple-system,'Segoe UI',sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#0f2847,#0a1930)", padding: "20px 20px 28px", color: "#fff" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>🚧</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Security Gate Dashboard</div>
            <div style={{ fontSize: 12.5, opacity: 0.7 }}>Pencatatan Keluar / Masuk Kendaraan</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "-16px auto 0", padding: "0 16px 40px" }}>
        {error && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#fbe9e8", color: "#e0483f", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 50, color: "#7c8aa0", background: "#fff", borderRadius: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
            Memuat data...
          </div>
        ) : (
          <>
            {/* Sedang di luar / check-in */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", marginBottom: 16, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef2f9", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f08c1a" }} />
                <span style={{ fontWeight: 800, fontSize: 14, color: "#0f2847" }}>Sedang Keluar / Check-In</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#7c8aa0" }}>{activeRows.length} kendaraan</span>
              </div>
              {activeRows.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#a0aabb", fontSize: 13 }}>Tidak ada kendaraan yang sedang keluar/check-in.</div>
              ) : (
                activeRows.map((r) => (
                  <div key={r.vehicleId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid #f2f5fa" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontWeight: 800, fontSize: 14.5, color: "#0f2847" }}>{r.nopol}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 6, background: r.plant === "CIK" ? "#e8edff" : "#fdf1e2", color: r.plant === "CIK" ? "#2f5fe0" : "#b25700" }}>{r.plant}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#435773" }}>{r.driverName || "-"}{r.tujuan ? ` · ${r.tujuan}` : ""}</div>
                      <div style={{ fontSize: 11.5, color: "#a0aabb", marginTop: 2 }}>
                        Sejak {fmtJam(r.openSince)} · {fmtDurasiSince(r.openSince)} lalu
                      </div>
                    </div>
                    <button
                      onClick={() => handleClose(r)}
                      disabled={busyVehicleId === r.vehicleId}
                      style={{
                        flexShrink: 0,
                        padding: "10px 18px",
                        borderRadius: 12,
                        border: "none",
                        background: actionColor("DONE"),
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: busyVehicleId === r.vehicleId ? "wait" : "pointer",
                        opacity: busyVehicleId === r.vehicleId ? 0.6 : 1,
                      }}
                    >
                      {busyVehicleId === r.vehicleId ? "..." : actionLabel(r.plant, "DONE")}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Standby */}
            <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef2f9", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#cbd5e1" }} />
                <span style={{ fontWeight: 800, fontSize: 14, color: "#0f2847" }}>Standby</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#7c8aa0" }}>{standbyRows.length} kendaraan</span>
              </div>
              {standbyRows.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#a0aabb", fontSize: 13 }}>Semua kendaraan sedang keluar/check-in.</div>
              ) : (
                standbyRows.map((r) => (
                  <div key={r.vehicleId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid #f2f5fa" }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#0f2847" }}>{r.nopol}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 6, background: r.plant === "CIK" ? "#e8edff" : "#fdf1e2", color: r.plant === "CIK" ? "#2f5fe0" : "#b25700" }}>{r.plant}</span>
                      <span style={{ fontSize: 12, color: "#a0aabb" }}>{r.jenis}</span>
                    </div>
                    <button
                      onClick={() => openQuickForm(r)}
                      style={{
                        flexShrink: 0,
                        padding: "9px 16px",
                        borderRadius: 12,
                        border: "none",
                        background: actionColor(r.nextAction),
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {actionLabel(r.plant, r.nextAction)}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {openTarget && (
        <div
          onClick={() => !submitting && setOpenTarget(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(6,13,24,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 20, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f2847", marginBottom: 2 }}>
              {actionLabel(openTarget.plant, openTarget.nextAction)} — {openTarget.nopol}
            </div>
            <div style={{ fontSize: 12.5, color: "#7c8aa0", marginBottom: 18 }}>{openTarget.jenis} · {openTarget.plant}</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#435773" }}>DRIVER *</label>
                <button type="button" onClick={() => setUseManualDriver((v) => !v)} style={{ background: "none", border: "none", color: "#2f5fe0", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                  {useManualDriver ? "Pilih dari daftar" : "Driver lain (ketik manual)"}
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

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#435773", marginBottom: 6, display: "block" }}>
                TUJUAN {openTarget.plant === "PRB" ? "/ KEPERLUAN" : ""}
              </label>
              <input
                value={tujuan}
                onChange={(e) => setTujuan(e.target.value)}
                placeholder={openTarget.plant === "CIK" ? "Contoh: Antar dokumen ke Plant PRB" : "Contoh: Pengiriman barang"}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setOpenTarget(null)} disabled={submitting} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #e1e7f1", background: "#f6f8fc", color: "#435773", fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button
                onClick={handleQuickOpenSubmit}
                disabled={submitting || (useManualDriver ? driverManual.trim() === "" : driverId === "")}
                style={{
                  flex: 2, padding: 12, borderRadius: 12, border: "none",
                  background: actionColor(openTarget.nextAction), color: "#fff", fontWeight: 800, fontSize: 14,
                  cursor: submitting ? "wait" : "pointer",
                  opacity: (useManualDriver ? driverManual.trim() === "" : driverId === "") ? 0.5 : 1,
                }}
              >
                {submitting ? "Menyimpan..." : `CATAT ${actionLabel(openTarget.plant, openTarget.nextAction).toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
