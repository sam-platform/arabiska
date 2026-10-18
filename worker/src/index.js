// Daily 21:00 Stockholm-time reminder: pushes a notification only if today's
// Arabiska set isn't done yet (public.daily_log.set_completed). Cron fires
// hourly (cheap, well within free-tier limits) and bails unless it's 21:00
// Europe/Stockholm, so DST is handled for free — no biannual cron edits.
import { buildPushPayload } from "@block65/webcrypto-web-push";

const STOCKHOLM_TZ = "Europe/Stockholm";
const REMINDER_HOUR = 21;

function stockholmDateStr(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STOCKHOLM_TZ }).format(date);
}

function stockholmHour(date = new Date()) {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: STOCKHOLM_TZ,
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
    10
  );
}

function corsHeaders(origin, env) {
  const headers = new Headers();
  if (origin && origin === env.ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, X-Subscribe-Secret");
  }
  return headers;
}

async function handleSubscribe(request, env) {
  const origin = request.headers.get("Origin") || "";
  const headers = corsHeaders(origin, env);

  if (request.headers.get("X-Subscribe-Secret") !== env.SUBSCRIBE_SECRET) {
    return new Response("Forbidden", { status: 403, headers });
  }

  const body = await request.json().catch(() => null);
  if (!body?.subscription?.endpoint || !body?.userId) {
    return new Response("Bad request", { status: 400, headers });
  }

  await env.SUBS.put(
    "subscription",
    JSON.stringify({ subscription: body.subscription, userId: body.userId })
  );

  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true }), { headers });
}

async function checkAndNotify(env) {
  const stored = await env.SUBS.get("subscription", "json");
  if (!stored) return { sent: false, reason: "no-subscription" };

  const today = stockholmDateStr();

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/daily_log?user_id=eq.${stored.userId}&day=eq.${today}&select=set_completed`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await res.json();
  const completed = rows[0]?.set_completed === true;

  if (completed) {
    await env.SUBS.put("last-notified-day", today);
    return { sent: false, reason: "already-completed" };
  }

  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  const message = {
    data: JSON.stringify({
      title: "Arabiska",
      body: "Remember to do your daily Arabic",
    }),
    options: { ttl: 3600 },
  };

  const payload = await buildPushPayload(message, stored.subscription, vapid);
  const pushRes = await fetch(stored.subscription.endpoint, payload);

  await env.SUBS.put("last-notified-day", today);
  return { sent: true, status: pushRes.status };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin, env) });
    }

    if (url.pathname === "/subscribe" && request.method === "POST") {
      return handleSubscribe(request, env);
    }

    if (url.pathname === "/test-notify" && request.method === "GET") {
      if (url.searchParams.get("secret") !== env.SUBSCRIBE_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
      const result = await checkAndNotify(env);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    if (stockholmHour() !== REMINDER_HOUR) return;

    const today = stockholmDateStr();
    const lastNotified = await env.SUBS.get("last-notified-day");
    if (lastNotified === today) return;

    ctx.waitUntil(checkAndNotify(env));
  },
};
