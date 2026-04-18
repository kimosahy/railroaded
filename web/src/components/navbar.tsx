"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
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
  isActive,
}: {
  label: string;
  items: { label: string; href: string }[];
  isActive?: boolean;
}) {
  return (
    <Dropdown>
      <Dropdown.Trigger
        className="flex items-center gap-1"
        style={{
          fontSize: "17px",
          padding: "0.25rem 0.6rem",
          borderRadius: "9999px",
          background: isActive ? "rgba(201,168,76,0.15)" : "transparent",
          color: isActive ? "var(--accent)" : "var(--foreground)",
          opacity: isActive ? 1 : 0.7,
          border: "none",
        }}
      >
        {label}
        <CaretDown size={12} />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom start">
        <Dropdown.Menu>
          {items.map((item) => (
            <Dropdown.Item key={item.href} id={item.href} href={item.href}>
              {item.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isExploreActive = exploreLinks.some((l) => pathname.startsWith(l.href));

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("play");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = "/#play";
    }
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-[60px] border-b border-divider bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
        {/* Brand */}
        <NextLink href="/" className="flex items-center gap-2 no-underline">
          <Image src="/logo.svg" alt="" width={28} height={28} />
          <span
            className="text-lg tracking-wide"
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--accent)",
            }}
          >
            Railroaded
          </span>
        </NextLink>

        {/* Desktop links — centered */}
        <div
          className="hidden md:flex items-center gap-4"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          {centerLinks.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <NextLink
                key={link.href}
                href={link.href}
                className="no-underline transition-colors"
                style={{
                  fontSize: "17px",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "9999px",
                  background: active ? "rgba(201,168,76,0.15)" : "transparent",
                  color: active ? "var(--accent)" : "var(--foreground)",
                  opacity: active ? 1 : 0.7,
                }}
              >
                {link.label}
              </NextLink>
            );
          })}
          <NavDropdown label="Explore" items={exploreLinks} isActive={isExploreActive} />
        </div>

        {/* Play CTA — far right */}
        <a
          href="/#play"
          onClick={handlePlayClick}
          className="hidden md:flex items-center gap-1.5 no-underline"
          style={{
            fontSize: "17px",
            padding: "0.3rem 1.2rem",
            border: "1px solid transparent",
            borderRadius: "9999px",
            color: "var(--accent-foreground)",
            background: "var(--accent)",
            transition: "opacity 0.2s",
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
          <div className="py-2 text-xs text-foreground/40 uppercase tracking-wider">Explore</div>
          {exploreLinks.map((link) => (
            <NextLink
              key={link.href}
              href={link.href}
              className="block py-1.5 pl-3 text-sm text-foreground/70 hover:text-foreground no-underline"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </NextLink>
          ))}
          <a
            href="/#play"
            onClick={(e) => {
              e.preventDefault();
              setMobileOpen(false);
              const el = document.getElementById("play");
              if (el) el.scrollIntoView({ behavior: "smooth" });
              else window.location.href = "/#play";
            }}
            className="block py-2 text-sm no-underline"
            style={{ color: "var(--accent)" }}
          >
            <GameController size={14} className="inline mr-1" />
            Play
          </a>
        </div>
      )}
    </nav>
  );
}
