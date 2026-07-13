"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useLang, useTheme } from "@/lib/providers";
import {
  getEmployeeByNik,
  registerLocker,
  verifyLockerRelease,
  releaseLockerByUser,
  sendLockerEmail,
} from "@/lib/lockerApi";

type Screen =
  | "menu"
  | "employee-nik"
  | "employee-form"
  | "intern-form"
  | "end-use"
  | "end-confirm"
  | "result"
  | "end-result";

const TOP_TITLES: Record<Screen, { id: string; en: string }> = {
  menu: { id: "Daftar Locker", en: "Locker Registration" },
  "employee-nik": { id: "Daftar Karyawan", en: "Register — Employee" },
  "employee-form": { id: "Daftar Karyawan", en: "Register — Employee" },
  "intern-form": { id: "Daftar Internship", en: "Register — Internship" },
  "end-use": { id: "Selesai Pakai Locker", en: "End Locker Usage" },
  "end-confirm": { id: "Konfirmasi", en: "Confirm" },
  result: { id: "Berhasil", en: "Success" },
  "end-result": { id: "Berhasil", en: "Success" },
};

export default function LockerPublicPage() {
  const { lang, setLang, t } = useLang();
  const { theme, toggleTheme } = useTheme();

  const [history, setHistory] = useState<Screen[]>(["menu"]);
  const screen = history[history.length - 1];

  const [loading, setLoading] = useState<string | null>(null);

  // Employee NIK step
  const [nik, setNik] = useState("");
  const [namaEmp, setNamaEmp] = useState("");
  const [dept, setDept] = useState("");
  const [nikStatus, setNikStatus] = useState<"" | "loading" | "ok" | "bad">("");

  // Employee contact step
  const [hpEmp, setHpEmp] = useState("");
  const [emailEmp, setEmailEmp] = useState("");

  // Intern form
  const [namaInt, setNamaInt] = useState("");
  const [kampus, setKampus] = useState("");
  const [hpInt, setHpInt] = useState("");
  const [emailInt, setEmailInt] = useState("");
  const [periode, setPeriode] = useState("");
  const [tanggalSelesai, setTanggalSelesai] = useState("");

  // End-of-use
  const [endNumber, setEndNumber] = useState("");
  const [endPin, setEndPin] = useState("");
  const [endUseError, setEndUseError] = useState("");
  const [confirmData, setConfirmData] = useState<{ nama: string; extra: string; periode: string } | null>(null);

  // Result
  const [resultLocker, setResultLocker] = useState("");
  const [resultPin, setResultPin] = useState("");
  const [resultPeriode, setResultPeriode] = useState("");

  function goTo(s: Screen) {
    setHistory((h) => [...h, s]);
  }
  function goBack() {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  }
  function resetApp() {
    setNik(""); setNamaEmp(""); setDept(""); setNikStatus("");
    setHpEmp(""); setEmailEmp("");
    setNamaInt(""); setKampus(""); setHpInt(""); setEmailInt(""); setPeriode(""); setTanggalSelesai("");
    setEndNumber(""); setEndPin(""); setEndUseError(""); setConfirmData(null);
    setHistory(["menu"]);
  }

  // Debounced NIK lookup
  useEffect(() => {
    if (!nik.trim()) {
      setNamaEmp(""); setDept(""); setNikStatus("");
      return;
    }
    setNikStatus("loading");
    const id = setTimeout(async () => {
      try {
        const emp = await getEmployeeByNik(nik.trim());
        if (emp) {
          setNamaEmp(emp.nama);
          setDept(emp.dept);
          setNikStatus("ok");
        } else {
          setNamaEmp(""); setDept("");
          setNikStatus("bad");
        }
      } catch {
        setNikStatus("bad");
      }
    }, 450);
    return () => clearTimeout(id);
  }, [nik]);

  async function submitEmployee() {
    if (!hpEmp.trim() || !emailEmp.trim()) {
      alert(lang === "en" ? "Phone number and email are required." : "Nomor HP dan Email wajib diisi.");
      return;
    }
    setLoading(lang === "en" ? "Registering locker..." : "Mendaftarkan locker...");
    try {
      const res = await registerLocker({
        nama: namaEmp,
        noHp: hpEmp.trim(),
        email: emailEmp.trim(),
        periode: "Employee",
        extra: dept,
      });
      sendLockerEmail({
        kind: "register",
        toEmail: emailEmp.trim(),
        lockerNumber: res.lockerNumber,
        pin: res.pin,
        nama: namaEmp,
        noHp: hpEmp.trim(),
        extra: dept,
        periode: "Employee",
      }).catch(() => {});
      setResultLocker(res.lockerNumber);
      setResultPin(res.pin);
      setResultPeriode(res.periode);
      goTo("result");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(null);
    }
  }

  async function submitIntern() {
    if (!namaInt.trim() || !kampus.trim() || !hpInt.trim() || !emailInt.trim() || !tanggalSelesai) {
      alert(lang === "en" ? "All fields are required, including end date." : "Semua data wajib diisi, termasuk tanggal selesai.");
      return;
    }
    setLoading(lang === "en" ? "Registering locker..." : "Mendaftarkan locker...");
    try {
      const res = await registerLocker({
        nama: namaInt.trim(),
        noHp: hpInt.trim(),
        email: emailInt.trim(),
        periode: periode.trim(),
        extra: kampus.trim(),
        tanggalSelesai,
      });
      sendLockerEmail({
        kind: "register",
        toEmail: emailInt.trim(),
        lockerNumber: res.lockerNumber,
        pin: res.pin,
        nama: namaInt.trim(),
        noHp: hpInt.trim(),
        extra: kampus.trim(),
        periode: res.periode,
      }).catch(() => {});
      setResultLocker(res.lockerNumber);
      setResultPin(res.pin);
      setResultPeriode(res.periode);
      goTo("result");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(null);
    }
  }

  async function verifyEndUse() {
    setEndUseError("");
    if (!endNumber.trim() || !endPin.trim()) {
      setEndUseError(lang === "en" ? "Locker number and PIN are required." : "Nomor locker dan PIN wajib diisi.");
      return;
    }
    setLoading(lang === "en" ? "Checking..." : "Memeriksa data...");
    try {
      const data = await verifyLockerRelease(endNumber.trim(), endPin.trim());
      setConfirmData(data);
      goTo("end-confirm");
    } catch (e) {
      setEndUseError(e instanceof Error ? e.message : "Gagal menghubungi server. Coba lagi.");
    } finally {
      setLoading(null);
    }
  }

  async function confirmEndUse() {
    setLoading(lang === "en" ? "Processing..." : "Memproses...");
    try {
      const res = await releaseLockerByUser(endNumber.trim(), endPin.trim());
      if (res.email) {
        sendLockerEmail({
          kind: "release",
          toEmail: res.email,
          lockerNumber: res.lockerNumber,
          nama: res.nama,
          extra: res.extra,
          periode: res.periode,
          source: "user",
        }).catch(() => {});
      }
      goTo("end-result");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(null);
    }
  }

  const isMobile = typeof window !== "undefined" && window.innerWidth < 480;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: isMobile ? "stretch" : "flex-start",
        padding: isMobile ? 0 : "24px 0",
        background: "linear-gradient(160deg, var(--navy) 0%, var(--brand) 75%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          minHeight: isMobile ? "100vh" : "calc(100vh - 48px)",
          background: "var(--bg)",
          borderRadius: isMobile ? 0 : 26,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* ── Top bar ── */}
        <div style={{ background: "var(--navy)", padding: "20px 20px 18px", display: "flex", alignItems: "center", gap: 12, color: "#fff", flexShrink: 0 }}>
          <button
            onClick={goBack}
            style={{
              width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, cursor: "pointer", color: "#fff",
              visibility: screen === "menu" ? "hidden" : "visible", flexShrink: 0,
            }}
          >
            ←
          </button>
          <img src="/logo.png" alt="Logo" style={{ width: 36, height: 36, background: "#fff", borderRadius: 9, padding: 4, objectFit: "contain" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{lang === "en" ? TOP_TITLES[screen].en : TOP_TITLES[screen].id}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Facility Management</div>
          </div>
          <button
            onClick={() => setLang(lang === "id" ? "en" : "id")}
            style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: "var(--pill)", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            {lang === "id" ? "EN" : "ID"}
          </button>
          <button onClick={toggleTheme} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: "50%", width: 30, height: 30, cursor: "pointer" }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="tabContent" key={screen} style={{ flex: 1, overflowY: "auto", padding: "24px 20px 110px" }}>
          {screen === "menu" && (
            <MenuScreen lang={lang} onPick={(s) => goTo(s)} />
          )}

          {screen === "employee-nik" && (
            <EmployeeNikScreen
              lang={lang}
              nik={nik} setNik={setNik}
              namaEmp={namaEmp} dept={dept} nikStatus={nikStatus}
            />
          )}

          {screen === "employee-form" && (
            <ContactFormScreen
              lang={lang}
              hp={hpEmp} setHp={setHpEmp}
              email={emailEmp} setEmail={setEmailEmp}
            />
          )}

          {screen === "intern-form" && (
            <InternFormScreen
              lang={lang}
              namaInt={namaInt} setNamaInt={setNamaInt}
              kampus={kampus} setKampus={setKampus}
              hpInt={hpInt} setHpInt={setHpInt}
              emailInt={emailInt} setEmailInt={setEmailInt}
              periode={periode} setPeriode={setPeriode}
              tanggalSelesai={tanggalSelesai} setTanggalSelesai={setTanggalSelesai}
            />
          )}

          {screen === "end-use" && (
            <EndUseScreen
              lang={lang}
              number={endNumber} setNumber={setEndNumber}
              pin={endPin} setPin={setEndPin}
              error={endUseError}
            />
          )}

          {screen === "end-confirm" && confirmData && (
            <EndConfirmScreen lang={lang} data={confirmData} />
          )}

          {screen === "result" && (
            <ResultScreen lang={lang} locker={resultLocker} pin={resultPin} periode={resultPeriode} />
          )}

          {screen === "end-result" && <EndResultScreen lang={lang} />}
        </div>

        {/* ── Bottom action bar ── */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--surface)", padding: "14px 20px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)" }}>
          {screen === "employee-nik" && (
            <BigButton disabled={nikStatus !== "ok"} onClick={() => goTo("employee-form")}>
              {lang === "en" ? "Continue" : "Lanjutkan"}
            </BigButton>
          )}
          {screen === "employee-form" && (
            <BigButton onClick={submitEmployee}>{lang === "en" ? "Register Locker" : "Daftarkan Locker"}</BigButton>
          )}
          {screen === "intern-form" && (
            <BigButton onClick={submitIntern}>{lang === "en" ? "Register Locker" : "Daftarkan Locker"}</BigButton>
          )}
          {screen === "end-use" && (
            <BigButton onClick={verifyEndUse}>{lang === "en" ? "Verify" : "Verifikasi"}</BigButton>
          )}
          {screen === "end-confirm" && (
            <BigButton danger onClick={confirmEndUse}>
              {confirmData?.periode === "Employee"
                ? (lang === "en" ? "Confirm Exit" : "Konfirmasi Exit Locker")
                : (lang === "en" ? "Confirm Finished" : "Konfirmasi Selesai")}
            </BigButton>
          )}
          {(screen === "result" || screen === "end-result") && (
            <BigButton onClick={resetApp}>{lang === "en" ? "Back to Menu" : "Kembali ke Menu"}</BigButton>
          )}
        </div>

        {/* ── Loading overlay ── */}
        {loading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(248,250,252,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 50 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", border: "4px solid var(--border)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 13.5, color: "var(--t2)", fontWeight: 600 }}>{loading}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Shared bits
════════════════════════════════════════════════════════════ */

function BigButton({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        height: 52,
        border: "none",
        borderRadius: 14,
        fontSize: 15.5,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        color: "#fff",
        background: disabled ? "var(--t3)" : danger ? "var(--red)" : "linear-gradient(135deg, var(--brand), var(--brand2))",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

const fieldLabel: CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--t2)", marginBottom: 7 };
const fieldInput: CSSProperties = {
  width: "100%", height: 50, padding: "0 15px", borderRadius: 14, border: "1.5px solid var(--border2)",
  fontSize: 15, fontFamily: "var(--font)", background: "var(--surface)", color: "var(--t1)",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={fieldLabel}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SCREENS
════════════════════════════════════════════════════════════ */

function MenuScreen({ lang, onPick }: { lang: string; onPick: (s: Screen) => void }) {
  const tiles: { screen: Screen; icon: string; color: string; titleId: string; titleEn: string; subId: string; subEn: string }[] = [
    { screen: "employee-nik", icon: "🧑‍💼", color: "var(--brand)", titleId: "Daftar sebagai Karyawan", titleEn: "Register as Employee", subId: "Registrasi locker untuk karyawan tetap", subEn: "Locker registration for permanent staff" },
    { screen: "intern-form", icon: "🎓", color: "var(--gold2)", titleId: "Daftar sebagai Internship", titleEn: "Register as Intern", subId: "Registrasi locker untuk peserta magang", subEn: "Locker registration for interns" },
    { screen: "end-use", icon: "🔓", color: "var(--green)", titleId: "Selesai Pakai Locker", titleEn: "End Locker Usage", subId: "Exit / selesai kontrak & magang", subEn: "Exit / end of contract & internship" },
  ];
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>{lang === "en" ? "Welcome 👋" : "Selamat datang 👋"}</div>
      <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 22 }}>
        {lang === "en" ? "Choose a menu below to continue." : "Pilih salah satu menu di bawah untuk melanjutkan."}
      </div>
      {tiles.map((tile) => (
        <button
          key={tile.screen}
          onClick={() => onPick(tile.screen)}
          className="statPop"
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 14, background: "var(--surface)",
            border: "1px solid var(--border2)", borderRadius: 16, padding: 16, marginBottom: 12, cursor: "pointer", textAlign: "left",
          }}
        >
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `${tile.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            {tile.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--t1)" }}>{lang === "en" ? tile.titleEn : tile.titleId}</div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>{lang === "en" ? tile.subEn : tile.subId}</div>
          </div>
          <div style={{ color: "var(--t3)", fontSize: 18 }}>›</div>
        </button>
      ))}
    </div>
  );
}

function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i < step ? "var(--green)" : i === step ? "var(--brand)" : "var(--border)" }} />
      ))}
    </div>
  );
}

function EmployeeNikScreen({
  lang, nik, setNik, namaEmp, dept, nikStatus,
}: {
  lang: string; nik: string; setNik: (v: string) => void; namaEmp: string; dept: string; nikStatus: "" | "loading" | "ok" | "bad";
}) {
  const statusColor = nikStatus === "ok" ? "var(--green)" : nikStatus === "bad" ? "var(--red)" : "var(--t3)";
  const statusText =
    nikStatus === "loading" ? (lang === "en" ? "Searching..." : "Mencari data...") :
    nikStatus === "ok" ? (lang === "en" ? "✓ NIK found" : "✓ NIK ditemukan") :
    nikStatus === "bad" ? (lang === "en" ? "NIK not found" : "NIK tidak ditemukan") : "";
  return (
    <div>
      <StepBar step={0} total={2} />
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>
        {lang === "en" ? "Step 1 of 2 — Employee Verification" : "Langkah 1 dari 2 — Verifikasi Karyawan"}
      </div>
      <Field label={lang === "en" ? "Employee NIK" : "NIK Karyawan"}>
        <input className="premiumInput" style={fieldInput} inputMode="numeric" placeholder={lang === "en" ? "Enter NIK" : "Masukkan NIK"} value={nik} onChange={(e) => setNik(e.target.value)} />
        {statusText && <div style={{ fontSize: 12, marginTop: 6, color: statusColor, fontWeight: 600 }}>{statusText}</div>}
      </Field>
      <Field label={lang === "en" ? "Name" : "Nama"}>
        <input style={{ ...fieldInput, background: "var(--bg2)", color: "var(--t2)" }} readOnly value={namaEmp} placeholder={lang === "en" ? "Auto-filled" : "Otomatis terisi"} />
      </Field>
      <Field label="Department">
        <input style={{ ...fieldInput, background: "var(--bg2)", color: "var(--t2)" }} readOnly value={dept} placeholder={lang === "en" ? "Auto-filled" : "Otomatis terisi"} />
      </Field>
    </div>
  );
}

function ContactFormScreen({
  lang, hp, setHp, email, setEmail,
}: { lang: string; hp: string; setHp: (v: string) => void; email: string; setEmail: (v: string) => void }) {
  return (
    <div>
      <StepBar step={1} total={2} />
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>
        {lang === "en" ? "Step 2 of 2 — Contact Details" : "Langkah 2 dari 2 — Data Kontak"}
      </div>
      <Field label={lang === "en" ? "Phone Number" : "Nomor HP"}>
        <input className="premiumInput" style={fieldInput} type="tel" inputMode="tel" placeholder="08xxxxxxxxxx" value={hp} onChange={(e) => setHp(e.target.value)} />
      </Field>
      <Field label="Email">
        <input className="premiumInput" style={fieldInput} type="email" inputMode="email" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
    </div>
  );
}

function InternFormScreen({
  lang, namaInt, setNamaInt, kampus, setKampus, hpInt, setHpInt, emailInt, setEmailInt, periode, setPeriode, tanggalSelesai, setTanggalSelesai,
}: {
  lang: string;
  namaInt: string; setNamaInt: (v: string) => void;
  kampus: string; setKampus: (v: string) => void;
  hpInt: string; setHpInt: (v: string) => void;
  emailInt: string; setEmailInt: (v: string) => void;
  periode: string; setPeriode: (v: string) => void;
  tanggalSelesai: string; setTanggalSelesai: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>
        {lang === "en" ? "Internship / Contract Participant Data" : "Data Peserta Magang / Kontrak"}
      </div>
      <Field label={lang === "en" ? "Full Name" : "Nama Lengkap"}>
        <input className="premiumInput" style={fieldInput} value={namaInt} onChange={(e) => setNamaInt(e.target.value)} placeholder={lang === "en" ? "Full name" : "Nama lengkap"} />
      </Field>
      <Field label={lang === "en" ? "University / Institution" : "Universitas / Institusi"}>
        <input className="premiumInput" style={fieldInput} value={kampus} onChange={(e) => setKampus(e.target.value)} placeholder={lang === "en" ? "University name" : "Nama universitas"} />
      </Field>
      <Field label={lang === "en" ? "Phone Number" : "Nomor HP"}>
        <input className="premiumInput" style={fieldInput} type="tel" inputMode="tel" value={hpInt} onChange={(e) => setHpInt(e.target.value)} placeholder="08xxxxxxxxxx" />
      </Field>
      <Field label="Email">
        <input className="premiumInput" style={fieldInput} type="email" inputMode="email" value={emailInt} onChange={(e) => setEmailInt(e.target.value)} placeholder="nama@email.com" />
      </Field>
      <Field label={lang === "en" ? "Period (e.g. Jul - Dec 2026)" : "Periode (contoh: Jul - Des 2026)"}>
        <input className="premiumInput" style={fieldInput} value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder={lang === "en" ? "Write the internship period" : "Tulis periode magang"} />
      </Field>
      <Field
        label={lang === "en" ? "Internship / Contract End Date" : "Tanggal Selesai Magang / Kontrak"}
        hint={lang === "en" ? "The locker will auto-reset and PIN will be shuffled on this date." : "Locker akan otomatis direset & PIN diacak ulang pada tanggal ini."}
      >
        <input className="premiumInput" style={fieldInput} type="date" value={tanggalSelesai} onChange={(e) => setTanggalSelesai(e.target.value)} />
      </Field>
    </div>
  );
}

function EndUseScreen({
  lang, number, setNumber, pin, setPin, error,
}: { lang: string; number: string; setNumber: (v: string) => void; pin: string; setPin: (v: string) => void; error: string }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>
        {lang === "en" ? "Locker Verification" : "Verifikasi Locker"}
      </div>
      {error && (
        <div style={{ fontSize: 13, padding: "12px 14px", borderRadius: 10, marginBottom: 14, background: "var(--red-soft)", color: "var(--red)" }}>{error}</div>
      )}
      <Field label={lang === "en" ? "Locker Number" : "Nomor Locker"}>
        <input className="premiumInput" style={fieldInput} inputMode="numeric" placeholder={lang === "en" ? "e.g. 12" : "Contoh: 12"} value={number} onChange={(e) => setNumber(e.target.value)} />
      </Field>
      <Field label="PIN">
        <input className="premiumInput" style={fieldInput} inputMode="numeric" placeholder={lang === "en" ? "Enter your PIN" : "Masukkan PIN Anda"} value={pin} onChange={(e) => setPin(e.target.value)} />
      </Field>
    </div>
  );
}

function EndConfirmScreen({ lang, data }: { lang: string; data: { nama: string; extra: string; periode: string } }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--t3)", fontWeight: 600, marginBottom: 18 }}>{lang === "en" ? "Confirmation" : "Konfirmasi"}</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <InfoRow label={lang === "en" ? "Name" : "Nama"} value={data.nama} />
        <InfoRow label={lang === "en" ? "Department / University" : "Dept / Universitas"} value={data.extra} />
        <InfoRow label={lang === "en" ? "Period" : "Periode"} value={data.periode} last />
      </div>
      <p style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.6 }}>
        {lang === "en"
          ? "Once confirmed, this locker will be reset, its PIN shuffled, and a confirmation email sent to you and the Facility Management team. This cannot be undone."
          : "Setelah dikonfirmasi, locker ini akan direset, PIN akan diacak ulang, dan email konfirmasi akan dikirim ke Anda serta tim Facility Management. Tindakan ini tidak bisa dibatalkan."}
      </p>
    </div>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13.5, borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <span style={{ color: "var(--t3)" }}>{label}</span>
      <span style={{ color: "var(--t1)", fontWeight: 700 }}>{value || "-"}</span>
    </div>
  );
}

function ResultScreen({ lang, locker, pin, periode }: { lang: string; locker: string; pin: string; periode: string }) {
  return (
    <div className="heroGlow" style={{ borderRadius: 20, padding: "30px 26px", textAlign: "center", color: "#fff", background: "linear-gradient(135deg, var(--navy), var(--brand))", boxShadow: "var(--shadow-lg)" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 28 }}>✅</div>
      <div style={{ fontSize: 12, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>Locker Number</div>
      <div style={{ fontSize: 44, fontWeight: 800, marginTop: 6, letterSpacing: 2 }}>{locker}</div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.2)", margin: "20px 0" }} />
      <div style={{ fontSize: 22, fontWeight: 800, background: "#fff", color: "var(--navy)", padding: "8px 24px", display: "inline-block", borderRadius: 10, letterSpacing: 1 }}>
        PIN {pin}
      </div>
      <div style={{ marginTop: 12, fontSize: 13.5, opacity: 0.85 }}>{periode}</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 16, lineHeight: 1.5 }}>
        {lang === "en" ? "Locker registered successfully." : "Locker berhasil didaftarkan."}<br />
        {lang === "en" ? "Please keep your PIN safe." : "Simpan PIN Anda dengan aman."}
      </div>
    </div>
  );
}

function EndResultScreen({ lang }: { lang: string }) {
  return (
    <div className="heroGlow" style={{ borderRadius: 20, padding: "30px 26px", textAlign: "center", color: "#fff", background: "linear-gradient(135deg, var(--green), #0f8a5c)", boxShadow: "var(--shadow-lg)" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 28 }}>🔓</div>
      <div style={{ fontSize: 12, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>{lang === "en" ? "Success" : "Berhasil"}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>
        {lang === "en" ? "Locker has been deactivated" : "Locker telah dinonaktifkan"}
      </div>
      <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 12 }}>
        {lang === "en"
          ? "A confirmation email has been sent to you and the Facility Management team."
          : "Email konfirmasi telah dikirim ke Anda dan tim Facility Management."}
      </div>
    </div>
  );
}
