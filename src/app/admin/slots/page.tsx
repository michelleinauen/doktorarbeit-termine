"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Service = {
  id: string;
  name: string;
  modality: "US" | "MRI";
  visit_kind: "BASELINE" | "FOLLOWUP";
  active: boolean;
};

type AdminSlotRow = {
  slot_id: string;
  service_id: string;
  service_name: string;
  modality: string; // "US" | "MRI"
  visit_kind: string; // "BASELINE" | "FOLLOWUP"
  starts_at: string;
  ends_at: string;
  active: boolean;
  booked: boolean;
  booked_by_email: string | null;
  booking_id: string | null;
};

const ADMIN_EMAILS = ["michelle.inauen@hotmail.com", "login@study-booking.ch"];

function fmtRange(startsAt: string, endsAt: string) {
  const s = new Date(startsAt).toLocaleString("de-CH", { timeZone: "Europe/Zurich" });
  const e = new Date(endsAt).toLocaleString("de-CH", { timeZone: "Europe/Zurich" });
  return `${s} — ${e}`;
}

function labelPhase(vk: string) {
  return vk === "BASELINE" ? "Vor Therapie" : "Nach Therapie";
}

function labelMod(m: string) {
  return m === "US" ? "Ultraschall" : "MRI";
}

// datetime-local (Europe/Zurich) -> ISO string
function toIsoFromLocalDateTime(dtLocal: string) {
  // dtLocal kommt als "YYYY-MM-DDTHH:mm"
  // new Date(dtLocal) interpretiert als lokale TZ des Browsers; passt für Europe/Zurich User.
  // Falls dein Browser nicht Europe/Zurich ist, sag kurz Bescheid, dann machen wir es TZ-sicherer.
  const d = new Date(dtLocal);
  return d.toISOString();
}

function addMinutesIso(iso: string, minutes: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export default function AdminSlotsPage() {
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  const [services, setServices] = useState<Service[]>([]);
  const [rows, setRows] = useState<AdminSlotRow[]>([]);

  const [hideInactive, setHideInactive] = useState(true);
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);

  // Create form state
  const [creating, setCreating] = useState(false);
  const [newServiceId, setNewServiceId] = useState<string>("");
  const [newStartsAtLocal, setNewStartsAtLocal] = useState<string>(""); // datetime-local
  const [durationMin, setDurationMin] = useState<number>(60);

  const visible = useMemo(() => {
    if (!hideInactive) return rows;
    return rows.filter((r) => r.active);
  }, [rows, hideInactive]);

  const activeServicesSorted = useMemo(() => {
    const a = services.filter((s) => s.active !== false);
    // Baseline zuerst, dann Followup; innerhalb: US dann MRI
    return a.sort((x, y) => {
      const phaseOrder = (s: Service) => (s.visit_kind === "BASELINE" ? 0 : 1);
      const modOrder = (s: Service) => (s.modality === "US" ? 0 : 1);
      return phaseOrder(x) - phaseOrder(y) || modOrder(x) - modOrder(y) || x.name.localeCompare(y.name);
    });
  }, [services]);

  async function guardAdmin() {
    const { data: sessionRes } = await supabase.auth.getSession();
    const user = sessionRes.session?.user;

    if (!user) {
      window.location.href = "/login";
      return { ok: false };
    }

    const email = user.email ?? "";
    if (!ADMIN_EMAILS.includes(email)) {
      setUnauthorized(true);
      return { ok: false };
    }

    return { ok: true };
  }

  async function load() {
    setLoading(true);

    const g = await guardAdmin();
    if (!g.ok) {
      setLoading(false);
      return;
    }

    // Services laden (für neues Slot Formular)
    const sv = await supabase
      .from("services")
      .select("id,name,modality,visit_kind,active")
      .order("name", { ascending: true });

    if (sv.error) {
      alert("Fehler Services: " + sv.error.message);
      setLoading(false);
      return;
    }
    setServices((sv.data ?? []) as Service[]);

    // Slots overview laden
    const { data, error } = await supabase.rpc("get_admin_slots_overview");
    if (error) {
      alert("Fehler beim Laden: " + error.message);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as AdminSlotRow[]);
    setLoading(false);
  }

  async function disableSlot(slotId: string) {
    const row = rows.find((r) => r.slot_id === slotId);
    const msg = row?.booked
      ? `Dieser Slot ist aktuell gebucht von ${row.booked_by_email ?? "unbekannt"}. Beim Löschen wird die Buchung automatisch storniert und der Slot deaktiviert. Fortfahren?`
      : "Slot deaktivieren (löschen)?";

    if (!confirm(msg)) return;

    setSavingSlotId(slotId);

    const { error } = await supabase.rpc("admin_disable_slot", { p_slot_id: slotId });

    if (error) {
      alert(error.message);
      setSavingSlotId(null);
      return;
    }

    await load();
    setSavingSlotId(null);
  }

  async function createSlot() {
    // Basic validation
    if (!newServiceId) {
      alert("Bitte Service auswählen.");
      return;
    }
    if (!newStartsAtLocal) {
      alert("Bitte Startdatum/-zeit wählen.");
      return;
    }
    if (!durationMin || durationMin < 5) {
      alert("Bitte eine sinnvolle Dauer wählen (mind. 5 Minuten).");
      return;
    }

    setCreating(true);

    try {
      const startsIso = toIsoFromLocalDateTime(newStartsAtLocal);
      const endsIso = addMinutesIso(startsIso, durationMin);

      const { error } = await supabase.from("slots").insert({
        service_id: newServiceId,
        starts_at: startsIso,
        ends_at: endsIso,
        active: true,
      });

      if (error) {
        alert("Fehler beim Erstellen: " + error.message);
        setCreating(false);
        return;
      }

      // reset form
      setNewStartsAtLocal("");
      setDurationMin(60);

      await load();
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 16, maxWidth: 1100, margin: "40px auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Admin – Slots</h1>
        <p style={{ marginTop: 12 }}>Lade…</p>
      </main>
    );
  }

  if (unauthorized) {
    return (
      <main style={{ padding: 16, maxWidth: 800, margin: "40px auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Kein Zugriff</h1>
        <p style={{ marginTop: 12 }}>Diese Seite ist nur für Administrator:innen.</p>
        <div style={{ marginTop: 12 }}>
          <Link href="/dashboard">← zurück</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 1100, margin: "40px auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Admin – Slots verwalten</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>
            {visible.length} Slots in Ansicht (gesamt: {rows.length})
          </p>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={hideInactive}
            onChange={(e) => setHideInactive(e.target.checked)}
          />
          Inaktive ausblenden
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <Link href="/dashboard">← zurück</Link>
      </div>

      {/* CREATE SLOT */}
      <section
        style={{
          marginTop: 16,
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: 12,
          padding: 12,
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Neuen Slot hinzufügen</h2>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1.2fr 1fr 0.7fr auto" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Service</div>
            <select
              value={newServiceId}
              onChange={(e) => setNewServiceId(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            >
              <option value="">Bitte wählen…</option>
              {activeServicesSorted.map((s) => (
                <option key={s.id} value={s.id}>
                  {labelPhase(s.visit_kind)} · {labelMod(s.modality)} — {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Start (Zürich)</div>
            <input
              type="datetime-local"
              value={newStartsAtLocal}
              onChange={(e) => setNewStartsAtLocal(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Dauer (Min.)</div>
            <input
              type="number"
              min={5}
              step={5}
              value={durationMin}
              onChange={(e) => setDurationMin(parseInt(e.target.value || "60", 10))}
              style={{ width: "100%", padding: 10 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "end" }}>
            <button
              onClick={createSlot}
              disabled={creating}
              style={{ padding: "10px 14px", opacity: creating ? 0.7 : 1, minWidth: 150 }}
            >
              {creating ? "Erstelle…" : "Slot hinzufügen"}
            </button>
          </div>
        </div>

        <p style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Hinweis: “Löschen” deaktiviert Slots (active=false) und storniert ggf. aktive Buchungen automatisch.
        </p>
      </section>

      {/* LIST */}
      {visible.length === 0 ? (
        <p style={{ marginTop: 16 }}>Keine Slots in dieser Ansicht.</p>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {visible.map((r) => {
            const badge = r.booked
              ? {
                  text: `GEBUCHT: ${r.booked_by_email ?? "?"}`,
                  bg: "rgba(234,179,8,0.18)",
                  bd: "rgba(234,179,8,0.35)",
                }
              : {
                  text: "FREI",
                  bg: "rgba(34,197,94,0.18)",
                  bd: "rgba(34,197,94,0.35)",
                };

            return (
              <div
                key={r.slot_id}
                style={{
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(255,255,255,0.03)",
                  opacity: r.active ? 1 : 0.6,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {r.service_name} · {labelMod(r.modality)} · {labelPhase(r.visit_kind)}
                    </div>
                    <div style={{ marginTop: 6, opacity: 0.9 }}>{fmtRange(r.starts_at, r.ends_at)}</div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          border: `1px solid ${badge.bd}`,
                          background: badge.bg,
                          letterSpacing: 0.3,
                        }}
                      >
                        {badge.text}
                      </span>

                      {!r.active && (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            border: "1px solid rgba(255,255,255,0.25)",
                            background: "rgba(255,255,255,0.06)",
                            letterSpacing: 0.3,
                          }}
                        >
                          INAKTIV
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    <button
                      onClick={() => disableSlot(r.slot_id)}
                      disabled={savingSlotId === r.slot_id}
                      style={{
                        padding: "10px 12px",
                        opacity: savingSlotId === r.slot_id ? 0.6 : 1,
                        minWidth: 120,
                      }}
                    >
                      {savingSlotId === r.slot_id ? "…" : "Löschen"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
