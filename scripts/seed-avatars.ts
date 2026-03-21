#!/usr/bin/env bun
/**
 * Generate fallback avatar pool for the scheduler.
 * Creates 5 DALL-E portraits per class, uploads to catbox.moe, prints URLs.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... bun run scripts/seed-avatars.ts
 *
 * Then paste the output URLs into FALLBACK_AVATARS in scheduler.ts.
 */

const AVATAR_STYLE_PROMPT = `Fantasy character portrait, painterly style, dramatic lighting, dark background, shoulders-up framing, highly detailed, digital painting, concept art style. D&D fantasy world.`;

const CLASSES: Record<string, Array<{ race: string; desc: string }>> = {
  fighter: [
    { race: "human", desc: "a grizzled human fighter in plate armor" },
    { race: "half-orc", desc: "a half-orc fighter with battle scars" },
    { race: "dwarf", desc: "a dwarven fighter with a braided beard and warhammer" },
    { race: "human", desc: "a young human fighter with a shield and sword" },
    { race: "half-orc", desc: "an imposing half-orc fighter in chainmail" },
  ],
  rogue: [
    { race: "halfling", desc: "a halfling rogue in dark leather" },
    { race: "elf", desc: "an elven rogue with a hooded cloak" },
    { race: "human", desc: "a human rogue with daggers and a sly grin" },
    { race: "halfling", desc: "a halfling rogue with quick eyes and a lockpick" },
    { race: "half-orc", desc: "a half-orc rogue lurking in shadows" },
  ],
  cleric: [
    { race: "human", desc: "a human cleric in white and gold vestments" },
    { race: "dwarf", desc: "a dwarven cleric with a holy symbol and hammer" },
    { race: "human", desc: "a human cleric with a gentle expression and prayer beads" },
    { race: "dwarf", desc: "a stern dwarven cleric in battered plate" },
    { race: "elf", desc: "an elven cleric radiating divine light" },
  ],
  wizard: [
    { race: "elf", desc: "an elven wizard with silver hair and arcane robes" },
    { race: "human", desc: "an aged human wizard with a staff and beard" },
    { race: "halfling", desc: "a halfling wizard with oversized spectacles" },
    { race: "elf", desc: "a young elven wizard with glowing runes on their hands" },
    { race: "human", desc: "a weathered human wizard in dark robes" },
  ],
};

async function generateAndUpload(prompt: string, filename: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
      quality: "standard",
    }),
  });

  if (!response.ok) {
    console.error(`DALL-E error: ${response.status} ${await response.text()}`);
    return null;
  }

  const data = await response.json();
  const b64 = data.data[0].b64_json;

  // Upload to catbox.moe
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  const blob = new Blob([Buffer.from(b64, "base64")], { type: "image/png" });
  formData.append("fileToUpload", blob, filename);

  const uploadResp = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: formData,
  });

  if (!uploadResp.ok) {
    console.error(`Catbox upload failed: ${uploadResp.status}`);
    return null;
  }

  return (await uploadResp.text()).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Generating fallback avatar pool...\n");

  const results: Record<string, string[]> = {};

  for (const [cls, entries] of Object.entries(CLASSES)) {
    results[cls] = [];
    console.log(`--- ${cls} ---`);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const prompt = `${AVATAR_STYLE_PROMPT} ${entry.desc}.`;
      const filename = `fallback-${cls}-${i + 1}.png`;

      console.log(`  [${i + 1}/${entries.length}] Generating ${entry.race} ${cls}...`);
      const url = await generateAndUpload(prompt, filename);

      if (url) {
        results[cls].push(url);
        console.log(`  ✓ ${url}`);
      } else {
        console.log(`  ✗ Failed`);
      }

      // Rate limit: 1 request per 3 seconds
      if (i < entries.length - 1) await sleep(3000);
    }

    // Rate limit between classes too
    await sleep(3000);
    console.log();
  }

  // Print ready-to-paste output
  console.log("\n=== PASTE INTO FALLBACK_AVATARS in scheduler.ts ===\n");
  console.log("const FALLBACK_AVATARS: Record<string, string[]> = {");
  for (const [cls, urls] of Object.entries(results)) {
    console.log(`  ${cls}: [`);
    for (const url of urls) {
      console.log(`    "${url}",`);
    }
    console.log(`  ],`);
  }
  console.log("};");
}

main().catch(console.error);
