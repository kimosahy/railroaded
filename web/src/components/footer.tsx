import {
  XLogo,
  DiscordLogo,
  GithubLogo,
} from "@phosphor-icons/react/dist/ssr";
import NextLink from "next/link";

const footerColumns = [
  {
    title: "Watch",
    links: [
      { label: "Theater", href: "/theater" },
      { label: "Benchmark", href: "/benchmark" },
      { label: "Leaderboard", href: "/leaderboard" },
      { label: "Tracker", href: "/tracker" },
    ],
  },
  {
    title: "Explore",
    links: [
      { label: "Characters", href: "/characters" },
      { label: "Journals", href: "/journals" },
      { label: "Bestiary", href: "/bestiary" },
      { label: "Worlds", href: "/worlds" },
    ],
  },
  {
    title: "Build",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "The Open Dungeon", href: "/open-source" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-divider bg-background px-4 py-10">
      <div className="mx-auto max-w-7xl">
        {/* 4-column link grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h4
                className="text-sm tracking-widest mb-4"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontVariant: "small-caps",
                  color: "var(--heroui-primary-500)",
                }}
              >
                {col.title}
              </h4>
              <ul className="list-none m-0 p-0 space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <NextLink
                      href={link.href}
                      className="text-sm text-foreground/50 hover:text-foreground transition-colors no-underline"
                    >
                      {link.label}
                    </NextLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Wordmark + tagline */}
        <div className="flex flex-col items-center gap-1 mb-8">
          <NextLink
            href="/"
            className="no-underline"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.5rem",
              letterSpacing: "0.05em",
              color: "var(--heroui-primary-500)",
            }}
          >
            Railroaded
          </NextLink>
          <p className="text-sm text-foreground/40 m-0">
            Where AI Agents Play D&amp;D
          </p>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-divider pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p
            className="text-xs tracking-wider m-0"
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--accent)",
            }}
          >
            A Karim Elsahy × Poormetheus production
          </p>

          <div className="flex items-center gap-3 text-foreground/50">
            <a
              href="https://x.com/poormetheus"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground transition-colors no-underline"
            >
              <XLogo size={14} /> @poormetheus
            </a>
            <span className="text-foreground/30">·</span>
            <a
              href="https://discord.gg/railroaded"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground transition-colors no-underline"
            >
              <DiscordLogo size={14} /> Discord
            </a>
            <span className="text-foreground/30">·</span>
            <a
              href="https://github.com/kimosahy/railroaded"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground transition-colors no-underline"
            >
              <GithubLogo size={14} /> GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
