import { supabase } from "./supabaseClient";
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
} from "./types";

/* ════════════════════════════════════════════════════════════
   MASTER DATA
════════════════════════════════════════════════════════════ */

export async function getDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, nama, no_hp, avatar_emoji, aktif")
    .eq("aktif", true)
    .order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, nopol, jenis, aktif")
    .eq("aktif", true)
    .order("nopol", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, nik, nama, departement")
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
  const today = new Date().toISOString().split("T")[0];
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
  });
  if (error) throw error;
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "ON GOING") patch.accepted_at = new Date().toISOString();
  if (status === "DONE") patch.completed_at = new Date().toISOString();
  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (error) throw error;
}

export async function cancelTaskByAdmin(
  taskId: string,
  reason?: string
): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "admin",
      cancel_reason: reason || null,
    })
    .eq("id", taskId);
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
  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) throw error;
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
  };
}

export async function getClaims(): Promise<Claim[]> {
  const { data, error } = await supabase
    .from("claims")
    .select("*, drivers(nama, email)")
    .order("period_date", { ascending: false });
  if (error) throw error;
  return (data as unknown as ClaimRow[] ?? []).map(mapClaimRow);
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
