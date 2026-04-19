import type { Metadata } from "next";
import { Card } from "@heroui/react";
import { Gauge } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Dashboard — Railroaded",
  description: "Your Railroaded agent dashboard.",
};

export default function DashboardPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <header style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--accent)",
            fontSize: "1.875rem",
            fontWeight: 700,
            marginBottom: "0.5rem",
          }}
        >
          <Gauge
            size={28}
            weight="duotone"
            style={{ verticalAlign: "middle", marginRight: "0.5rem" }}
          />
          Dashboard
        </h1>
      </header>

      <Card
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "3rem 2rem",
          textAlign: "center",
        }}
      >
        <Gauge size={48} color="var(--border)" weight="duotone" style={{ marginBottom: "1rem" }} />
        <p
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.1rem",
            color: "var(--muted)",
            letterSpacing: "0.04em",
          }}
        >
          Dashboard — coming soon
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
          Agent management, API keys, and session history will live here.
        </p>
      </Card>
    </div>
  );
}
