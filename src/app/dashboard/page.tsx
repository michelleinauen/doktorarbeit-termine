'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

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

function labelMod(m: "US" | "MRI") {
  return m === "US" ? "Ultraschall" : "MRI";
}

export default function DashboardPage() {
  const supabase = supabaseBrowser();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const bookedByService = useMemo(() => {
    const m = new Map<string, BookingRow>();
    for (const b of bookings) {
      if (b.status === "BOOKED") m.set(b.service_id, b);
    }
    return m;
  }, [bookings]);

  const progress = useMemo(() => {
    const total = services.length;
    const done = services.filter((s) => bookedByService.has(s.id)).length;
    return { total, done };
  }, [services, bookedByService]);

  const grouped = useMemo(() => {
    const baseline = services.filter((s) => s.visit_kind === "BASELINE");
    const followup = services.filter((s) => s.visit_kind === "FOLLOWUP");
    const modOrder = (x: Service) => (x.modality === "US" ? 0 : 1);
    baseline.sort((a, b) => modOrder(a) - modOrder(b));
    followup.sort((a, b) => modOrder(a) - modOrder(b));
    return { baseline, followup };
  }, [services]);

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
        const phaseOrder = (x: Service) => (x.visit_kind === "BASELINE" ? 0 : 1);
        const modOrder = (x: Service) => (x.modality === "US" ? 0 : 1);
        return phaseOrder(a) - phaseOrder(b) || modOrder(a) - modOrder(b);
      });
      setServices(sorted);
    }

    const my = await supabase.rpc("get_my_bookings");
    if (!my.error) setBookings(my.data as BookingRow[]);

    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function cancel(bookingId: string) {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
      .eq("id", bookingId);

    if (error) alert(error.message);
    else load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading)
    return (
      <main style={{ padding: 16, maxWidth: 860, margin: "40px auto" }}>
        Lade…
      </main>
    );

  if (!userEmail) {
    return (
      <main style={{ padding: 16, maxWidth: 860, margin: "40px auto" }}>
        <p>Bitte zuerst einloggen.</p>
        <Link href="/login">Zum Login</Link>
      </main>
    );
  }

  function Section({
    subtitle,
    items,
    topMargin,
  }: {
    subtitle: string;
    items: Service[];
    topMargin: number;
  }) {
    return (
      <div style={{ marginTop: topMargin }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
          {subtitle}
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {items.map((s) => {
            const b = bookedByService.get(s.id);
            const isBooked = !!b;

            return (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  columnGap: 18,
                  rowGap: 8,
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 12,
                  padding: 14,
                  background: isBooked ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.03)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{s.name}</div>
                  <div style={{ opacity: 0.8 }}>
                    {labelMod(s.modality)} · Dauer 1h
                  </div>
                  <div style={{ marginTop: 8, opacity: 0.9 }}>
                    Status:{" "}
                    <b>{isBooked ? `gebucht (${fmtStart(b!.starts_at)})` : "noch nicht gebucht"}</b>
                  </div>
                </div>

                {!b ? (
                  <Link
                    href={`/book/${s.id}`}
                    style={{ textDecoration: "underline", fontWeight: 700, fontSize: 16 }}
                  >
                    Termin wählen
                  </Link>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                      textAlign: "right",
                    }}
                  >
                    <Link href={`/reschedule/${b.booking_id}`} style={{ textDecoration: "underline" }}>
                      Umbuchen
                    </Link>
                    <button onClick={() => cancel(b.booking_id)} style={{ padding: "8px 10px" }}>
                      Stornieren
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 860, margin: "40px auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Studientermine – Übersicht</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>Eingeloggt als: {userEmail}</p>
          <p style={{ marginTop: 6 }}>
            Fortschritt: <b>{progress.done}</b> / <b>{progress.total}</b> gebucht
          </p>
        </div>
        <button onClick={logout} style={{ padding: 10 }}>
          Logout
        </button>
      </div>

      <Section
        subtitle="Buchen Sie 2 Termine vor Therapiebeginn:"
        items={grouped.baseline}
        topMargin={22}
      />

      {/* Mehr Abstand zwischen den beiden Blöcken */}
      <Section
        subtitle="Buchen Sie 2 Termine 3.5 Monate nach Therapiebeginn:"
        items={grouped.followup}
        topMargin={46}
      />

      <div style={{ marginTop: 28 }}>
        <Link href="/admin/slots" style={{ display: "block", marginBottom: 8 }}>
          Admin: Slots verwalten
        </Link>

        <Link href="/admin/bookings" style={{ display: "block" }}>
          Admin: Buchungsübersicht
        </Link>
      </div>
    </main>
  );
}
