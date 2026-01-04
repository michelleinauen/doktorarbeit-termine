"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

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

export default function AdminSlotsPage() {
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [rows, setRows] = useState<AdminSlotRow[]>([]);
  const [hideInactive, setHideInactive] = useState(true);
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!hideInactive) return rows;
    return rows.filter((r) => r.active);
  }, [rows, hideInactive]);

  async function load() {
    setLoading(true);

    const { data: sessionRes } = await supabase.auth.getSession();
    const user = sessionRes.session?.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const email = user.email ?? "";
    if (!ADMIN_EMAILS.includes(email)) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }

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

      {visible.length === 0 ? (
        <p style={{ marginTop: 16 }}>Keine Slots in dieser Ansicht.</p>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {visible.map((r) => {
            const badge = r.booked
              ? { text: `GEBUCHT: ${r.booked_by_email ?? "?"}`, bg: "rgba(234,179,8,0.18)", bd: "rgba(234,179,8,0.35)" }
              : { text: "FREI", bg: "rgba(34,197,94,0.18)", bd: "rgba(34,197,94,0.35)" };

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
