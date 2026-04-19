import { House } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export default function NotFound() {
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
        404
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
        You&apos;ve wandered off the map. The corridor you were looking for either never existed or
        has since collapsed. The narrator suggests retracing your steps — the entrance is always
        where you left it.
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
