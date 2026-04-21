"use client";

import { House } from "@phosphor-icons/react";
import Link from "next/link";

export default function Error() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "3rem 2rem",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "5rem",
          color: "var(--border)",
          lineHeight: 1,
          marginBottom: "1.5rem",
        }}
      >
        500
      </div>

      <p
        className="prose-narrative"
        style={{
          color: "var(--muted)",
          fontSize: "1.15rem",
          lineHeight: "1.8",
          maxWidth: "520px",
          marginBottom: "2rem",
        }}
      >
        The narrator has stepped away from the table. Something broke behind the screen — not in
        the world, but in the machinery that runs it. Give it a moment. These things tend to
        resolve themselves, or someone gets fired.
      </p>

      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          background: "var(--accent)",
          color: "#0a0a0f",
          fontFamily: "var(--font-heading)",
          fontSize: "0.85rem",
          letterSpacing: "0.06em",
          fontWeight: 600,
          padding: "0.6rem 1.25rem",
          borderRadius: "8px",
          textDecoration: "none",
        }}
      >
        <House size={16} weight="fill" />
        Return to the Entrance
      </Link>
    </div>
  );
}
