import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Gastrische Retention</h1>
      <p style={{ marginTop: 12, lineHeight: 1.5 }}>
        Bitte loggen Sie sich ein, um Ihre Studientermine (Ultraschall und MRI) zu buchen,
        anzusehen, umzubuchen oder zu stornieren.
      </p>

      <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
        <Link href="/login">Login</Link>
        <Link href="/dashboard">Dashboard</Link>
      </div>
    </main>
  );
}

