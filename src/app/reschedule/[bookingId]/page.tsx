"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

function fmtStart(dt: string) {
  return new Date(dt).toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ReschedulePage({ params }: { params: { bookingId: string } }) {
  const supabase = supabaseBrowser();
  const bookingId = params.bookingId;

  const [serviceName, setServiceName] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [slots, setSlots] = useState<{ slot_id: string; starts_at: string; ends_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    // booking holen
    const b = await supabase.from("bookings").select("service_id,status").eq("id", bookingId).single();
    if (b.error) {
      alert(b.error.message);
      window.location.href = "/dashboard";
      return;
    }
    if (b.data.status !== "BOOKED") {
      alert("Diese Buchung ist nicht mehr aktiv und kann nicht umgebucht werden.");
      window.location.href = "/dashboard";
      return;
    }

    setServiceId(b.data.service_id);

    const sv = await supabase.from("services").select("name").eq("id", b.data.service_id).single();
    if (!sv.error) setServiceName(sv.data.name);

    const av = await supabase.rpc("get_available_slots", { p_service_id: b.data.service_id });
    if (!av.error) setSlots(av.data);

    setLoading(false);
  }

  async function reschedule(newSlotId: string) {
    setSaving(newSlotId);

    // ✅ Atomar umbuchen via RPC
    const { error } = await supabase.rpc("reschedule_booking", {
      p_booking_id: bookingId,
      p_new_slot_id: newSlotId,
    });

    if (error) {
      const msg = error.message?.toLowerCase?.() ?? "";

      if (msg.includes("slot already booked") || (error as any).code === "23505") {
        alert("Dieser Slot wurde soeben von jemand anderem gebucht. Bitte wählen Sie einen anderen Termin.");
        await load(); // Liste aktualisieren
      } else {
        alert(error.message);
      }
      setSaving(null);
      return;
    }

    window.location.href = "/dashboard";
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <main style={{ padding: 16, maxWidth: 820, margin: "40px auto" }}>Lade…</main>;

  return (
    <main style={{ padding: 16, maxWidth: 820, margin: "40px auto" }}>
      <Link href="/dashboard">← zurück</Link>
      <h1 style={{ marginTop: 12, fontSize: 20, fontWeight: 700 }}>Umbuchen</h1>
      <p style={{ marginTop: 8 }}>
        Leistung: <b>{serviceName}</b>
      </p>

      {slots.length === 0 ? (
        <p style={{ marginTop: 14 }}>Aktuell keine alternativen Slots verfügbar.</p>
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
                onClick={() => reschedule(s.slot_id)}
                disabled={saving === s.slot_id}
                style={{ padding: "10px 12px", opacity: saving === s.slot_id ? 0.7 : 1 }}
              >
                {saving === s.slot_id ? "Speichere…" : "Auf diesen Slot umbuchen"}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
