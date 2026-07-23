import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════
//  send-push-notification
//  Kirim push notification OneSignal ke driver tertentu.
//  Driver diidentifikasi via External User ID = driver UUID dari
//  tabel drivers — yang kita set saat login lewat JavaScript Bridge.
// ═══════════════════════════════════════════════════════════════

const ONESIGNAL_APP_ID  = Deno.env.get("ONESIGNAL_APP_ID")  ?? "";
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "ONESIGNAL_APP_ID / ONESIGNAL_API_KEY belum diset di secrets." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { driverIds, title, body, data } = await req.json() as {
      driverIds: string[];   // array of driver UUIDs (external user IDs)
      title: string;
      body: string;
      data?: Record<string, string>;
    };

    if (!driverIds?.length) {
      return new Response(
        JSON.stringify({ ok: false, error: "driverIds kosong." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: {
        external_id: driverIds,
      },
      target_channel: "push",
      headings: { en: title, id: title },
      contents: { en: body, id: body },
      priority: 10,
      data: data ?? {},
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
    };

    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    const ok = !!result.id && !result.errors;

    return new Response(
      JSON.stringify({ ok, result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
