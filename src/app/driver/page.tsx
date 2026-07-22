"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./driver.module.css";
import {
  acceptTask,
  cancelTaskByDriver,
  changeDriverPassword,
  completeTask,
  driverGetSession,
  driverSignIn,
  driverSignOut,
  getDriverHistory,
  getDriverTasksToday,
  subscribeToTasks,
} from "@/lib/api";
import type { Driver, TaskDetail } from "@/lib/types";
import { computeStats } from "@/lib/types";
import { useLang, useTheme } from "@/lib/providers";
import type { Dict } from "@/lib/dictionary";
import { todayLocalISODate } from "@/lib/dateUtils";

type Screen = "splash" | "login" | "app";
type Tab = "today" | "history" | "profile";

export default function DriverPanelPage() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const [screen, setScreen] = useState<Screen>("splash");
  const [splashFading, setSplashFading] = useState(false);
  const [tab, setTab] = useState<Tab>("today");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

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

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwModalNew, setPwModalNew] = useState("");
  const [pwModalConfirm, setPwModalConfirm] = useState("");
  const [pwModalError, setPwModalError] = useState("");
  const [pwModalBusy, setPwModalBusy] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  // ── splash screen: tampil sebentar, lalu cek sesi Supabase Auth ──
useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 1300);
    const nextTimer = setTimeout(async () => {
      try {
        const driver = await driverGetSession();
        if (driver) {
          setLoggedDriver(driver);
          setScreen("app");
          setTab("today");
          return;
        }
      } catch {
        // fall through ke layar login
      }
      setScreen("login");
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
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {
      // Web Speech API tidak tersedia/diblokir — abaikan.
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
      navigator.vibrate([260, 110, 260, 110, 260]);
    }
    playNotificationSound();
    speakNewTaskAnnouncement(destination);
  }

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

  useEffect(() => {
    if (screen !== "app" || !loggedDriver) return;

    async function recheckStillActive() {
      try {
        const fresh = await driverGetSession();
        if (!fresh) {
          showToast(
            lang === "en" ? "Your session has ended" : "Sesi kamu telah berakhir"
          );
          logout();
        }
      } catch {
        // best-effort — don't log the driver out just because this
        // particular check failed (e.g. briefly offline)
      }
    }

    function handleVisible() {
      if (document.visibilityState === "visible") recheckStillActive();
    }
    document.addEventListener("visibilitychange", handleVisible);
    const id = setInterval(recheckStillActive, 5 * 60 * 1000); // tiap 5 menit
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      clearInterval(id);
    };
  }, [screen, loggedDriver]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function submitLogin(e?: React.FormEvent) {
    e?.preventDefault();
    const email = loginEmail.trim();
    if (!email || !loginPassword || loginBusy) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const driver = await driverSignIn(email, loginPassword);
      setLoggedDriver(driver);
      setLoginPassword("");
      setScreen("app");
      setTab("today");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "NOT_A_DRIVER") setLoginError(t.akunBukanDriver);
      else if (msg === "INVALID_CREDENTIALS") setLoginError(t.loginGagal);
      else setLoginError(msg || t.loginGagal);
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    try {
      await driverSignOut();
    } catch {
      // Sesi lokal tetap dibersihkan meski request sign-out gagal
      // (mis. sedang offline) — Supabase menghapus token lokalnya sendiri.
    }
    knownAssignedIdsRef.current = null;
    updateAppBadge(0);
    setLoggedDriver(null);
    setLoginPassword("");
    setLoginError(null);
    setScreen("login");
    setTab("today");
    setTodayTasks([]);
    setHistoryTasks([]);
    setHistoryApplied(false);
  }

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

  function openPasswordModal() {
    setPwModalOpen(true);
    setPwModalNew("");
    setPwModalConfirm("");
    setPwModalError("");
  }

  function closePasswordModal() {
    if (pwModalBusy) return;
    setPwModalOpen(false);
  }

  async function submitPasswordChange(e?: React.FormEvent) {
    e?.preventDefault();
    if (pwModalBusy) return;
    if (pwModalNew.length < 6) {
      setPwModalError(t.passwordMin6);
      return;
    }
    if (pwModalNew !== pwModalConfirm) {
      setPwModalError(t.passwordTidakSama);
      return;
    }
    setPwModalBusy(true);
    setPwModalError("");
    try {
      await changeDriverPassword(pwModalNew);
      setPwModalOpen(false);
      showToast(t.passwordDiubah);
    } catch (e2) {
      setPwModalError(e2 instanceof Error ? e2.message : t.gagalMengubahPassword);
    } finally {
      setPwModalBusy(false);
    }
  }

  const stats = useMemo(() => computeStats(todayTasks), [todayTasks]);

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

  if (screen === "login") {
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

          <div className={styles.loginWelcome}>{t.loginWelcome}</div>
          <div className={styles.loginWelcomeSub}>{t.masukDenganAkun}</div>

          <form className={styles.loginCard} onSubmit={submitLogin}>
            <label className={styles.loginLabel} htmlFor="driver-email">Email</label>
            <input
              id="driver-email"
              className={styles.loginInput}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nama@perusahaan.com"
              value={loginEmail}
              onChange={(e) => { setLoginEmail(e.target.value); setLoginError(null); }}
              disabled={loginBusy}
            />

            <label className={styles.loginLabel} htmlFor="driver-password">Password</label>
            <div className={styles.loginPasswordWrap}>
              <input
                id="driver-password"
                className={styles.loginInput}
                type={loginShowPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => { setLoginPassword(e.target.value); setLoginError(null); }}
                disabled={loginBusy}
              />
              <button
                type="button"
                className={styles.loginEyeBtn}
                onClick={() => setLoginShowPassword((v) => !v)}
                aria-label={loginShowPassword ? t.sembunyikanPassword : t.lihatPassword}
                tabIndex={-1}
              >
                {loginShowPassword ? "🙈" : "👁️"}
              </button>
            </div>

            {loginError && <div className={styles.loginError}>{loginError}</div>}

            <button
              type="submit"
              className={styles.btnMasuk}
              disabled={!loginEmail.trim() || !loginPassword || loginBusy}
              style={{ marginTop: 6 }}
            >
              {loginBusy ? t.sedangMasuk : t.masuk}
            </button>
          </form>

          <div className={styles.loginHint}>{t.loginHintAdmin}</div>

          <div className={styles.landingFooter}>CIKOPS-FM SYSTEM v1.0</div>
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
                onChangePassword={openPasswordModal}
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

        {pwModalOpen && (
          <PasswordChangeModal
            newVal={pwModalNew}
            confirmVal={pwModalConfirm}
            error={pwModalError}
            busy={pwModalBusy}
            setNewVal={setPwModalNew}
            setConfirmVal={setPwModalConfirm}
            onSubmit={submitPasswordChange}
            onClose={closePasswordModal}
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
  onChangePassword,
  onLogout,
}: {
  driver: Driver;
  onChangePassword: () => void;
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
        {driver.email && (
          <div className={styles.profileRow}>
            <span className={styles.profileRowIco}>✉️</span>
            <span className={styles.profileRowLabel}>Email</span>
            <span className={styles.profileRowVal} style={{ fontSize: 13.5, wordBreak: "break-all" }}>{driver.email}</span>
          </div>
        )}
      </div>

      <div className={styles.profileSection}>
        <div className={styles.profileSectionHeader}>{t.keamanan}</div>
        <div className={styles.profileRow}>
          <span className={styles.profileRowIco}>🔒</span>
          <span className={styles.profileRowLabel}>Password</span>
          <button className={styles.pinRowBtn} onClick={onChangePassword}>
            {t.ubahPassword}
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

      <div className={styles.profileFooter}>CIKOPS-FM SYSTEM v1.0</div>
    </div>
  );
}

function PasswordChangeModal({
  newVal,
  confirmVal,
  error,
  busy,
  setNewVal,
  setConfirmVal,
  onSubmit,
  onClose,
}: {
  newVal: string;
  confirmVal: string;
  error: string;
  busy: boolean;
  setNewVal: (v: string) => void;
  setConfirmVal: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalBox} ${styles.modalBoxOpen}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHandle} />
        <div className={styles.modalTitle}>{t.ubahPassword}</div>
        <div className={styles.modalSub}>{t.passwordMin6}</div>

        <form onSubmit={onSubmit} className={styles.pwForm}>
          <label className={styles.loginLabel} htmlFor="pw-new">{t.passwordBaru}</label>
          <input
            id="pw-new"
            className={styles.loginInput}
            type="password"
            autoComplete="new-password"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            disabled={busy}
          />

          <label className={styles.loginLabel} htmlFor="pw-confirm">{t.konfirmasiPasswordBaru}</label>
          <input
            id="pw-confirm"
            className={styles.loginInput}
            type="password"
            autoComplete="new-password"
            value={confirmVal}
            onChange={(e) => setConfirmVal(e.target.value)}
            disabled={busy}
          />

          <div className={styles.modalErr}>{error}</div>

          <button
            type="submit"
            className={styles.btnMasuk}
            disabled={busy || !newVal || !confirmVal}
          >
            {busy ? t.menyimpan : t.simpanPassword}
          </button>
        </form>

        <button className={styles.modalCancelBtn} onClick={onClose} disabled={busy}>
          {t.batal}
        </button>
      </div>
    </div>
  );
}
