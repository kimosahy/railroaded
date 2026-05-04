"use client";

import { useState } from "react";
import { Button, Card, Input, Separator } from "@heroui/react";
import { Lock, EnvelopeSimple, Sword } from "@phosphor-icons/react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--muted)",
  fontSize: "0.8rem",
  fontFamily: "var(--font-heading)",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: "0.35rem",
};

const inputWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "0.6rem 0.75rem",
  minHeight: "44px",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? body.message ?? "Login failed. Check your credentials.");
        return;
      }

      const data = await res.json();
      if (data.token) {
        sessionStorage.setItem("auth_token", data.token);
      }
      setSuccess(true);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--accent)",
              fontSize: "1.875rem",
              fontWeight: 700,
              marginBottom: "0.4rem",
            }}
          >
            <Sword
              size={24}
              weight="duotone"
              style={{ verticalAlign: "middle", marginRight: "0.5rem" }}
            />
            Sign In
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Access your Railroaded account
          </p>
        </div>

        <Card
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            padding: "2rem",
          }}
        >
          {success ? (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <p
                style={{
                  color: "#52b788",
                  fontFamily: "var(--font-heading)",
                  fontSize: "1rem",
                  marginBottom: "0.5rem",
                }}
              >
                Signed in successfully.
              </p>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                Your token has been stored for this session.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label htmlFor="email" style={labelStyle}>Email</label>
                  <div style={inputWrapStyle}>
                    <EnvelopeSimple size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--foreground)",
                        fontSize: "0.95rem",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" style={labelStyle}>Password</label>
                  <div style={inputWrapStyle}>
                    <Lock size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--foreground)",
                        fontSize: "0.95rem",
                      }}
                    />
                  </div>
                </div>

                {error && (
                  <p
                    style={{
                      color: "#e63946",
                      fontSize: "0.875rem",
                      padding: "0.5rem 0.75rem",
                      background: "rgba(230,57,70,0.1)",
                      borderRadius: "6px",
                      border: "1px solid rgba(230,57,70,0.2)",
                    }}
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  isDisabled={loading}
                  style={{
                    background: "var(--accent)",
                    color: "#0a0a0f",
                    fontFamily: "var(--font-heading)",
                    fontSize: "0.85rem",
                    letterSpacing: "0.06em",
                    fontWeight: 600,
                    marginTop: "0.25rem",
                    opacity: loading ? 0.7 : 1,
                    width: "100%",
                    minHeight: "44px",
                  }}
                >
                  {loading ? "Signing in…" : "Sign In"}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Separator style={{ margin: "1.5rem 0", opacity: 0.3 }} />

        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
          Don&apos;t have an account?{" "}
          <Link href="/register" style={{ color: "var(--accent)" }}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
