"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

type SlotRow = {
  slot_id: string;
  starts_at: string;
  ends_at: string;
};

function fmtStart(dt: string) {
  return new Date(dt).toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ReschedulePage({
  params,
}: {
  params: { bookingId?: string };
}) {
  const supabase = supabaseBrowser();
  const bookingId = params?.bookingId;

  const [serviceName, setServiceName] = useState<string>("");
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);

    // 1) Param-Guard: verhindert "uuid: undefined"
    if (!bookingId || bookingId === "undefined") {
      alert("Fehlender Booking-ID Parameter. Bitte zurück zum Dashboard und erneut umbuchen.");
      window.location.href = "/dashboard";
      return;
    }

    // 2) Session prüfen
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    // 3) Booking laden (inkl. service_id)
    const b = await supabase
      .from("bookings")
      .select("service_id,status")
      .eq("id", bookingId)
      .single();

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

    // 4) Service-Namen laden
    const sv = await supabase
      .from("services")
      .select("name")
      .eq("id", b.data.service_id)
      .single();

    if (!sv.error) setServiceName(sv.data.name ?? "");

    // 5) Freie Slots laden (nur freie, kommende Slots)
    const av = await supabase.rpc("get_available_slots", {
      p_service_id: b.data.service_id,
    });

    if (av.error) {
      alert(av.error.message);
      setLoading(false);
      return;
    }

    setSlots((av.data ?? []) as SlotRow[]);
    setLoading(false);
  }

  async function reschedule(newSlotId: string) {
    if (!bookingId) return;

    setSaving(newSlotId);

    const { error } = await supabase.rpc("reschedule_booking", {
      p_booking_id: bookingId,
      p_new_slot_id: newSlotId,
    });

    if (error) {
      const msg = (error.message ?? "").toLowerCase();

      // Konflikt / Unique violation: Slot inzwischen vergeben
      if (msg.includes("slot already booked") || (error as any).code === "23505") {
        alert("Dieser Slot wurde soeben von jemand anderem gebucht. Bitte wählen Sie einen anderen Termin.");
        setSaving(null);
        await load();
        return;
      }

      alert(error.message);
      setSaving(null);
      return;
    }

    window.location.href = "/dashboard";
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 16, maxWidth: 820, margin: "40px auto" }}>
        Lade…
      </main>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 820, margin: "40px auto" }}>
      <Link href="/dashboard">← zurück</Link>

      <h1 style={{ marginTop: 12, fontSize: 20, fontWeight: 700 }}>Umbuchen</h1>

      <p style={{ marginTop: 8 }}>
        Leistung: <b>{serviceName || "—"}</b>
      </p>

      {slots.length === 0 ? (
        <p style={{ marginTop: 14 }}>Aktuell keine alternativen Slots verfügbar.</p>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {slots.map((s) => (
            <div
              key={s.slot_id}
              style={{
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                background: "rgba(255,255,255,0.03)",
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
