"use client";

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type SlotRow = {
  slot_id: string;
  service_name: string;
  modality: "US" | "MRI";
  visit_kind: "BASELINE" | "FOLLOWUP";
  starts_at: string;
  ends_at: string;
  booked: boolean;
  user_email: string | null;
};

const ADMIN_EMAILS = [
  "michelle.inauen@hotmail.com",
  "michelle.inauen@spitalzollikerberg.ch",
  "login@study-booking.ch",
];

function fmt(dt: string) {
  return new Date(dt).toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function labelPhase(vk: "BASELINE" | "FOLLOWUP") {
  return vk === "BASELINE" ? "Vor Therapie (Baseline)" : "Nach Therapie (Kontrolle)";
}

function labelMod(m: "US" | "MRI") {
  return m === "US" ? "Ultraschall" : "MRI";
}

export default function AdminSlotOverviewPage() {
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [showOnlyBooked, setShowOnlyBooked] = useState(false);

  useEffect(() => {
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

      const { data, error } = await supabase.rpc("get_admin_slot_overview");

      if (error) {
        console.error(error);
        alert("Fehler beim Laden der Slot-Übersicht: " + error.message);
        setLoading(false);
        return;
      }

      setSlots(data as SlotRow[]);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 16, maxWidth: 1100, margin: "40px auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Admin – Slots & Belegung</h1>
        <p style={{ marginTop: 12 }}>Lade Übersicht…</p>
      </main>
    );
  }

  if (unauthorized) {
    return (
      <main style={{ padding: 16, maxWidth: 800, margin: "40px auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Kein Zugriff</h1>
        <p style={{ marginTop: 12 }}>
          Diese Seite ist nur für Administrator:innen freigeschaltet.
        </p>
      </main>
    );
  }

  const filtered = slots.filter((s) => {
    if (!showOnlyBooked) return true;
    return s.booked;
  });

  return (
    <main style={{ padding: 16, maxWidth: 1200, margin: "40px auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Admin – Slot-Übersicht</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>
            Angezeigte Slots: <b>{filtered.length}</b> (gesamt {slots.length})
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showOnlyBooked}
            onChange={(e) => setShowOnlyBooked(e.target.checked)}
          />
          Nur gebuchte Slots anzeigen
        </label>
      </div>

      {filtered.length === 0 ? (
        <p style={{ marginTop: 16 }}>Keine Slots für den gewählten Filter.</p>
      ) : (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #444",
            borderRadius: 12,
            overflow: "hidden",
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ position: "sticky", top: 0, background: "#111" }}>
              <tr>
                <th style={th}>Datum / Zeit</th>
                <th style={th}>Leistung</th>
                <th style={th}>Phase / Modalität</th>
                <th style={th}>Status</th>
                <th style={th}>Patient:in (E-Mail, falls gebucht)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.slot_id} style={{ borderTop: "1px solid #333" }}>
                  <td style={td}>
                    <div>{fmt(s.starts_at)}</div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>bis {fmt(s.ends_at)}</div>
                  </td>
                  <td style={td}>{s.service_name}</td>
                  <td style={td}>
                    {labelPhase(s.visit_kind)} · {labelMod(s.modality)}
                  </td>
                  <td style={td}>
                    {s.booked ? (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          border: "1px solid #3a7f3a",
                          background: "#123512",
                        }}
                      >
                        gebucht
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          border: "1px solid #555",
                          background: "#222",
                        }}
                      >
                        frei
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {s.booked && s.user_email ? (
                      <a href={`mailto:${s.user_email}`} style={{ color: "#7fb4ff" }}>
                        {s.user_email}
                      </a>
                    ) : (
                      <span style={{ opacity: 0.6 }}>–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #444",
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const td: React.CSSProperties = {
  padding: "8px 10px",
  verticalAlign: "top",
};
