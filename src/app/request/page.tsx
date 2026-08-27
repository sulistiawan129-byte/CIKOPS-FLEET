"use client";
import { useState } from "react";
import type { CSSProperties } from "react";
import { submitEmployeeRequest, submitPrinterRequestPublic } from "@/lib/api";

type FormKind = "DRIVER" | "PRINTER" | "OTHER";

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "13px 15px",
  borderRadius: 12,
  border: "1.5px solid #e1e7f1",
  background: "#f6f8fc",
  fontSize: 14.5,
  color: "#0f2847",
  fontFamily: "inherit",
  outline: "none",
};
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 800, color: "#435773", marginBottom: 6, display: "block", letterSpacing: "0.02em" };

function todayLabel(): string {
  return new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Receipt {
  refId: string;
  createdAt: string;
  kind: FormKind;
  employeeName: string;
  department: string;
  lines: { label: string; value: string }[];
}

export default function RequestPage() {
  const [kind, setKind] = useState<FormKind>("DRIVER");
  const [employeeName, setEmployeeName] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");

  // Driver fields
  const [eventDate, setEventDate] = useState(todayISO());
  const [destination, setDestination] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Printer fields
  const [printAction, setPrintAction] = useState<"RESET_KUOTA" | "TAMBAH_KUOTA">("RESET_KUOTA");
  const [printUserId, setPrintUserId] = useState("");
  const [printReason, setPrintReason] = useState("");

  // Other fields
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  function resetAll() {
    setKind("DRIVER");
    setEmployeeName(""); setDepartment(""); setPhone("");
    setEventDate(todayISO()); setDestination(""); setDepartureTime(""); setPurpose(""); setAdditionalNotes("");
    setPrintAction("RESET_KUOTA"); setPrintUserId(""); setPrintReason("");
    setDescription("");
    setReceipt(null); setError("");
  }

  const canSubmit =
    employeeName.trim() !== "" &&
    !submitting &&
    (kind === "DRIVER"
      ? eventDate !== "" && destination.trim() !== "" && departureTime !== "" && purpose.trim() !== ""
      : kind === "PRINTER"
      ? printUserId.trim() !== "" && (printAction === "RESET_KUOTA" || printReason.trim() !== "")
      : description.trim() !== "");

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      if (kind === "DRIVER") {
        const result = await submitEmployeeRequest({
          requestType: "DRIVER",
          employeeName: employeeName.trim(),
          department: department.trim(),
          phone: phone.trim(),
          description: purpose.trim(),
          details: { eventDate, destination: destination.trim(), departureTime, purpose: purpose.trim(), additionalNotes: additionalNotes.trim() },
        });
        setReceipt({
          refId: result.id, createdAt: result.createdAt, kind, employeeName: employeeName.trim(), department: department.trim(),
          lines: [
            { label: "Tanggal Event/Acara", value: new Date(eventDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) },
            { label: "Tujuan", value: destination.trim() },
            { label: "Jam Berangkat", value: departureTime },
            { label: "Keperluan", value: purpose.trim() },
            ...(additionalNotes.trim() ? [{ label: "Catatan Tambahan", value: additionalNotes.trim() }] : []),
          ],
        });
      } else if (kind === "PRINTER") {
        const result = await submitPrinterRequestPublic({
          requestType: printAction,
          employeeName: employeeName.trim(),
          department: department.trim(),
          printUserId: printUserId.trim(),
          notes: printReason.trim(),
        });
        setReceipt({
          refId: result.id, createdAt: result.createdAt, kind, employeeName: employeeName.trim(), department: department.trim(),
          lines: [
            { label: "Jenis Permintaan", value: printAction === "RESET_KUOTA" ? "Reset Kuota" : "Tambah Kuota" },
            { label: "User ID Print", value: printUserId.trim() },
            ...(printAction === "TAMBAH_KUOTA" ? [{ label: "Alasan / Keperluan", value: printReason.trim() }] : []),
          ],
        });
      } else {
        const result = await submitEmployeeRequest({
          requestType: "OTHER",
          employeeName: employeeName.trim(),
          department: department.trim(),
          phone: phone.trim(),
          description: description.trim(),
        });
        setReceipt({
          refId: result.id, createdAt: result.createdAt, kind, employeeName: employeeName.trim(), department: department.trim(),
          lines: [{ label: "Detail Permintaan", value: description.trim() }],
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim permintaan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    const kindLabel = receipt.kind === "DRIVER" ? "Request Driver / Kendaraan" : receipt.kind === "PRINTER" ? "Permintaan Kuota Printer" : "Permintaan Lainnya";
    return (
      <div style={{ minHeight: "100vh", background: "#eef2f9", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "-apple-system,'Segoe UI',sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 460 }}>
          <div id="receipt-print-area" style={{ background: "#fff", borderRadius: 20, padding: 30, boxShadow: "0 10px 40px rgba(15,40,71,0.12)" }}>
            <div style={{ textAlign: "center", marginBottom: 20, paddingBottom: 20, borderBottom: "2px dashed #dbe4f0" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#0f2847", border: "2px solid #2f5fe0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", overflow: "hidden" }}>
                <img src="/logo.png" alt="CIKOPS" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f2847" }}>BUKTI PERMINTAAN</div>
              <div style={{ fontSize: 12, color: "#7c8aa0" }}>CIKOPS FLEET — General Affair</div>
            </div>

            <div style={{ fontSize: 12.5, color: "#7c8aa0", marginBottom: 4 }}>No. Referensi</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f2847", fontFamily: "monospace", marginBottom: 16 }}>{receipt.refId.slice(0, 8).toUpperCase()}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11.5, color: "#7c8aa0" }}>Tanggal Pengajuan</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f2847" }}>{new Date(receipt.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: "#7c8aa0" }}>Jenis Permintaan</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f2847" }}>{kindLabel}</div>
              </div>
            </div>

            <div style={{ background: "#f6f8fc", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0f2847" }}>{receipt.employeeName}</div>
              <div style={{ fontSize: 12.5, color: "#7c8aa0" }}>{receipt.department || "-"}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              {receipt.lines.map((l) => (
                <div key={l.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #f2f5fa", fontSize: 13 }}>
                  <span style={{ color: "#7c8aa0" }}>{l.label}</span>
                  <span style={{ fontWeight: 700, color: "#0f2847", textAlign: "right" }}>{l.value}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", padding: "10px 0", background: "#fdf1e0", borderRadius: 10, fontSize: 12.5, fontWeight: 700, color: "#b25700" }}>
              STATUS: MENUNGGU DIPROSES
            </div>
          </div>

          <div className="no-print" style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={resetAll} style={{ flex: 1, padding: 14, borderRadius: 14, border: "1.5px solid #dbe4f0", background: "#fff", color: "#435773", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Kirim Permintaan Lain
            </button>
            <button onClick={() => window.print()} style={{ flex: 1, padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#2f5fe0,#1f44b8)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              🖨️ Cetak Bukti
            </button>
          </div>
        </div>

        <style>{`
          @media print {
            .no-print { display: none !important; }
            body * { visibility: hidden; }
            #receipt-print-area, #receipt-print-area * { visibility: visible; }
            #receipt-print-area { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a1930, #0f2847)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "-apple-system, 'Segoe UI', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#ffffff", borderRadius: 24, padding: 30, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#0f2847", border: "2px solid #2f5fe0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", overflow: "hidden" }}>
            <img src="/logo.png" alt="CIKOPS" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0f2847" }}>Form Permintaan Karyawan</div>
          <div style={{ fontSize: 13, color: "#7c8aa0", marginTop: 3 }}>CIKOPS FLEET — General Affair</div>
        </div>

        {error && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fbe9e8", color: "#e0483f", fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        {/* Jenis Permintaan */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>JENIS PERMINTAAN *</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {([
              ["DRIVER", "🚗", "Request Driver / Kendaraan"],
              ["PRINTER", "🖨️", "Reset / Tambah Kuota Printer"],
              ["OTHER", "📝", "Lainnya"],
            ] as const).map(([val, icon, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setKind(val)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, textAlign: "left",
                  border: kind === val ? "2px solid #2f5fe0" : "1.5px solid #e1e7f1",
                  background: kind === val ? "#eef3ff" : "#fff", cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: kind === val ? "#1f44b8" : "#0f2847" }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Data umum */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>NAMA LENGKAP *</label>
          <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Nama Anda" style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>DEPARTEMEN</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Contoh: Finance" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>NO. HP</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" style={inputStyle} />
          </div>
        </div>

        <div style={{ height: 1, background: "#eef2f9", margin: "0 0 18px" }} />

        {/* Field dinamis per jenis */}
        {kind === "DRIVER" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TANGGAL PENGAJUAN</label>
              <div style={{ ...inputStyle, color: "#7c8aa0", background: "#eef1f7" }}>{todayLabel()} (Otomatis)</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TANGGAL EVENT / ACARA *</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TUJUAN *</label>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Contoh: Kantor PRB" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>JAM BERANGKAT *</label>
              <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>KEPERLUAN *</label>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Contoh: Meeting dengan vendor" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>CATATAN TAMBAHAN</label>
              <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows={2} placeholder="Opsional..." style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            </div>
          </>
        )}

        {kind === "PRINTER" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TANGGAL PENGAJUAN</label>
              <div style={{ ...inputStyle, color: "#7c8aa0", background: "#eef1f7" }}>{todayLabel()} (Otomatis)</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>PILIHAN *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["RESET_KUOTA", "TAMBAH_KUOTA"] as const).map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setPrintAction(act)}
                    style={{ flex: 1, padding: "12px", borderRadius: 12, fontWeight: 700, fontSize: 13.5, cursor: "pointer", border: printAction === act ? "2px solid #2f5fe0" : "1.5px solid #e1e7f1", background: printAction === act ? "#eef3ff" : "#fff", color: printAction === act ? "#1f44b8" : "#0f2847" }}
                  >
                    {act === "RESET_KUOTA" ? "Reset Kuota" : "Tambah Kuota"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>USER ID PRINT *</label>
              <input value={printUserId} onChange={(e) => setPrintUserId(e.target.value)} placeholder="Contoh: budi.santoso" style={inputStyle} />
            </div>
            {printAction === "TAMBAH_KUOTA" && (
              <div style={{ marginBottom: 22 }}>
                <label style={labelStyle}>ALASAN / KEPERLUAN *</label>
                <textarea value={printReason} onChange={(e) => setPrintReason(e.target.value)} rows={2} placeholder="Contoh: Kuota habis, butuh cetak laporan bulanan" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
              </div>
            )}
            {printAction === "RESET_KUOTA" && <div style={{ marginBottom: 8 }} />}
          </>
        )}

        {kind === "OTHER" && (
          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>DETAIL PERMINTAAN *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Jelaskan kebutuhan Anda..." style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: "100%", padding: 15, borderRadius: 14, border: "none",
            background: canSubmit ? "linear-gradient(135deg,#2f5fe0,#1f44b8)" : "#e1e7f1",
            color: canSubmit ? "#fff" : "#a0aabb", fontWeight: 800, fontSize: 16,
            cursor: canSubmit ? "pointer" : "not-allowed",
            boxShadow: canSubmit ? "0 10px 24px rgba(47,95,224,0.3)" : "none",
          }}
        >
          {submitting ? "MENGIRIM..." : "KIRIM PERMINTAAN"}
        </button>
      </div>
    </div>
  );
}
