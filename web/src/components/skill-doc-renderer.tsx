"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function makeId(children: React.ReactNode): string {
  return String(children).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard requires HTTPS — silent on http
    }
  };
  return (
    <div className="relative my-4">
      <pre className="overflow-x-auto text-sm p-4 bg-[var(--surface)] rounded border border-[var(--border)]">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)] min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={copied ? "Copied" : "Copy code"}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export function SkillDocRenderer({
  markdown,
  title,
}: {
  markdown: string;
  title: string;
}) {
  const [tocOpen, setTocOpen] = useState(false);

  // Extract headings for TOC. Matches H1-H3 lines from the raw markdown source —
  // synthesised IDs match the ones we generate in the heading components below.
  const headings =
    markdown.match(/^#{1,3}\s+.+$/gm)?.map((h, i) => {
      const level = h.match(/^#+/)?.[0].length ?? 2;
      const text = h.replace(/^#+\s+/, "");
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return { level, text, id, index: i };
    }) ?? [];

  return (
    <div className="flex flex-col md:flex-row gap-6 px-4 py-8 max-w-7xl mx-auto">
      {/* Desktop TOC: sidebar */}
      <nav className="hidden md:block md:w-64 shrink-0 md:sticky md:top-20 self-start max-h-[80vh] overflow-y-auto">
        <h3 className="font-heading text-sm uppercase tracking-wider mb-3 text-[var(--muted)]">
          {title}
        </h3>
        {headings
          .filter((h) => h.level <= 2)
          .map((h) => (
            <a
              key={h.index}
              href={`#${h.id}`}
              className={`block py-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] truncate ${
                h.level > 1 ? "ml-3" : ""
              }`}
            >
              {h.text}
            </a>
          ))}
      </nav>

      {/* Mobile TOC: collapsible */}
      <div className="md:hidden sticky top-0 z-10 bg-[var(--background)] border-b border-[var(--border)]">
        <button
          onClick={() => setTocOpen(!tocOpen)}
          className="w-full px-4 py-3 text-left text-sm font-heading min-h-[44px]"
          aria-expanded={tocOpen}
        >
          {tocOpen ? "Close Contents" : "Contents ▼"}
        </button>
        {tocOpen && (
          <nav className="px-4 pb-3 max-h-[50vh] overflow-y-auto">
            {headings
              .filter((h) => h.level <= 2)
              .map((h) => (
                <a
                  key={h.index}
                  href={`#${h.id}`}
                  onClick={() => setTocOpen(false)}
                  className="block py-2 text-sm text-[var(--muted)] min-h-[44px] flex items-center"
                >
                  {h.text}
                </a>
              ))}
          </nav>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 max-w-prose text-base">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 id={makeId(children)} className="font-heading text-2xl mt-8 mb-4">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 id={makeId(children)} className="font-heading text-xl mt-6 mb-3">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 id={makeId(children)} className="font-heading text-lg mt-4 mb-2">
                {children}
              </h3>
            ),
            code: ({ className, children }) => {
              const isBlock = className?.includes("language-");
              if (isBlock) return <CodeBlock code={String(children).replace(/\n$/, "")} />;
              return (
                <code className="bg-[var(--surface)] px-1 py-0.5 rounded text-sm">
                  {children}
                </code>
              );
            },
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="w-full text-sm border-collapse">{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th className="text-left p-2 border-b border-[var(--border)] font-medium">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="p-2 border-b border-[var(--border)]">{children}</td>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
