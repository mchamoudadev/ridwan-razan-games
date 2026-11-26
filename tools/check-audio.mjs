#!/usr/bin/env node
/**
 * Quality check: Gemini listens to each generated clip and writes down what it hears,
 * so we can compare it with the intended Somali text (we can't listen ourselves).
 *   node tools/check-audio.mjs key1 key2 ...     (no keys = all clips in audio/)
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}
const KEY = process.env.OPENROUTER_API_KEY;
const P = JSON.parse(readFileSync(path.join(ROOT, "phrases.json"), "utf8"));
const want = { ...P.somali, ...P.arabic };
let keys = process.argv.slice(2);
if (!keys.length) keys = readdirSync(path.join(ROOT, "audio")).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4));

let cost = 0;
async function check(k) {
  const b64 = readFileSync(path.join(ROOT, "audio", `${k}.mp3`)).toString("base64");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash", max_tokens: 400,
      messages: [{ role: "user", content: [
        { type: "text", text: `Transcribe exactly what is spoken in this clip (it should be Somali, or an Arabic letter name). Then rate how natural and correct the Somali/Arabic pronunciation sounds from 1 (bad/foreign/wrong words) to 5 (native, clear). Reply as: TRANSCRIPT: ... | SCORE: n | NOTE: few words` },
        { type: "input_audio", input_audio: { data: b64, format: "mp3" } },
      ] }],
    }),
  });
  const j = await r.json();
  cost += j.usage?.cost || 0;
  return j.choices?.[0]?.message?.content?.trim() || JSON.stringify(j).slice(0, 200);
}

for (let i = 0; i < keys.length; i += 6) {
  const res = await Promise.all(keys.slice(i, i + 6).map(async (k) => [k, await check(k)]));
  for (const [k, out] of res) console.log(`${k}\n  want: ${want[k]}\n  got:  ${out.replace(/\n/g, " ")}`);
}
console.log(`check cost ≈ $${cost.toFixed(3)}`);
