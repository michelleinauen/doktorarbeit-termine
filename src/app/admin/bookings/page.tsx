"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type AdminBooking = {
  booking_id: string;
  user_email: string;
  service_name: string;
  modality: "US" | "MRI";
  visit_kind: "BASELINE" | "FOLLOWUP";
  starts_at: string;
  ends_at: string;
  status: string;
  reminder_sent_at: string | null;
};

const ADMIN_EMAILS = ["michelle.inauen@hotmail.com", "login@study-booking.ch"];

function fmt(dt: string) {
  return new Date(dt).toLocaleString("de-CH", { timeZone: "Europe/Zurich" });
}

function labelPhase(vk: "BASELINE" | "FOLLOWUP") {
  return vk === "BASELINE" ? "Vor Therapie (Baseline)" : "Nach Therapie (Kontrolle)";
}

function labelMod(m: "US" | "MRI") {
  return m === "US" ? "Ultraschall" : "MRI";
}

export default function AdminBookingsPage() {
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [showOnlyUpcoming, setShowOnlyUpcoming] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Session holen
      const { data: sessionRes } = await supabase.auth.getSession();
      const user = sessionRes.session?.user;

      if (!user) {
        // nicht eingeloggt -> auf Login schicken
        window.location.href = "/login";
        return;
      }

      const email = user.email ?? "";
      if (!ADMIN_EMAILS.includes(email)) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      // Admin-RPC aufrufen
      const { data, error } = await supabase.rpc("get_admin_bookings");

      if (error) {
        console.error(error);
        alert("Fehler beim Laden der Buchungen: " + error.message);
        setLoading(false);
        return;
      }

      setBookings(data as AdminBooking[]);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 16, maxWidth: 1100, margin: "40px auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Admin – Buchungen</h1>
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

  const now = new Date();

  const filtered = bookings.filter((b) => {
    if (!showOnlyUpcoming) return true;
    return new Date(b.starts_at) >= now;
  });

  return (
    <main style={{ padding: 16, maxWidth: 1200, margin: "40px auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Admin – Buchungsübersicht</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>
            Gesamt: <b>{bookings.length}</b> Buchungen, davon{" "}
            <b>{filtered.length}</b> in der aktuellen Ansicht.
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showOnlyUpcoming}
            onChange={(e) => setShowOnlyUpcoming(e.target.checked)}
          />
          Nur zukünftige Termine
        </label>
      </div>

      {filtered.length === 0 ? (
        <p style={{ marginTop: 16 }}>Keine Buchungen für den gewählten Filter.</p>
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
                <th style={th}>Patient:in (E-Mail)</th>
                <th style={th}>Reminder gesendet</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.booking_id} style={{ borderTop: "1px solid #333" }}>
                  <td style={td}>
                    <div>{fmt(b.starts_at)}</div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>bis {fmt(b.ends_at)}</div>
                  </td>
                  <td style={td}>{b.service_name}</td>
                  <td style={td}>
                    {labelPhase(b.visit_kind)} · {labelMod(b.modality)}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        border: "1px solid #555",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td style={td}>
                    <a href={`mailto:${b.user_email}`} style={{ color: "#7fb4ff" }}>
                      {b.user_email}
                    </a>
                  </td>
                  <td style={td}>
                    {b.reminder_sent_at ? (
                      <>
                        {fmt(b.reminder_sent_at)}
                        <div style={{ opacity: 0.7, fontSize: 11 }}>UTC+1 (Zürich)</div>
                      </>
                    ) : (
                      <span style={{ opacity: 0.7 }}>noch nicht</span>
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
