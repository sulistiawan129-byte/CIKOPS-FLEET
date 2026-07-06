export type Lang = "id" | "en";

/* Flat string dictionary — same pattern FleetOS used (DICT.id / DICT.en),
 * adapted to TypeScript. Add new keys here as pages are ported; keep id/en
 * objects with identical key sets (the `Dict` type below enforces it). */
export interface Dict {
  // App identity
  appName: string;
  appTagline: string;

  // Splash
  splashTagline: string;

  // Landing
  pilihDriver: string;
  memuatDriver: string;
  online: string;
  masuk: string;
  gantiTema: string;

  // PIN entry screen
  kembali: string;
  masukkanPin: string;
  pinSalah: string;

  // App header / nav
  driverPanel: string;
  keluar: string;
  hariIni: string;
  riwayat: string;
  profil: string;
  statBaru: string;
  statProses: string;
  statSelesai: string;

  // Today tab
  memuatTugasHariIni: string;
  belumAdaTugasHariIni: string;
  tugasBaruOtomatis: string;
  liveUpdateOtomatis: string;

  // History tab
  dariTanggal: string;
  sampaiTanggal: string;
  statusLabel: string;
  terapkan: string;
  reset: string;
  memuatRiwayat: string;
  tidakAdaRiwayat: string;
  cobaUbahRentang: string;
  pilihRentangTanggal: string;
  tekanTerapkan: string;

  // Profile tab
  informasi: string;
  noHp: string;
  keamanan: string;
  pinAkses: string;
  ubahPin: string;
  keluarDariAkun: string;

  // PIN change modal
  masukkanPinLama: string;
  buatPinBaru: string;
  konfirmasiPinBaru: string;
  verifikasiIdentitas: string;
  empatDigitMudahDiingat: string;
  ketikUlangPin: string;
  batal: string;
  pinBaruTidakCocok: string;
  pinLamaSalah: string;
  pinBerhasilDiubah: string;

  // Cancel task modal
  batalkanTugasIni: string;
  tujuanLabel: string;
  yaBatalkanTugas: string;
  tidakKembali: string;

  // Task card
  tujuan: string;
  kendaraan: string;
  jenisPekerjaan: string;
  requestor: string;
  perihal: string;
  terimaTugas: string;
  selesaikanTugas: string;
  batalkanTugas: string;
  memproses: string;
  selesai: string;
  dibatalkanOleh: string;

  // Status labels
  statusAssigned: string;
  statusOngoing: string;
  statusCancelled: string;
  statusDone: string;

  // Toasts / errors
  tugasBaruMasuk: string;
  tugasDiterima: string;
  tugasSelesaiToast: string;
  tugasDibatalkanToast: string;
  gagalMemuatDataDriver: string;
  gagalMemuatTugas: string;
  gagalMenerimaTugas: string;
  gagalMenyelesaikanTugas: string;
  gagalMembatalkanTugas: string;
  gagalMemuatRiwayat: string;
  gagalMengubahPin: string;

  // Language toggle (new)
  language: string;
}

export const DICT: Record<Lang, Dict> = {
  id: {
    appName: "CIKOPS",
    appTagline: "Fleet Operations",

    splashTagline: "Fleet Operations",

    pilihDriver: "Pilih Driver",
    memuatDriver: "Memuat driver...",
    online: "Online",
    masuk: "Masuk →",
    gantiTema: "Ganti tema",

    kembali: "← Kembali",
    masukkanPin: "MASUKKAN PIN 4 DIGIT",
    pinSalah: "PIN salah, coba lagi",

    driverPanel: "Driver Panel",
    keluar: "Keluar",
    hariIni: "Hari Ini",
    riwayat: "Riwayat",
    profil: "Profil",
    statBaru: "Baru",
    statProses: "Proses",
    statSelesai: "Selesai",

    memuatTugasHariIni: "Memuat tugas hari ini...",
    belumAdaTugasHariIni: "Belum ada tugas hari ini",
    tugasBaruOtomatis: "Tugas baru akan muncul otomatis di sini",
    liveUpdateOtomatis: "Live — update otomatis",

    dariTanggal: "Dari Tanggal",
    sampaiTanggal: "Sampai Tanggal",
    statusLabel: "STATUS",
    terapkan: "Terapkan",
    reset: "Reset",
    memuatRiwayat: "Memuat riwayat...",
    tidakAdaRiwayat: "Tidak ada riwayat",
    cobaUbahRentang: "Coba ubah rentang tanggal atau filter status",
    pilihRentangTanggal: "Pilih rentang tanggal",
    tekanTerapkan: 'Tekan "Terapkan" untuk melihat riwayat tugas',

    informasi: "INFORMASI",
    noHp: "No. HP",
    keamanan: "KEAMANAN",
    pinAkses: "PIN Akses",
    ubahPin: "Ubah PIN",
    keluarDariAkun: "Keluar dari akun",

    masukkanPinLama: "Masukkan PIN Lama",
    buatPinBaru: "Buat PIN Baru",
    konfirmasiPinBaru: "Konfirmasi PIN Baru",
    verifikasiIdentitas: "Verifikasi identitas Anda",
    empatDigitMudahDiingat: "4 digit angka, mudah diingat",
    ketikUlangPin: "Ketik ulang PIN yang sama",
    batal: "Batal",
    pinBaruTidakCocok: "PIN baru tidak cocok, ulangi",
    pinLamaSalah: "PIN lama salah",
    pinBerhasilDiubah: "PIN berhasil diubah ✓",

    batalkanTugasIni: "Batalkan tugas ini?",
    tujuanLabel: "Tujuan",
    yaBatalkanTugas: "Ya, Batalkan Tugas",
    tidakKembali: "Tidak, Kembali",

    tujuan: "TUJUAN",
    kendaraan: "Kendaraan",
    jenisPekerjaan: "Jenis Pekerjaan",
    requestor: "Requestor",
    perihal: "Perihal",
    terimaTugas: "Terima Tugas →",
    selesaikanTugas: "Selesaikan Tugas ✓",
    batalkanTugas: "Batalkan Tugas",
    memproses: "Memproses...",
    selesai: "Selesai",
    dibatalkanOleh: "oleh",

    statusAssigned: "Baru",
    statusOngoing: "Berlangsung",
    statusCancelled: "Dibatalkan",
    statusDone: "Selesai",

    tugasBaruMasuk: "Tugas baru masuk 🔔",
    tugasDiterima: "Tugas diterima ✓",
    tugasSelesaiToast: "Tugas selesai ✓",
    tugasDibatalkanToast: "Tugas dibatalkan",
    gagalMemuatDataDriver: "Gagal memuat data driver",
    gagalMemuatTugas: "Gagal memuat tugas",
    gagalMenerimaTugas: "Gagal menerima tugas",
    gagalMenyelesaikanTugas: "Gagal menyelesaikan tugas",
    gagalMembatalkanTugas: "Gagal membatalkan tugas",
    gagalMemuatRiwayat: "Gagal memuat riwayat",
    gagalMengubahPin: "Gagal mengubah PIN",

    language: "Bahasa",
  },
  en: {
    appName: "CIKOPS",
    appTagline: "Fleet Operations",

    splashTagline: "Fleet Operations",

    pilihDriver: "Select Driver",
    memuatDriver: "Loading drivers...",
    online: "Online",
    masuk: "Log In →",
    gantiTema: "Toggle theme",

    kembali: "← Back",
    masukkanPin: "ENTER YOUR 4-DIGIT PIN",
    pinSalah: "Wrong PIN, try again",

    driverPanel: "Driver Panel",
    keluar: "Log Out",
    hariIni: "Today",
    riwayat: "History",
    profil: "Profile",
    statBaru: "New",
    statProses: "Ongoing",
    statSelesai: "Done",

    memuatTugasHariIni: "Loading today's tasks...",
    belumAdaTugasHariIni: "No tasks yet today",
    tugasBaruOtomatis: "New tasks will appear here automatically",
    liveUpdateOtomatis: "Live — auto-updating",

    dariTanggal: "From Date",
    sampaiTanggal: "To Date",
    statusLabel: "STATUS",
    terapkan: "Apply",
    reset: "Reset",
    memuatRiwayat: "Loading history...",
    tidakAdaRiwayat: "No history found",
    cobaUbahRentang: "Try a different date range or status filter",
    pilihRentangTanggal: "Select a date range",
    tekanTerapkan: 'Press "Apply" to view task history',

    informasi: "INFORMATION",
    noHp: "Phone",
    keamanan: "SECURITY",
    pinAkses: "Access PIN",
    ubahPin: "Change PIN",
    keluarDariAkun: "Sign out",

    masukkanPinLama: "Enter Current PIN",
    buatPinBaru: "Create New PIN",
    konfirmasiPinBaru: "Confirm New PIN",
    verifikasiIdentitas: "Verify your identity",
    empatDigitMudahDiingat: "4 digits, easy to remember",
    ketikUlangPin: "Re-enter the same PIN",
    batal: "Cancel",
    pinBaruTidakCocok: "New PINs don't match, try again",
    pinLamaSalah: "Current PIN is incorrect",
    pinBerhasilDiubah: "PIN changed successfully ✓",

    batalkanTugasIni: "Cancel this task?",
    tujuanLabel: "Destination",
    yaBatalkanTugas: "Yes, Cancel Task",
    tidakKembali: "No, Go Back",

    tujuan: "DESTINATION",
    kendaraan: "Vehicle",
    jenisPekerjaan: "Job Type",
    requestor: "Requestor",
    perihal: "Subject",
    terimaTugas: "Accept Task →",
    selesaikanTugas: "Complete Task ✓",
    batalkanTugas: "Cancel Task",
    memproses: "Processing...",
    selesai: "Done",
    dibatalkanOleh: "by",

    statusAssigned: "New",
    statusOngoing: "Ongoing",
    statusCancelled: "Cancelled",
    statusDone: "Done",

    tugasBaruMasuk: "New task received 🔔",
    tugasDiterima: "Task accepted ✓",
    tugasSelesaiToast: "Task completed ✓",
    tugasDibatalkanToast: "Task cancelled",
    gagalMemuatDataDriver: "Failed to load driver data",
    gagalMemuatTugas: "Failed to load tasks",
    gagalMenerimaTugas: "Failed to accept task",
    gagalMenyelesaikanTugas: "Failed to complete task",
    gagalMembatalkanTugas: "Failed to cancel task",
    gagalMemuatRiwayat: "Failed to load history",
    gagalMengubahPin: "Failed to change PIN",

    language: "Language",
  },
};
