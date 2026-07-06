"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import styles from "./dashboard.module.css";
import {
  cancelTaskByAdmin,
  createTask,
  deleteTask,
  getDrivers,
  getEmployees,
  getJobTypes,
  getTasksByDate,
  getTasksByRange,
  getVehicles,
  subscribeToTasks,
  updateTaskStatus,
  getAllVehiclesFull,
  addVehicle,
  updateVehicle,
  deleteVehicle,
  getClaims,
  addClaim,
  deleteClaim,
  getOvertimes,
  addOvertime,
  deleteOvertime,
  getCurrentKantong,
  updateKantongBudget,
  resetKantong,
  getDriverTiers,
  addDriverTier,
  updateDriverTier,
  deleteDriverTier,
  setDriverTier,
  getGasStations,
  addGasStation,
  updateGasStation,
  deleteGasStation,
} from "@/lib/api";
import type { Claim, ClaimItem, Overtime, Plant, Kantong, DriverTier, GasStation, FuelEntry } from "@/lib/types";

// Leaflet touches `window` directly, so it must never be server-rendered.
const GasStationMap = dynamic(() => import("./GasStationMap"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 420, borderRadius: "var(--r2)", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)" }}>
      Memuat peta...
    </div>
  ),
});
import { exportTasksToCsv, exportTasksToPdf } from "@/lib/report";
import { computeReportAnalytics, formatMinutes } from "@/lib/analytics";
import type {
  Driver,
  Employee,
  JobType,
  TaskDetail,
  TaskStatus,
  Vehicle,
} from "@/lib/types";
import { computeStats } from "@/lib/types";
import { useLang, useTheme } from "@/lib/providers";
import { useAuth } from "@/lib/auth";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

/** Merged dashboard tabs — "tasks" is the original driver-assignment
 *  feature; the rest are FleetOS features ported into this same app. */
export type DashboardTab =
  | "overview"
  | "tasks"
  | "vehicles"
  | "claims"
  | "overtime"
  | "driverbudget"
  | "opfund"
  | "gasstations";

const TAB_CONFIG: { id: DashboardTab; icon: string; labelId: string; labelEn: string }[] = [
  { id: "overview", icon: "📊", labelId: "Ringkasan", labelEn: "Overview" },
  { id: "tasks", icon: "🗂️", labelId: "Penugasan", labelEn: "Tasks" },
  { id: "vehicles", icon: "🚗", labelId: "Armada", labelEn: "Vehicles" },
  { id: "claims", icon: "🧾", labelId: "Klaim", labelEn: "Claims" },
  { id: "overtime", icon: "⏱️", labelId: "Overtime", labelEn: "Overtime" },
  { id: "driverbudget", icon: "💳", labelId: "Budget Driver", labelEn: "Driver Budget" },
  { id: "opfund", icon: "💰", labelId: "Dana Operasional", labelEn: "Operational Fund" },
  { id: "gasstations", icon: "⛽", labelId: "Pom Bensin", labelEn: "Gas Stations" },
];

/** Hook sederhana untuk deteksi viewport mobile vs desktop, dipakai untuk
 *  memilih presentasi yang berbeda (tabel di PC, kartu di HP) dari data yang sama. */
function useIsMobile(breakpoint = 860) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < breakpoint);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isMobile;
}

export default function DashboardPage() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { session, loading: authLoading, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

  const [dateFilter, setDateFilter] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState<TaskStatus | null>(null);
  const [search, setSearch] = useState("");

  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TaskDetail | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(
    null
  );

  function showToast(msg: string, isError = false) {
    setToast({ msg, error: isError });
    setTimeout(() => setToast(null), 2500);
  }

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTasksByDate(dateFilter);
      setTasks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data tugas");
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const unsubscribe = subscribeToTasks(() => {
      loadTasks();
    });
    return unsubscribe;
  }, [loadTasks]);

  // load master data once (for the create-task form)
  useEffect(() => {
    (async () => {
      try {
        const [d, v, e, j] = await Promise.all([
          getDrivers(),
          getVehicles(),
          getEmployees(),
          getJobTypes(),
        ]);
        setDrivers(d);
        setVehicles(v);
        setEmployees(e);
        setJobTypes(j);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Gagal memuat master data",
          true
        );
      }
    })();
  }, []);

  const stats = useMemo(() => computeStats(tasks), [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (statusFilter) {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.tujuan?.toLowerCase().includes(q) ||
          t.driver_nama?.toLowerCase().includes(q) ||
          t.requestor?.toLowerCase().includes(q) ||
          t.kendaraan?.toLowerCase().includes(q) ||
          t.jenis_pekerjaan?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [tasks, statusFilter, search]);

  async function handleStatusChange(task: TaskDetail, status: TaskStatus) {
    try {
      await updateTaskStatus(task.id, status);
      showToast(`Status diubah ke ${status}`);
      loadTasks();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal mengubah status", true);
    }
  }

  async function handleDelete(task: TaskDetail) {
    if (!confirm(`Hapus tugas ke "${task.tujuan}"?`)) return;
    try {
      await deleteTask(task.id);
      showToast("Tugas dihapus");
      loadTasks();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal menghapus tugas", true);
    }
  }

  function openCancelConfirm(task: TaskDetail) {
    setCancelTarget(task);
  }

  async function handleCancelConfirmed() {
    if (!cancelTarget) return;
    const task = cancelTarget;
    setCancelTarget(null);
    try {
      await cancelTaskByAdmin(task.id);
      showToast("Tugas dibatalkan");
      loadTasks();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal membatalkan tugas", true);
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--t3)" }}>
        {t.actionLoading}
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <img src="/logo.svg" alt="CIKOPS" className={styles.topbarLogoImg} />
        <div className={styles.topbarTitleWrap}>
          <div className={styles.topbarEyebrow}>CIKOPS</div>
          <div className={styles.topbarTitle}>Fleet Dashboard</div>
        </div>
        <div className={styles.topbarActions}>
          {!isMobile && (
            <div className={styles.liveBadge}>
              <span className={styles.liveDot} /> Live
            </div>
          )}
          <button
            className={styles.iconBtn}
            onClick={() => setLang(lang === "id" ? "en" : "id")}
            aria-label="Language"
            style={{ fontSize: 12, fontWeight: 700 }}
          >
            {lang === "id" ? "EN" : "ID"}
          </button>
          <button className={styles.iconBtn} onClick={toggleTheme}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => signOut()}
            aria-label={t.actionSignOut}
            title={t.actionSignOut}
          >
            🚪
          </button>
          {activeTab === "tasks" && (
            <>
              <button
                className={styles.iconBtn}
                onClick={() => setReportModalOpen(true)}
                aria-label="Laporan & Analytics"
                title="Laporan & Analytics"
              >
                📊
              </button>
              <button className={styles.btnPrimary} onClick={() => setModalOpen(true)}>
                {isMobile ? "+ Tugaskan" : "+ Tugaskan Driver"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Tab navigation — Sky & Gold pill style, merges the original
          driver-assignment ("Penugasan") feature with every FleetOS module. ── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 20px",
          overflowX: "auto",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, var(--surface2), var(--surface))",
        }}
      >
        {TAB_CONFIG.map((tabItem) => (
          <button
            key={tabItem.id}
            className={`tabPill ${activeTab === tabItem.id ? "tabPillActive" : ""}`}
            onClick={() => setActiveTab(tabItem.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 17px",
              borderRadius: "var(--pill)",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "var(--font)",
              background: activeTab === tabItem.id ? "linear-gradient(135deg, var(--gold), var(--gold2))" : "transparent",
              color: activeTab === tabItem.id ? "var(--gold-on)" : "var(--t2)",
            }}
          >
            <span>{tabItem.icon}</span>
            {lang === "id" ? tabItem.labelId : tabItem.labelEn}
          </button>
        ))}
      </div>

      {activeTab === "tasks" && (
      <div className={styles.body}>
        <div className={styles.statsRow}>
          <div className={`${styles.statCard} ${styles.statTotal}`}>
            <div className={styles.statCardTop}>
              <span className={styles.statCardIcon}>📊</span>
            </div>
            <div className={styles.statCardNum}>{stats.total}</div>
            <div className={styles.statCardLabel}>Total Tugas</div>
          </div>
          <div className={`${styles.statCard} ${styles.statAssigned}`}>
            <div className={styles.statCardTop}>
              <span className={styles.statCardIcon}>🆕</span>
            </div>
            <div className={styles.statCardNum}>{stats.assigned}</div>
            <div className={styles.statCardLabel}>Baru Ditugaskan</div>
          </div>
          <div className={`${styles.statCard} ${styles.statOngoing}`}>
            <div className={styles.statCardTop}>
              <span className={styles.statCardIcon}>🚗</span>
            </div>
            <div className={styles.statCardNum}>{stats.ongoing}</div>
            <div className={styles.statCardLabel}>Sedang Berjalan</div>
          </div>
          <div className={`${styles.statCard} ${styles.statDone}`}>
            <div className={styles.statCardTop}>
              <span className={styles.statCardIcon}>✅</span>
            </div>
            <div className={styles.statCardNum}>{stats.done}</div>
            <div className={styles.statCardLabel}>Selesai</div>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolbarDate}>
            <span>📅</span>
            <input
              type="date"
              className={styles.toolbarDateInput}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>

          <div className={styles.toolbarStatusGroup}>
            {(["ASSIGNED", "ON GOING", "DONE", "CANCELLED"] as TaskStatus[]).map(
              (s) => (
                <button
                  key={s}
                  className={`${styles.statusChip} ${
                    statusFilter === s ? styles.statusChipOn : ""
                  }`}
                  onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                >
                  {s}
                </button>
              )
            )}
          </div>

          {!isMobile && <div className={styles.toolbarSpacer} />}

          <div className={styles.searchBox}>
            <span>🔎</span>
            <input
              className={styles.searchInput}
              placeholder="Cari tujuan, driver, requestor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className={styles.errBanner}>{error}</div>}

        {loading ? (
          <div className={styles.tableWrap}>
            <div className={styles.tableLoading}>
              <div className={styles.spinner} />
              <div className={styles.loadingTxt}>Memuat data tugas...</div>
            </div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className={styles.tableWrap}>
            <div className={styles.tableEmpty}>
              <span className={styles.tableEmptyIco}>🗂️</span>
              <div className={styles.tableEmptyTitle}>
                Tidak ada tugas untuk filter ini
              </div>
            </div>
          </div>
        ) : isMobile ? (
          <MobileTaskList
            tasks={filteredTasks}
            onAdvance={handleStatusChange}
            onCancel={openCancelConfirm}
            onDelete={handleDelete}
          />
        ) : (
          <DesktopTaskTable
            tasks={filteredTasks}
            onAdvance={handleStatusChange}
            onCancel={openCancelConfirm}
            onDelete={handleDelete}
          />
        )}
      </div>
      )}

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "vehicles" && <VehiclesTab />}
      {activeTab === "claims" && <ClaimsTab />}
      {activeTab === "overtime" && <OvertimeTab />}
      {activeTab === "driverbudget" && <DriverBudgetTab />}
      {activeTab === "opfund" && <OpFundTab />}
      {activeTab === "gasstations" && <GasStationsTab />}

      {modalOpen && (
        <CreateTaskModal
          drivers={drivers}
          vehicles={vehicles}
          employees={employees}
          jobTypes={jobTypes}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            showToast("Tugas berhasil ditugaskan ✓");
            loadTasks();
          }}
          onError={(msg) => showToast(msg, true)}
        />
      )}

      {reportModalOpen && (
        <ReportModal
          drivers={drivers}
          onClose={() => setReportModalOpen(false)}
          onError={(msg) => showToast(msg, true)}
          onSuccess={(msg) => showToast(msg)}
        />
      )}

      {cancelTarget && (
        <div
          className={styles.modalOverlay}
          onClick={() => setCancelTarget(null)}
        >
          <div
            className={styles.confirmBox}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalTitle}>Batalkan tugas ini?</div>
            <div className={styles.confirmSub}>
              Tujuan: {cancelTarget.tujuan} · Driver:{" "}
              {cancelTarget.driver_nama || "-"}
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancel}
                onClick={() => setCancelTarget(null)}
              >
                Tidak
              </button>
              <button
                className={styles.btnDangerConfirm}
                onClick={handleCancelConfirmed}
              >
                Ya, Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`${styles.toast} ${toast.error ? styles.toastError : ""}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  const cls =
    status === "ASSIGNED"
      ? styles.pillAssigned
      : status === "ON GOING"
      ? styles.pillOngoing
      : status === "CANCELLED"
      ? styles.pillCancelled
      : styles.pillDone;
  return <span className={`${styles.statusPill} ${cls}`}>{status}</span>;
}

/* ════════════════════════════════════════════════
   DESKTOP: tabel lebar dengan scroll horizontal
════════════════════════════════════════════════ */

function DesktopTaskTable({
  tasks,
  onAdvance,
  onCancel,
  onDelete,
}: {
  tasks: TaskDetail[];
  onAdvance: (t: TaskDetail, status: TaskStatus) => void;
  onCancel: (t: TaskDetail) => void;
  onDelete: (t: TaskDetail) => void;
}) {
  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Driver</th>
              <th>Kendaraan</th>
              <th>Tujuan</th>
              <th>Jenis Pekerjaan</th>
              <th>Requestor</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td className={styles.cellMuted}>
                  {new Date(t.created_at).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className={styles.cellBold}>
                  {t.driver_avatar} {t.driver_nama || "-"}
                </td>
                <td>{t.kendaraan || "-"}</td>
                <td className={styles.cellBold}>{t.tujuan}</td>
                <td>{t.jenis_pekerjaan}</td>
                <td>
                  {t.requestor}
                  {t.departement ? ` (${t.departement})` : ""}
                </td>
                <td>
                  <StatusPill status={t.status} />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    {t.status !== "DONE" && t.status !== "CANCELLED" && (
                      <button
                        className={styles.rowActionBtn}
                        onClick={() =>
                          onAdvance(
                            t,
                            t.status === "ASSIGNED" ? "ON GOING" : "DONE"
                          )
                        }
                      >
                        {t.status === "ASSIGNED" ? "→ Proses" : "→ Selesai"}
                      </button>
                    )}
                    {t.status !== "DONE" && t.status !== "CANCELLED" && (
                      <button
                        className={`${styles.rowActionBtn} ${styles.rowActionWarn}`}
                        onClick={() => onCancel(t)}
                      >
                        Batalkan
                      </button>
                    )}
                    <button
                      className={`${styles.rowActionBtn} ${styles.rowActionDanger}`}
                      onClick={() => onDelete(t)}
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   MOBILE: kartu vertikal, tanpa scroll horizontal
════════════════════════════════════════════════ */

function MobileTaskList({
  tasks,
  onAdvance,
  onCancel,
  onDelete,
}: {
  tasks: TaskDetail[];
  onAdvance: (t: TaskDetail, status: TaskStatus) => void;
  onCancel: (t: TaskDetail) => void;
  onDelete: (t: TaskDetail) => void;
}) {
  return (
    <div className={styles.mobileList}>
      {tasks.map((t) => (
        <div key={t.id} className={styles.mobileCard}>
          <div className={styles.mobileCardTop}>
            <div className={styles.mobileCardDest}>{t.tujuan}</div>
            <StatusPill status={t.status} />
          </div>
          <div className={styles.mobileCardMeta}>
            <span>
              {t.driver_avatar} {t.driver_nama || "-"}
            </span>
            <span className={styles.mobileCardDot}>•</span>
            <span>{t.kendaraan || "-"}</span>
          </div>
          <div className={styles.mobileCardSub}>
            {t.jenis_pekerjaan} · {t.requestor}
            {t.departement ? ` (${t.departement})` : ""}
          </div>
          <div className={styles.mobileCardTime}>
            {new Date(t.created_at).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <div className={styles.mobileCardActions}>
            {t.status !== "DONE" && t.status !== "CANCELLED" && (
              <button
                className={styles.mobileActionBtn}
                onClick={() =>
                  onAdvance(t, t.status === "ASSIGNED" ? "ON GOING" : "DONE")
                }
              >
                {t.status === "ASSIGNED" ? "→ Proses" : "→ Selesai"}
              </button>
            )}
            {t.status !== "DONE" && t.status !== "CANCELLED" && (
              <button
                className={`${styles.mobileActionBtn} ${styles.mobileActionWarn}`}
                onClick={() => onCancel(t)}
              >
                Batalkan
              </button>
            )}
            <button
              className={`${styles.mobileActionBtn} ${styles.mobileActionDanger}`}
              onClick={() => onDelete(t)}
            >
              Hapus
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════
   REPORT MODAL — pilih rentang tanggal, unduh CSV/PDF
════════════════════════════════════════════════ */

type QuickRange = "today" | "7d" | "14d" | "30d" | "3m" | "thisMonth";

function quickRangeToDates(range: QuickRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (range === "today") {
    // from = to
  } else if (range === "7d") {
    from.setDate(from.getDate() - 6);
  } else if (range === "14d") {
    from.setDate(from.getDate() - 13);
  } else if (range === "30d") {
    from.setDate(from.getDate() - 29);
  } else if (range === "3m") {
    from.setMonth(from.getMonth() - 3);
  } else if (range === "thisMonth") {
    from.setDate(1);
  }
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { from: fmt(from), to: fmt(to) };
}

function ReportModal({
  drivers,
  onClose,
  onError,
  onSuccess,
}: {
  drivers: Driver[];
  onClose: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [quickRange, setQuickRange] = useState<QuickRange>("7d");
  const [dateFrom, setDateFrom] = useState(quickRangeToDates("7d").from);
  const [dateTo, setDateTo] = useState(quickRangeToDates("7d").to);
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);
  const [reportTasks, setReportTasks] = useState<TaskDetail[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoadingPreview(true);
    try {
      const data = await getTasksByRange(dateFrom, dateTo);
      setReportTasks(data);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Gagal memuat data laporan");
    } finally {
      setLoadingPreview(false);
    }
  }, [dateFrom, dateTo, onError]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  function applyQuickRange(range: QuickRange) {
    setQuickRange(range);
    const { from, to } = quickRangeToDates(range);
    setDateFrom(from);
    setDateTo(to);
  }

  const analytics = useMemo(
    () => computeReportAnalytics(reportTasks, drivers),
    [reportTasks, drivers]
  );

  async function handleDownload(format: "csv" | "pdf") {
    if (!dateFrom || !dateTo) {
      onError("Pilih rentang tanggal terlebih dahulu");
      return;
    }
    setBusy(format);
    try {
      const tasks =
        reportTasks.length > 0 || !loadingPreview
          ? reportTasks
          : await getTasksByRange(dateFrom, dateTo);
      if (format === "csv") {
        exportTasksToCsv(tasks, dateFrom, dateTo);
      } else {
        await exportTasksToPdf(tasks, drivers, dateFrom, dateTo);
      }
      onSuccess(
        `Laporan ${format.toUpperCase()} berhasil diunduh (${tasks.length} tugas)`
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Gagal membuat laporan");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.reportOverlay}>
      <div className={styles.reportPanel}>
        <div className={styles.reportTopbar}>
          <div className={styles.reportTitleWrap}>
            <div className={styles.topbarEyebrow}>CIKOPS</div>
            <div className={styles.topbarTitle}>Laporan & Analytics</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            ✕ Tutup
          </button>
        </div>

        <div className={styles.reportBody}>
          <div className={styles.reportFilterRow}>
            <div className={styles.toolbarDate}>
              <span>📅</span>
              <input
                type="date"
                className={styles.toolbarDateInput}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <span className={styles.reportRangeDash}>s/d</span>
            <div className={styles.toolbarDate}>
              <input
                type="date"
                className={styles.toolbarDateInput}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className={styles.reportQuickChips}>
              {(
                [
                  ["today", "Hari Ini"],
                  ["7d", "7 Hari"],
                  ["14d", "14 Hari"],
                  ["30d", "30 Hari"],
                  ["3m", "3 Bulan"],
                  ["thisMonth", "Bulan Ini"],
                ] as [QuickRange, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`${styles.statusChip} ${
                    quickRange === key ? styles.statusChipOn : ""
                  }`}
                  onClick={() => applyQuickRange(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.reportActionRow}>
            <button
              className={styles.btnReportCsv}
              disabled={busy !== null || loadingPreview}
              onClick={() => handleDownload("csv")}
            >
              {busy === "csv" ? "Menyiapkan..." : "⬇ Export CSV"}
            </button>
            <button
              className={styles.btnSubmit}
              disabled={busy !== null || loadingPreview}
              onClick={() => handleDownload("pdf")}
            >
              {busy === "pdf" ? "Menyiapkan..." : "⬇ Export PDF"}
            </button>
          </div>

          {loadingPreview ? (
            <div className={styles.tableWrap}>
              <div className={styles.tableLoading}>
                <div className={styles.spinner} />
                <div className={styles.loadingTxt}>Memuat data laporan...</div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.statsRow}>
                <div className={`${styles.statCard} ${styles.statTotal}`}>
                  <div className={styles.statCardNum}>{analytics.totalTask}</div>
                  <div className={styles.statCardLabel}>Total Task</div>
                </div>
                <div className={`${styles.statCard} ${styles.statAssigned}`}>
                  <div className={styles.statCardNum}>{analytics.assigned}</div>
                  <div className={styles.statCardLabel}>Assigned</div>
                </div>
                <div className={`${styles.statCard} ${styles.statOngoing}`}>
                  <div className={styles.statCardNum}>{analytics.ongoing}</div>
                  <div className={styles.statCardLabel}>On Going</div>
                </div>
                <div className={`${styles.statCard} ${styles.statDone}`}>
                  <div className={styles.statCardNum}>{analytics.done}</div>
                  <div className={styles.statCardLabel}>Done</div>
                </div>
                <div className={`${styles.statCard} ${styles.statDriverAktif}`}>
                  <div className={styles.statCardNum}>
                    {analytics.driverAktif}
                  </div>
                  <div className={styles.statCardLabel}>Driver Aktif</div>
                </div>
                <div className={`${styles.statCard} ${styles.statCompletion}`}>
                  <div className={styles.statCardNum}>
                    {analytics.completionRate.toFixed(0)}%
                  </div>
                  <div className={styles.statCardLabel}>Completion Rate</div>
                </div>
              </div>

              <div className={styles.reportSectionHeader}>
                <span className={styles.reportSectionIco}>📊</span>
                Analytics & Insights
              </div>

              <div className={styles.insightGrid}>
                <InsightCard
                  icon="🏆"
                  title="Top Driver (Task)"
                  entries={analytics.topDriverByTask}
                  color="blue"
                />
                <InsightCard
                  icon="⏱️"
                  title="Rata-rata Durasi Driver"
                  entries={analytics.avgDurationByDriver}
                  color="cyan"
                  valueFormatter={(v) => formatMinutes(v)}
                />
                <InsightCard
                  icon="🏢"
                  title="Top Departemen Requestor"
                  entries={analytics.topDepartementRequestor}
                  color="purple"
                />
                <InsightCard
                  icon="🧰"
                  title="Jenis Pekerjaan Terbanyak"
                  entries={analytics.topJenisPekerjaan}
                  color="green"
                />
                <InsightCard
                  icon="🚗"
                  title="Utilisasi Kendaraan"
                  entries={analytics.utilisasiKendaraan}
                  color="orange"
                />
                <InsightCard
                  icon="📅"
                  title="Aktivitas Harian"
                  entries={analytics.aktivitasHarian.map((e) => ({
                    ...e,
                    label: formatDateLabel(e.label),
                  }))}
                  color="red"
                />
              </div>

              <div className={styles.reportSectionHeader}>
                <span className={styles.reportSectionIco}>👥</span>
                Ringkasan Per Driver
                <span className={styles.reportSectionCount}>
                  {analytics.driverSummaries.length} driver
                </span>
              </div>

              <div className={styles.driverSummaryGrid}>
                {analytics.driverSummaries.length === 0 ? (
                  <div className={styles.tableEmpty}>
                    <div className={styles.tableEmptyTitle}>
                      Tidak ada data driver pada periode ini
                    </div>
                  </div>
                ) : (
                  analytics.driverSummaries.map((s) => (
                    <div key={s.driverId} className={styles.driverSummaryCard}>
                      <div className={styles.driverSummaryHeader}>
                        <span>🏅</span> {s.driverNama}
                      </div>
                      <div className={styles.driverSummaryPeriod}>
                        {formatDateLabel(dateFrom)} s/d {formatDateLabel(dateTo)}
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Total Task</span>
                        <strong>{s.totalTask}</strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Selesai</span>
                        <strong>{s.selesai}</strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Completion Rate</span>
                        <strong className={styles.driverSummaryAccent}>
                          {s.completionRate.toFixed(0)}%
                        </strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Total Jam Kerja</span>
                        <strong className={styles.driverSummaryAccentBlue}>
                          {formatMinutes(s.totalJamKerjaMinutes)}
                        </strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Avg Durasi/Task</span>
                        <strong className={styles.driverSummaryAccentBlue}>
                          {s.avgDurationMinutes !== null
                            ? formatMinutes(s.avgDurationMinutes)
                            : "-"}
                        </strong>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

const INSIGHT_COLOR_CLASS: Record<string, string> = {
  blue: "insightBarBlue",
  cyan: "insightBarCyan",
  purple: "insightBarPurple",
  green: "insightBarGreen",
  orange: "insightBarOrange",
  red: "insightBarRed",
};

function InsightCard({
  icon,
  title,
  entries,
  color,
  valueFormatter,
}: {
  icon: string;
  title: string;
  entries: { label: string; value: number }[];
  color: string;
  valueFormatter?: (v: number) => string;
}) {
  const maxValue = Math.max(...entries.map((e) => e.value), 1);
  const barClass =
    styles[INSIGHT_COLOR_CLASS[color] as keyof typeof styles] || "";
  return (
    <div className={styles.insightCard}>
      <div className={styles.insightCardHeader}>
        <span>{icon}</span> {title}
      </div>
      {entries.length === 0 ? (
        <div className={styles.insightEmpty}>Tidak ada data</div>
      ) : (
        <div className={styles.insightList}>
          {entries.slice(0, 5).map((e) => (
            <div key={e.label} className={styles.insightRow}>
              <div className={styles.insightLabel} title={e.label}>
                {e.label}
              </div>
              <div className={styles.insightBarTrack}>
                <div
                  className={`${styles.insightBarFill} ${barClass}`}
                  style={{ width: `${(e.value / maxValue) * 100}%` }}
                />
              </div>
              <div className={styles.insightValue}>
                {valueFormatter ? valueFormatter(e.value) : e.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   CREATE TASK MODAL
════════════════════════════════════════════════ */

function CreateTaskModal({
  drivers,
  vehicles,
  employees,
  jobTypes,
  onClose,
  onCreated,
  onError,
}: {
  drivers: Driver[];
  vehicles: Vehicle[];
  employees: Employee[];
  jobTypes: JobType[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [tanggal, setTanggal] = useState(todayStr());
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [jenisPekerjaan, setJenisPekerjaan] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [requestor, setRequestor] = useState("");
  const [departement, setDepartement] = useState("");
  const [perihal, setPerihal] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  function handleRequestorPick(name: string) {
    setRequestor(name);
    const emp = employees.find((e) => e.nama === name);
    if (emp?.departement) setDepartement(emp.departement);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!driverId || !vehicleId || !jenisPekerjaan || !tujuan || !requestor) {
      setFormError("Lengkapi semua field wajib (bertanda *)");
      return;
    }

    setBusy(true);
    try {
      await createTask({
        tanggal,
        driver_id: driverId,
        vehicle_id: vehicleId,
        jenis_pekerjaan: jenisPekerjaan,
        tujuan,
        requestor,
        departement,
        perihal,
      });
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Gagal membuat tugas");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Tugaskan Driver</div>
          <button className={styles.modalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Tanggal *</label>
              <input
                type="date"
                className={styles.formInput}
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Driver *</label>
              <select
                className={styles.formSelect}
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">Pilih driver</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Kendaraan *</label>
              <select
                className={styles.formSelect}
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                <option value="">Pilih kendaraan</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nopol} {v.jenis ? `(${v.jenis})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Jenis Pekerjaan *</label>
              <select
                className={styles.formSelect}
                value={jenisPekerjaan}
                onChange={(e) => setJenisPekerjaan(e.target.value)}
              >
                <option value="">Pilih jenis</option>
                {jobTypes.map((j) => (
                  <option key={j.id} value={j.label}>
                    {j.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={`${styles.formField} ${styles.formFieldFull}`}>
              <label className={styles.formLabel}>Tujuan *</label>
              <input
                type="text"
                className={styles.formInput}
                placeholder="Contoh: Kantor Cabang Selatan"
                value={tujuan}
                onChange={(e) => setTujuan(e.target.value)}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Requestor *</label>
              <select
                className={styles.formSelect}
                value={requestor}
                onChange={(e) => handleRequestorPick(e.target.value)}
              >
                <option value="">Pilih pegawai</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.nama}>
                    {emp.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Departemen</label>
              <input
                type="text"
                className={styles.formInput}
                placeholder="Otomatis terisi"
                value={departement}
                onChange={(e) => setDepartement(e.target.value)}
              />
            </div>

            <div className={`${styles.formField} ${styles.formFieldFull}`}>
              <label className={styles.formLabel}>Perihal (opsional)</label>
              <textarea
                className={styles.formTextarea}
                placeholder="Catatan tambahan untuk driver..."
                value={perihal}
                onChange={(e) => setPerihal(e.target.value)}
              />
            </div>
          </div>

          {formError && <div className={styles.formError}>{formError}</div>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>
              Batal
            </button>
            <button type="submit" className={styles.btnSubmit} disabled={busy}>
              {busy ? "Menyimpan..." : "Tugaskan Driver"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   FLEETOS TABS — ported from the original FleetOS system into this
   merged dashboard. Styled with the shared "Sky & Gold" design tokens
   (var(--brand), var(--gold), var(--surface), etc.) via inline styles,
   since these are new components without a pre-existing CSS module.
════════════════════════════════════════════════════════════ */

function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function urgencyColor(days: number): string {
  if (days <= 7) return "var(--red)";
  if (days <= 30) return "var(--orange)";
  return "var(--green)";
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

/** Safely evaluates a simple arithmetic expression like "50000+30000" —
 *  strips anything that isn't a digit/operator first, same approach the
 *  original FleetOS claim form used for its nominal field. */
function evalExpr(raw: string): number | null {
  const cleaned = (raw || "").replace(/[^0-9+\-*/().\s]/g, "").slice(0, 120);
  if (!cleaned.trim()) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function('"use strict";return (' + cleaned + ")")();
    return isFinite(value) && value >= 0 ? Math.round(value) : null;
  } catch {
    return null;
  }
}

/** Monday-based week-of-month, matching the original FleetOS grouping. */
function weekOfMonth(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 1;
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
  return Math.floor((d.getDate() + startDay - 1) / 7) + 1;
}

/** Shared placeholder for tabs not yet ported in this pass. */
function ComingSoonTab({ title }: { title: string }) {
  return (
    <div
      style={{
        padding: 60,
        textAlign: "center",
        color: "var(--t3)",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)" }}>
        {title}
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>
        Segera hadir di tahap berikutnya — belum diporting dari FleetOS.
      </div>
    </div>
  );
}

function OverviewTab() {
  const { lang, t } = useLang();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [overtimes, setOvertimes] = useState<Overtime[]>([]);
  const [kantong, setKantong] = useState<Kantong | null>(null);
  const [gasStations, setGasStations] = useState<GasStation[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [v, c, ot, k, g, d] = await Promise.all([
          getAllVehiclesFull(),
          getClaims(),
          getOvertimes(),
          getCurrentKantong(),
          getGasStations(),
          getDrivers(),
        ]);
        setVehicles(v);
        setClaims(c);
        setOvertimes(ot);
        setKantong(k);
        setGasStations(g);
        setDrivers(d);
      } catch {
        // best-effort overview — individual tabs already surface their own errors
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "var(--t3)" }}>Memuat ringkasan...</div>;

  const now = new Date();
  const activeV = vehicles.filter((v) => v.aktif).length;
  const docBuckets = { urgent: 0, mid: 0, safe: 0 };
  vehicles.forEach((v) => {
    [v.kir_date, v.service_date, v.stnk_date].forEach((date) => {
      const d = daysUntil(date);
      if (d <= 7) docBuckets.urgent++;
      else if (d <= 30) docBuckets.mid++;
      else docBuckets.safe++;
    });
  });
  const totalDocs = docBuckets.urgent + docBuckets.mid + docBuckets.safe;

  const thisMonthClaims = claims.filter((c) => {
    const d = new Date(c.periodDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonthClaims.reduce((s, c) => s + c.total, 0);
  const activeDrivers = new Set(claims.map((c) => c.driver_id)).size;

  const totalAlokasi = kantong ? kantong.allocOpDriver + kantong.allocEmergency : 0;
  const outstanding = kantong ? totalAlokasi + kantong.cashAvailable + kantong.claimSubmitted + kantong.claimPaid : 0;
  const gap = kantong ? outstanding - kantong.totalBudget : 0;

  const periodNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const otThisMonth = overtimes.filter((o) => o.period === periodNow);
  const otHours = otThisMonth.reduce((s, o) => s + o.hours, 0);
  const otAmount = otThisMonth.reduce((s, o) => s + o.amount, 0);
  const otByPlant = OT_PLANTS.map((p) => ({ plant: p, hours: otThisMonth.filter((o) => o.plant === p).reduce((s, o) => s + o.hours, 0) }));
  const topPlant = [...otByPlant].sort((a, b) => b.hours - a.hours)[0];

  const docHealthPct = totalDocs > 0 ? Math.max(0, 100 - ((docBuckets.urgent * 2 + docBuckets.mid) / (totalDocs * 2)) * 100) : 100;
  const budgetHealthPct = kantong?.totalBudget ? Math.max(0, 100 - Math.min(100, Math.abs(gap) / kantong.totalBudget * 100)) : 100;
  const healthScore = Math.round(docHealthPct * 0.5 + budgetHealthPct * 0.5);
  const healthColor = healthScore >= 85 ? "var(--green)" : healthScore >= 70 ? "var(--brand)" : healthScore >= 50 ? "var(--orange)" : "var(--red)";
  const R = 62, CIRC = 2 * Math.PI * R;
  const gaugeOffset = CIRC * (1 - healthScore / 100);

  const cardStyle: CSSProperties = { background: "linear-gradient(180deg, var(--surface2), var(--surface))", border: "1px solid var(--border2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)" };

  return (
    <div style={{ padding: 20 }}>
      {/* Hero: Fleet Health Score */}
      <div
        className="heroGlow"
        style={{
          padding: "30px 32px",
          marginBottom: 20,
          borderRadius: "var(--r3)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", animation: "pulse 1.6s infinite", display: "inline-block" }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "var(--t3)", textTransform: "uppercase" }}>
            {lang === "en" ? "Executive Summary · Live" : "Ringkasan Eksekutif · Live"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 36, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
            <svg viewBox="0 0 140 140" width={140} height={140}>
              <defs>
                <linearGradient id="healthGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--brand)" />
                  <stop offset="100%" stopColor="var(--gold)" />
                </linearGradient>
              </defs>
              <circle cx={70} cy={70} r={R} fill="none" stroke="var(--border)" strokeWidth={10} />
              <circle cx={70} cy={70} r={R} fill="none" stroke="url(#healthGrad)" strokeWidth={10} strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={gaugeOffset} transform="rotate(-90 70 70)" />
              <text x={70} y={66} textAnchor="middle" fontSize={34} fontWeight={800} fill="var(--t1)" fontFamily="var(--mono)">{healthScore}</text>
              <text x={70} y={84} textAnchor="middle" fontSize={10} fill="var(--t3)">/ 100</text>
            </svg>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: healthColor }}>
              {lang === "en" ? "Fleet Health Score" : "Skor Kesehatan Armada"}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", position: "relative", zIndex: 1 }}>
            {[
              { label: lang === "en" ? "Total Vehicles" : "Total Kendaraan", value: String(vehicles.length), sub: `${activeV} aktif` },
              { label: lang === "en" ? "Claims This Month" : "Klaim Bulan Ini", value: `Rp ${fmtRp(thisMonthTotal)}`, sub: `${thisMonthClaims.length} transaksi` },
              { label: lang === "en" ? "Urgent Documents" : "Dokumen Urgent", value: String(docBuckets.urgent + docBuckets.mid), sub: "≤30 hari" },
            ].map((k, i) => (
              <div key={i} style={{ padding: "0 22px", borderLeft: i > 0 ? "1px solid var(--border2)" : "none" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: "var(--t1)", fontFamily: "var(--mono)", letterSpacing: -0.5 }}>{k.value}</div>
                <div style={{ fontSize: 12, color: "var(--t2)", fontWeight: 600, marginTop: 4 }}>{k.label}</div>
                <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3 intelligence cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ height: 3, background: "var(--brand)" }} />
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", marginBottom: 12 }}>
              🚗 {lang === "en" ? "Fleet & Documents" : "Armada & Dokumen"}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--t1)" }}>{vehicles.length}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 12 }}>{activeV} aktif · {vehicles.length - activeV} maintenance</div>
            <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--t3)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <span><strong style={{ color: "var(--red)" }}>{docBuckets.urgent}</strong> Urgent</span>
              <span><strong style={{ color: "var(--orange)" }}>{docBuckets.mid}</strong> Perhatian</span>
              <span><strong style={{ color: "var(--green)" }}>{docBuckets.safe}</strong> Aman</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--t3)" }}>⛽ {gasStations.length} SPBU terdaftar</div>
          </div>
        </div>

        <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ height: 3, background: "var(--gold)" }} />
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--gold2)", textTransform: "uppercase", marginBottom: 12 }}>
              💰 {lang === "en" ? "Operational Finance" : "Keuangan Operasional"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>Rp {fmtRp(thisMonthTotal)}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 12 }}>{lang === "en" ? "Claims this month" : "Klaim bulan ini"}</div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div style={{ fontSize: 10, color: "var(--t3)" }}>Total Cash</div>
              <div style={{ fontWeight: 700, color: "var(--t1)" }}>Rp {fmtRp(kantong?.totalBudget || 0)}</div>
              {kantong && (
                <div style={{ fontSize: 10, marginTop: 4, color: gap === 0 ? "var(--green)" : gap > 0 ? "var(--orange)" : "var(--red)" }}>
                  GAP: {gap >= 0 ? "+" : ""}Rp {fmtRp(gap)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ height: 3, background: "var(--green)" }} />
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--green)", textTransform: "uppercase", marginBottom: 12 }}>
              👥 {lang === "en" ? "Workforce & Overtime" : "Tenaga Kerja & Lembur"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>{activeDrivers}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 12 }}>{lang === "en" ? "Active drivers" : "Driver aktif"} ({drivers.length} total)</div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div style={{ fontSize: 10, color: "var(--t3)" }}>{lang === "en" ? "Overtime this month" : "Overtime bulan ini"}</div>
              <div style={{ fontWeight: 700, color: "var(--t1)" }}>{fmtRp(otHours)} jam · Rp {fmtRp(otAmount)}</div>
              {topPlant && otHours > 0 && (
                <div style={{ fontSize: 10, marginTop: 4, color: PLANT_COLOR[topPlant.plant] }}>
                  {lang === "en" ? "Top plant" : "Plant terbanyak"}: {topPlant.plant}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
const CLAIM_TYPES = ["Gasoline", "Toll", "Parking", "Service", "Maintenance", "Other"];
const CLAIM_TYPE_COLOR: Record<string, string> = {
  Gasoline: "var(--green)",
  Toll: "var(--brand)",
  Parking: "var(--orange)",
  Service: "var(--red)",
  Maintenance: "var(--red)",
  Other: "var(--t3)",
};

type ClaimLineDraft = { id: number; type: string; expr: string };

function ClaimsTab() {
  const { lang, t } = useLang();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Claim | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formDriverId, setFormDriverId] = useState("");
  const [submissionDate, setSubmissionDate] = useState(todayStr());
  const [periodDate, setPeriodDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<ClaimLineDraft[]>([
    { id: Date.now(), type: "Gasoline", expr: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, d] = await Promise.all([getClaims(), getDrivers()]);
      setClaims(c);
      setDrivers(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data klaim");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (driverFilter === "all" ? claims : claims.filter((c) => c.driver_id === driverFilter)),
    [claims, driverFilter]
  );
  const totalFiltered = filtered.reduce((s, c) => s + c.total, 0);
  const uniqueDriversFiltered = new Set(filtered.map((c) => c.driver_id)).size;

  function openAdd() {
    setFormDriverId("");
    setSubmissionDate(todayStr());
    setPeriodDate(todayStr());
    setNote("");
    setLines([{ id: Date.now(), type: "Gasoline", expr: "" }]);
    setShowForm(true);
  }

  function addLine() {
    setLines((p) => [...p, { id: Date.now() + Math.random(), type: "Gasoline", expr: "" }]);
  }
  function removeLine(id: number) {
    setLines((p) => (p.length > 1 ? p.filter((l) => l.id !== id) : p));
  }
  function updateLine(id: number, field: "type" | "expr", value: string) {
    setLines((p) => p.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  const grandTotal = lines.reduce((s, l) => s + (evalExpr(l.expr) || 0), 0);
  const canSave = !!formDriverId && lines.every((l) => l.type && (evalExpr(l.expr) || 0) > 0);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const items: ClaimItem[] = lines.map((l) => ({
        type: l.type,
        expr: l.expr,
        total: evalExpr(l.expr) || 0,
      }));
      await addClaim({
        driver_id: formDriverId,
        submissionDate,
        periodDate,
        items,
        total: grandTotal,
        note,
      });
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan klaim");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteClaim(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus klaim");
    }
  }

  const cardStyle: CSSProperties = {
    background: "linear-gradient(180deg, var(--surface2), var(--surface))",
    border: "1px solid var(--border2)",
    borderRadius: "var(--r2)",
    boxShadow: "var(--shadow-md)",
  };
  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid var(--border2)",
    background: "var(--bg2)",
    color: "var(--t1)",
    fontSize: 13,
    fontFamily: "var(--font)",
  };
  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--t2)",
    marginBottom: 5,
    display: "block",
  };
  const tagStyle = (color: string): CSSProperties => ({
    display: "inline-block",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 9px",
    borderRadius: 6,
    color,
    borderLeft: `2px solid ${color}`,
    background: "var(--bg2)",
  });

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <select
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          style={{ ...inputStyle, width: "auto", minWidth: 180 }}
        >
          <option value="all">{lang === "en" ? "All Drivers" : "Semua Driver"}</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>{d.nama}</option>
          ))}
        </select>
        <button className="pillBtn" onClick={openAdd}>
          + {lang === "en" ? "New Claim" : "Buat Klaim"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 24, padding: "12px 18px", marginBottom: 16, ...cardStyle, background: "var(--gold-soft)", border: "1px solid var(--gold)" }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--t3)" }}>{lang === "en" ? "Claims" : "Klaim"}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--gold2)" }}>{filtered.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--t3)" }}>Total</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>Rp {fmtRp(totalFiltered)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--t3)" }}>{lang === "en" ? "Drivers" : "Driver"}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>{uniqueDriversFiltered}</div>
        </div>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{t.actionLoading}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{t.actionNoDataYet}</div>
        ) : (
          filtered
            .slice()
            .sort((a, b) => (a.periodDate < b.periodDate ? 1 : -1))
            .map((c) => {
              const isOpen = expandedId === c.id;
              return (
                <div key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <div
                    onClick={() => setExpandedId(isOpen ? null : c.id)}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", cursor: "pointer" }}
                  >
                    <div style={{ minWidth: 90, fontSize: 11, color: "var(--t3)" }}>
                      Minggu {weekOfMonth(c.periodDate)}
                      <div style={{ fontSize: 10 }}>{c.periodDate}</div>
                    </div>
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: "var(--t1)" }}>{c.driverName || "-"}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {[...new Set(c.items.map((i) => i.type))].map((t) => (
                        <span key={t} style={tagStyle(CLAIM_TYPE_COLOR[t] || "var(--t3)")}>{t}</span>
                      ))}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "var(--t1)", whiteSpace: "nowrap" }}>Rp {fmtRp(c.total)}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(c); }}
                      style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", fontSize: 11, cursor: "pointer" }}
                    >
                      🗑️
                    </button>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 18px 16px 118px", background: "var(--bg2)" }}>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: "var(--t3)", textAlign: "left" }}>
                            <th style={{ paddingBottom: 6 }}>{lang === "en" ? "Type" : "Jenis"}</th>
                            <th style={{ paddingBottom: 6 }}>{lang === "en" ? "Detail" : "Rincian"}</th>
                            <th style={{ paddingBottom: 6, textAlign: "right" }}>Nominal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map((item, idx) => (
                            <tr key={idx} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ padding: "6px 0" }}><span style={tagStyle(CLAIM_TYPE_COLOR[item.type] || "var(--t3)")}>{item.type}</span></td>
                              <td style={{ padding: "6px 0", fontFamily: "var(--mono)", color: "var(--t3)" }}>{item.expr}</td>
                              <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700 }}>Rp {fmtRp(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {c.note && <div style={{ marginTop: 8, fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>Catatan: {c.note}</div>}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>
              {lang === "en" ? "New Claim" : "Buat Klaim"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>{lang === "en" ? "SUBMISSION DATE" : "TANGGAL PENGAJUAN"}</label>
                <input className="premiumInput" style={inputStyle} type="date" value={submissionDate} onChange={(e) => setSubmissionDate(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>{lang === "en" ? "PERIOD DATE" : "TANGGAL PERIODE"}</label>
                <input className="premiumInput" style={inputStyle} type="date" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t.fieldDriver} *</label>
              <select className="premiumInput" style={inputStyle} value={formDriverId} onChange={(e) => setFormDriverId(e.target.value)}>
                <option value="">{lang === "en" ? "Select driver" : "Pilih driver"}</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.nama}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>{lang === "en" ? "CLAIM LINES" : "RINCIAN KLAIM"}</label>
                <button onClick={addLine} style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}>
                  + {lang === "en" ? "Add Line" : "Tambah Baris"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lines.map((line) => {
                  const val = evalExpr(line.expr);
                  return (
                    <div key={line.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 28px", gap: 8 }}>
                      <select style={{ ...inputStyle, fontSize: 12 }} value={line.type} onChange={(e) => updateLine(line.id, "type", e.target.value)}>
                        {CLAIM_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <div style={{ position: "relative" }}>
                        <input
                          style={{ ...inputStyle, fontFamily: "var(--mono)" }}
                          placeholder="50000+30000"
                          value={line.expr}
                          onChange={(e) => updateLine(line.id, "expr", e.target.value)}
                        />
                        {line.expr && (
                          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: val !== null ? "var(--brand)" : "var(--red)" }}>
                            {val !== null ? `Rp ${fmtRp(val)}` : "invalid"}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeLine(line.id)}
                        disabled={lines.length === 1}
                        style={{ border: "none", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, cursor: "pointer", opacity: lines.length === 1 ? 0.3 : 1 }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{lang === "en" ? "NOTE (optional)" : "CATATAN (opsional)"}</label>
              <input className="premiumInput" style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--gold-soft)", borderRadius: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)" }}>TOTAL</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: "var(--gold2)" }}>Rp {fmtRp(grandTotal)}</span>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button
                className="pillBtn"
                onClick={handleSave}
                disabled={!canSave || saving}
                style={{ flex: 2, justifyContent: "center", opacity: canSave && !saving ? 1 : 0.5 }}
              >
                {saving ? t.actionSaving : (lang === "en" ? "Submit Claim" : "Submit Klaim")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this claim?" : "Hapus klaim ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>Rp {fmtRp(confirmDelete.total)}</strong> ({confirmDelete.driverName}) akan dihapus permanen.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const OT_PLANTS: Plant[] = ["CIK", "PRB"];
const PLANT_COLOR: Record<Plant, string> = { CIK: "var(--brand)", PRB: "var(--green)" };
const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function OvertimeTab() {
  const { lang, t } = useLang();
  const months = lang === "en" ? MONTHS_EN : MONTHS_ID;
  const now = new Date();

  const [overtimes, setOvertimes] = useState<Overtime[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterPlant, setFilterPlant] = useState<"all" | Plant>("all");

  const [showForm, setShowForm] = useState(false);
  const [formDriverId, setFormDriverId] = useState("");
  const [formMonth, setFormMonth] = useState(now.getMonth());
  const [formYear, setFormYear] = useState(now.getFullYear());
  const [formPlant, setFormPlant] = useState<Plant>("CIK");
  const [formHours, setFormHours] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formReason, setFormReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Overtime | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ot, d] = await Promise.all([getOvertimes(), getDrivers()]);
      setOvertimes(ot);
      setDrivers(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data overtime");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const period = `${filterYear}-${String(filterMonth + 1).padStart(2, "0")}`;
    return overtimes.filter((o) => o.period === period && (filterPlant === "all" || o.plant === filterPlant));
  }, [overtimes, filterMonth, filterYear, filterPlant]);

  const totalHours = filtered.reduce((s, o) => s + o.hours, 0);
  const totalAmount = filtered.reduce((s, o) => s + o.amount, 0);

  const byPlant = OT_PLANTS.map((plant) => {
    const rows = filtered.filter((o) => o.plant === plant);
    const hours = rows.reduce((s, o) => s + o.hours, 0);
    const amount = rows.reduce((s, o) => s + o.amount, 0);
    return { plant, count: rows.length, hours, amount, hoursPct: totalHours > 0 ? (hours / totalHours) * 100 : 0 };
  });
  const topPlant = [...byPlant].sort((a, b) => b.hours - a.hours)[0];

  const byDriver = useMemo(() => {
    const map = new Map<string, { driver: string; hours: number; amount: number; count: number }>();
    filtered.forEach((o) => {
      const cur = map.get(o.driver_id) || { driver: o.driverName, hours: 0, amount: 0, count: 0 };
      cur.hours += o.hours;
      cur.amount += o.amount;
      cur.count += 1;
      map.set(o.driver_id, cur);
    });
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [filtered]);

  function openAdd() {
    setFormDriverId("");
    setFormMonth(filterMonth);
    setFormYear(filterYear);
    setFormPlant("CIK");
    setFormHours("");
    setFormAmount("");
    setFormReason("");
    setShowForm(true);
  }

  const hoursNum = Number(formHours);
  const amountNum = evalExpr(formAmount);
  const canSave = !!formDriverId && hoursNum > 0 && (amountNum || 0) > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await addOvertime({
        driver_id: formDriverId,
        period: `${formYear}-${String(formMonth + 1).padStart(2, "0")}`,
        plant: formPlant,
        hours: hoursNum,
        amount: amountNum || 0,
        reason: formReason,
      });
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan overtime");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteOvertime(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus overtime");
    }
  }

  const cardStyle: CSSProperties = { background: "linear-gradient(180deg, var(--surface2), var(--surface))", border: "1px solid var(--border2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)" };
  const inputStyle: CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t1)", fontSize: 13, fontFamily: "var(--font)" };
  const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <select style={{ ...inputStyle, width: "auto" }} value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}>
          {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select style={{ ...inputStyle, width: "auto" }} value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={{ ...inputStyle, width: "auto" }} value={filterPlant} onChange={(e) => setFilterPlant(e.target.value as "all" | Plant)}>
          <option value="all">{lang === "en" ? "All Plants" : "Semua Plant"}</option>
          {OT_PLANTS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="pillBtn" onClick={openAdd}>+ {lang === "en" ? "Add Overtime" : "Tambah OT"}</button>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 13, marginBottom: 18 }}>
        <div className="statPop" style={{ ...cardStyle, padding: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>{filtered.length}</div>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>{lang === "en" ? "Entries" : "Entri"}</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>{fmtRp(totalHours)} jam</div>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>Total Jam OT</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--gold2)" }}>Rp {fmtRp(totalAmount)}</div>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>Total Nominal</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: topPlant ? PLANT_COLOR[topPlant.plant] : "var(--t1)" }}>{topPlant?.plant || "-"}</div>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>Plant Terbanyak OT</div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
          {lang === "en" ? "Plant Comparison" : "Perbandingan Plant"}
        </div>
        <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 16 }}>CIK vs PRB</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {byPlant.map((p) => (
            <div key={p.plant} style={{ padding: 14, borderRadius: 12, border: `1px solid var(--border2)`, borderLeft: `3px solid ${PLANT_COLOR[p.plant]}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontWeight: 800, color: PLANT_COLOR[p.plant] }}>{p.plant}</span>
                <span style={{ fontSize: 11, color: "var(--t3)" }}>{p.count} entri</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 4 }}>Jam OT</div>
              <div style={{ fontWeight: 700, color: "var(--t1)", marginBottom: 6 }}>{fmtRp(p.hours)} jam ({p.hoursPct.toFixed(0)}%)</div>
              <div style={{ height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${p.hoursPct}%`, background: PLANT_COLOR[p.plant] }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--t3)" }}>Nominal</div>
              <div style={{ fontWeight: 700, color: "var(--t1)" }}>Rp {fmtRp(p.amount)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--t1)" }}>
            {lang === "en" ? "Driver Ranking" : "Ranking Driver"}
          </div>
          {byDriver.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--t3)", fontSize: 12 }}>-</div>
          ) : (
            byDriver.map((d, i) => (
              <div key={d.driver} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--t1)" }}>{d.driver}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)" }}>{fmtRp(d.hours)} jam</div>
                  <div style={{ fontSize: 10, color: "var(--t3)" }}>Rp {fmtRp(d.amount)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--t1)" }}>
            {lang === "en" ? "Entry List" : "Daftar Entri"}
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--t3)" }}>...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--t3)", fontSize: 12 }}>Belum ada data</div>
          ) : (
            filtered.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: PLANT_COLOR[o.plant], padding: "2px 8px", borderRadius: 6, background: "var(--bg2)" }}>{o.plant}</span>
                <div style={{ flex: 1, fontSize: 12, color: "var(--t1)" }}>{o.driverName}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{fmtRp(o.hours)}j</div>
                <button onClick={() => setConfirmDelete(o)} style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer" }}>🗑️</button>
              </div>
            ))
          )}
        </div>
      </div>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 440 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>{lang === "en" ? "Add Overtime" : "Tambah Overtime"}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <select className="premiumInput" style={inputStyle} value={formMonth} onChange={(e) => setFormMonth(Number(e.target.value))}>
                {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select className="premiumInput" style={inputStyle} value={formYear} onChange={(e) => setFormYear(Number(e.target.value))}>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{t.fieldDriver} *</label>
              <select className="premiumInput" style={inputStyle} value={formDriverId} onChange={(e) => setFormDriverId(e.target.value)}>
                <option value="">{lang === "en" ? "Select driver" : "Pilih driver"}</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{t.fieldPlant} *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {OT_PLANTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFormPlant(p)}
                    style={{
                      flex: 1, padding: "9px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer",
                      border: formPlant === p ? `1px solid ${PLANT_COLOR[p]}` : "1px solid var(--border2)",
                      background: formPlant === p ? "var(--bg2)" : "transparent",
                      color: formPlant === p ? PLANT_COLOR[p] : "var(--t3)",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>{lang === "en" ? "HOURS *" : "TOTAL JAM OT *"}</label>
                <input className="premiumInput" style={inputStyle} type="number" step="0.5" value={formHours} onChange={(e) => setFormHours(e.target.value)} placeholder="4" />
              </div>
              <div>
                <label style={labelStyle}>{lang === "en" ? "AMOUNT *" : "TOTAL NOMINAL *"}</label>
                <input className="premiumInput" style={inputStyle} value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="150000" />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>{lang === "en" ? "REASON" : "ALASAN OT"}</label>
              <input className="premiumInput" style={inputStyle} value={formReason} onChange={(e) => setFormReason(e.target.value)} placeholder="Lembur closing bulanan" />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button className="pillBtn" onClick={handleSave} disabled={!canSave || saving} style={{ flex: 2, justifyContent: "center", opacity: canSave && !saving ? 1 : 0.5 }}>
                {saving ? t.actionSaving : t.actionSave}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this OT entry?" : "Hapus entri OT ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDelete.driverName}</strong> ({confirmDelete.plant}) akan dihapus permanen.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const TIER_PALETTE = ["var(--brand)", "var(--green)", "var(--orange)", "var(--red)", "var(--purple)"];

/* ════════════════════════════════════════════════════════════
   LOGIN SCREEN — Admin/GA sign-in via Supabase Auth. Separate from
   the driver PIN system on /driver, which is untouched.
════════════════════════════════════════════════════════════ */
function LoginScreen() {
  const { t, lang, setLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) setError(t.loginErrorGeneric);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, var(--bg2), var(--bg))",
        padding: 20,
      }}
    >
      <div style={{ position: "fixed", top: 16, right: 16, display: "flex", gap: 8 }}>
        <button
          onClick={() => setLang(lang === "id" ? "en" : "id")}
          style={{ padding: "6px 12px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", background: "var(--surface)", color: "var(--t2)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
        >
          {lang === "id" ? "EN" : "ID"}
        </button>
        <button
          onClick={toggleTheme}
          style={{ padding: "6px 12px", borderRadius: "var(--pill)", border: "1px solid var(--border2)", background: "var(--surface)", cursor: "pointer" }}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>

      <div
        className="heroGlow"
        style={{
          borderRadius: "var(--r3)",
          boxShadow: "var(--shadow-lg)",
          padding: 36,
          width: "100%",
          maxWidth: 380,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <img src="/logo.svg" alt="CIKOPS" style={{ width: 52, height: 52, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>{t.loginTitle}</div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 3 }}>{t.loginSubtitle}</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" }}>
              {t.loginEmail.toUpperCase()}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="premiumInput"
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t1)", fontSize: 14 }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" }}>
              {t.loginPassword.toUpperCase()}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="premiumInput"
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t1)", fontSize: 14 }}
            />
          </div>

          {error && (
            <div style={{ padding: 10, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", fontSize: 12.5, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="pillBtn"
            disabled={busy}
            style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 14, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? t.loginSigningIn : t.loginButton}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <a href="/driver" style={{ fontSize: 12, color: "var(--t3)", textDecoration: "none" }}>
            {t.loginBackToDriver}
          </a>
        </div>
      </div>
    </div>
  );
}

function DriverBudgetTab() {
  const { lang, t } = useLang();
  const [tiers, setTiers] = useState<DriverTier[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DriverTier | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(TIER_PALETTE[0]);
  const [formAmount, setFormAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DriverTier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, d] = await Promise.all([getDriverTiers(), getDrivers()]);
      setTiers(t);
      setDrivers(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data tier");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalDrivers = tiers.reduce((s, t) => s + t.activeDriverCount, 0);
  const totalBudget = tiers.reduce((s, t) => s + t.amountPerMonth * t.activeDriverCount, 0);

  function openAdd() {
    setEditing(null);
    setFormName("");
    setFormColor(TIER_PALETTE[0]);
    setFormAmount("");
    setShowForm(true);
  }
  function openEdit(t: DriverTier) {
    setEditing(t);
    setFormName(t.name);
    setFormColor(t.color);
    setFormAmount(String(t.amountPerMonth));
    setShowForm(true);
  }

  async function handleSave() {
    const amount = evalExpr(formAmount);
    if (!formName || !amount) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDriverTier(editing.id, { name: formName, color: formColor, amountPerMonth: amount });
      } else {
        await addDriverTier({ name: formName, color: formColor, amountPerMonth: amount });
      }
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan tier");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteDriverTier(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus tier");
    }
  }

  async function handleAssignTier(driverId: string, tierId: string) {
    try {
      await setDriverTier(driverId, tierId || null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal assign tier");
    }
  }

  const cardStyle: CSSProperties = { background: "linear-gradient(180deg, var(--surface2), var(--surface))", border: "1px solid var(--border2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)" };
  const inputStyle: CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t1)", fontSize: 13, fontFamily: "var(--font)" };
  const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 13, marginBottom: 18 }}>
        <div className="statPop" style={{ ...cardStyle, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>{totalDrivers}</div>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>{lang === "en" ? "Total Drivers" : "Total Driver"}</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--gold2)" }}>Rp {fmtRp(totalBudget)}</div>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>{lang === "en" ? "Budget/Month" : "Budget/Bulan"}</div>
        </div>
        <div className="statPop" style={{ ...cardStyle, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>Rp {fmtRp(totalBudget * 12)}</div>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>{lang === "en" ? "Per Year" : "Per Tahun"}</div>
        </div>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <div style={{ ...cardStyle, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{lang === "en" ? "Operational Allowance Tiers" : "Tier Uang Operasional"}</div>
            <button className="pillBtn" onClick={openAdd} style={{ padding: "6px 14px", fontSize: 12 }}>+ Tambah</button>
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 30, color: "var(--t3)" }}>Memuat...</div>
          ) : tiers.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "var(--t3)" }}>{t.actionNoDataYet}</div>
          ) : (
            tiers.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "var(--bg2)", marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)" }}>{t.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--t3)" }}>{t.activeDriverCount} driver · Rp {fmtRp(t.amountPerMonth)}/orang</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 13, color: t.color }}>Rp {fmtRp(t.amountPerMonth * t.activeDriverCount)}</div>
                <button onClick={() => openEdit(t)} style={{ border: "none", background: "none", cursor: "pointer" }}>✏️</button>
                <button onClick={() => setConfirmDelete(t)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--red)" }}>🗑️</button>
              </div>
            ))
          )}
        </div>

        <div style={{ ...cardStyle, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
            {lang === "en" ? "Assign Tier per Driver" : "Assign Tier per Driver"}
          </div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14 }}>
            {lang === "en" ? "New — links each driver to their allowance tier." : "Baru — hubungkan tiap driver ke tier uang operasionalnya."}
          </div>
          {drivers.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, fontSize: 12.5, color: "var(--t1)" }}>{d.nama}</div>
              <select
                style={{ ...inputStyle, width: "auto", fontSize: 11, padding: "6px 10px" }}
                value={d.tier_id || ""}
                onChange={(e) => handleAssignTier(d.id, e.target.value)}
              >
                <option value="">-</option>
                {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 380 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>{editing ? (lang === "en" ? "Edit Tier" : "Edit Tier") : (lang === "en" ? "Add Tier" : "Tambah Tier")}</div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{t.fieldTierName}</label>
              <input className="premiumInput" style={inputStyle} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Senior Driver" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{t.fieldColor}</label>
              <div style={{ display: "flex", gap: 8 }}>
                {TIER_PALETTE.map((c) => (
                  <div key={c} onClick={() => setFormColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: formColor === c ? "2px solid var(--t1)" : "2px solid transparent" }} />
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>{t.fieldAmountPerPersonMonth}</label>
              <input className="premiumInput" style={inputStyle} value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="2000000" />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: "center" }}>{saving ? t.actionSaving : t.actionSave}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this tier?" : "Hapus tier ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDelete.name}</strong> akan dihapus permanen.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function OpFundTab() {
  const { lang, t } = useLang();
  const [kantong, setKantong] = useState<Kantong | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [eBudget, setEBudget] = useState("");
  const [eOpDriver, setEOpDriver] = useState("");
  const [eEmergency, setEEmergency] = useState("");
  const [eCash, setECash] = useState("");
  const [eSubmitted, setESubmitted] = useState("");
  const [ePaid, setEPaid] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const k = await getCurrentKantong();
      setKantong(k);
      if (k) {
        setEBudget(String(k.totalBudget));
        setEOpDriver(String(k.allocOpDriver));
        setEEmergency(String(k.allocEmergency));
        setECash(String(k.cashAvailable));
        setESubmitted(String(k.claimSubmitted));
        setEPaid(String(k.claimPaid));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat Dana Operasional");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "var(--t3)" }}>Memuat...</div>;
  if (error) return <div style={{ padding: 30, margin: 20, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)" }}>{error}</div>;
  if (!kantong) return <div style={{ padding: 60, textAlign: "center", color: "var(--t3)" }}>Belum ada data Dana Operasional untuk periode ini.</div>;

  const totalAlokasi = kantong.allocOpDriver + kantong.allocEmergency;
  const outstanding = totalAlokasi + kantong.cashAvailable + kantong.claimSubmitted + kantong.claimPaid;
  const gap = outstanding - kantong.totalBudget;
  const gapColor = gap === 0 ? "var(--green)" : gap > 0 ? "var(--orange)" : "var(--red)";
  const gapText = gap === 0 ? "Sesuai" : gap > 0 ? "Outstanding melebihi total cash" : "Outstanding di bawah total cash";

  async function handleSaveEdit() {
    if (!kantong) return;
    setSaving(true);
    try {
      const updated = {
        period: kantong.period,
        totalBudget: evalExpr(eBudget) ?? kantong.totalBudget,
        allocOpDriver: evalExpr(eOpDriver) ?? kantong.allocOpDriver,
        allocEmergency: evalExpr(eEmergency) ?? kantong.allocEmergency,
        cashAvailable: evalExpr(eCash) ?? kantong.cashAvailable,
        claimSubmitted: evalExpr(eSubmitted) ?? kantong.claimSubmitted,
        claimPaid: evalExpr(ePaid) ?? kantong.claimPaid,
        lastReset: kantong.lastReset,
      };
      await updateKantongBudget(updated);
      setShowEdit(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!kantong) return;
    const now = new Date();
    const newPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    try {
      await resetKantong(newPeriod, now.toISOString().slice(0, 10));
      setShowResetConfirm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal reset periode");
    }
  }

  const cardStyle: CSSProperties = { background: "linear-gradient(180deg, var(--surface2), var(--surface))", border: "1px solid var(--border2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)" };
  const inputStyle: CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t1)", fontSize: 13, fontFamily: "var(--font)" };
  const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };
  const row = (label: string, sub: string, value: number, color?: string) => (
    <div style={{ padding: "15px 22px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>{sub}</div>
      <div style={{ fontWeight: 800, fontSize: 18, color: color || "var(--t1)", marginTop: 6 }}>Rp {fmtRp(value)}</div>
    </div>
  );

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "var(--t3)" }}>
          Periode: <strong style={{ color: "var(--t1)" }}>{kantong.period}</strong> · Reset: {kantong.lastReset}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowEdit(true)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            ✏️ {lang === "en" ? "Edit Values" : "Edit Nilai"}
          </button>
          <button onClick={() => setShowResetConfirm(true)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            🔄 Reset Periode
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "19px 22px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase" }}>Total Cash Operational (A)</div>
          <div style={{ fontWeight: 800, fontSize: 28, color: "var(--brand)" }}>Rp {fmtRp(kantong.totalBudget)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border)" }}>
          {row("Op Driver (A1)", "Alokasi", kantong.allocOpDriver, "var(--orange)")}
          {row("Emergency (A2)", "Alokasi", kantong.allocEmergency, "var(--red)")}
        </div>
        <div style={{ padding: "13px 22px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--t3)" }}>TOTAL ALOKASI (A3)</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--t2)" }}>Rp {fmtRp(totalAlokasi)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid var(--border)" }}>
          {row("Cash Available (A4)", "Editable", kantong.cashAvailable, "var(--green)")}
          {row("Claim Diajukan (A5)", "Ke Finance", kantong.claimSubmitted, "var(--brand)")}
          {row("Claim Dibayar (A6)", "Oleh Finance", kantong.claimPaid, "var(--t3)")}
        </div>
        <div style={{ padding: "16px 22px", background: "var(--gold-soft)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--gold2)" }}>OUTSTANDING (B) = A3+A4+A5+A6</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "var(--gold2)" }}>Rp {fmtRp(outstanding)}</div>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)" }}>GAP = B − A</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>{gapText}</div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, color: gapColor }}>{gap >= 0 ? "+" : ""}Rp {fmtRp(gap)}</div>
        </div>
      </div>

      {showEdit && (
        <div onClick={() => setShowEdit(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>Edit Dana Operasional</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={labelStyle}>{t.fieldTotalCashOp}</label><input className="premiumInput" style={inputStyle} value={eBudget} onChange={(e) => setEBudget(e.target.value)} /></div>
              <div><label style={labelStyle}>OP DRIVER (A1)</label><input className="premiumInput" style={inputStyle} value={eOpDriver} onChange={(e) => setEOpDriver(e.target.value)} /></div>
              <div><label style={labelStyle}>EMERGENCY (A2)</label><input className="premiumInput" style={inputStyle} value={eEmergency} onChange={(e) => setEEmergency(e.target.value)} /></div>
              <div><label style={labelStyle}>CASH AVAILABLE (A4)</label><input className="premiumInput" style={inputStyle} value={eCash} onChange={(e) => setECash(e.target.value)} /></div>
              <div><label style={labelStyle}>{lang === "en" ? "CLAIM SUBMITTED (A5)" : "CLAIM DIAJUKAN (A5)"}</label><input className="premiumInput" style={inputStyle} value={eSubmitted} onChange={(e) => setESubmitted(e.target.value)} /></div>
              <div><label style={labelStyle}>{lang === "en" ? "CLAIM PAID (A6)" : "CLAIM DIBAYAR (A6)"}</label><input className="premiumInput" style={inputStyle} value={ePaid} onChange={(e) => setEPaid(e.target.value)} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowEdit(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSaveEdit} disabled={saving} style={{ flex: 1, justifyContent: "center" }}>{saving ? t.actionSaving : t.actionSave}</button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div onClick={() => setShowResetConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>Reset Periode?</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              Claim Diajukan (A5) dan Claim Dibayar (A6) akan direset ke 0 untuk periode baru. Total cash dan alokasi tetap sama. Data periode lama tetap tersimpan.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowResetConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleReset} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Ya, Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const FUEL_TYPES_LIST = ["Pertalite", "Pertamax", "Pertamax Turbo", "Pertamax Green", "Solar", "Dexlite"];

function GasStationsTab() {
  const { lang, t } = useLang();
  const [stations, setStations] = useState<GasStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GasStation | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formFuels, setFormFuels] = useState<FuelEntry[]>(FUEL_TYPES_LIST.map((f) => ({ type: f, available: true })));
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<GasStation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStations(await getGasStations());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data SPBU");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setFormName("");
    setFormAddress("");
    setFormLat("");
    setFormLng("");
    setFormFuels(FUEL_TYPES_LIST.map((f) => ({ type: f, available: true })));
    setFormNotes("");
    setShowForm(true);
  }
  function openEdit(s: GasStation) {
    setEditing(s);
    setFormName(s.name);
    setFormAddress(s.address);
    setFormLat(String(s.lat));
    setFormLng(String(s.lng));
    setFormFuels(FUEL_TYPES_LIST.map((f) => {
      const existing = s.fuels.find((x) => x.type === f);
      return { type: f, available: existing ? existing.available : false };
    }));
    setFormNotes(s.notes);
    setShowForm(true);
  }
  function toggleFuel(type: string) {
    setFormFuels((p) => p.map((f) => (f.type === type ? { ...f, available: !f.available } : f)));
  }

  function handleMapPick(lat: number, lng: number) {
    setPlacing(false);
    setEditing(null);
    setFormName("");
    setFormAddress("");
    setFormLat(lat.toFixed(6));
    setFormLng(lng.toFixed(6));
    setFormFuels(FUEL_TYPES_LIST.map((f) => ({ type: f, available: true })));
    setFormNotes("");
    setShowForm(true);
  }

  function handleMarkerClick(s: GasStation) {
    openEdit(s);
  }

  const canSave = formName.trim() && formLat !== "" && formLng !== "" && !isNaN(Number(formLat)) && !isNaN(Number(formLng));

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = { name: formName.trim(), address: formAddress.trim(), lat: Number(formLat), lng: Number(formLng), fuels: formFuels, notes: formNotes.trim() };
      if (editing) await updateGasStation(editing.id, payload);
      else await addGasStation(payload);
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan SPBU");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteGasStation(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus SPBU");
    }
  }

  const cardStyle: CSSProperties = { background: "linear-gradient(180deg, var(--surface2), var(--surface))", border: "1px solid var(--border2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)" };
  const inputStyle: CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--t1)", fontSize: 13, fontFamily: "var(--font)" };
  const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)" }}>{lang === "en" ? "Gas Stations" : "Pom Bensin"}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setPlacing((p) => !p)}
            style={{
              padding: "9px 16px",
              borderRadius: "var(--pill)",
              border: placing ? "1px solid var(--orange)" : "1px solid var(--border2)",
              background: placing ? "var(--orange-soft)" : "var(--surface2)",
              color: placing ? "var(--orange)" : "var(--t2)",
              fontWeight: 700,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            {placing ? (lang === "en" ? "✕ Cancel — click the map" : "✕ Batal — klik di peta") : `📍 ${lang === "en" ? "Mark on Map" : "Tandai di Peta"}`}
          </button>
          <button className="pillBtn" onClick={openAdd}>+ {lang === "en" ? "Add Station" : "Tambah Manual"}</button>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <GasStationMap stations={stations} placing={placing} onPick={handleMapPick} onMarkerClick={handleMarkerClick} />
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>Memuat...</div>
      ) : stations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{t.actionNoDataYet}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {stations.map((s) => (
            <div key={s.id} className="statPop" style={{ ...cardStyle, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--t1)", marginBottom: 4 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 10 }}>{s.address || `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                {s.fuels.filter((f) => f.available).map((f) => (
                  <span key={f.type} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "var(--bg2)", color: "var(--brand)" }}>{f.type}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => openEdit(s)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>✏️ {t.actionEdit}</button>
                <button onClick={() => setConfirmDelete(s)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>{editing ? (lang === "en" ? "Edit Station" : "Edit SPBU") : (lang === "en" ? "Add Station" : "Tambah SPBU")}</div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{t.fieldStationName}</label>
              <input className="premiumInput" style={inputStyle} value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div><label style={labelStyle}>{t.fieldLatitude}</label><input className="premiumInput" style={inputStyle} value={formLat} onChange={(e) => setFormLat(e.target.value)} placeholder="-6.2607" /></div>
              <div><label style={labelStyle}>{t.fieldLongitude}</label><input className="premiumInput" style={inputStyle} value={formLng} onChange={(e) => setFormLng(e.target.value)} placeholder="107.1525" /></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t.fieldAddress}</label>
              <input className="premiumInput" style={inputStyle} value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t.fieldFuelsAvailable}</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {formFuels.map((f) => (
                  <div
                    key={f.type}
                    onClick={() => toggleFuel(f.type)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 8, cursor: "pointer", background: f.available ? "var(--green-soft)" : "var(--bg2)", border: f.available ? "1px solid var(--green)" : "1px solid var(--border2)" }}
                  >
                    <div style={{ width: 15, height: 15, borderRadius: 4, background: f.available ? "var(--green)" : "transparent", border: f.available ? "none" : "1px solid var(--border2)" }} />
                    <span style={{ fontSize: 12, color: f.available ? "var(--t1)" : "var(--t3)", fontWeight: f.available ? 700 : 400 }}>{f.type}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>{t.fieldNotes}</label>
              <input className="premiumInput" style={inputStyle} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="dekat pintu tol, buka 24 jam..." />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button className="pillBtn" onClick={handleSave} disabled={!canSave || saving} style={{ flex: 1, justifyContent: "center", opacity: canSave && !saving ? 1 : 0.5 }}>{saving ? t.actionSaving : t.actionSave}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this station?" : "Hapus SPBU ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}><strong style={{ color: "var(--t1)" }}>{confirmDelete.name}</strong> akan dihapus permanen.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── VEHICLES TAB — full CRUD, ported from FleetOS ── */

const FUEL_OPTIONS = ["Pertalite", "Pertamax", "Pertamax Turbo", "Solar", "Dexlite"];

type VehicleFormState = {
  nopol: string;
  jenis: string;
  year: string;
  color: string;
  fuel: string;
  odometer: string;
  aktif: boolean;
  kir_date: string;
  service_date: string;
  stnk_date: string;
  dept: string;
  default_driver_id: string;
};

const BLANK_VEHICLE_FORM: VehicleFormState = {
  nopol: "",
  jenis: "",
  year: String(new Date().getFullYear()),
  color: "",
  fuel: "Pertalite",
  odometer: "0",
  aktif: true,
  kir_date: "",
  service_date: "",
  stnk_date: "",
  dept: "",
  default_driver_id: "",
};

function VehiclesTab() {
  const { lang, t } = useLang();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleFormState>(BLANK_VEHICLE_FORM);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, d] = await Promise.all([getAllVehiclesFull(), getDrivers()]);
      setVehicles(v);
      setDrivers(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data kendaraan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function driverName(id: string | null | undefined) {
    return drivers.find((d) => d.id === id)?.nama || "-";
  }

  function openAdd() {
    setEditing(null);
    setForm(BLANK_VEHICLE_FORM);
    setShowForm(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      nopol: v.nopol,
      jenis: v.jenis || "",
      year: String(v.year || new Date().getFullYear()),
      color: v.color || "",
      fuel: v.fuel || "Pertalite",
      odometer: String(v.odometer || 0),
      aktif: v.aktif,
      kir_date: v.kir_date || "",
      service_date: v.service_date || "",
      stnk_date: v.stnk_date || "",
      dept: v.dept || "",
      default_driver_id: v.default_driver_id || "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.nopol.trim() || !form.jenis.trim()) return;
    setSaving(true);
    const payload = {
      nopol: form.nopol.trim(),
      jenis: form.jenis.trim(),
      year: Number(form.year) || null,
      color: form.color || null,
      fuel: form.fuel || null,
      odometer: Number(form.odometer) || 0,
      aktif: form.aktif,
      kir_date: form.kir_date || null,
      service_date: form.service_date || null,
      stnk_date: form.stnk_date || null,
      dept: form.dept || null,
      default_driver_id: form.default_driver_id || null,
    };
    try {
      if (editing) {
        await updateVehicle(editing.id, payload);
      } else {
        await addVehicle(payload);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan kendaraan");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteVehicle(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus kendaraan");
    }
  }

  const cardStyle: CSSProperties = {
    background: "linear-gradient(180deg, var(--surface2), var(--surface))",
    border: "1px solid var(--border2)",
    borderRadius: "var(--r2)",
    boxShadow: "var(--shadow-md)",
  };
  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid var(--border2)",
    background: "var(--bg2)",
    color: "var(--t1)",
    fontSize: 13,
    fontFamily: "var(--font)",
  };
  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--t2)",
    marginBottom: 5,
    display: "block",
  };

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)" }}>
          {lang === "en" ? "Vehicle Fleet" : "Armada Kendaraan"}
        </div>
        <button className="pillBtn" onClick={openAdd}>
          + {lang === "en" ? "Add Vehicle" : "Tambah Kendaraan"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "var(--red-soft)",
            color: "var(--red)",
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
          {lang === "en" ? "Loading vehicles..." : "Memuat kendaraan..."}
        </div>
      ) : vehicles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>
          {lang === "en" ? "No vehicles yet." : "Belum ada kendaraan."}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 14,
          }}
        >
          {vehicles.map((v) => {
            const docs: [string, string | null | undefined][] = [
              ["KIR", v.kir_date],
              [lang === "en" ? "Service" : "Service", v.service_date],
              ["STNK", v.stnk_date],
            ];
            return (
              <div key={v.id} className="statPop" style={{ ...cardStyle, padding: 16, position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    borderRadius: "var(--r2) 0 0 var(--r2)",
                    background: v.aktif ? "var(--green)" : "var(--orange)",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, color: "var(--t1)" }}>
                      {v.nopol}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--t3)" }}>
                      {v.jenis} · {v.year}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: "var(--pill)",
                      background: v.aktif ? "var(--green-soft)" : "var(--orange-soft)",
                      color: v.aktif ? "var(--green)" : "var(--orange)",
                      height: "fit-content",
                    }}
                  >
                    {v.aktif ? (lang === "en" ? "Active" : "Aktif") : (lang === "en" ? "Maintenance" : "Maintenance")}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12, fontSize: 12 }}>
                  <div>
                    <div style={{ color: "var(--t3)", fontSize: 10 }}>Driver</div>
                    <div style={{ color: "var(--t1)", fontWeight: 600 }}>{driverName(v.default_driver_id)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--t3)", fontSize: 10 }}>{lang === "en" ? "Dept" : "Departemen"}</div>
                    <div style={{ color: "var(--t1)", fontWeight: 600 }}>{v.dept || "-"}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--t3)", fontSize: 10 }}>BBM</div>
                    <div style={{ color: "var(--t1)", fontWeight: 600 }}>{v.fuel || "-"}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--t3)", fontSize: 10 }}>Odometer</div>
                    <div style={{ color: "var(--t1)", fontWeight: 600 }}>{fmtRp(v.odometer || 0)} km</div>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 12 }}>
                  {docs.map(([label, date]) => {
                    const d = daysUntil(date);
                    return (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: "var(--t3)" }}>{label}</span>
                        <span style={{ color: urgencyColor(d), fontWeight: 700 }}>
                          {date ? (d <= 0 ? (lang === "en" ? "Expired" : "Lewat") : `${d}h`) : "-"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openEdit(v)}
                    style={{
                      flex: 1,
                      padding: "7px",
                      borderRadius: 8,
                      border: "1px solid var(--border2)",
                      background: "var(--surface2)",
                      color: "var(--t2)",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ✏️ {t.actionEdit}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(v)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--red)",
                      background: "var(--red-soft)",
                      color: "var(--red)",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,20,40,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--t1)" }}>
              {editing ? (lang === "en" ? "Edit Vehicle" : "Edit Kendaraan") : (lang === "en" ? "Add Vehicle" : "Tambah Kendaraan")}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>{t.fieldPlateNumber} *</label>
                <input className="premiumInput" style={inputStyle} value={form.nopol} onChange={(e) => setForm({ ...form, nopol: e.target.value })} placeholder="B 1234 XY" />
              </div>
              <div>
                <label style={labelStyle}>{t.fieldType} *</label>
                <input className="premiumInput" style={inputStyle} value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} placeholder="Toyota Avanza" />
              </div>
              <div>
                <label style={labelStyle}>{t.fieldYear}</label>
                <input className="premiumInput" style={inputStyle} type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{t.fieldColor}</label>
                <input className="premiumInput" style={inputStyle} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{t.fieldFuel}</label>
                <select className="premiumInput" style={inputStyle} value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })}>
                  {FUEL_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t.fieldOdometer}</label>
                <input className="premiumInput" style={inputStyle} type="number" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{t.fieldDefaultDriver}</label>
                <select className="premiumInput" style={inputStyle} value={form.default_driver_id} onChange={(e) => setForm({ ...form, default_driver_id: e.target.value })}>
                  <option value="">-</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.nama}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t.fieldDepartment}</label>
                <input className="premiumInput" style={inputStyle} value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{t.fieldStatus}</label>
                <select
                  className="premiumInput" style={inputStyle}
                  value={form.aktif ? "active" : "maintenance"}
                  onChange={(e) => setForm({ ...form, aktif: e.target.value === "active" })}
                >
                  <option value="active">Aktif</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div />
              <div>
                <label style={labelStyle}>{t.fieldScheduleKir}</label>
                <input className="premiumInput" style={inputStyle} type="date" value={form.kir_date} onChange={(e) => setForm({ ...form, kir_date: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{t.fieldScheduleService}</label>
                <input className="premiumInput" style={inputStyle} type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{t.fieldScheduleStnk}</label>
                <input className="premiumInput" style={inputStyle} type="date" value={form.stnk_date} onChange={(e) => setForm({ ...form, stnk_date: e.target.value })} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}
              >
                Batal
              </button>
              <button
                className="pillBtn"
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 2, justifyContent: "center", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? t.actionSaving : t.actionSave}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(10,20,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this vehicle?" : "Hapus kendaraan?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              <strong style={{ color: "var(--t1)" }}>{confirmDelete.nopol}</strong> akan dihapus permanen.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
