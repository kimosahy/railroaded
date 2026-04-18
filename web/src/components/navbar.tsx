"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CaretDown,
  GameController,
  List,
  X,
} from "@phosphor-icons/react";
import { Dropdown } from "@heroui/react";
import Image from "next/image";
import NextLink from "next/link";

const centerLinks = [
  { label: "Home", href: "/" },
  { label: "Theater", href: "/theater" },
  { label: "Leaderboard", href: "/leaderboard" },
];

const exploreLinks = [
  { label: "Characters", href: "/characters" },
  { label: "Journals", href: "/journals" },
  { label: "Bestiary", href: "/bestiary" },
  { label: "Worlds", href: "/worlds" },
  { label: "Benchmark", href: "/benchmark" },
  { label: "Tracker", href: "/tracker" },
];

function NavDropdown({
  label,
  items,
  onNavigate,
  isActive,
  desktopSize,
}: {
  label: string;
  items: { label: string; href: string }[];
  onNavigate?: () => void;
  isActive?: boolean;
  desktopSize?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Dropdown isOpen={open} onOpenChange={setOpen}>
        <Dropdown.Trigger
          className="flex items-center gap-1 text-foreground/70 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer"
          style={{
            ...(desktopSize ? { fontSize: "17px" } : { fontSize: "14px" }),
            padding: "0.25rem 0.6rem",
            ...(isActive
              ? {
                  background: "rgba(201,168,76,0.15)",
                  borderRadius: "9999px",
                  color: "var(--heroui-primary-500)",
                }
              : {}),
          }}
        >
          {label}
          <CaretDown
            size={12}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Dropdown.Trigger>
        <Dropdown.Popover
          placement="bottom start"
          className="min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--overlay)] p-1 shadow-lg z-50"
        >
          <Dropdown.Menu
            onAction={(key) => {
              router.push(key as string);
              setOpen(false);
              onNavigate?.();
            }}
          >
            {items.map((item) => (
              <Dropdown.Item
                key={item.href}
                id={item.href}
                className="rounded-md px-3 py-2 text-sm cursor-pointer transition-colors"
                style={{
                  background: "transparent",
                  color: "var(--foreground, #d4d0c8)",
                }}
                onHoverStart={() => {}}
                onHoverEnd={() => {}}
              >
                {item.label}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-[60px] border-b border-divider bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
        {/* Brand — MF-STD-001: Cinzel */}
        <NextLink
          href="/"
          className="flex items-center gap-2 no-underline"
        >
          <Image src="/logo.svg" alt="" width={28} height={28} />
          <span
            className="text-lg tracking-wide"
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--heroui-primary-500)",
            }}
          >
            Railroaded
          </span>
        </NextLink>

        {/* Desktop links — centered absolutely */}
        <div className="hidden md:flex items-center gap-6" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          {centerLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <NextLink
                key={link.href}
                href={link.href}
                className="text-foreground/70 hover:text-foreground transition-colors no-underline"
                style={{
                  fontSize: "17px",
                  padding: "0.25rem 0.6rem",
                  ...(active
                    ? {
                        background: "rgba(201,168,76,0.15)",
                        borderRadius: "9999px",
                        color: "var(--heroui-primary-500)",
                      }
                    : {}),
                }}
              >
                {link.label}
              </NextLink>
            );
          })}
          <NavDropdown
            label="Explore"
            items={exploreLinks}
            isActive={exploreLinks.some((l) => pathname.startsWith(l.href))}
            desktopSize
          />
        </div>

        {/* Play CTA — far right */}
        <a
          href="/#play"
          className="hidden md:flex items-center gap-1.5 no-underline"
          style={{
            fontSize: "17px",
            padding: "0.3rem 1.2rem",
            border: "1px solid transparent",
            borderRadius: "9999px",
            color: "var(--accent-foreground)",
            background: "var(--accent)",
            transition: "background 0.2s, border-color 0.2s",
          }}
        >
          <GameController size={16} />
          Play
        </a>

        {/* Hamburger */}
        <button
          className="md:hidden flex items-center justify-center w-10 h-10 text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
          type="button"
        >
          {mobileOpen ? <X size={24} /> : <List size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-divider bg-background/95 backdrop-blur-md px-4 py-4 space-y-1">
          {centerLinks.map((link) => (
            <NextLink
              key={link.href}
              href={link.href}
              className="block py-2 text-sm text-foreground/70 hover:text-foreground no-underline"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </NextLink>
          ))}
          {/* Explore items expanded in mobile */}
          <div className="pl-2 border-l border-foreground/10">
            <span className="block py-2 text-xs text-foreground/40 uppercase tracking-wider">Explore</span>
            {exploreLinks.map((link) => (
              <NextLink
                key={link.href}
                href={link.href}
                className="block py-2 text-sm text-foreground/70 hover:text-foreground no-underline"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </NextLink>
            ))}
          </div>
          {/* Play CTA in mobile */}
          <a
            href="/#play"
            className="flex items-center gap-1.5 no-underline mt-3"
            style={{
              fontSize: "14px",
              padding: "0.4rem 1.2rem",
              borderRadius: "9999px",
              color: "var(--accent-foreground)",
              background: "var(--accent)",
              width: "fit-content",
            }}
            onClick={() => setMobileOpen(false)}
          >
            <GameController size={16} />
            Play
          </a>
        </div>
      )}
    </nav>
  );
}
