import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const FROM_NAME = "CIKOPS-FM System";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        ${id ? `Halo <strong>${p.requestor}</strong>,` : `Hi <strong>${p.requestor}</strong>,`}
      </p>
      <p style="font-size:14px;color:#2d375a;line-height:1.6;">
        ${id
          ? "Penugasan driver untuk rentang beberapa hari sudah dibuat di sistem. Berikut rinciannya:"
          : "A multi-day driver assignment has been created in the system. Here are the details:"}
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <tr><td style="padding:6px 0;color:#5a6485;width:150px;">${id ? "Driver" : "Driver"}</td><td style="padding:6px 0;color:#0d1328;font-weight:700;">${p.driverName}</td></tr>
        <tr><td style="padding:6px 0;color:#5a6485;">${id ? "Kendaraan" : "Vehicle"}</td><td style="padding:6px 0;color:#0d1328;">${p.vehicleLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#5a6485;">${id ? "Jenis Pekerjaan" : "Job Type"}</td><td style="padding:6px 0;color:#0d1328;">${p.jenisPekerjaan}</td></tr>
        <tr><td style="padding:6px 0;color:#5a6485;">${id ? "Tujuan" : "Destination"}</td><td style="padding:6px 0;color:#0d1328;">${p.tujuan}</td></tr>
        <tr><td style="padding:6px 0;color:#5a6485;">${id ? "Departemen" : "Department"}</td><td style="padding:6px 0;color:#0d1328;">${p.departement || "-"}</td></tr>
      </table>
      <div style="background:#f7fbfe;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:#3d6ff2;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${id ? "Periode Penugasan" : "Assignment Period"}</div>
        <div style="font-size:14px;color:#0d1328;font-weight:700;">${fmtDate(p.dateFrom, p.lang ?? "id")} s/d ${fmtDate(p.dateTo, p.lang ?? "id")}</div>
        <div style="font-size:12px;color:#5a6485;margin-top:2px;">${p.dayCount} ${id ? "hari" : "days"}</div>
      </div>
      ${p.perihal ? `<p style="font-size:12.5px;color:#5a6485;font-style:italic;margin-bottom:16px;">${id ? "Catatan" : "Note"}: ${p.perihal}</p>` : ""}
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
  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "GMAIL_USER / GMAIL_APP_PASSWORD belum diset di secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const payload: TaskBatchEmailPayload = await req.json();
    const recipients = (Array.isArray(payload.toEmail) ? payload.toEmail : [payload.toEmail])
      .map((e) => e.trim())
      .filter(Boolean);
    if (recipients.length === 0 || !payload.driverName || !payload.dateFrom || !payload.dateTo) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    await client.send({
      from: `${FROM_NAME} <${GMAIL_USER}>`,
      to: recipients,
      subject,
      content: "Email ini memerlukan HTML untuk ditampilkan dengan benar.",
      html,
    });
    await client.close();
    return new Response(JSON.stringify({ success: true, recipients }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
