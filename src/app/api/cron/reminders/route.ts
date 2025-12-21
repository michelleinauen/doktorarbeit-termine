import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

/**
 * Erwartete ENV-Variablen (Vercel + lokal):
 * - NEXT_PUBLIC_SUPABASE_URL = https://xxxx.supabase.co
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY = sb_publishable_...   (nur fürs Frontend, hier nur Diagnose)
 * - SUPABASE_SERVICE_ROLE_KEY = sb_secret_...            (Server only)
 * - RESEND_API_KEY = re_...
 * - MAIL_FROM = Studienteam <onboarding@resend.dev>      (oder eigene verified domain)
 * - APP_BASE_URL = https://deinprojekt.vercel.app
 * - CRON_SECRET = study_cron_2025_secure
 */

function fmt(dateIso: string) {
  // Nur Datum + Startzeit (wie du es wolltest)
  return new Date(dateIso).toLocaleString("de-CH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Zurich",
  });
}

function sanitizeBaseUrl(url: string) {
  // entfernt trailing slash
  return url.replace(/\/+$/, "");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("secret");

    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // ✅ Diagnose: nur Präfixe/URLs, keine Secrets
    const envDiag = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
      anonPrefix: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").slice(0, 15),
      servicePrefix: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").slice(0, 10),
      resendPrefix: (process.env.RESEND_API_KEY ?? "").slice(0, 5),
      mailFrom: process.env.MAIL_FROM ?? null,
      appBaseUrl: process.env.APP_BASE_URL ?? null,
    };

    // harte ENV Checks (damit Fehler eindeutig sind)
    if (!envDiag.supabaseUrl?.endsWith(".supabase.co")) {
      return NextResponse.json(
        {
          error: "env error",
          detail: "NEXT_PUBLIC_SUPABASE_URL is missing or not a *.supabase.co URL",
          envDiag,
        },
        { status: 500 }
      );
    }
    if (!envDiag.servicePrefix.startsWith("sb_secret_")) {
      return NextResponse.json(
        {
          error: "env error",
          detail: "SUPABASE_SERVICE_ROLE_KEY must start with sb_secret_",
          envDiag,
        },
        { status: 500 }
      );
    }
    if (!envDiag.resendPrefix.startsWith("re_")) {
      return NextResponse.json(
        {
          error: "env error",
          detail: "RESEND_API_KEY must start with re_",
          envDiag,
        },
        { status: 500 }
      );
    }
    if (!envDiag.mailFrom) {
      return NextResponse.json(
        { error: "env error", detail: "MAIL_FROM is missing", envDiag },
        { status: 500 }
      );
    }
    if (!envDiag.appBaseUrl) {
      return NextResponse.json(
        { error: "env error", detail: "APP_BASE_URL is missing", envDiag },
        { status: 500 }
      );
    }

    const APP_BASE_URL = sanitizeBaseUrl(process.env.APP_BASE_URL!);

    // Supabase (Service Role!)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Resend
    const resend = new Resend(process.env.RESEND_API_KEY!);

    /**
     * Zeitfenster:
     * - wir senden Reminder für Termine, die zwischen "jetzt" und "in 24h" starten
     * - und nur wenn reminder_sent_at NULL ist
     */
    const now = new Date();
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 1) Buchungen holen (nur minimal nötig)
    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select("id,user_id,slot_id,service_id,status,reminder_sent_at")
      .eq("status", "BOOKED")
      .is("reminder_sent_at", null);

    if (bErr) {
      return NextResponse.json(
        { error: "database error (bookings)", detail: bErr.message, envDiag },
        { status: 500 }
      );
    }

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, details: [], envDiag });
    }

    // 2) Slots & Services in Bulk laden
    const slotIds = [...new Set(bookings.map((b) => b.slot_id).filter(Boolean))];
    const serviceIds = [...new Set(bookings.map((b) => b.service_id).filter(Boolean))];

    if (slotIds.length === 0 || serviceIds.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        details: [],
        envDiag,
        note: "No slotIds or serviceIds found on bookings.",
      });
    }

    const { data: slots, error: sErr } = await supabase
      .from("slots")
      .select("id,starts_at")
      .in("id", slotIds);

    if (sErr) {
      return NextResponse.json(
        { error: "database error (slots)", detail: sErr.message, envDiag },
        { status: 500 }
      );
    }

    const { data: services, error: svErr } = await supabase
      .from("services")
      .select("id,name")
      .in("id", serviceIds);

    if (svErr) {
      return NextResponse.json(
        { error: "database error (services)", detail: svErr.message, envDiag },
        { status: 500 }
      );
    }

    const slotMap = new Map((slots ?? []).map((s) => [s.id, s]));
    const serviceMap = new Map((services ?? []).map((s) => [s.id, s]));

    let sent = 0;
    const details: Array<{
      bookingId: string;
      email: string;
      when: string;
      serviceName: string;
    }> = [];

    // 3) Emails senden
    for (const b of bookings) {
      const slot = slotMap.get(b.slot_id);
      if (!slot?.starts_at) continue;

      const starts = new Date(slot.starts_at);
      if (starts < now || starts > in24h) continue;

      // User email via Admin API
      const { data: userRes, error: uErr } = await supabase.auth.admin.getUserById(b.user_id);
      if (uErr) continue;

      const email = userRes.user?.email;
      if (!email) continue;

      const serviceName = serviceMap.get(b.service_id)?.name ?? "Studientermin";
      const when = fmt(slot.starts_at);

      const sendRes = await resend.emails.send({
        from: process.env.MAIL_FROM!,
        to: email,
        subject: "Erinnerung: Studientermin",
        text: `Dies ist eine automatische Erinnerung an Ihren Studientermin.

Leistung: ${serviceName}
Zeit: ${when}

Umbuchen/Stornieren:
${APP_BASE_URL}/dashboard
`,
      });

      if (sendRes.error) continue;

      // 4) als gesendet markieren
      await supabase
        .from("bookings")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", b.id);

      sent++;
      details.push({ bookingId: b.id, email, when, serviceName });
    }

    return NextResponse.json({ ok: true, sent, details, envDiag });
  } catch (e: any) {
    return NextResponse.json(
      { error: "internal error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
