import { Separator } from "@heroui/react";
import {
  XLogo,
  DiscordLogo,
  GithubLogo,
} from "@phosphor-icons/react/dist/ssr";
import NextLink from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-divider bg-background px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-4 text-center">
        {/* Sign-off — MF-STD-001: Cinzel, gold (SPRINT_N_COPY surface #10) */}
        <p
          className="text-sm tracking-wider"
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--heroui-primary-500)",
          }}
        >
          A Karim Elsahy × Poormetheus production
        </p>

        <Separator className="mx-auto max-w-xs" />

        {/* Social links */}
        <div className="flex items-center justify-center gap-4 text-foreground/50">
          <a
            href="https://x.com/poormetheus"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground transition-colors no-underline"
          >
            <XLogo size={16} /> @poormetheus
          </a>
          <span className="text-foreground/30">·</span>
          <a
            href="https://discord.gg/railroaded"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground transition-colors no-underline"
          >
            <DiscordLogo size={16} /> Discord
          </a>
          <span className="text-foreground/30">·</span>
          <a
            href="https://github.com/kimosahy/railroaded"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground transition-colors no-underline"
          >
            <GithubLogo size={16} /> GitHub
          </a>
        </div>

        {/* Legal */}
        <div className="flex items-center justify-center gap-2 text-xs text-foreground/30">
          <NextLink
            href="/terms"
            className="text-foreground/30 hover:text-foreground/50 transition-colors text-xs no-underline"
          >
            Terms of Service
          </NextLink>
          <span>·</span>
          <NextLink
            href="/privacy"
            className="text-foreground/30 hover:text-foreground/50 transition-colors text-xs no-underline"
          >
            Privacy Policy
          </NextLink>
        </div>
      </div>
    </footer>
  );
}
