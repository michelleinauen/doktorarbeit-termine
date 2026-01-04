'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

/* =========================
   ADMIN KONFIGURATION
========================= */
const ADMIN_EMAILS = [
  "michelle.inauen@hotmail.com",
  "login@study-booking.ch",
];

/* =========================
   TYPEN
========================= */
type Service = {
  id: string;
  name: string;
  modality: "US" | "MRI";
  visit_kind: "BASELINE" | "FOLLOWUP";
};

type BookingRow = {
  booking_id: string;
  status: "BOOKED" | "CANCELLED";
  service_id: string;
  service_name: string;
  modality: "US" | "MRI";
  visit_kind: "BASELINE" | "FOLLOWUP";
  slot_id: string;
  starts_at: string;
  ends_at: string;
};

/* =========================
   HELPER
========================= */
function fmtStart(dt: string) {
  return new Date(dt).toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelPhase(vk: "BASELINE" | "FOLLOWUP") {
  return vk === "BASELINE"
    ? "Vor Therapie (Baseline)"
    : "Nach Therapie (Kontrolle)";
}

function labelMod(m: "US" | "MRI") {
  return m === "US" ? "Ultraschall" : "MRI";
}

/* =========================
   PAGE
========================= */
export default function DashboardPage() {
  const supabase = supabaseBrowser();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================
     ADMIN CHECK
  ========================= */
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail);

  /* =========================
     BUCHUNGEN PRO SERVICE
  ========================= */
  const bookedByService = useMemo(() => {
    const m = new Map<string, BookingRow>();
    for (const b of bookings) {
      if (b.status === "BOOKED") m.set(b.service_id, b);
    }
    return m;
  }, [bookings]);

  /* =========================
     LOAD
  ========================= */
  async function load() {
    setLoading(true);

    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    setUserEmail(user.email ?? null);

    const sv = await supabase
      .from("services")
      .select("id,name,modality,visit_kind")
      .eq("active", true);

    if (!sv.error) {
      const sorted = (sv.data as Service[]).sort((a, b) => {
        const phase = (x: Service) => (x.visit_kind === "BASELINE" ? 0 : 1);
        const mod = (x: Service) => (x.modality === "US" ? 0 : 1);
        return phase(a) - phase(b) || mod(a) - mod(b);
      });
      setServices(sorted);
    }

    const my = await supabase.rpc("get_my_bookings");
    if (!my.error) setBookings(my.data as BookingRow[]);

    setLoading(false);
  }

  /* =========================
     ACTIONS
  ========================= */
  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function cancel(bookingId: string) {
    const { error } = await supabase
      .from("bookings")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (error) alert(error.message);
    else load();
  }

  useEffect(() => {
    load();
  }, []);

  /* =========================
     STATES
  ========================= */
  if (loading) {
    return (
      <main style={{ padding: 16, maxWidth: 860, margin: "40px auto" }}>
        Lade…
      </main>
    );
  }

  if (!userEmail) {
    return (
      <main style={{ padding: 16, maxWidth: 860, margin: "40px auto" }}>
        <p>Bitte zuerst einloggen.</p>
        <Link href="/login">Zum Login</Link>
      </main>
    );
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <main style={{ padding: 16, maxWidth: 860, margin: "40px auto" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>
            Studientermine – Übersicht
          </h1>
          <p style={{ opacity: 0.85 }}>
            Eingeloggt als: {userEmail}
            {isAdmin && (
              <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.6 }}>
                (Administrator)
              </span>
            )}
          </p>
        </div>
        <button onClick={logout} style={{ padding: 10 }}>
          Logout
        </button>
      </div>

      {/* =========================
          VOR THERAPIE
      ========================= */}
      <h2 style={{ marginTop: 28, fontSize: 18, fontWeight: 700 }}>
        Untersuchungen vor Therapiebeginn
      </h2>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {services
          .filter((s) => s.visit_kind === "BASELINE")
          .map((s) => {
            const b = bookedByService.get(s.id);
            return (
              <ServiceCard
                key={s.id}
                service={s}
                booking={b}
                onCancel={cancel}
              />
            );
          })}
      </div>

      {/* =========================
          NACH THERAPIE
      ========================= */}
      <h2 style={{ marginTop: 40, fontSize: 18, fontWeight: 700 }}>
        Untersuchungen nach Therapie (Kontrolle)
      </h2>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {services
          .filter((s) => s.visit_kind === "FOLLOWUP")
          .map((s) => {
            const b = bookedByService.get(s.id);
            return (
              <ServiceCard
                key={s.id}
                service={s}
                booking={b}
                onCancel={cancel}
              />
            );
          })}
      </div>

      {/* =========================
          ADMIN LINKS (NUR ADMIN)
      ========================= */}
      {isAdmin && (
        <div style={{ marginTop: 40 }}>
          <Link href="/admin/slots" style={{ display: "block", marginBottom: 8 }}>
            Admin: Slots verwalten
          </Link>
          <Link href="/admin/bookings">
            Admin: Buchungsübersicht
          </Link>
        </div>
      )}
    </main>
  );
}

/* =========================
   SERVICE CARD
========================= */
function ServiceCard({
  service,
  booking,
  onCancel,
}: {
  service: Service;
  booking?: BookingRow;
  onCancel: (id: string) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.16)",
        borderRadius: 12,
        padding: 12,
        background: booking
          ? "rgba(34,197,94,0.18)"
          : "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{service.name}</div>
          <div style={{ opacity: 0.8 }}>
            {labelMod(service.modality)} · Dauer 1h
          </div>
        </div>

        {!booking ? (
          <Link href={`/book/${service.id}`}>Termin wählen</Link>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <b>{fmtStart(booking.starts_at)}</b>
            <Link href={`/reschedule/${booking.booking_id}`}>Umbuchen</Link>
            <button onClick={() => onCancel(booking.booking_id)}>
              Stornieren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
