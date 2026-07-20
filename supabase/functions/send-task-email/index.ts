import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const FROM_NAME = "CIKOPS-FM System";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TaskBatchEmailPayload {
  toEmail: string | string[];
  requestor: string;
  driverName: string;
  vehicleLabel: string;
  jenisPekerjaan: string;
  tujuan: string;
  departement: string;
  perihal?: string;
  dateFrom: string;
  dateTo: string;
  dayCount: number;
  lang?: "id" | "en";
}

/** Escape untuk mencegah HTML/markup injection dari field yang diisi user
 * (requestor, driverName, tujuan, perihal, dll) sebelum disisipkan ke email HTML. */
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

function fmtDate(d: string, lang: "id" | "en"): string {
  try {
    return new Date(d).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function template(p: TaskBatchEmailPayload): { subject: string; html: string } {
  const id = (p.lang ?? "id") === "id";

  // Escape semua field yang berasal dari input user sebelum dipakai di HTML.
  const requestor = escapeHtml(p.requestor);
  const driverName = escapeHtml(p.driverName);
  const vehicleLabel = escapeHtml(p.vehicleLabel);
  const jenisPekerjaan = escapeHtml(p.jenisPekerjaan);
  const tujuan = escapeHtml(p.tujuan);
  const departement = escapeHtml(p.departement) || "-";
  const perihal = p.perihal ? escapeHtml(p.perihal) : "";
  const dayCount = Number.isFinite(p.dayCount) ? p.dayCount : 0;

  const subject = id
    ? `Penugasan Driver Rentang Tanggal - ${p.driverName} (${p.dayCount} hari)`
    : `Multi-Day Driver Assignment - ${p.driverName} (${p.dayCount} days)`;

  const html = `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;background:#f3f8fd;padding:24px;">
    <div style="background:linear-gradient(135deg,#3d6ff2,#2a52d6);border-radius:16px 16px 0 0;padding:24px;text-align:center;">
      <div style="font-size:28px;margin-bottom:6px;">🗓️</div>
      <div style="color:#fff;font-size:18px;font-weight:800;">${id ? "Penugasan Rentang Tanggal" : "Multi-Day Assignment"}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;">
      <p style="font-size:14px;color:#0d1328;line-height:1.6;">
        ${id ? `Halo <strong>${requestor}</strong>,` : `Hi <strong>${requestor}</strong>,`}
      </p>
      <p style="font-size:14px;color:#2d375a;line-height:1.6;">
        ${id
          ? "Penugasan driver untuk rentang beberapa hari sudah dibuat di sistem. Berikut rinciannya:"
          : "A multi-day driver assignment has been created in the system. Here are the details:"}
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <tr><td style="padding:6px 0;color:#5a6485;width:150px;">${id ? "Driver" : "Driver"}</td><td style="padding:6px 0;color:#0d1328;font-weight:700;">${driverName}</td></tr>
        <tr><td style="padding:6px 0;color:#5a6485;">${id ? "Kendaraan" : "Vehicle"}</td><td style="padding:6px 0;color:#0d1328;">${vehicleLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#5a6485;">${id ? "Jenis Pekerjaan" : "Job Type"}</td><td style="padding:6px 0;color:#0d1328;">${jenisPekerjaan}</td></tr>
        <tr><td style="padding:6px 0;color:#5a6485;">${id ? "Tujuan" : "Destination"}</td><td style="padding:6px 0;color:#0d1328;">${tujuan}</td></tr>
        <tr><td style="padding:6px 0;color:#5a6485;">${id ? "Departemen" : "Department"}</td><td style="padding:6px 0;color:#0d1328;">${departement}</td></tr>
      </table>
      <div style="background:#f7fbfe;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:#3d6ff2;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${id ? "Periode Penugasan" : "Assignment Period"}</div>
        <div style="font-size:14px;color:#0d1328;font-weight:700;">${fmtDate(p.dateFrom, p.lang ?? "id")} s/d ${fmtDate(p.dateTo, p.lang ?? "id")}</div>
        <div style="font-size:12px;color:#5a6485;margin-top:2px;">${dayCount} ${id ? "hari" : "days"}</div>
      </div>
      ${perihal ? `<p style="font-size:12.5px;color:#5a6485;font-style:italic;margin-bottom:16px;">${id ? "Catatan" : "Note"}: ${perihal}</p>` : ""}
      <p style="font-size:13px;color:#5a6485;line-height:1.6;">
        ${id
          ? "Tugas harian akan otomatis muncul di sistem untuk setiap tanggal dalam rentang ini."
          : "A daily task will automatically appear in the system for each date within this range."}
      </p>
      <p style="font-size:11px;color:#9ba3be;margin-top:20px;">${id ? "Email otomatis dari" : "Automated email from"} CIKOPS-FM System</p>
    </div>
  </div>`;

  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "GMAIL_USER / GMAIL_APP_PASSWORD belum diset di secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: TaskBatchEmailPayload;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipients = (Array.isArray(payload.toEmail) ? payload.toEmail : [payload.toEmail])
      .map((e) => (typeof e === "string" ? e.trim() : ""))
      .filter((e) => EMAIL_RE.test(e));

    if (recipients.length === 0 || !payload.driverName || !payload.dateFrom || !payload.dateTo) {
      return new Response(
        JSON.stringify({ error: "Missing required fields or no valid recipient email." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { subject, html } = template(payload);
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });
    // Kirim satu email per penerima, BUKAN satu panggilan dengan array berisi
    // banyak alamat sekaligus. Waktu `to` diisi array 2+ alamat, denomailer
    // pernah teramati menghasilkan header `To:` yang dipisah titik-koma
    // (mis. "<a@x.com>; <b@y.com>") padahal RFC 5322 mewajibkan pemisah
    // koma untuk daftar alamat biasa. Header yang tidak standar ini bisa
    // membuat mail gateway yang strict (mis. Exchange/Microsoft 365) gagal
    // mem-parsing seluruh pesan dan jatuh ke fallback menampilkan raw MIME
    // source — persis bug yang terjadi saat dikirim ke 2 penerima sekaligus.
    // Mengirim satu-per-satu juga sekalian menghindari penerima A melihat
    // alamat email penerima B di header To.
    const failed: string[] = [];
    for (const to of recipients) {
      try {
        await client.send({
          from: `${FROM_NAME} <${GMAIL_USER}>`,
          to,
          subject,
          html,
        });
      } catch (sendErr) {
        console.error(`Gagal kirim ke ${to}:`, sendErr);
        failed.push(to);
      }
    }
    await client.close();

    if (failed.length === recipients.length) {
      return new Response(
        JSON.stringify({ error: "Gagal mengirim ke semua penerima.", failed }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        recipients: recipients.filter((r) => !failed.includes(r)),
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
