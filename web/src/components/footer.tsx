import {
  XLogo,
  DiscordLogo,
  GithubLogo,
} from "@phosphor-icons/react/dist/ssr";
import NextLink from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-divider bg-background px-4 py-3">
      <div className="mx-auto max-w-7xl flex items-center justify-between flex-wrap gap-x-6 gap-y-1">
        {/* Sign-off — MF-STD-001: Cinzel, gold */}
        <p
          className="text-xs tracking-wider"
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--accent)",
          }}
        >
          A Karim Elsahy × Poormetheus production
        </p>

        {/* Social links */}
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

        {/* Legal */}
        <div className="flex items-center gap-2 text-xs text-foreground/30">
          <NextLink
            href="/terms"
            className="text-foreground/30 hover:text-foreground/50 transition-colors text-xs no-underline"
          >
            Terms
          </NextLink>
          <span>·</span>
          <NextLink
            href="/privacy"
            className="text-foreground/30 hover:text-foreground/50 transition-colors text-xs no-underline"
          >
            Privacy
          </NextLink>
        </div>
      </div>
    </footer>
  );
}
