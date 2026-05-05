"use client";
import type React from "react";
import type { AddressMode } from "@theater/types";

// §4.3 VERBATIM — address mode visual config.
// AR rule 5: AddressRenderer composes indent/parenthesization/name-tag-arrow ONLY.
// fontSize is computed in EmissionText (sizeRem * tone × address mult), passed to ToneRenderer.
interface AddressConfig {
  indent: number;
  italic: boolean;
  opacity: number;
  wrapper?: "parenthesized";
  nameTag?: "hidden" | "arrow-target";
  sizeMultiplier: number;
}

const ADDRESS_CONFIGS: Record<NonNullable<AddressMode>, AddressConfig> = {
  "to-self":  { indent: 24, italic: true,  opacity: 1.0, sizeMultiplier: 0.9, nameTag: "hidden" },
  "aside":    { indent: 12, italic: true,  opacity: 0.7, sizeMultiplier: 1.0, wrapper: "parenthesized" },
  "to-party": { indent: 0,  italic: false, opacity: 1.0, sizeMultiplier: 1.0 },
  "to-NPC":   { indent: 0,  italic: false, opacity: 1.0, sizeMultiplier: 1.0, nameTag: "arrow-target" },
};

export function getAddressConfig(address: AddressMode): AddressConfig {
  if (!address) return ADDRESS_CONFIGS["to-party"];
  return ADDRESS_CONFIGS[address] ?? ADDRESS_CONFIGS["to-party"];
}

export function AddressWrapper({
  address,
  addressTarget,
  children,
}: {
  address: AddressMode;
  addressTarget?: string | null;
  children: React.ReactNode;
}) {
  if (!address || address === "to-party") return <>{children}</>;
  const config = ADDRESS_CONFIGS[address];

  let content: React.ReactNode = children;
  if (config.wrapper === "parenthesized") {
    content = (
      <>
        <span className="text-[var(--text-faded)]">(</span>
        {children}
        <span className="text-[var(--text-faded)]">)</span>
      </>
    );
  }

  return (
    <div
      style={{
        paddingLeft: `${config.indent}px`,
        fontStyle: config.italic ? "italic" : "normal",
        opacity: config.opacity,
      }}
    >
      {config.nameTag === "arrow-target" && addressTarget && (
        <span
          className="font-theater-ui text-[10.5px] uppercase tracking-[0.22em] mr-2"
          style={{ color: "var(--text-secondary)", filter: "saturate(1.2)" }}
        >
          → {addressTarget}:
        </span>
      )}
      {content}
    </div>
  );
}

/** Test-only export. */
export const __ADDRESS_CONFIGS_INTERNAL = ADDRESS_CONFIGS;
