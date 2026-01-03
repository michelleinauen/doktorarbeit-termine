"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

function fmtStart(dt: string) {
  return new Date(dt).toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "short",
    timeStyle: "short",

  });
}

export default function BookServicePage() {
  const supabase = supabaseBrowser();
  const params = useParams<{ serviceId: string }>();
  const serviceId = params.serviceId;

  const [serviceName, setServiceName] = useState<string>("");
  const [slots, setSlots] = useState<{ slot_id: string; starts_at: string; ends_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingNow, setBookingNow] = useState<string | null>(null);

  async function load() {
    setLoading(true);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    const sv = await supabase.from("services").select("name").eq("id", serviceId).single();
    if (!sv.error) setServiceName(sv.data.name);

    const av = await supabase.rpc("get_available_slots", { p_service_id: serviceId });
    if (!av.error) setSlots(av.data);

    setLoading(false);
  }

  async function book(slotId: string) {
    setBookingNow(slotId);

    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase.from("bookings").insert({
      user_id: user.id,
      service_id: serviceId,
      slot_id: slotId,
      status: "BOOKED",
    });

    if (error) {
      // Postgres unique_violation (Slot oder one_per_service_per_user)
      const code = (error as any).code;
      if (code === "23505") {
        alert("Dieser Slot wurde soeben gebucht oder Sie haben diese Leistung bereits gebucht. Bitte wählen Sie einen anderen Termin!");
        await load(); // Liste aktualisieren (Slot verschwindet)
      } else {
        alert(error.message);
      }
      setBookingNow(null);
      return;
    }

    window.location.href = "/dashboard";
  }

  useEffect(() => {
    if (serviceId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  if (loading) return <main style={{ padding: 16, maxWidth: 820, margin: "40px auto" }}>Lade…</main>;

  return (
    <main style={{ padding: 16, maxWidth: 820, margin: "40px auto" }}>
      <Link href="/dashboard">← zurück</Link>
      <h1 style={{ marginTop: 12, fontSize: 20, fontWeight: 700 }}>{serviceName}</h1>
      <p style={{ marginTop: 8, opacity: 0.85 }}>Bitte wählen Sie einen freien Termin (Dauer: 1 Stunde).</p>

      {slots.length === 0 ? (
        <p style={{ marginTop: 14 }}>Aktuell keine freien Slots verfügbar!</p>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {slots.map((s) => (
            <div
              key={s.slot_id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <b>{fmtStart(s.starts_at)}</b>
              </div>
              <button
                onClick={() => book(s.slot_id)}
                disabled={bookingNow === s.slot_id}
                style={{ padding: "10px 12px", opacity: bookingNow === s.slot_id ? 0.7 : 1 }}
              >
                {bookingNow === s.slot_id ? "Buche…" : "Buchen"}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
