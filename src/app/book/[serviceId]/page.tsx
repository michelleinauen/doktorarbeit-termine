"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

function fmt(dt: string) {
  return new Date(dt).toLocaleString("de-CH", { timeZone: "Europe/Zurich" });
}

export default function BookServicePage() {
  const supabase = supabaseBrowser();
  const params = useParams<{ serviceId: string }>();
  const serviceId = params.serviceId;

  const [serviceName, setServiceName] = useState<string>("");
  const [slots, setSlots] = useState<{ slot_id: string; starts_at: string; ends_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

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
    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;
    if (!user) return;

    const { error } = await supabase.from("bookings").insert({
      user_id: user.id,
      service_id: serviceId,
      slot_id: slotId,
      status: "BOOKED",
    });

    if (error) {
      alert(error.message);
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
      <p style={{ marginTop: 8, opacity: 0.85 }}>
        Bitte wählen Sie einen freien Termin (Dauer: 1 Stunde).
      </p>

      {slots.length === 0 ? (
        <p style={{ marginTop: 14 }}>Aktuell keine freien Slots verfügbar.</p>
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
                <b>{fmt(s.starts_at)}</b>
                <div style={{ opacity: 0.8 }}>bis {fmt(s.ends_at)}</div>
              </div>
              <button onClick={() => book(s.slot_id)} style={{ padding: "10px 12px" }}>
                Buchen
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
