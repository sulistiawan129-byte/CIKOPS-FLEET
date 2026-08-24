"use client";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  getActiveVehiclesForGate,
  getActiveDriversForGate,
  getVehicleGateStatus,
  recordGateCheckpoint,
} from "@/lib/api";
import type { GateVehicleOption, GateDriverOption } from "@/lib/types";

type ActionKind = "OUT" | "IN" | "DONE";

function actionLabel(plant: string, action: ActionKind): string {
  if (action === "DONE") {
    return plant === "CIK" ? "Kembali" : "Check-Out";
  }
  return plant === "CIK" ? "Keluar" : "Check-In";
}

function actionColor(action: ActionKind): string {
  if (action === "DONE") return "#17a673";
  return "#f08c1a";
}

function fmtJam(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 12,
  border: "1.5px solid #e1e7f1",
  background: "#f6f8fc",
  fontSize: 15,
  color: "#0f2847",
  fontFamily: "inherit",
  outline: "none",
};

export default function GatePage() {
  const [vehicles, setVehicles] = useState<GateVehicleOption[]>([]);
  const [drivers, setDrivers] = useState<GateDriverOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [useManualDriver, setUseManualDriver] = useState(false);
  const [driverManual, setDriverManual] = useState("");
  const [tujuan, setTujuan] = useState("");

  const [preview, setPreview] = useState<{ plant: string; nextAction: ActionKind; openSince: string | null; openTujuan: string | null } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ plant: string; action: ActionKind; time: string } | null>(null);

  useEffect(() => {
    Promise.all([getActiveVehiclesForGate(), getActiveDriversForGate()])
      .then(([v, d]) => {
        setVehicles(v);
        setDrivers(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat data"))
      .finally(() => setLoadingOptions(false));
  }, []);

  useEffect(() => {
    if (!vehicleId) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    setError("");
    getVehicleGateStatus(vehicleId)
      .then(setPreview)
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat status kendaraan"))
      .finally(() => setLoadingPreview(false));
  }, [vehicleId]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const isOpening = preview && preview.nextAction !== "DONE";
  const canSubmit =
    !!vehicleId &&
    !!preview &&
    !submitting &&
    (!isOpening || (useManualDriver ? driverManual.trim() !== "" : driverId !== ""));

  async function handleSubmit() {
    if (!canSubmit || !preview) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await recordGateCheckpoint({
        vehicleId,
        driverId: useManualDriver ? null : driverId || null,
        driverNameManual: useManualDriver ? driverManual.trim() : null,
        tujuan: tujuan.trim(),
      });
      setSuccess({ plant: result.plant, action: result.action as ActionKind, time: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencatat data");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNext() {
    setVehicleId("");
    setDriverId("");
    setUseManualDriver(false);
    setDriverManual("");
    setTujuan("");
    setPreview(null);
    setSuccess(null);
    setError("");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0a1930, #0f2847)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "-apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#ffffff",
          borderRadius: 24,
          padding: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🚧</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0f2847" }}>Security Gate Log</div>
          <div style={{ fontSize: 13, color: "#7c8aa0", marginTop: 2 }}>Pencatatan Keluar / Masuk Kendaraan</div>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: `${actionColor(success.action)}22`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 30,
              }}
            >
              ✓
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f2847", marginBottom: 6 }}>
              Tercatat: {actionLabel(success.plant, success.action)}
            </div>
            <div style={{ fontSize: 13, color: "#7c8aa0", marginBottom: 24 }}>
              {selectedVehicle?.nopol} · {fmtJam(success.time)}
            </div>
            <button
              onClick={resetForNext}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg, #2f5fe0, #1f44b8)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Catat Kendaraan Lain
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fbe9e8", color: "#e0483f", fontSize: 13, marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#435773", marginBottom: 6, display: "block" }}>
                PILIH KENDARAAN *
              </label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                disabled={loadingOptions}
                style={selectStyle}
              >
                <option value="">{loadingOptions ? "Memuat..." : "-- Pilih Nomor Polisi --"}</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nopol} — {v.jenis} ({v.plant})
                  </option>
                ))}
              </select>
            </div>

            {loadingPreview && (
              <div style={{ textAlign: "center", padding: 16, color: "#7c8aa0", fontSize: 13 }}>Mengecek status kendaraan...</div>
            )}

            {preview && !loadingPreview && (
              <>
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: `${actionColor(preview.nextAction)}15`,
                    border: `1px solid ${actionColor(preview.nextAction)}40`,
                    marginBottom: 16,
                    fontSize: 13,
                  }}
                >
                  {preview.nextAction === "DONE" ? (
                    <>
                      <div style={{ fontWeight: 700, color: "#0f2847" }}>
                        Kendaraan ini sedang {preview.plant === "CIK" ? "di luar" : "check-in"}
                        {preview.openSince ? ` sejak ${fmtJam(preview.openSince)}` : ""}
                      </div>
                      {preview.openTujuan && <div style={{ color: "#7c8aa0", marginTop: 2 }}>Tujuan: {preview.openTujuan}</div>}
                      <div style={{ marginTop: 6, fontWeight: 800, color: actionColor(preview.nextAction) }}>
                        Akan dicatat sebagai: {actionLabel(preview.plant, preview.nextAction)}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontWeight: 800, color: actionColor(preview.nextAction) }}>
                      Akan dicatat sebagai: {actionLabel(preview.plant, preview.nextAction)}
                    </div>
                  )}
                </div>

                {isOpening && (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: "#435773" }}>DRIVER *</label>
                        <button
                          type="button"
                          onClick={() => setUseManualDriver((v) => !v)}
                          style={{ background: "none", border: "none", color: "#2f5fe0", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
                        >
                          {useManualDriver ? "Pilih dari daftar" : "Driver lain (ketik manual)"}
                        </button>
                      </div>
                      {useManualDriver ? (
                        <input
                          value={driverManual}
                          onChange={(e) => setDriverManual(e.target.value)}
                          placeholder="Nama driver"
                          style={selectStyle}
                        />
                      ) : (
                        <select value={driverId} onChange={(e) => setDriverId(e.target.value)} style={selectStyle}>
                          <option value="">-- Pilih Driver --</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.nama}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "#435773", marginBottom: 6, display: "block" }}>
                        TUJUAN {preview.plant === "PRB" ? "/ KEPERLUAN" : ""}
                      </label>
                      <input
                        value={tujuan}
                        onChange={(e) => setTujuan(e.target.value)}
                        placeholder={preview.plant === "CIK" ? "Contoh: Antar dokumen ke Plant PRB" : "Contoh: Pengiriman barang"}
                        style={selectStyle}
                      />
                    </div>
                  </>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  style={{
                    width: "100%",
                    padding: "15px",
                    borderRadius: 14,
                    border: "none",
                    background: canSubmit ? `linear-gradient(135deg, ${actionColor(preview.nextAction)}, ${actionColor(preview.nextAction)}cc)` : "#e1e7f1",
                    color: canSubmit ? "#fff" : "#a0aabb",
                    fontWeight: 800,
                    fontSize: 16,
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    transition: "transform 0.15s ease",
                  }}
                >
                  {submitting ? "Menyimpan..." : `CATAT ${actionLabel(preview.plant, preview.nextAction).toUpperCase()}`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
