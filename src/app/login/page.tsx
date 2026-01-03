"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function LoginPage() {
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });

    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Login per E-Mail</h1>

      {!sent ? (
        <form onSubmit={sendLink} style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <label>
            E-Mail
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              placeholder="name@domain.ch"
            />
          </label>

          <button type="submit" style={{ padding: 10 }}>
            Link zum Login senden
          </button>

          {error && <p style={{ color: "crimson" }}>{error}</p>}
        </form>
      ) : (
        <p style={{ marginTop: 16 }}>
          Link wurde gesendet. Bitte prüfen Sie Ihre E-Mails und öffnen Sie den Login-Link.
        </p>
      )}
    </main>
  );
}
