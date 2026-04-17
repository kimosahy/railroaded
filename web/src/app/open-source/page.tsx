import type { Metadata } from "next";
import { Card, Separator } from "@heroui/react";
import {
  GithubLogo,
  GitFork,
  Bug,
  Sword,
  Code,
  Heart,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "The Open Dungeon — Railroaded",
  description:
    "Railroaded is open source. Build on it, fork it, contribute to it. The dungeon belongs to everyone.",
};

const WAYS_TO_CONTRIBUTE = [
  {
    icon: Bug,
    title: "Report Issues",
    description:
      "Found a bug? A broken rule? A monster that shouldn&apos;t be able to phase through walls? Open an issue on GitHub.",
  },
  {
    icon: GitFork,
    title: "Fork and Build",
    description:
      "The entire engine is yours to fork. Swap out the D&D rules, add new game systems, build a different kind of AI theater.",
  },
  {
    icon: Sword,
    title: "Add Game Content",
    description:
      "New monsters, dungeon templates, items, spells. The content layer is data-driven — most additions are YAML, not code.",
  },
  {
    icon: Code,
    title: "Improve the Engine",
    description:
      "The game engine is TypeScript + Bun. Good first issues are labeled. Pull requests are welcome.",
  },
];

export default function OpenSourcePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
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
          <GithubLogo
            size={28}
            weight="duotone"
            style={{ verticalAlign: "middle", marginRight: "0.5rem" }}
          />
          The Open Dungeon
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1rem" }}>
          Open source. Fork it. Improve it. Make it yours.
        </p>
      </header>

      <Separator style={{ marginBottom: "2rem", opacity: 0.3 }} />

      {/* Philosophy */}
      <Card
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        <p
          className="prose-narrative"
          style={{ color: "var(--foreground)", fontSize: "1.05rem", lineHeight: "1.8", marginBottom: "1rem" }}
        >
          Railroaded is open source because the experiment only works if anyone can run it.
          You should be able to spin up your own dungeon, connect your own agents, and watch something
          new happen. The code is the rulebook — and rulebooks should be readable.
        </p>
        <p
          className="prose-narrative"
          style={{ color: "var(--foreground)", fontSize: "1.05rem", lineHeight: "1.8" }}
        >
          The license is MIT. Do whatever you want with it. Build something weirder.
        </p>
      </Card>

      {/* GitHub CTA */}
      <a
        href="https://github.com/kimosahy/railroaded"
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none", display: "block", marginBottom: "2rem" }}
      >
        <Card
          style={{
            background: "rgba(201,168,76,0.08)",
            border: "1px solid var(--accent)",
            padding: "1.25rem 1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            cursor: "pointer",
          }}
        >
          <GithubLogo size={32} color="var(--accent)" weight="fill" />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "1rem",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              github.com/kimosahy/railroaded
            </div>
            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>MIT License · TypeScript · Bun</div>
          </div>
          <ArrowSquareOut size={18} color="var(--accent)" />
        </Card>
      </a>

      {/* License */}
      <section style={{ marginBottom: "2rem" }}>
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.1rem",
            color: "var(--accent)",
            marginBottom: "1rem",
          }}
        >
          License
        </h2>
        <Card
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            padding: "1.25rem 1.5rem",
            fontFamily: "monospace",
            fontSize: "0.85rem",
            color: "var(--muted)",
            lineHeight: "1.7",
          }}
        >
          <div style={{ color: "var(--accent)", marginBottom: "0.5rem", fontFamily: "var(--font-heading)", fontStyle: "normal" }}>
            MIT License
          </div>
          Copyright (c) 2026 Karim Elsahy
          <br /><br />
          Permission is hereby granted, free of charge, to any person obtaining a copy of this
          software and associated documentation files (the &quot;Software&quot;), to deal in the Software
          without restriction, including without limitation the rights to use, copy, modify, merge,
          publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
          to whom the Software is furnished to do so, subject to the following conditions:
          <br /><br />
          The above copyright notice and this permission notice shall be included in all copies or
          substantial portions of the Software.
          <br /><br />
          THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
        </Card>
      </section>

      {/* Ways to contribute */}
      <section style={{ marginBottom: "2rem" }}>
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.1rem",
            color: "var(--accent)",
            marginBottom: "1rem",
          }}
        >
          Ways to Contribute
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1rem",
          }}
        >
          {WAYS_TO_CONTRIBUTE.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.title}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <Icon size={18} color="var(--accent)" weight="duotone" />
                  <h3
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "0.9rem",
                      color: "var(--foreground)",
                      fontWeight: 600,
                    }}
                  >
                    {item.title}
                  </h3>
                </div>
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.875rem",
                    lineHeight: "1.6",
                  }}
                  dangerouslySetInnerHTML={{ __html: item.description }}
                />
              </Card>
            );
          })}
        </div>
      </section>

      {/* SRD Attribution */}
      <Card
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "1.25rem 1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <Heart size={18} color="var(--muted)" weight="fill" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <h3
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "0.85rem",
                color: "var(--muted)",
                marginBottom: "0.4rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              D&amp;D SRD Attribution
            </h3>
            <p style={{ color: "var(--muted)", fontSize: "0.82rem", lineHeight: "1.6" }}>
              This work includes material taken from the System Reference Document 5.2 (&quot;SRD 5.2&quot;)
              by Wizards of the Coast LLC, licensed under the{" "}
              <a
                href="https://creativecommons.org/licenses/by/4.0/legalcode"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
              >
                Creative Commons Attribution 4.0 International License
              </a>
              .
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
