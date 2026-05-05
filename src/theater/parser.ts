import type { PlayerEmissionFields, Pacing, Confidence, AddressMode } from "./types.ts";

export interface ContentSpan {
  text: string;
  overrides: Partial<PlayerEmissionFields>;
}

export interface ParseResult {
  spans: ContentSpan[];
  warnings: string[];
}

/**
 * Parse inline markup from emission content. Handles 3 formats per MF §2.2:
 *
 * Bare-tag tone:    [whisper]text[/whisper]   → tone: "whisper"
 * Bare-tag hedge:   [hedge]text[/hedge]       → confidence: "low"
 * Colon-separated:  [pacing:hesitant]text[/pacing]  → pacing: "hesitant"
 * Equals-separated: [tone=whisper]text[/tone]       → tone: "whisper"
 * Stacked:          [excited][yell]text[/yell][/excited] → both apply
 *
 * Closing tags match by tag name: [/whisper] closes [whisper],
 * [/tone] closes [tone=...], [/pacing] closes [pacing:...].
 */
export function parseInlineMarkup(content: string): ParseResult {
  const spans: ContentSpan[] = [];
  const warnings: string[] = [];
  const tagStack: Array<{ tag: string; attribute: string; value: string; startIdx: number }> = [];

  // MUST be inside function body — g flag leaks lastIndex state between calls
  // Matches all 3 formats:
  //   [whisper] or [hedge]                    → bare-tag (group 1)
  //   [pacing:hesitant] or [tone=whisper]     → attr:value or attr=value (group 2 + group 3)
  //   [/whisper] or [/tone] or [/pacing]      → closing (group 4)
  const TAG_REGEX = /\[(whisper|mutter|normal|excited|yell|shout|growl|sigh|giggle|monotone|raspy|hedge)\]|\[(tone|pacing|confidence|address|mood)[:=]([^\]]+)\]|\[\/(\w+)\]/g;

  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_REGEX.exec(content)) !== null) {
    if (match.index > lastIdx) {
      spans.push({ text: content.slice(lastIdx, match.index), overrides: buildOverrides(tagStack) });
    }

    if (match[1]) {
      // Bare-tag: [whisper], [hedge], etc.
      const bareTag = match[1];
      if (bareTag === "hedge") {
        tagStack.push({ tag: "hedge", attribute: "confidence", value: "low", startIdx: match.index });
      } else {
        // It's a tone preset bare-tag
        tagStack.push({ tag: bareTag, attribute: "tone", value: bareTag, startIdx: match.index });
      }
    } else if (match[2] && match[3]) {
      // Attribute tag: [pacing:hesitant] or [tone=whisper]
      tagStack.push({ tag: match[2], attribute: match[2], value: match[3], startIdx: match.index });
    } else if (match[4]) {
      // Closing tag: [/whisper], [/tone], [/pacing], [/hedge]
      const closeTag = match[4];
      let openIdx = -1;
      for (let i = tagStack.length - 1; i >= 0; i--) {
        if (tagStack[i]!.tag === closeTag) { openIdx = i; break; }
      }
      if (openIdx === -1) {
        warnings.push(`Closing [/${closeTag}] without matching open tag at position ${match.index}`);
      } else {
        tagStack.splice(openIdx, 1);
      }
    }

    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < content.length) {
    spans.push({ text: content.slice(lastIdx), overrides: buildOverrides(tagStack) });
  }

  for (const unclosed of tagStack) {
    warnings.push(`Unclosed [${unclosed.tag}] at position ${unclosed.startIdx}`);
  }

  if (spans.length === 0) {
    spans.push({ text: content, overrides: {} });
  }

  return { spans, warnings };
}

function buildOverrides(stack: Array<{ tag: string; attribute: string; value: string }>): Partial<PlayerEmissionFields> {
  const overrides: Partial<PlayerEmissionFields> = {};
  for (const entry of stack) {
    switch (entry.attribute) {
      case "tone": overrides.tone = entry.value; break;
      case "pacing": overrides.pacing = entry.value as Pacing; break;
      case "confidence": overrides.confidence = entry.value as Confidence; break;
      case "address": overrides.address = entry.value as AddressMode; break;
      case "mood": overrides.mood = entry.value; break;
    }
  }
  return overrides;
}
