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
  driverPhone?: string;
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

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}

function fmtDateLong(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function fmtDateShort(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function template(p: TaskBatchEmailPayload): { subject: string; html: string } {
  const requestor    = escapeHtml(p.requestor);
  const driverName   = escapeHtml(p.driverName);
  const driverPhone  = p.driverPhone ? escapeHtml(p.driverPhone) : null;
  const vehicleLabel = escapeHtml(p.vehicleLabel);
  const jenis        = escapeHtml(p.jenisPekerjaan);
  const tujuan       = escapeHtml(p.tujuan);
  const departement  = escapeHtml(p.departement) || "-";
  const perihal      = p.perihal ? escapeHtml(p.perihal) : null;
  const dateFrom     = fmtDateShort(p.dateFrom);
  const dateTo       = fmtDateShort(p.dateTo);
  const dayCount     = Number.isFinite(p.dayCount) ? p.dayCount : 0;
  const isSameDay    = p.dateFrom === p.dateTo;

  // Subject: Penugasan Driver : <Tanggal> <Requestor> <Tujuan>
  const dateLabel = isSameDay ? dateFrom : `${dateFrom} – ${dateTo}`;
  const subject = `Penugasan Driver : ${dateLabel} | ${p.requestor} | ${p.tujuan}`;

  const html = `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4fb;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#f0f4fb;padding:0 16px 32px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1c3e82 0%,#3d6ff2 100%);border-radius:16px 16px 0 0;padding:28px 28px 24px;text-align:center;">
    <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">
      PT. FRISIAN FLAG INDONESIA
    </div>
    <div style="font-size:22px;font-weight:800;color:#ffffff;margin-bottom:4px;">
      Surat Penugasan Driver
    </div>
    <div style="font-size:13px;color:rgba(255,255,255,0.75);">
      CIKOPS Fleet Management System
    </div>
  </div>

  <!-- Body -->
  <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px;">

    <p style="font-size:14px;color:#1a2540;line-height:1.7;margin:0 0 18px;">
      Yth. <strong>${requestor}</strong>,
    </p>

    <p style="font-size:14px;color:#2d3d6b;line-height:1.7;margin:0 0 20px;">
      Berikut kami informasikan Penugasan Driver pada tanggal
      <strong style="color:#1c3e82;">${isSameDay ? dateFrom : `${dateFrom} s/d ${dateTo}`}</strong>${!isSameDay ? ` <span style="font-size:12px;color:#7a86aa;">(${dayCount} hari)</span>` : ""}
      dengan detail sebagai berikut:
    </p>

    <!-- Detail table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13.5px;">
      <tbody>
        <tr style="border-bottom:1px solid #edf0f7;">
          <td style="padding:10px 14px;color:#7a86aa;width:38%;background:#f8faff;border-radius:8px 0 0 0;">Nama Driver</td>
          <td style="padding:10px 14px;color:#1a2540;font-weight:700;">${driverName}</td>
        </tr>
        ${driverPhone ? `
        <tr style="border-bottom:1px solid #edf0f7;">
          <td style="padding:10px 14px;color:#7a86aa;background:#f8faff;">No. HP Driver</td>
          <td style="padding:10px 14px;color:#1a2540;font-weight:600;">${driverPhone}</td>
        </tr>` : ""}
        <tr style="border-bottom:1px solid #edf0f7;">
          <td style="padding:10px 14px;color:#7a86aa;background:#f8faff;">Kendaraan</td>
          <td style="padding:10px 14px;color:#1a2540;">${vehicleLabel}</td>
        </tr>
        <tr style="border-bottom:1px solid #edf0f7;">
          <td style="padding:10px 14px;color:#7a86aa;background:#f8faff;">Jenis Pekerjaan</td>
          <td style="padding:10px 14px;color:#1a2540;">${jenis}</td>
        </tr>
        <tr style="border-bottom:1px solid #edf0f7;">
          <td style="padding:10px 14px;color:#7a86aa;background:#f8faff;">Tujuan</td>
          <td style="padding:10px 14px;color:#1a2540;font-weight:600;">${tujuan}</td>
        </tr>
        <tr style="border-bottom:1px solid #edf0f7;">
          <td style="padding:10px 14px;color:#7a86aa;background:#f8faff;">Departemen</td>
          <td style="padding:10px 14px;color:#1a2540;">${departement}</td>
        </tr>
        <tr style="${perihal ? "border-bottom:1px solid #edf0f7;" : ""}">
          <td style="padding:10px 14px;color:#7a86aa;background:#f8faff;border-radius:0 0 0 8px;">Tanggal</td>
          <td style="padding:10px 14px;color:#1c3e82;font-weight:700;">
            ${isSameDay ? dateFrom : `${dateFrom} s/d ${dateTo}`}
          </td>
        </tr>
        ${perihal ? `
        <tr>
          <td style="padding:10px 14px;color:#7a86aa;background:#f8faff;border-radius:0 0 0 8px;">Perihal / Catatan</td>
          <td style="padding:10px 14px;color:#1a2540;font-style:italic;">${perihal}</td>
        </tr>` : ""}
      </tbody>
    </table>

    <!-- Notice box -->
    <div style="background:#f0f5ff;border-left:4px solid #3d6ff2;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#2d3d6b;line-height:1.7;">
        Mohon untuk dapat melakukan konfirmasi kepada driver secara langsung apabila terdapat informasi tambahan atau perubahan yang diperlukan.
        ${driverPhone ? `Driver dapat dihubungi melalui nomor <strong>${driverPhone}</strong>.` : ""}
      </p>
    </div>

    <p style="font-size:13px;color:#2d3d6b;line-height:1.7;margin:0 0 8px;">
      Demikian informasi penugasan ini kami sampaikan. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.
    </p>

    <p style="font-size:13px;color:#2d3d6b;margin:0;">
      Hormat kami,<br>
      <strong>Tim GA — Fleet Management</strong><br>
      <span style="color:#7a86aa;font-size:12px;">PT. Frisian Flag Indonesia</span>
    </p>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px 0 0;">
    <p style="font-size:11px;color:#a0aac0;margin:0;">
      Email ini dibuat secara otomatis oleh <strong>CIKOPS-FM System</strong> dan tidak memerlukan balasan langsung.<br>
      Untuk pertanyaan, silakan hubungi tim GA secara langsung.
    </p>
  </div>

</div>
</body>
</html>`;

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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    const failed: string[] = [];
    for (const to of recipients) {
      try {
        await client.send({ from: `${FROM_NAME} <${GMAIL_USER}>`, to, subject, html });
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
      JSON.stringify({ success: true, recipients: recipients.filter((r) => !failed.includes(r)), failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
