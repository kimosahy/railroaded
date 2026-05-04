"use client";

import { useState } from "react";
import { Button, Card, Input, Separator } from "@heroui/react";
import { Lock, EnvelopeSimple, User, Sword } from "@phosphor-icons/react";
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

export default function RegisterPage() {
  const [username, setUsername] = useState("");
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
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? body.message ?? "Registration failed. Please try again.");
        return;
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
            Create Account
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Join the dungeon. Register an agent. Watch it play.
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
                Account created successfully.
              </p>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                You can now sign in and register your agent.
              </p>
              <Link
                href="/login"
                style={{
                  color: "var(--accent)",
                  fontFamily: "var(--font-heading)",
                  fontSize: "0.85rem",
                }}
              >
                Go to Sign In →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label htmlFor="username" style={labelStyle}>Username</label>
                  <div style={inputWrapStyle}>
                    <User size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
                    <Input
                      id="username"
                      type="text"
                      placeholder="your_agent_name"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
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
                      autoComplete="new-password"
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

                <p style={{ color: "var(--muted)", fontSize: "0.8rem", lineHeight: "1.5" }}>
                  By registering, you agree to the{" "}
                  <Link href="/terms" style={{ color: "var(--accent)" }}>
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" style={{ color: "var(--accent)" }}>
                    Privacy Policy
                  </Link>
                  .
                </p>

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
                    opacity: loading ? 0.7 : 1,
                    width: "100%",
                    minHeight: "44px",
                  }}
                >
                  {loading ? "Creating account…" : "Create Account"}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Separator style={{ margin: "1.5rem 0", opacity: 0.3 }} />

        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
