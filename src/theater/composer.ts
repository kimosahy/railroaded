import type { Emission, ViewerRole } from "./types.ts";
import type { ContentSpan } from "./parser.ts";
import { parseInlineMarkup } from "./parser.ts";
import { normalizeEmission } from "./normalizer.ts";

export interface ComposedEmission {
  emission: Emission;
  spans: ContentSpan[];
  warnings: string[];
  viewerRole: ViewerRole;
  visible: boolean;
  /** True if original emission contained audience-only content, regardless of viewer role.
   *  (ATLAS-017 minor #3: named to reflect pre-strip state, not post-strip.) */
  producedAudienceContent: boolean;
}

export function compose(
  raw: Record<string, unknown>,
  viewerRole: ViewerRole,
): ComposedEmission {
  const allWarnings: string[] = [];

  // Steps 1-3: normalize (returns fresh object, doesn't mutate raw)
  const { emission, warnings: normWarnings } = normalizeEmission(raw);
  allWarnings.push(...normWarnings);

  // Step 4: parse inline markup
  const { spans, warnings: parseWarnings } = parseInlineMarkup(emission.content);
  allWarnings.push(...parseWarnings);

  // Step 6: viewer-role gating (TWO layers per MF §9.4 — ATLAS-018 blocker fix)
  // Layer 1: whole-emission visibility (only when CONTENT itself is viewer-scoped)
  const visible = isVisibleToViewer(emission, viewerRole);
  const producedAudienceContent = emission.track === "internal_monologue"
    || !!emission.audience_aside
    || !!emission.hidden_information
    || !!emission.foreshadow;

  // Step 7: conflict resolution (clone before mutating — never touch normalized emission)
  const resolved: Emission = { ...emission };
  if (resolved.interrupting && resolved.tone === "whisper") {
    resolved.tone = "normal";
    allWarnings.push("Conflict: interrupting + whisper → tone reset to normal");
  }

  // Layer 2: field-stripping (remove audience-only ANNOTATIONS, keep emission visible)
  // foreshadow and hidden_information are annotations ON a narration, not the narration itself.
  // Player sees the narration text. Audience sees narration + foreshadow card + hidden info sidebar.
  const forViewer = stripAnnotationsForViewer(resolved, viewerRole);

  return {
    emission: forViewer,
    spans,
    warnings: allWarnings,
    viewerRole,
    visible,
    producedAudienceContent,
  };
}

/**
 * Whole-emission visibility. Hides ONLY when the content itself IS the viewer-scoped thing.
 * - internal_monologue: content IS the monologue → audience-only
 * - audience_aside: content IS the aside → audience-only
 * - foreshadow/hidden_information: these are ANNOTATIONS on visible narration → do NOT hide emission
 */
function isVisibleToViewer(emission: Emission, role: ViewerRole): boolean {
  if (emission.track === "internal_monologue" && role !== "audience") return false;
  if (emission.audience_aside && role !== "audience") return false;
  return true;
}

/**
 * Strip audience-only annotation FIELDS from emission based on viewer role.
 * The emission itself remains visible — only the annotation fields are removed.
 * Per MF §9.4: foreshadow card, hidden_information sidebar, recap_card are audience-only surfaces.
 */
function stripAnnotationsForViewer(emission: Emission, role: ViewerRole): Emission {
  const stripped: Emission = { ...emission };
  if (role === "player") {
    stripped.foreshadow = undefined;
    stripped.hidden_information = undefined;
    stripped.recap_card = undefined;
  } else if (role === "dm") {
    stripped.foreshadow = undefined;       // dramatic tension — DM doesn't need
    // DM keeps hidden_information (operational awareness)
    stripped.recap_card = undefined;
  }
  // audience: keeps everything
  return stripped;
}

export function deduplicateEmissions(emissions: ComposedEmission[]): ComposedEmission[] {
  const seen = new Set<string>();
  return emissions.filter(e => {
    if (seen.has(e.emission.emission_id)) return false;
    seen.add(e.emission.emission_id);
    return true;
  });
}
