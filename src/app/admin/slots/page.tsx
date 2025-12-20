"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Service = { id: string; name: string };
type SlotRow = { id: string; service_id: string; starts_at: string; ends_at: string };

function addOneHour(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() + 60 * 60 * 1000).toISOString();
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString("de-CH", { timeZone: "Europe/Zurich" });
}

export default function AdminSlotsPage() {
  const supabase = supabaseBrowser();
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState<string>("");
  const [startsAtLocal, setStartsAtLocal] = useState<string>("");
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const canCreate = useMemo(() => !!serviceId && !!startsAtLocal, [serviceId, startsAtLocal]);

  async function load() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    // admin check
    const prof = await supabase.from("profiles").select("is_admin").eq("id", session.session.user.id).single();
    if (prof.error || !prof.data.is_admin) {
      setIsAdmin(false);
      return;
    }
    setIsAdmin(true);

    const sv = await supabase.from("services").select("id,name").eq("active", true).order("name");
    if (!sv.error) {
      setServices(sv.data as Service[]);
      if (!serviceId && sv.data.length) setServiceId(sv.data[0].id);
    }

    const sl = await supabase.from("slots").select("id,service_id,starts_at,ends_at").order("starts_at", { ascending: true });
    if (!sl.error) setSlots(sl.data as SlotRow[]);
  }

  async function createSlot() {
    // startsAtLocal ist "YYYY-MM-DDTHH:mm" in Browser-Lokalzeit → als Date interpretieren
    const start = new Date(startsAtLocal);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;

    const { error } = await supabase.from("slots").insert({
      service_id: serviceId,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      capacity: 1,
      created_by: user?.id ?? null,
    });

    if (error) alert(error.message);
    else {
      setStartsAtLocal("");
      load();
    }
  }

  async function deleteSlot(slotId: string) {
    // Nur löschen, wenn niemand gebucht hat (sonst DB-Integrität/Studienlogik)
    const b = await supabase.from("bookings").select("id").eq("slot_id", slotId).eq("status", "BOOKED").limit(1);
    if (!b.error && (b.data?.length ?? 0) > 0) {
      alert("Slot kann nicht gelöscht werden: es existiert eine aktive Buchung.");
      return;
    }

    const { error } = await supabase.from("slots").delete().eq("id", slotId);
    if (error) alert(error.message);
    else load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin) {
    return (
      <main style={{ padding: 16, maxWidth: 820, margin: "40px auto" }}>
        <Link href="/dashboard">← zurück</Link>
        <h1 style={{ marginTop: 12, fontSize: 20, fontWeight: 700 }}>Admin: Slots</h1>
        <p style={{ marginTop: 10 }}>Kein Admin-Zugriff.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "40px auto" }}>
      <Link href="/dashboard">← zurück</Link>
      <h1 style={{ marginTop: 12, fontSize: 20, fontWeight: 700 }}>Admin: Slots verwalten</h1>

      <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Neuen Slot anlegen (Dauer 1h)</h2>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <label>
            Dienstleistung
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} style={{ width: "100%", padding: 10, marginTop: 6 }}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label>
            Start (lokale Zeit)
            <input
              type="datetime-local"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <button onClick={createSlot} disabled={!canCreate} style={{ padding: 10 }}>
            Slot erstellen
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: 18, fontSize: 16, fontWeight: 700 }}>Alle Slots</h2>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {slots.map((s) => (
          <div key={s.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{services.find(x => x.id === s.service_id)?.name ?? s.service_id}</div>
              <div>{fmt(s.starts_at)} – {fmt(s.ends_at)}</div>
            </div>
            <button onClick={() => deleteSlot(s.id)} style={{ padding: "10px 12px" }}>
              Löschen
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
