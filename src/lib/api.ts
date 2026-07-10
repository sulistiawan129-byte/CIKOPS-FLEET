import { supabase } from "./supabaseClient";
import { todayLocalISODate } from "./dateUtils";
import type {
  Claim,
  ClaimItem,
  Driver,
  DriverTier,
  Employee,
  FuelEntry,
  GasStation,
  JobType,
  Kantong,
  Overtime,
  Plant,
  TaskDetail,
  TaskStatus,
  Vehicle,
  CanteenReport,
} from "./types";

/* ════════════════════════════════════════════════════════════
   MASTER DATA
════════════════════════════════════════════════════════════ */

export async function getDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, nama, no_hp, avatar_emoji, aktif, tier_id, email, plant")
    .eq("aktif", true)
    .order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, nopol, jenis, aktif, plant")
    .eq("aktif", true)
    .order("nopol", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, nama, departement")
    .order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getJobTypes(): Promise<JobType[]> {
  const { data, error } = await supabase
    .from("job_types")
    .select("id, label")
    .order("label", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/* ════════════════════════════════════════════════════════════
   AUTH (PIN) — via RPC, pin_hash tidak pernah keluar dari DB
════════════════════════════════════════════════════════════ */

export async function verifyDriverPin(
  driverId: string,
  pin: string
): Promise<Driver | null> {
  const { data, error } = await supabase.rpc("verify_driver_pin", {
    p_driver_id: driverId,
    p_pin: pin,
  });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return { ...data[0], aktif: true } as Driver;
}

export async function changeDriverPin(
  driverId: string,
  oldPin: string,
  newPin: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_driver_pin", {
    p_driver_id: driverId,
    p_old_pin: oldPin,
    p_new_pin: newPin,
  });
  if (error) throw error;
  return Boolean(data);
}

/* ════════════════════════════════════════════════════════════
   TASKS — driver panel
════════════════════════════════════════════════════════════ */

export async function getDriverTasksToday(
  driverId: string
): Promise<TaskDetail[]> {
  const today = todayLocalISODate();
  const { data, error } = await supabase
    .from("tasks_detail")
    .select("*")
    .eq("driver_id", driverId)
    .eq("tanggal", today)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getDriverHistory(
  driverId: string,
  dateFrom: string,
  dateTo: string
): Promise<TaskDetail[]> {
  const { data, error } = await supabase
    .from("tasks_detail")
    .select("*")
    .eq("driver_id", driverId)
    .gte("tanggal", dateFrom)
    .lte("tanggal", dateTo)
    .order("tanggal", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function acceptTask(
  taskId: string,
  driverId: string
): Promise<void> {
  const { error } = await supabase.rpc("accept_task", {
    p_task_id: taskId,
    p_driver_id: driverId,
  });
  if (error) throw error;
}

export async function completeTask(
  taskId: string,
  driverId: string
): Promise<void> {
  const { error } = await supabase.rpc("complete_task", {
    p_task_id: taskId,
    p_driver_id: driverId,
  });
  if (error) throw error;
}

export async function cancelTaskByDriver(
  taskId: string,
  driverId: string,
  reason?: string
): Promise<void> {
  const { error } = await supabase.rpc("cancel_task", {
    p_task_id: taskId,
    p_driver_id: driverId,
    p_reason: reason || null,
  });
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   TASKS — dashboard admin
════════════════════════════════════════════════════════════ */

export async function getTasksByDate(
  dateFilter: string
): Promise<TaskDetail[]> {
  const { data, error } = await supabase
    .from("tasks_detail")
    .select("*")
    .eq("tanggal", dateFilter)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTasksByRange(
  dateFrom: string,
  dateTo: string
): Promise<TaskDetail[]> {
  const { data, error } = await supabase
    .from("tasks_detail")
    .select("*")
    .gte("tanggal", dateFrom)
    .lte("tanggal", dateTo)
    .order("tanggal", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface CreateTaskInput {
  tanggal: string;
  driver_id: string;
  vehicle_id: string;
  jenis_pekerjaan: string;
  tujuan: string;
  requestor: string;
  departement: string;
  perihal?: string;
  plant: Plant; 
  }

  
export async function createTask(input: CreateTaskInput): Promise<void> {
  const { error } = await supabase.from("tasks").insert({
    tanggal: input.tanggal,
    driver_id: input.driver_id,
    vehicle_id: input.vehicle_id,
    jenis_pekerjaan: input.jenis_pekerjaan,
    tujuan: input.tujuan,
    requestor: input.requestor,
    departement: input.departement,
    perihal: input.perihal || "",
    status: "ASSIGNED",
    plant: input.plant,
  });
  if (error) throw error;
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus
): Promise<void> {
  // Hanya dua transisi yang valid didorong dari sisi admin:
  // ASSIGNED -> ON GOING, dan ON GOING -> DONE.
  if (status !== "ON GOING" && status !== "DONE") {
    throw new Error(`Transisi status tidak didukung dari dashboard: ${status}`);
  }
  const { error } = await supabase.rpc("admin_update_task_status", {
    p_task_id: taskId,
    p_new_status: status,
  });
  if (error) throw error;
}


export async function cancelTaskByAdmin(
  taskId: string,
  reason?: string
): Promise<void> {
  const { error } = await supabase.rpc("admin_cancel_task", {
    p_task_id: taskId,
    p_reason: reason || null,
  });
  if (error) throw error;
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   REALTIME SUBSCRIPTION
════════════════════════════════════════════════════════════ */

export function subscribeToTasks(onChange: () => void) {
  const channel = supabase
    .channel("tasks-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks" },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — VEHICLES (management tab: sees ALL vehicles, not just
   active ones, unlike getVehicles() above which the task-assignment
   form uses). Granular per-row ops only — `vehicles` is shared with
   the task-assignment feature, so we never bulk overwrite it.
════════════════════════════════════════════════════════════ */

export async function getAllVehiclesFull(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .order("nopol", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type VehicleInput = Omit<Vehicle, "id">;

export async function addVehicle(input: VehicleInput): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVehicle(
  id: string,
  input: Partial<VehicleInput>
): Promise<void> {
  const { error } = await supabase.from("vehicles").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteVehicle(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "Penghapusan tidak diizinkan — akun Anda mungkin tidak memiliki hak akses admin untuk menghapus kendaraan."
    );
  }
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — CLAIMS
════════════════════════════════════════════════════════════ */

interface ClaimRow {
  id: string;
  driver_id: string;
  submission_date: string;
  period_date: string;
  items: ClaimItem[];
  total: number;
  status: string;
  note: string | null;
  submitted_at: string;
  plant: string;
  drivers: { nama: string; email: string | null } | null;
}

function mapClaimRow(row: ClaimRow): Claim {
  return {
    id: row.id,
    driver_id: row.driver_id,
    driverName: row.drivers?.nama ?? "",
    driverEmail: row.drivers?.email ?? "",
    submissionDate: row.submission_date,
    periodDate: row.period_date,
    items: Array.isArray(row.items) ? row.items : [],
    total: Number(row.total) || 0,
    status: row.status,
    note: row.note ?? "",
    submittedAt: row.submitted_at,
    plant: row.plant as Plant,
  };
}

export async function getClaims(): Promise<Claim[]> {
  const { data, error } = await supabase
    .from("claims")
    .select(`
      id, driver_id, period_date, submission_date, items, total, status, note, plant,
      drivers ( nama )
    `)
    .order("submission_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    driverId: row.driver_id,
    driverName: row.drivers?.nama ?? "-",
    periodDate: row.period_date,
    submissionDate: row.submission_date,
    items: row.items,
    total: row.total,
    status: row.status,
    note: row.note,
    plant: row.plant,
  }));
}

export interface AddClaimInput {
  driver_id: string;
  submissionDate: string;
  periodDate: string;
  items: ClaimItem[];
  total: number;
  note?: string;
}

export async function addClaim(input: AddClaimInput): Promise<void> {
  const { error } = await supabase.from("claims").insert({
    driver_id: input.driver_id,
    submission_date: input.submissionDate,
    period_date: input.periodDate,
    items: input.items,
    total: input.total,
    note: input.note || "",
    status: "submitted",
    submitted_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteClaim(id: string): Promise<void> {
  const { error } = await supabase.from("claims").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — OVERTIME (Lembur, CIK vs PRB)
════════════════════════════════════════════════════════════ */

interface OvertimeRow {
  id: string;
  driver_id: string;
  period: string;
  plant: Plant;
  hours: number;
  amount: number;
  reason: string | null;
  created_at: string;
  drivers: { nama: string } | null;
}

function mapOvertimeRow(row: OvertimeRow): Overtime {
  const [y, m] = (row.period || "").split("-").map(Number);
  const now = new Date();
  return {
    id: row.id,
    driver_id: row.driver_id,
    driverName: row.drivers?.nama ?? "",
    period: row.period,
    periodYear: y || now.getFullYear(),
    periodMonth: m ? m - 1 : now.getMonth(),
    plant: row.plant,
    hours: Number(row.hours) || 0,
    amount: Number(row.amount) || 0,
    reason: row.reason ?? "",
    createdAt: row.created_at,
  };
}

export async function getOvertimes(): Promise<Overtime[]> {
  const { data, error } = await supabase
    .from("overtime")
    .select("*, drivers(nama)")
    .order("period", { ascending: false });
  if (error) throw error;
  return (data as unknown as OvertimeRow[] ?? []).map(mapOvertimeRow);
}

export interface AddOvertimeInput {
  driver_id: string;
  period: string;
  plant: Plant;
  hours: number;
  amount: number;
  reason?: string;
}

export async function addOvertime(input: AddOvertimeInput): Promise<void> {
  const { error } = await supabase.from("overtime").insert({
    driver_id: input.driver_id,
    period: input.period,
    plant: input.plant,
    hours: input.hours,
    amount: input.amount,
    reason: input.reason || "",
  });
  if (error) throw error;
}

export async function updateOvertime(
  id: string,
  input: Partial<AddOvertimeInput>
): Promise<void> {
  const { error } = await supabase.from("overtime").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteOvertime(id: string): Promise<void> {
  const { error } = await supabase.from("overtime").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — DRIVER TIERS (Driver Budget)
   `activeDriverCount` is derived (driver_tier_summary view) — never
   written back, only read.
════════════════════════════════════════════════════════════ */

interface DriverTierRow {
  id: string;
  name: string;
  color: string;
  amount_per_month: number;
  active_driver_count: number;
}

export async function getDriverTiers(): Promise<DriverTier[]> {
  const { data, error } = await supabase
    .from("driver_tier_summary")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data as DriverTierRow[]) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    amountPerMonth: Number(r.amount_per_month) || 0,
    activeDriverCount: Number(r.active_driver_count) || 0,
  }));
}

export interface SaveDriverTierInput {
  name: string;
  color: string;
  amountPerMonth: number;
}

export async function addDriverTier(input: SaveDriverTierInput): Promise<void> {
  const { error } = await supabase.from("driver_tiers").insert({
    name: input.name,
    color: input.color,
    amount_per_month: input.amountPerMonth,
  });
  if (error) throw error;
}

export async function updateDriverTier(
  id: string,
  input: SaveDriverTierInput
): Promise<void> {
  const { error } = await supabase
    .from("driver_tiers")
    .update({
      name: input.name,
      color: input.color,
      amount_per_month: input.amountPerMonth,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDriverTier(id: string): Promise<void> {
  const { error } = await supabase.from("driver_tiers").delete().eq("id", id);
  if (error) throw error;
}

/** Assign (or clear, with tierId=null) a tier for one driver — the piece
 *  of UI the original FleetOS sheet version never had (it only tracked
 *  a manual headcount, not real per-driver assignment). */
export async function setDriverTier(
  driverId: string,
  tierId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("drivers")
    .update({ tier_id: tierId })
    .eq("id", driverId);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — DANA OPERASIONAL (Kantong), period-keyed
════════════════════════════════════════════════════════════ */

interface KantongRow {
  id: string;
  period: string;
  total_budget: number;
  alloc_op_driver: number;
  alloc_emergency: number;
  cash_available: number;
  claim_submitted: number;
  claim_paid: number;
  last_reset: string;
}

function mapKantongRow(row: KantongRow): Kantong {
  return {
    id: row.id,
    period: row.period,
    totalBudget: Number(row.total_budget) || 0,
    allocOpDriver: Number(row.alloc_op_driver) || 0,
    allocEmergency: Number(row.alloc_emergency) || 0,
    cashAvailable: Number(row.cash_available) || 0,
    claimSubmitted: Number(row.claim_submitted) || 0,
    claimPaid: Number(row.claim_paid) || 0,
    lastReset: row.last_reset,
  };
}

export async function getCurrentKantong(): Promise<Kantong | null> {
  const { data, error } = await supabase
    .from("current_kantong")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? mapKantongRow(data as KantongRow) : null;
}

export interface KantongInput {
  period: string;
  totalBudget: number;
  allocOpDriver: number;
  allocEmergency: number;
  cashAvailable: number;
  claimSubmitted: number;
  claimPaid: number;
  lastReset: string;
}

export async function updateKantongBudget(input: KantongInput): Promise<void> {
  const { error } = await supabase
    .from("kantong")
    .update({
      total_budget: input.totalBudget,
      alloc_op_driver: input.allocOpDriver,
      alloc_emergency: input.allocEmergency,
      cash_available: input.cashAvailable,
      claim_submitted: input.claimSubmitted,
      claim_paid: input.claimPaid,
      last_reset: input.lastReset,
    })
    .eq("period", input.period);
  if (error) throw error;
}

/** Creates the very first Dana Operasional row for the current period —
 *  needed because the table starts completely empty (the migration only
 *  creates the table, it doesn't seed a row), so there was previously no
 *  way to get past "no data yet" in the UI. */
export async function createKantong(input: {
  period: string;
  totalBudget: number;
  allocOpDriver: number;
  allocEmergency: number;
  cashAvailable: number;
}): Promise<void> {
  const { error } = await supabase.from("kantong").insert({
    period: input.period,
    total_budget: input.totalBudget,
    alloc_op_driver: input.allocOpDriver,
    alloc_emergency: input.allocEmergency,
    cash_available: input.cashAvailable,
    claim_submitted: 0,
    claim_paid: 0,
    last_reset: todayLocalISODate(),
  });
  if (error) throw error;
}

/** Starts a fresh period row, carrying budget/allocations/cash forward and
 *  zeroing claimSubmitted/claimPaid — preserves history unlike the old
 *  single mutable sheet row. */
export async function resetKantong(
  newPeriod: string,
  lastReset: string
): Promise<void> {
  const current = await getCurrentKantong();
  const { error } = await supabase.from("kantong").upsert(
    {
      period: newPeriod,
      total_budget: current?.totalBudget ?? 0,
      alloc_op_driver: current?.allocOpDriver ?? 0,
      alloc_emergency: current?.allocEmergency ?? 0,
      cash_available: current?.cashAvailable ?? 0,
      claim_submitted: 0,
      claim_paid: 0,
      last_reset: lastReset,
    },
    { onConflict: "period" }
  );
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   FLEETOS — GAS STATIONS (Pom Bensin)
════════════════════════════════════════════════════════════ */

interface GasStationRow {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  fuels: FuelEntry[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapGasStationRow(row: GasStationRow): GasStation {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    fuels: Array.isArray(row.fuels) ? row.fuels : [],
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getGasStations(): Promise<GasStation[]> {
  const { data, error } = await supabase
    .from("gas_stations")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data as GasStationRow[]) ?? []).map(mapGasStationRow);
}

export interface GasStationInput {
  name: string;
  address: string;
  lat: number;
  lng: number;
  fuels: FuelEntry[];
  notes: string;
}

export async function addGasStation(input: GasStationInput): Promise<void> {
  const { error } = await supabase.from("gas_stations").insert({
    name: input.name,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    fuels: input.fuels,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function updateGasStation(
  id: string,
  input: GasStationInput
): Promise<void> {
  const { error } = await supabase
    .from("gas_stations")
    .update({
      name: input.name,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      fuels: input.fuels,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGasStation(id: string): Promise<void> {
  const { error } = await supabase.from("gas_stations").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   MY PROFILE — for the sidebar topbar's avatar/name/role display.
   Returns null on any error (missing row, RLS, etc.) so the UI can
   fall back to showing just the auth email instead of breaking.
════════════════════════════════════════════════════════════ */
export interface MyProfile {
  fullName: string | null;
  role: string;
  plantScope: Plant | null; // null = lihat semua plant (admin/GA global)
  accessScope: "full" | "tasks_only";
}

export async function getMyProfile(userId: string): Promise<MyProfile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, role, plant_scope, access_scope")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      fullName: data.full_name,
      role: data.role,
      plantScope: (data.plant_scope as Plant | null) ?? null,
      accessScope: (data.access_scope as "full" | "tasks_only") ?? "full",
    };
  } catch {
    return null;
  }
}

/* ════════════════════════════════════════════════════════════
   MASTER DATA — Drivers, Employees, Job Types.
   Unlike getDrivers()/getEmployees()/getJobTypes() above (which filter
   to only what the Task-assignment dropdowns need), these return
   everything for a management/admin view, plus full CRUD.
════════════════════════════════════════════════════════════ */

export async function getAllDriversFull(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, nama, no_hp, avatar_emoji, aktif, tier_id, email, plant")
    .order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
export interface DriverInput {
  nama: string;
  no_hp: string | null;
  email: string | null;
  avatar_emoji: string | null;
  aktif: boolean;
  plant?: Plant;
}

export async function addDriver(input: DriverInput, initialPin?: string): Promise<Driver> {
  const { data, error } = await supabase.from("drivers").insert(input).select().single();
  if (error) throw error;
  if (initialPin) {
    await supabase.rpc("admin_set_driver_pin", { p_driver_id: data.id, p_new_pin: initialPin });
  }
  return data;
}

export async function updateDriver(id: string, input: DriverInput): Promise<void> {
  const { error } = await supabase.from("drivers").update(input).eq("id", id);
  if (error) throw error;
}

export async function resetDriverPin(id: string, newPin: string): Promise<void> {
  const { error } = await supabase.rpc("admin_set_driver_pin", { p_driver_id: id, p_new_pin: newPin });
  if (error) throw error;
}

export async function deleteDriver(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("drivers")
    .delete()
    .eq("id", id)
    .select("id"); // wajib .select() supaya kita bisa cek data.length
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "Penghapusan tidak diizinkan — akun Anda mungkin tidak memiliki hak akses admin untuk menghapus driver."
    );
  }
}

export async function getAllEmployeesFull(): Promise<Employee[]> {
  const { data, error } = await supabase.from("employees").select("*").order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface EmployeeInput {
  nama: string;
  departement: string | null;
}

export async function addEmployee(input: EmployeeInput): Promise<void> {
  const { error } = await supabase.from("employees").insert(input);
  if (error) throw error;
}

export async function updateEmployee(id: string, input: EmployeeInput): Promise<void> {
  const { error } = await supabase.from("employees").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
}

export async function getAllJobTypesFull(): Promise<JobType[]> {
  const { data, error } = await supabase.from("job_types").select("*").order("label", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addJobType(label: string): Promise<void> {
  const { error } = await supabase.from("job_types").insert({ label });
  if (error) throw error;
}

export async function updateJobType(id: string, label: string): Promise<void> {
  const { error } = await supabase.from("job_types").update({ label }).eq("id", id);
  if (error) throw error;
}

export async function deleteJobType(id: string): Promise<void> {
  const { error } = await supabase.from("job_types").delete().eq("id", id);
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   APP SETTINGS — simple key-value config (e.g. manager_email for
   claim notification emails), editable by any authenticated admin/GA.
════════════════════════════════════════════════════════════ */

export async function getAppSetting(key: string): Promise<string> {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.value ?? "";
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* ════════════════════════════════════════════════════════════
   CLAIM EMAIL NOTIFICATIONS — sends via the `send-claim-email` Supabase
   Edge Function (Resend). Two templates: a friendly confirmation for
   the driver, and a formal record-keeping notice for the manager.
   Both calls are best-effort — a missing/misconfigured email address,
   or the Edge Function not being deployed yet, must never block the
   claim itself from being saved (that already happened before this
   is called).
════════════════════════════════════════════════════════════ */

export interface ClaimEmailInput {
  driverName: string;
  periodDate: string;
  submissionDate: string;
  items: { type: string; expr: string; total: number }[];
  total: number;
  note?: string;
  lang?: "id" | "en";
}

async function invokeClaimEmail(
  recipientType: "driver" | "manager",
  toEmail: string,
  input: ClaimEmailInput
): Promise<{ ok: boolean; error?: string }> {
  if (!toEmail) return { ok: false, error: "No recipient email configured" };
  try {
    const { error } = await supabase.functions.invoke("send-claim-email", {
      body: { recipientType, toEmail, ...input },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send email" };
  }
}

/** Sends both notification emails for a newly-submitted claim (driver +
 *  manager, if their addresses are available) and returns a per-recipient
 *  result so the UI can show a soft warning without blocking anything —
 *  the claim record itself is already saved by the time this runs. */
export async function sendClaimNotificationEmails(
  driverEmail: string | null | undefined,
  input: ClaimEmailInput
): Promise<{ driver: { ok: boolean; error?: string } | null; manager: { ok: boolean; error?: string } | null }> {
  let managerEmail = "";
  try {
    managerEmail = await getAppSetting("manager_email");
  } catch (e) {
    // Previously this failure was silently swallowed (`.catch(() => "")`),
    // so a misconfigured/blocked read of manager_email would look
    // identical to "no manager email set" — no trace anywhere. Now it's
    // at least visible in the console for debugging.
    console.warn("Failed to read manager_email setting:", e instanceof Error ? e.message : e);
  }
  if (!managerEmail) {
    console.warn("sendClaimNotificationEmails: manager_email is empty — no manager copy will be sent.");
  }
  const [driverResult, managerResult] = await Promise.all([
    driverEmail ? invokeClaimEmail("driver", driverEmail, input) : Promise.resolve(null),
    managerEmail ? invokeClaimEmail("manager", managerEmail, input) : Promise.resolve(null),
  ]);
  return { driver: driverResult, manager: managerResult };
}

/* ════════════════════════════════════════════════════════════
   CANTEEN — merged from the standalone Canteen Ops system.
════════════════════════════════════════════════════════════ */

interface CanteenReportRow {
  id: string;
  report_date: string;
  snack_order_1: number; snack_order_2: number; snack_order_3: number;
  snack_leftover_1: number; snack_leftover_2: number; snack_leftover_3: number;
  meal_order_1: number; meal_order_2: number; meal_order_3: number;
  meal_leftover_1: number; meal_leftover_2: number; meal_leftover_3: number;
  submitted_by: string | null;
  created_at: string;
}

function mapCanteenRow(row: CanteenReportRow): CanteenReport {
  return {
    id: row.id,
    reportDate: row.report_date,
    snackOrder: [Number(row.snack_order_1) || 0, Number(row.snack_order_2) || 0, Number(row.snack_order_3) || 0],
    snackLeftover: [Number(row.snack_leftover_1) || 0, Number(row.snack_leftover_2) || 0, Number(row.snack_leftover_3) || 0],
    mealOrder: [Number(row.meal_order_1) || 0, Number(row.meal_order_2) || 0, Number(row.meal_order_3) || 0],
    mealLeftover: [Number(row.meal_leftover_1) || 0, Number(row.meal_leftover_2) || 0, Number(row.meal_leftover_3) || 0],
    submittedBy: row.submitted_by ?? "",
    createdAt: row.created_at,
  };
}

/** Gets all canteen reports for a given "YYYY-MM" month. */
export async function getCanteenReportsForMonth(month: string): Promise<CanteenReport[]> {
  const { data, error } = await supabase
    .from("canteen_reports")
    .select("*")
    .gte("report_date", `${month}-01`)
    .lte("report_date", `${month}-31`)
    .order("report_date", { ascending: true });
  if (error) throw error;
  return ((data as CanteenReportRow[]) ?? []).map(mapCanteenRow);
}

/** Gets every canteen report on file — used for the monthly-history /
 *  month-picker views, where we need to know which months have data. */
export async function getAllCanteenReports(): Promise<CanteenReport[]> {
  const { data, error } = await supabase.from("canteen_reports").select("*").order("report_date", { ascending: true });
  if (error) throw error;
  return ((data as CanteenReportRow[]) ?? []).map(mapCanteenRow);
}

export interface CanteenReportInput {
  reportDate: string;
  snackOrder: [number, number, number];
  snackLeftover: [number, number, number];
  mealOrder: [number, number, number];
  mealLeftover: [number, number, number];
  submittedBy: string;
}

/** Saving a report for a date that already has one REPLACES it (upsert
 *  on report_date) — matches the original system, where submitting the
 *  same day again was how you corrected a mistake, not a duplicate. */
export async function saveCanteenReport(input: CanteenReportInput): Promise<void> {
  const { error } = await supabase.from("canteen_reports").upsert(
    {
      report_date: input.reportDate,
      snack_order_1: input.snackOrder[0], snack_order_2: input.snackOrder[1], snack_order_3: input.snackOrder[2],
      snack_leftover_1: input.snackLeftover[0], snack_leftover_2: input.snackLeftover[1], snack_leftover_3: input.snackLeftover[2],
      meal_order_1: input.mealOrder[0], meal_order_2: input.mealOrder[1], meal_order_3: input.mealOrder[2],
      meal_leftover_1: input.mealLeftover[0], meal_leftover_2: input.mealLeftover[1], meal_leftover_3: input.mealLeftover[2],
      submitted_by: input.submittedBy,
    },
    { onConflict: "report_date" }
  );
  if (error) throw error;
}

export async function deleteCanteenReport(id: string): Promise<void> {
  const { error } = await supabase.from("canteen_reports").delete().eq("id", id);
  if (error) throw error;
}
