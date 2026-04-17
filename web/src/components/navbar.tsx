"use client";

import { useState } from "react";
import {
  CaretDown,
  List,
  X,
} from "@phosphor-icons/react";
import Image from "next/image";
import NextLink from "next/link";

const mainLinks = [
  { label: "Home", href: "/" },
  { label: "Theater", href: "/theater" },
  { label: "Benchmark", href: "/benchmark" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Tracker", href: "/tracker" },
  { label: "About", href: "/about" },
];

const exploreLinks = [
  { label: "Characters", href: "/characters" },
  { label: "Journals", href: "/journals" },
  { label: "Bestiary", href: "/bestiary" },
  { label: "Worlds", href: "/worlds" },
];

const buildLinks = [
  { label: "Docs", href: "/docs" },
  { label: "The Open Dungeon", href: "/open-source" },
];

function NavDropdown({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: { label: string; href: string }[];
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className="flex items-center gap-1 text-sm text-foreground/70 hover:text-foreground transition-colors"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {label}
        <CaretDown
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[160px] rounded-lg border border-divider bg-content1 p-1 shadow-lg z-50">
          {items.map((item) => (
            <NextLink
              key={item.href}
              href={item.href}
              className="block w-full rounded-md px-3 py-2 text-sm text-foreground/70 hover:text-foreground hover:bg-content2 transition-colors no-underline"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              {item.label}
            </NextLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Navbar() {
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

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {mainLinks.map((link) => (
            <NextLink
              key={link.href}
              href={link.href}
              className="text-sm text-foreground/70 hover:text-foreground transition-colors no-underline"
            >
              {link.label}
            </NextLink>
          ))}
          <NavDropdown label="Explore" items={exploreLinks} />
          <NavDropdown label="Build" items={buildLinks} />
        </div>

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
          {mainLinks.map((link) => (
            <NextLink
              key={link.href}
              href={link.href}
              className="block py-2 text-sm text-foreground/70 hover:text-foreground no-underline"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </NextLink>
          ))}
          <NavDropdown
            label="Explore"
            items={exploreLinks}
            onNavigate={() => setMobileOpen(false)}
          />
          <NavDropdown
            label="Build"
            items={buildLinks}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      )}
    </nav>
  );
}
