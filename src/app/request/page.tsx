"use client";
import { useState } from "react";
import type { CSSProperties } from "react";
import { submitEmployeeRequest } from "@/lib/api";
import type { EmployeeRequestType } from "@/lib/types";

const REQUEST_TYPES: { value: EmployeeRequestType; label: string; icon: string; placeholder: string }[] = [
  { value: "DRIVER", label: "Request Driver / Kendaraan", icon: "🚗", placeholder: "Contoh: Butuh driver untuk antar dokumen ke PRB besok jam 09.00" },
  { value: "TONER", label: "Request Toner Printer", icon: "🖨️", placeholder: "Contoh: Toner printer lantai 2 - Finance sudah habis" },
  { value: "OTHER", label: "Lainnya", icon: "📝", placeholder: "Jelaskan kebutuhan Anda..." },
];

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  border: "1.5px solid #e1e7f1",
  background: "#f6f8fc",
  fontSize: 15,
  color: "#0f2847",
  fontFamily: "inherit",
  outline: "none",
};
const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 800, color: "#435773", marginBottom: 7, display: "block", letterSpacing: "0.02em" };

export default function RequestPage() {
  const [requestType, setRequestType] = useState<EmployeeRequestType>("DRIVER");
  const [employeeName, setEmployeeName] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const selectedType = REQUEST_TYPES.find((t) => t.value === requestType)!;
  const canSubmit = employeeName.trim() !== "" && description.trim() !== "" && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await submitEmployeeRequest({
        requestType,
        employeeName: employeeName.trim(),
        department: department.trim(),
        phone: phone.trim(),
        description: description.trim(),
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim permintaan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setRequestType("DRIVER");
    setEmployeeName(""); setDepartment(""); setPhone(""); setDescription("");
    setSuccess(false); setError("");
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
      <div style={{ width: "100%", maxWidth: 460, background: "#ffffff", borderRadius: 24, padding: 30, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#0f2847", border: "2px solid #2f5fe0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", overflow: "hidden" }}>
            <img src="/logo.png" alt="CIKOPS" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0f2847" }}>Form Permintaan Karyawan</div>
          <div style={{ fontSize: 13, color: "#7c8aa0", marginTop: 3 }}>CIKOPS FLEET — General Affair</div>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#e5f7ef", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 30 }}>✓</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f2847", marginBottom: 6 }}>Permintaan Terkirim</div>
            <div style={{ fontSize: 13.5, color: "#7c8aa0", marginBottom: 26, lineHeight: 1.6 }}>
              Terima kasih, {employeeName}. Permintaan Anda sudah kami terima dan akan segera diproses oleh tim GA.
            </div>
            <button
              onClick={resetForm}
              style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#2f5fe0,#1f44b8)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
            >
              Kirim Permintaan Lain
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fbe9e8", color: "#e0483f", fontSize: 13, marginBottom: 16 }}>{error}</div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>JENIS PERMINTAAN *</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {REQUEST_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setRequestType(t.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, textAlign: "left",
                      border: requestType === t.value ? "2px solid #2f5fe0" : "1.5px solid #e1e7f1",
                      background: requestType === t.value ? "#eef3ff" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{t.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: requestType === t.value ? "#1f44b8" : "#0f2847" }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>NAMA LENGKAP *</label>
              <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Nama Anda" style={inputStyle} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>DEPARTEMEN</label>
                <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Contoh: Finance" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>NO. HP</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>DETAIL PERMINTAAN *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={selectedType.placeholder}
                rows={4}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

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
          </>
        )}
      </div>
    </div>
  );
}
