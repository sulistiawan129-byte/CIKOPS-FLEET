"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./driver.module.css";
import {
  acceptTask,
  cancelTaskByDriver,
  changeDriverPin,
  completeTask,
  getDriverHistory,
  getDriverTasksToday,
  getDrivers,
  subscribeToTasks,
  verifyDriverPin,
} from "@/lib/api";
import type { Driver, TaskDetail } from "@/lib/types";
import { computeStats } from "@/lib/types";
import { useLang, useTheme } from "@/lib/providers";
import type { Dict } from "@/lib/dictionary";
import { todayLocalISODate } from "@/lib/dateUtils";

type Screen = "splash" | "landing" | "pin" | "app";
type Tab = "today" | "history" | "profile";

const PIN_LEN = 4;

export default function DriverPanelPage() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const [screen, setScreen] = useState<Screen>("splash");
  const [splashFading, setSplashFading] = useState(false);
  const [tab, setTab] = useState<Tab>("today");

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driversError, setDriversError] = useState<string | null>(null);

  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
   const [driverSearch, setDriverSearch] = useState("");
 const [driverPlantFilter, setDriverPlantFilter] = useState<"all" | "CIK" | "PRB">("all");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  const [loggedDriver, setLoggedDriver] = useState<Driver | null>(null);

  const [todayTasks, setTodayTasks] = useState<TaskDetail[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [cancelConfirmTask, setCancelConfirmTask] = useState<TaskDetail | null>(
    null
  );
  const knownAssignedIdsRef = useRef<Set<string> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string | null>(
    null
  );
  const [historyTasks, setHistoryTasks] = useState<TaskDetail[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyApplied, setHistoryApplied] = useState(false);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalStep, setPinModalStep] = useState<"old" | "new" | "confirm">(
    "old"
  );
  const [pinModalOld, setPinModalOld] = useState("");
  const [pinModalNew, setPinModalNew] = useState("");
  const [pinModalConfirm, setPinModalConfirm] = useState("");
  const [pinModalError, setPinModalError] = useState("");
  const [pinModalBusy, setPinModalBusy] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  // ── init: load drivers ──

  const loadDrivers = useCallback(async () => {
    setDriversLoading(true);
    setDriversError(null);
    try {
      const data = await getDrivers();
      setDrivers(data);
    } catch (e) {
      setDriversError(e instanceof Error ? e.message : t.gagalMemuatDataDriver);
    } finally {
      setDriversLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  // ── splash screen: tampil sebentar, lalu cek session tersimpan ──
  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 1300);
    const nextTimer = setTimeout(() => {
      const savedSession = localStorage.getItem("cikops_driver_session");
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession) as Driver;
          if (parsed && parsed.id) {
            setLoggedDriver(parsed);
            setScreen("app");
            setTab("today");
            return;
          }
        } catch {
          localStorage.removeItem("cikops_driver_session");
        }
      }
      setScreen("landing");
    }, 1700);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(nextTimer);
    };
  }, []);

  function playNotificationSound() {
    try {
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AudioCtx();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      const playTone = (
        freq: number,
        startTime: number,
        duration: number,
        peakGain = 0.5
      ) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx!.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      const now = ctx.currentTime;
      // Pola dering 2x ulangan, lebih nyaring & lebih panjang dari sebelumnya
      [0, 0.7].forEach((offset) => {
        playTone(988, now + offset, 0.14, 0.55);
        playTone(1318, now + offset + 0.16, 0.16, 0.55);
        playTone(988, now + offset + 0.34, 0.14, 0.55);
      });
    } catch {
      // Web Audio tidak tersedia/diblokir — abaikan, getar & voice tetap jalan.
    }
  }

  function speakNewTaskAnnouncement(destination?: string) {
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window))
        return;
      const text = destination
        ? lang === "en"
          ? `New task received, destination ${destination}`
          : `Ada tugas masuk, tujuan ${destination}`
        : t.tugasBaruMasuk.replace(" 🔔", "");
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang === "en" ? "en-US" : "id-ID";
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = 1;
      // Batalkan ucapan sebelumnya yang masih berjalan agar tidak menumpuk
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {
      // Web Speech API tidak tersedia/diblokir — abaikan, getar & bunyi tetap jalan.
    }
  }

  function updateAppBadge(count: number) {
    try {
      const nav = navigator as Navigator & {
        setAppBadge?: (count?: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };
      if (count > 0 && nav.setAppBadge) {
        nav.setAppBadge(count).catch(() => {});
      } else if (nav.clearAppBadge) {
        nav.clearAppBadge().catch(() => {});
      }
    } catch {
      // PWA Badge API tidak didukung browser ini — abaikan.
    }
    if (typeof document !== "undefined") {
      document.title =
        count > 0 ? `(${count}) CIKOPS Fleet` : "CIKOPS Fleet Ops";
    }
  }

  function notifyNewTask(destination?: string) {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      // Pola getar lebih panjang & berulang agar lebih terasa di kantong/saku
      navigator.vibrate([260, 110, 260, 110, 260]);
    }
    playNotificationSound();
    speakNewTaskAnnouncement(destination);
  }

  // ── today tasks loader + realtime ──
  const loadTodayTasks = useCallback(
    async (driverId: string) => {
      setTodayLoading(true);
      setTodayError(null);
      try {
        const data = await getDriverTasksToday(driverId);
        setTodayTasks(data);

        const assignedTasks = data.filter((task) => task.status === "ASSIGNED");
        const currentAssignedIds = new Set(assignedTasks.map((task) => task.id));
        const known = knownAssignedIdsRef.current;
        if (known !== null) {
          const newTasks = assignedTasks.filter((task) => !known.has(task.id));
          if (newTasks.length > 0) {
            notifyNewTask(newTasks[0].tujuan);
            showToast(
              newTasks.length > 1
                ? `${newTasks.length} ${t.tugasBaruMasuk}`
                : t.tugasBaruMasuk
            );
          }
        }
        knownAssignedIdsRef.current = currentAssignedIds;
        updateAppBadge(assignedTasks.length);
      } catch (e) {
        setTodayError(e instanceof Error ? e.message : t.gagalMemuatTugas);
      } finally {
        setTodayLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (screen !== "app" || !loggedDriver) return;

    loadTodayTasks(loggedDriver.id);

    let unsubscribe = subscribeToTasks(() => {
      loadTodayTasks(loggedDriver.id);
    });

    // ── Standby: saat tab/app kembali aktif (HP dinyalakan dari sleep,
    //    pindah app lalu balik lagi), realtime channel kadang sudah mati
    //    diam-diam. Re-subscribe + refresh paksa agar driver tetap live. ──
    function handleVisibilityOrFocus() {
      if (document.visibilityState === "visible") {
        loadTodayTasks(loggedDriver!.id);
        unsubscribe();
        unsubscribe = subscribeToTasks(() => {
          loadTodayTasks(loggedDriver!.id);
        });
      }
    }

    function handleOnline() {
      loadTodayTasks(loggedDriver!.id);
      unsubscribe();
      unsubscribe = subscribeToTasks(() => {
        loadTodayTasks(loggedDriver!.id);
      });
    }

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("online", handleOnline);

    // ── Polling fallback ringan: jaga-jaga jika realtime channel diam
    //    tanpa terdeteksi putus. Tidak menggantikan realtime, hanya jaring pengaman. ──
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadTodayTasks(loggedDriver!.id);
      }
    }, 45000);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("online", handleOnline);
      clearInterval(pollInterval);
    };
  }, [screen, loggedDriver, loadTodayTasks]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  // ── PIN entry flow ──
  function selectDriver(d: Driver) {
    setSelectedDriver(d);
  }

  function goToPin() {
    if (!selectedDriver) return;
    setPin("");
    setPinError(false);
    setScreen("pin");
  }

  function pressDigit(digit: string) {
    if (pin.length >= PIN_LEN || pinBusy) return;
    const next = pin + digit;
    setPin(next);
    setPinError(false);
    if (next.length === PIN_LEN) {
      submitPin(next);
    }
  }

  function pressBackspace() {
    if (pinBusy) return;
    setPin((p) => p.slice(0, -1));
    setPinError(false);
  }

  async function submitPin(value: string) {
    if (!selectedDriver) return;
    setPinBusy(true);
    try {
      const verified = await verifyDriverPin(selectedDriver.id, value);
      if (!verified) {
        setPinError(true);
        setTimeout(() => {
          setPin("");
        }, 400);
        return;
      }
      setLoggedDriver(verified);
      localStorage.setItem("cikops_driver_session", JSON.stringify(verified));
      setScreen("app");
      setTab("today");
    } catch (e) {
      setPinError(true);
      setTimeout(() => setPin(""), 400);
    } finally {
      setPinBusy(false);
    }
  }

  function backToLanding() {
    setScreen("landing");
    setSelectedDriver(null);
    setPin("");
    setPinError(false);
  }

  function logout() {
    localStorage.removeItem("cikops_driver_session");
    knownAssignedIdsRef.current = null;
    updateAppBadge(0);
    setLoggedDriver(null);
    setSelectedDriver(null);
    setScreen("landing");
    setTab("today");
    setTodayTasks([]);
    setHistoryTasks([]);
    setHistoryApplied(false);
  }

  // ── task actions ──
  async function handleAccept(task: TaskDetail) {
    if (!loggedDriver) return;
    setActionBusyId(task.id);
    try {
      await acceptTask(task.id, loggedDriver.id);
      showToast(t.tugasDiterima);
      await loadTodayTasks(loggedDriver.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.gagalMenerimaTugas);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleComplete(task: TaskDetail) {
    if (!loggedDriver) return;
    setActionBusyId(task.id);
    try {
      await completeTask(task.id, loggedDriver.id);
      showToast(t.tugasSelesaiToast);
      await loadTodayTasks(loggedDriver.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.gagalMenyelesaikanTugas);
    } finally {
      setActionBusyId(null);
    }
  }

  function openCancelConfirm(task: TaskDetail) {
    setCancelConfirmTask(task);
  }

  function closeCancelConfirm() {
    setCancelConfirmTask(null);
  }

  async function handleCancelConfirmed() {
    if (!loggedDriver || !cancelConfirmTask) return;
    const task = cancelConfirmTask;
    setActionBusyId(task.id);
    setCancelConfirmTask(null);
    try {
      await cancelTaskByDriver(task.id, loggedDriver.id);
      showToast(t.tugasDibatalkanToast);
      await loadTodayTasks(loggedDriver.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.gagalMembatalkanTugas);
    } finally {
      setActionBusyId(null);
    }
  }

  // ── history ──
  async function applyHistoryFilter() {
    if (!loggedDriver) return;
    const today = todayLocalISODate();
    const from = historyFrom || today;
    const to = historyTo || today;
    setHistoryLoading(true);
    try {
      const data = await getDriverHistory(loggedDriver.id, from, to);
      setHistoryTasks(data);
      setHistoryApplied(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.gagalMemuatRiwayat);
    } finally {
      setHistoryLoading(false);
    }
  }

  function resetHistoryFilter() {
    setHistoryFrom("");
    setHistoryTo("");
    setHistoryStatusFilter(null);
    setHistoryTasks([]);
    setHistoryApplied(false);
  }

  const filteredHistory = useMemo(() => {
    if (!historyStatusFilter) return historyTasks;
    return historyTasks.filter((t) => t.status === historyStatusFilter);
  }, [historyTasks, historyStatusFilter]);

  const hasMultiplePlants = useMemo(
  () => new Set(drivers.map((d) => d.plant || "CIK")).size > 1,
   [drivers]
  );

  // ── PIN change modal ──
  function openPinModal() {
    setPinModalOpen(true);
    setPinModalStep("old");
    setPinModalOld("");
    setPinModalNew("");
    setPinModalConfirm("");
    setPinModalError("");
  }

  function closePinModal() {
    setPinModalOpen(false);
  }

  function modalCurrentValue() {
    if (pinModalStep === "old") return pinModalOld;
    if (pinModalStep === "new") return pinModalNew;
    return pinModalConfirm;
  }

  function pressModalDigit(digit: string) {
    if (pinModalBusy) return;
    const current = modalCurrentValue();
    if (current.length >= PIN_LEN) return;
    const next = current + digit;

    if (pinModalStep === "old") setPinModalOld(next);
    else if (pinModalStep === "new") setPinModalNew(next);
    else setPinModalConfirm(next);

    if (next.length === PIN_LEN) {
      handleModalStepComplete(next);
    }
  }

  function pressModalBackspace() {
    if (pinModalBusy) return;
    if (pinModalStep === "old") setPinModalOld((p) => p.slice(0, -1));
    else if (pinModalStep === "new") setPinModalNew((p) => p.slice(0, -1));
    else setPinModalConfirm((p) => p.slice(0, -1));
    setPinModalError("");
  }

  async function handleModalStepComplete(value: string) {
    if (pinModalStep === "old") {
      setPinModalStep("new");
      return;
    }
    if (pinModalStep === "new") {
      setPinModalStep("confirm");
      return;
    }
    // confirm step
    if (value !== pinModalNew) {
      setPinModalError(t.pinBaruTidakCocok);
      setPinModalConfirm("");
      setPinModalStep("new");
      setPinModalNew("");
      return;
    }
    if (!loggedDriver) return;
    setPinModalBusy(true);
    try {
      const ok = await changeDriverPin(loggedDriver.id, pinModalOld, pinModalNew);
      if (!ok) {
        setPinModalError(t.pinLamaSalah);
        setPinModalStep("old");
        setPinModalOld("");
        setPinModalNew("");
        setPinModalConfirm("");
        return;
      }
      setPinModalOpen(false);
      showToast(t.pinBerhasilDiubah);
    } catch (e) {
      setPinModalError(e instanceof Error ? e.message : t.gagalMengubahPin);
    } finally {
      setPinModalBusy(false);
    }
  }

  const stats = useMemo(() => computeStats(todayTasks), [todayTasks]);

  const filteredDrivers = useMemo(() => {
  let list = drivers;
   if (driverPlantFilter !== "all") {
     list = list.filter((d) => (d.plant || "CIK") === driverPlantFilter);
   }
    if (driverSearch.trim()) {
      const q = driverSearch.trim().toLowerCase();
      list = list.filter((d) => d.nama.toLowerCase().includes(q));
    }
    return list;
  }, [drivers, driverPlantFilter, driverSearch]);
 

  /* ════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════ */

  if (screen === "splash") {
    return (
      <div className={styles.appOuter}>
        <div
          className={`${styles.screen} ${styles.splashScreen} ${
            splashFading ? styles.splashFadeOut : ""
          }`}
        >
          <div className={styles.splashLogoWrap}>
            <img src="/logo.png" alt="CIKOPS" className={styles.splashLogo} />
            <div className={styles.splashBrandName}>{t.appName}</div>
            <div className={styles.splashBrandSub}>{t.splashTagline}</div>
          </div>
          <div className={styles.splashLoader}>
            <span className={styles.splashLoaderDot} />
            <span className={styles.splashLoaderDot} />
            <span className={styles.splashLoaderDot} />
          </div>
        </div>
      </div>
    );
  }

  if (screen === "landing") {
    return (
      <div className={styles.appOuter}>
      <div className={`${styles.screen} ${styles.landingScreen}`}>
        <div className={styles.landingBody}>
          <div className={styles.topBar}>
            <button
              className={styles.themeBtn}
              onClick={() => setLang(lang === "id" ? "en" : "id")}
              aria-label={t.language}
              style={{ marginRight: 8, fontSize: 12, fontWeight: 700 }}
            >
              {lang === "id" ? "EN" : "ID"}
            </button>
            <button
              className={styles.themeBtn}
              onClick={toggleTheme}
              aria-label={t.gantiTema}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>

          <div className={styles.heroLogoWrap}>
            <img src="/logo.png" alt="CIKOPS" className={styles.logoBadgeImg} />
            <div className={styles.brandName}>{t.appName} Fleet</div>
            <div className={styles.brandSub}>Driver Operations</div>
          </div>

          <div className={styles.sectionLabel}>{t.pilihDriver}</div>
 
{/* Search box — filter nama real-time */}
{!driversLoading && !driversError && drivers.length > 6 && (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: "#fff",
      borderRadius: 16,
      padding: "12px 16px",
      marginBottom: 10,
      boxShadow: "0 6px 18px rgba(11,30,77,0.1)",
    }}
  >
    <span style={{ fontSize: 15, opacity: 0.5 }}>🔍</span>
    <input
      value={driverSearch}
      onChange={(e) => setDriverSearch(e.target.value)}
      placeholder={lang === "en" ? "Search driver name..." : "Cari nama driver..."}
      style={{
        flex: 1,
        border: "none",
        outline: "none",
        fontSize: 14,
        fontFamily: "var(--font)",
        color: "var(--t1)",
        background: "transparent",
      }}
    />
    {driverSearch && (
      <button
        onClick={() => setDriverSearch("")}
        style={{ border: "none", background: "none", color: "var(--t3)", fontSize: 14, cursor: "pointer", padding: 2 }}
      >
        ✕
      </button>
    )}
  </div>
)}
 
{/* Filter Plant — HANYA muncul kalau memang ada >1 plant di data */}
{!driversLoading && !driversError && hasMultiplePlants && (
  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
    {(["all", "CIK", "PRB"] as const).map((p) => (
      <button
        key={p}
        onClick={() => setDriverPlantFilter(p)}
        className={`${styles.chip} ${driverPlantFilter === p ? styles.chipOn : ""}`}
        style={{ flex: 1 }}
      >
        {p === "all" ? (lang === "en" ? "All Plants" : "Semua Plant") : p}
      </button>
    ))}
  </div>
)}
 
{driversLoading && (
  <div className={styles.loadingWrap}>
    <div className={styles.spinner} />
    <div className={styles.loadingTxt}>{t.memuatDriver}</div>
  </div>
)}
 
{driversError && (
  <div className={styles.errBox}>
    <div className={styles.errTxt}>{driversError}</div>
  </div>
)}
 
{!driversLoading && !driversError && (
  filteredDrivers.length === 0 ? (
    <div style={{ textAlign: "center", padding: "32px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
      {lang === "en" ? "No driver found." : "Driver tidak ditemukan."}
    </div>
  ) : (
    <div className={styles.driverGrid}>
      {filteredDrivers.map((d) => (
        <button
          key={d.id}
          className={`${styles.driverCard} ${selectedDriver?.id === d.id ? styles.driverCardSelected : ""}`}
          onClick={() => selectDriver(d)}
        >
          <div className={styles.driverAvatar}>
            {d.avatar_emoji || "🧑‍✈️"}
            <span className={styles.driverAvatarDot} />
          </div>
          <div className={styles.driverCardBody}>
            <div className={styles.driverCardName}>
              {d.nama}
              {hasMultiplePlants && (
                <span
                  style={{
                    marginLeft: 7,
                    fontSize: 9.5,
                    fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: 5,
                    background: "rgba(61,111,242,0.1)",
                    color: "var(--brand)",
                    verticalAlign: "middle",
                  }}
                >
                  {d.plant || "CIK"}
                </span>
              )}
            </div>
            <div className={styles.driverCardRole}>
              <span>●</span> {t.online}
            </div>
          </div>
          <div className={styles.driverCardChevron}>›</div>
        </button>
      ))}
    </div>
  )
)}
                <button
                  key={d.id}
                  className={`${styles.driverCard} ${
                    selectedDriver?.id === d.id ? styles.driverCardSelected : ""
                  }`}
                  onClick={() => selectDriver(d)}
                >
                  <div className={styles.driverAvatar}>
                    {d.avatar_emoji || "🧑‍✈️"}
                    <span className={styles.driverAvatarDot} />
                  </div>
                  <div className={styles.driverCardBody}>
                    <div className={styles.driverCardName}>{d.nama}</div>
                    <div className={styles.driverCardRole}>
                      <span>●</span> {t.online}
                    </div>
                  </div>
                  <div className={styles.driverCardChevron}>›</div>
                </button>
              ))}
            </div>
          )}

          <button
            className={styles.btnMasuk}
            disabled={!selectedDriver}
            onClick={goToPin}
          >
            {t.masuk}
          </button>

          <div className={styles.landingFooter}>CIKOPS FLEET OS v1.0</div>
        </div>
      </div>
      </div>
    );
  }

  if (screen === "pin" && selectedDriver) {
    return (
      <div className={styles.appOuter}>
      <div className={`${styles.screen} ${styles.pinScreen}`}>
        <div className={styles.pinWrap}>
          <button className={styles.pinBack} onClick={backToLanding}>
            {t.kembali}
          </button>

          <div className={styles.pinInfoZone}>
            <div className={styles.pinAvatar}>
              {selectedDriver.avatar_emoji || "🧑‍✈️"}
            </div>
            <div className={styles.pinDriverName}>{selectedDriver.nama}</div>
            <div className={styles.pinPrompt}>{t.masukkanPin}</div>

            <div className={styles.pinDots}>
              {Array.from({ length: PIN_LEN }).map((_, i) => (
                <div
                  key={i}
                  className={`${styles.pinDot} ${
                    i < pin.length ? styles.pinDotFilled : ""
                  } ${pinError ? styles.pinDotError : ""}`}
                />
              ))}
            </div>

            <div className={styles.pinErrorMsg}>
              {pinError ? t.pinSalah : ""}
            </div>
          </div>

          <div className={styles.pinNumpadZone}>
            <Numpad
              onDigit={pressDigit}
              onBackspace={pressBackspace}
              disabled={pinBusy}
            />
          </div>
        </div>
      </div>
      </div>
    );
  }

  if (screen === "app" && loggedDriver) {
    return (
      <div className={styles.appOuter}>
      <div className={`${styles.screen} ${styles.appScreen}`}>
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <img src="/logo.png" alt="CIKOPS" className={styles.logoMarkImg} />
            <div className={styles.headerInfo}>
              <div className={styles.headerLabel}>{t.appName}</div>
              <div className={styles.headerTitle}>{t.driverPanel}</div>
            </div>
            <div className={styles.headerActions}>
              <button
                className={styles.hbtn}
                onClick={() => setLang(lang === "id" ? "en" : "id")}
                aria-label={t.language}
                style={{ fontSize: 11, fontWeight: 700 }}
              >
                {lang === "id" ? "EN" : "ID"}
              </button>
              <button className={styles.hbtn} onClick={toggleTheme}>
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.driverStrip}>
          <div className={styles.driverStripAvatar}>
            {loggedDriver.avatar_emoji || "🧑‍✈️"}
          </div>
          <div className={styles.driverStripInfo}>
            <div className={styles.driverStripName}>{loggedDriver.nama}</div>
            <div className={styles.driverStripStatus}>
              <span className={styles.stripDot} /> {t.online}
            </div>
          </div>
          <button className={styles.btnLogout} onClick={logout}>
            {t.keluar}
          </button>
        </div>

        {tab === "today" && (
          <div className={`${styles.statsStrip} ${styles.statsStripVisible}`}>
            <div className={styles.statPill}>
              <div className={`${styles.statNum} ${styles.cOrange}`}>
                {stats.assigned}
              </div>
              <div className={styles.statLabel}>{t.statBaru}</div>
            </div>
            <div className={styles.statPill}>
              <div className={`${styles.statNum} ${styles.cCyan}`}>
                {stats.ongoing}
              </div>
              <div className={styles.statLabel}>{t.statProses}</div>
            </div>
            <div className={styles.statPill}>
              <div className={`${styles.statNum} ${styles.cGreen}`}>
                {stats.done}
              </div>
              <div className={styles.statLabel}>{t.statSelesai}</div>
            </div>
          </div>
        )}

        <div className={styles.tabRow}>
          <button
            className={`${styles.tab} ${tab === "today" ? styles.tabActive : ""}`}
            onClick={() => setTab("today")}
          >
            <span className={styles.tabIcon}>📋</span> {t.hariIni}
            {stats.assigned + stats.ongoing > 0 && (
              <span className={styles.tabCount}>
                {stats.assigned + stats.ongoing}
              </span>
            )}
          </button>
          <button
            className={`${styles.tab} ${tab === "history" ? styles.tabActive : ""}`}
            onClick={() => setTab("history")}
          >
            <span className={styles.tabIcon}>🕘</span> {t.riwayat}
          </button>
          <button
            className={`${styles.tab} ${tab === "profile" ? styles.tabActive : ""}`}
            onClick={() => setTab("profile")}
          >
            <span className={styles.tabIcon}>👤</span> {t.profil}
          </button>
        </div>

        <div className={styles.scrollArea}>
          <div className={styles.scrollContent}>
            {tab === "today" && (
              <TodayTab
                loading={todayLoading}
                error={todayError}
                tasks={todayTasks}
                actionBusyId={actionBusyId}
                onAccept={handleAccept}
                onComplete={handleComplete}
                onCancel={openCancelConfirm}
              />
            )}

            {tab === "history" && (
              <HistoryTab
                from={historyFrom}
                to={historyTo}
                setFrom={setHistoryFrom}
                setTo={setHistoryTo}
                statusFilter={historyStatusFilter}
                setStatusFilter={setHistoryStatusFilter}
                onApply={applyHistoryFilter}
                onReset={resetHistoryFilter}
                applied={historyApplied}
                loading={historyLoading}
                tasks={filteredHistory}
              />
            )}

            {tab === "profile" && (
              <ProfileTab
                driver={loggedDriver}
                onChangePin={openPinModal}
                onLogout={logout}
              />
            )}
          </div>
        </div>

        <div className={styles.bottomNav}>
          <button
            className={`${styles.bnavItem} ${
              tab === "today" ? styles.bnavItemActive : ""
            }`}
            onClick={() => setTab("today")}
          >
            <span className={styles.bnavIcon}>📋</span>
            {t.hariIni}
            {stats.assigned + stats.ongoing > 0 && (
              <span className={styles.bnavBadge}>
                {stats.assigned + stats.ongoing}
              </span>
            )}
          </button>
          <button
            className={`${styles.bnavItem} ${
              tab === "history" ? styles.bnavItemActive : ""
            }`}
            onClick={() => setTab("history")}
          >
            <span className={styles.bnavIcon}>🕘</span>
            {t.riwayat}
          </button>
          <button
            className={`${styles.bnavItem} ${
              tab === "profile" ? styles.bnavItemActive : ""
            }`}
            onClick={() => setTab("profile")}
          >
            <span className={styles.bnavIcon}>👤</span>
            {t.profil}
          </button>
        </div>

        {pinModalOpen && (
          <PinChangeModal
            step={pinModalStep}
            oldVal={pinModalOld}
            newVal={pinModalNew}
            confirmVal={pinModalConfirm}
            error={pinModalError}
            busy={pinModalBusy}
            onDigit={pressModalDigit}
            onBackspace={pressModalBackspace}
            onClose={closePinModal}
          />
        )}

        {cancelConfirmTask && (
          <div className={styles.modalOverlay} onClick={closeCancelConfirm}>
            <div
              className={`${styles.modalBox} ${styles.modalBoxOpen}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHandle} />
              <div className={styles.modalTitle}>{t.batalkanTugasIni}</div>
              <div className={styles.modalSub}>
                {t.tujuanLabel}: {cancelConfirmTask.tujuan}
              </div>
              <button
                className={styles.btnCancelConfirmYes}
                onClick={handleCancelConfirmed}
              >
                {t.yaBatalkanTugas}
              </button>
              <button
                className={styles.modalCancelBtn}
                onClick={closeCancelConfirm}
              >
                {t.tidakKembali}
              </button>
            </div>
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
      </div>
    );
  }

  return null;
}

/* ════════════════════════════════════════════════
   SUB-COMPONENTS
════════════════════════════════════════════════ */

function Numpad({
  onDigit,
  onBackspace,
  disabled,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className={styles.numpad}>
      {keys.map((k) => (
        <button
          key={k}
          className={styles.numpadKey}
          onClick={() => onDigit(k)}
          disabled={disabled}
        >
          {k}
        </button>
      ))}
      <button className={`${styles.numpadKey} ${styles.numpadEmpty}`} disabled>
        {""}
      </button>
      <button
        className={styles.numpadKey}
        onClick={() => onDigit("0")}
        disabled={disabled}
      >
        0
      </button>
      <button
        className={`${styles.numpadKey} ${styles.numpadDel}`}
        onClick={onBackspace}
        disabled={disabled}
        aria-label="Hapus"
      >
        ⌫
      </button>
    </div>
  );
}

function statusLabel(status: string, t: Dict) {
  if (status === "ASSIGNED") return t.statusAssigned;
  if (status === "ON GOING") return t.statusOngoing;
  if (status === "CANCELLED") return t.statusCancelled;
  return t.statusDone;
}

function statusClasses(status: string) {
  if (status === "ASSIGNED")
    return { accent: styles.accentAssigned, badge: styles.badgeAssigned, dot: styles.sdotAssigned };
  if (status === "ON GOING")
    return { accent: styles.accentOngoing, badge: styles.badgeOngoing, dot: styles.sdotOngoing };
  if (status === "CANCELLED")
    return { accent: styles.accentCancelled, badge: styles.badgeCancelled, dot: styles.sdotCancelled };
  return { accent: styles.accentDone, badge: styles.badgeDone, dot: styles.sdotDone };
}

function TaskCard({
  task,
  busy,
  onAccept,
  onComplete,
  onCancel,
}: {
  task: TaskDetail;
  busy: boolean;
  onAccept: (t: TaskDetail) => void;
  onComplete: (t: TaskDetail) => void;
  onCancel?: (t: TaskDetail) => void;
}) {
  const { t, lang } = useLang();
  const cls = statusClasses(task.status);
  const locale = lang === "en" ? "en-GB" : "id-ID";
  return (
    <div className={styles.taskCard}>
      <div className={`${styles.cardAccent} ${cls.accent}`} />
      <div className={styles.cardHead}>
        <div className={styles.destBlock}>
          <div className={styles.destIcon}>📍 {t.tujuan}</div>
          <div className={styles.destName}>{task.tujuan}</div>
        </div>
        <div className={`${styles.sbadge} ${cls.badge}`}>
          <span className={`${styles.sdot} ${cls.dot}`} />
          {statusLabel(task.status, t)}
        </div>
      </div>

      <div className={styles.cardMeta}>
        <div className={styles.metaRow}>
          <div className={`${styles.mi} ${styles.miBlue}`}>🚗</div>
          <div className={styles.metaContent}>
            <div className={styles.ml}>{t.kendaraan}</div>
            <div className={styles.mv}>{task.kendaraan || "-"}</div>
          </div>
        </div>
        <div className={styles.metaRow}>
          <div className={`${styles.mi} ${styles.miPurple}`}>🧰</div>
          <div className={styles.metaContent}>
            <div className={styles.ml}>{t.jenisPekerjaan}</div>
            <div className={styles.mv}>{task.jenis_pekerjaan}</div>
          </div>
        </div>
        <div className={styles.metaRow}>
          <div className={`${styles.mi} ${styles.miAmber}`}>👤</div>
          <div className={styles.metaContent}>
            <div className={styles.ml}>{t.requestor}</div>
            <div className={styles.mv}>
              {task.requestor}
              {task.departement ? ` · ${task.departement}` : ""}
            </div>
          </div>
        </div>
        {task.perihal && (
          <div className={styles.metaRow}>
            <div className={`${styles.mi} ${styles.miGreen}`}>📝</div>
            <div className={styles.metaContent}>
              <div className={styles.ml}>{t.perihal}</div>
              <div className={styles.mv}>{task.perihal}</div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.cardAction}>
        {task.status === "ASSIGNED" && (
          <>
            <button
              className={styles.btnAccept}
              disabled={busy}
              onClick={() => onAccept(task)}
            >
              {busy ? t.memproses : t.terimaTugas}
            </button>
            {onCancel && (
              <button
                className={styles.btnCancelTask}
                disabled={busy}
                onClick={() => onCancel(task)}
              >
                {t.batalkanTugas}
              </button>
            )}
          </>
        )}
        {task.status === "ON GOING" && (
          <>
            <button
              className={styles.btnDone}
              disabled={busy}
              onClick={() => onComplete(task)}
            >
              {busy ? t.memproses : t.selesaikanTugas}
            </button>
            {onCancel && (
              <button
                className={styles.btnCancelTask}
                disabled={busy}
                onClick={() => onCancel(task)}
              >
                {t.batalkanTugas}
              </button>
            )}
          </>
        )}
        {task.status === "DONE" && (
          <div className={styles.doneStamp}>
            <span>✅</span>
            <div className={styles.doneStampTxt}>
              {t.selesai}{" "}
              {task.completed_at
                ? new Date(task.completed_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </div>
          </div>
        )}
        {task.status === "CANCELLED" && (
          <div className={styles.cancelStamp}>
            <span>🚫</span>
            <div className={styles.cancelStampTxt}>
              {t.statusCancelled}{" "}
              {task.cancelled_at
                ? new Date(task.cancelled_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
              {task.cancelled_by ? ` ${t.dibatalkanOleh} ${task.cancelled_by}` : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TodayTab({
  loading,
  error,
  tasks,
  actionBusyId,
  onAccept,
  onComplete,
  onCancel,
}: {
  loading: boolean;
  error: string | null;
  tasks: TaskDetail[];
  actionBusyId: string | null;
  onAccept: (t: TaskDetail) => void;
  onComplete: (t: TaskDetail) => void;
  onCancel: (t: TaskDetail) => void;
}) {
  const { t } = useLang();
  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <div className={styles.loadingTxt}>{t.memuatTugasHariIni}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errBox}>
        <div className={styles.errTxt}>{error}</div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIco}>📭</span>
        <div className={styles.emptyTitle}>{t.belumAdaTugasHariIni}</div>
        <div className={styles.emptySub}>
          {t.tugasBaruOtomatis}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.liveBar}>
        <span className={styles.liveDot} />
        <span className={styles.liveTxt}>{t.liveUpdateOtomatis}</span>
      </div>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          busy={actionBusyId === task.id}
          onAccept={onAccept}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      ))}
    </>
  );
}

function HistoryTab({
  from,
  to,
  setFrom,
  setTo,
  statusFilter,
  setStatusFilter,
  onApply,
  onReset,
  applied,
  loading,
  tasks,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  statusFilter: string | null;
  setStatusFilter: (v: string | null) => void;
  onApply: () => void;
  onReset: () => void;
  applied: boolean;
  loading: boolean;
  tasks: TaskDetail[];
}) {
  const { t } = useLang();
  return (
    <>
      <div className={styles.filterBox}>
        <div className={styles.filterRow}>
          <div className={styles.fiIcon}>📅</div>
          <div className={styles.fiInfo}>
            <div className={styles.fiLabel}>{t.dariTanggal}</div>
            <input
              type="date"
              className={styles.dateInput}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.fiIcon}>📅</div>
          <div className={styles.fiInfo}>
            <div className={styles.fiLabel}>{t.sampaiTanggal}</div>
            <input
              type="date"
              className={styles.dateInput}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.filterDivider}>
          <div className={styles.fdl} />
          <div className={styles.fdt}>{t.statusLabel}</div>
          <div className={styles.fdl} />
        </div>

        <div className={styles.chips}>
          {["ASSIGNED", "ON GOING", "DONE"].map((s) => (
            <button
              key={s}
              className={`${styles.chip} ${
                statusFilter === s ? styles.chipOn : ""
              }`}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            >
              {statusLabel(s, t)}
            </button>
          ))}
        </div>

        <div className={styles.filterActions}>
          <button className={styles.btnApply} onClick={onApply}>
            {t.terapkan}
          </button>
          <button className={styles.btnReset} onClick={onReset}>
            {t.reset}
          </button>
        </div>
      </div>

      {loading && (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <div className={styles.loadingTxt}>{t.memuatRiwayat}</div>
        </div>
      )}

      {!loading && applied && tasks.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIco}>🗂️</span>
          <div className={styles.emptyTitle}>{t.tidakAdaRiwayat}</div>
          <div className={styles.emptySub}>
            {t.cobaUbahRentang}
          </div>
        </div>
      )}

      {!loading && !applied && (
        <div className={styles.empty}>
          <span className={styles.emptyIco}>🔎</span>
          <div className={styles.emptyTitle}>{t.pilihRentangTanggal}</div>
          <div className={styles.emptySub}>
            {t.tekanTerapkan}
          </div>
        </div>
      )}

      {!loading &&
        tasks.map((task) => (
          <TaskCard key={task.id} task={task} busy={false} onAccept={() => {}} onComplete={() => {}} />
        ))}
    </>
  );
}

function ProfileTab({
  driver,
  onChangePin,
  onLogout,
}: {
  driver: Driver;
  onChangePin: () => void;
  onLogout: () => void;
}) {
  const { t } = useLang();
  return (
    <div className={styles.profileWrap}>
      <div className={styles.profileHero}>
        <div className={styles.profileAvatar}>
          {driver.avatar_emoji || "🧑‍✈️"}
        </div>
        <div className={styles.profileName}>{driver.nama}</div>
        <div className={styles.profileRoleLabel}>DRIVER</div>
      </div>

      <div className={styles.profileSection}>
        <div className={styles.profileSectionHeader}>{t.informasi}</div>
        <div className={styles.profileRow}>
          <span className={styles.profileRowIco}>📱</span>
          <span className={styles.profileRowLabel}>{t.noHp}</span>
          <span className={styles.profileRowVal}>{driver.no_hp || "-"}</span>
        </div>
      </div>

      <div className={styles.profileSection}>
        <div className={styles.profileSectionHeader}>{t.keamanan}</div>
        <div className={styles.profileRow}>
          <span className={styles.profileRowIco}>🔒</span>
          <span className={styles.profileRowLabel}>{t.pinAkses}</span>
          <button className={styles.pinRowBtn} onClick={onChangePin}>
            {t.ubahPin}
          </button>
        </div>
      </div>

      <div className={styles.profileSection}>
        <div className={styles.profileRow}>
          <span className={styles.profileRowIco}>🚪</span>
          <span className={styles.profileRowLabel}>{t.keluarDariAkun}</span>
          <button className={styles.pinRowBtn} onClick={onLogout}>
            {t.keluar}
          </button>
        </div>
      </div>

      <div className={styles.profileFooter}>CIKOPS FLEET OS v1.0</div>
    </div>
  );
}

function PinChangeModal({
  step,
  oldVal,
  newVal,
  confirmVal,
  error,
  busy,
  onDigit,
  onBackspace,
  onClose,
}: {
  step: "old" | "new" | "confirm";
  oldVal: string;
  newVal: string;
  confirmVal: string;
  error: string;
  busy: boolean;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const value = step === "old" ? oldVal : step === "new" ? newVal : confirmVal;
  const title =
    step === "old"
      ? t.masukkanPinLama
      : step === "new"
      ? t.buatPinBaru
      : t.konfirmasiPinBaru;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalBox} ${styles.modalBoxOpen}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHandle} />
        <div className={styles.modalTitle}>{title}</div>
        <div className={styles.modalSub}>
          {step === "old"
            ? t.verifikasiIdentitas
            : step === "new"
            ? t.empatDigitMudahDiingat
            : t.ketikUlangPin}
        </div>

        <div className={`${styles.pinDots} ${styles.modalDots}`}>
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <div
              key={i}
              className={`${styles.pinDot} ${
                i < value.length ? styles.pinDotFilled : ""
              }`}
            />
          ))}
        </div>

        <div className={styles.modalErr}>{error}</div>

        <Numpad onDigit={onDigit} onBackspace={onBackspace} disabled={busy} />

        <button className={styles.modalCancelBtn} onClick={onClose}>
          {t.batal}
        </button>
      </div>
    </div>
  );
}
