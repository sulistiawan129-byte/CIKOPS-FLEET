"use client";
import { useEffect, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  getActiveVehiclesForGate,
  getActiveDriversForGate,
  getGateLogsPublic,
  openGateCheckpoint,
  closeGateCheckpoint,
} from "@/lib/api";
import type { GateVehicleOption, GateDriverOption, VehicleGateLog } from "@/lib/types";

function actionLabel(plant: string, done: boolean): string {
  if (plant === "CIK") return done ? "Sudah Kembali" : "Sedang Keluar";
  return done ? "Sudah Check-Out" : "Sedang Check-In";
}
function controlLabel(plant: string): string {
  return plant === "CIK" ? "Catat Kembali" : "Catat Check-Out";
}
function fmtJam(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 13px",
  borderRadius: 10,
  border: "1.5px solid #e1e7f1",
  background: "#f6f8fc",
  fontSize: 14,
  color: "#0f2847",
  fontFamily: "inherit",
  outline: "none",
};
const labelStyle: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: "#435773", marginBottom: 6, display: "block" };

export default function GatePage() {
  const [vehicles, setVehicles] = useState<GateVehicleOption[]>([]);
  const [drivers, setDrivers] = useState<GateDriverOption[]>([]);
  const [logs, setLogs] = useState<VehicleGateLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [error, setError] = useState("");

  const [tanggal, setTanggal] = useState(todayStr());
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [useManualDriver, setUseManualDriver] = useState(false);
  const [driverManual, setDriverManual] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyLogId, setBusyLogId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const data = await getGateLogsPublic(tanggal);
      setLogs(data);
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
    const interval = setInterval(loadLogs, 15000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const driverOk = useManualDriver ? driverManual.trim() !== "" : driverId !== "";
  const canSubmit = vehicleId !== "" && driverOk && !submitting;

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
      setVehicleId("");
      setDriverId("");
      setUseManualDriver(false);
      setDriverManual("");
      setTujuan("");
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

  return (
    <div style={{ minHeight: "100vh", background: "#f6f8fc", fontFamily: "-apple-system,'Segoe UI',sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#0f2847,#0a1930)", padding: "20px 20px 60px", color: "#fff" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>🚧</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Security Gate Log</div>
            <div style={{ fontSize: 12.5, opacity: 0.7 }}>Pencatatan Keluar / Masuk Kendaraan</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "-40px auto 0", padding: "0 16px 40px" }}>
        {error && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#fbe9e8", color: "#e0483f", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.1)", padding: 22, marginBottom: 20 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0f2847", marginBottom: 16 }}>+ Catat Kendaraan Keluar / Check-In</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>TANGGAL *</label>
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>KENDARAAN *</label>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={inputStyle}>
                <option value="">-- Pilih --</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.nopol} ({v.plant})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>DRIVER *</label>
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

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>TUJUAN {selectedVehicle?.plant === "PRB" ? "/ KEPERLUAN" : ""}</label>
            <input
              value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              placeholder={selectedVehicle?.plant === "PRB" ? "Contoh: Pengiriman barang" : "Contoh: Antar dokumen ke Plant PRB"}
              style={inputStyle}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 12,
              border: "none",
              background: canSubmit ? "linear-gradient(135deg,#2f5fe0,#1f44b8)" : "#e1e7f1",
              color: canSubmit ? "#fff" : "#a0aabb",
              fontWeight: 800,
              fontSize: 15,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Menyimpan..." : selectedVehicle?.plant === "PRB" ? "CATAT CHECK-IN" : "CATAT KELUAR"}
          </button>
        </div>

        <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef2f9", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: "#0f2847" }}>Daftar Catatan</span>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12.5, marginLeft: "auto" }} />
          </div>

          {loadingLogs ? (
            <div style={{ padding: 30, textAlign: "center", color: "#a0aabb", fontSize: 13 }}>Memuat...</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "#a0aabb", fontSize: 13 }}>Belum ada catatan untuk tanggal ini.</div>
          ) : (
            logs.map((l) => {
              const done = l.status === "DONE";
              return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid #f2f5fa" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: "#0f2847" }}>{l.nopol}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 6, background: l.plant === "CIK" ? "#e8edff" : "#fdf1e2", color: l.plant === "CIK" ? "#2f5fe0" : "#b25700" }}>{l.plant}</span>
                      <span
                        style={{
                          fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 6,
                          background: done ? "#e5f7ef" : "#fdf1e2",
                          color: done ? "#17a673" : "#f08c1a",
                        }}
                      >
                        {actionLabel(l.plant, done)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#435773" }}>{l.driverName}{l.tujuan ? ` · ${l.tujuan}` : ""}</div>
                    <div style={{ fontSize: 11.5, color: "#a0aabb", marginTop: 2 }}>
                      Keluar/In: {fmtJam(l.timeOut)} · Masuk/Out: {fmtJam(l.timeIn)}
                    </div>
                  </div>
                  {!done && (
                    <button
                      onClick={() => handleControl(l)}
                      disabled={busyLogId === l.id}
                      style={{
                        flexShrink: 0, padding: "9px 15px", borderRadius: 10, border: "none",
                        background: "#17a673", color: "#fff", fontWeight: 700, fontSize: 12.5,
                        cursor: busyLogId === l.id ? "wait" : "pointer", opacity: busyLogId === l.id ? 0.6 : 1,
                      }}
                    >
                      {busyLogId === l.id ? "..." : controlLabel(l.plant)}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
