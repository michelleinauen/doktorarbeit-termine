"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

function fmt(dt: string) {
  return new Date(dt).toLocaleString("de-CH", { timeZone: "Europe/Zurich" });
}

type SlotRow = {
  slot_id: string;
  starts_at: string;
  ends_at: string;
};

export default function ReschedulePage() {
  const supabase = supabaseBrowser();

  // ✅ In Client Components: params via hook
  const params = useParams<{ bookingId: string }>();
  const bookingId = params?.bookingId;

  const [serviceName, setServiceName] = useState<string>("");
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    if (!bookingId || bookingId === "undefined") {
      alert("bookingId fehlt.");
      window.location.href = "/dashboard";
      return;
    }

    // Booking holen
    const b = await supabase.from("bookings").select("service_id").eq("id", bookingId).single();
    if (b.error || !b.data?.service_id) {
      alert(b.error?.message ?? "Booking nicht gefunden.");
      window.location.href = "/dashboard";
      return;
    }

    // Service Name
    const sv = await supabase.from("services").select("name").eq("id", b.data.service_id).single();
    if (!sv.error && sv.data?.name) setServiceName(sv.data.name);

    // Slots via RPC
    const av = await supabase.rpc("get_available_slots", { p_service_id: b.data.service_id });
    if (av.error) {
      alert(av.error.message);
      setSlots([]);
      setLoading(false);
      return;
    }

    // normalize: RPC liefert evtl. id statt slot_id
    const normalized: SlotRow[] = (av.data ?? [])
      .map((r: any) => ({
        slot_id: r.slot_id ?? r.id,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
      }))
      .filter((r: SlotRow) => !!r.slot_id);

    setSlots(normalized);
    setLoading(false);
  }

  async function reschedule(newSlotId: string) {
    if (!bookingId) {
      alert("bookingId fehlt.");
      return;
    }
    if (!newSlotId) {
      alert("slotId fehlt.");
      return;
    }

    const { error } = await supabase
      .from("bookings")
      .update({ slot_id: newSlotId, reminder_sent_at: null })
      .eq("id", bookingId);

    if (error) {
      alert(error.message);
      return;
    }

    window.location.href = "/dashboard";
  }

  useEffect(() => {
    // wartet kurz, bis bookingId verfügbar ist
    if (bookingId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

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
                <b>{fmt(s.starts_at)}</b>
                <div style={{ opacity: 0.8 }}>bis {fmt(s.ends_at)}</div>
              </div>
              <button onClick={() => reschedule(s.slot_id)} style={{ padding: "10px 12px" }}>
                Auf diesen Slot umbuchen
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
