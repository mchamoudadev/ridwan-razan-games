#!/usr/bin/env node
/**
 * Fallback voice generator: speaks every line in phrases.json with OpenAI gpt-audio via OpenRouter
 * (used while no Gemini key is available). Same output as gen-audio.mjs: audio/<key>.mp3
 *
 *   node tools/gen-audio-openrouter.mjs              # only missing clips
 *   node tools/gen-audio-openrouter.mjs --force      # redo all
 *   node tools/gen-audio-openrouter.mjs mom_go_1     # just these keys
 *
 * Reads OPENROUTER_API_KEY from the environment or ./.env
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error("Set OPENROUTER_API_KEY first."); process.exit(1); }
const OUT = path.join(ROOT, "audio");
mkdirSync(OUT, { recursive: true });

const MODEL = "openai/gpt-audio";
const DAD_VOICE = "ash", MOM_VOICE = "coral";
const P = JSON.parse(readFileSync(path.join(ROOT, "phrases.json"), "utf8"));
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

const RULES = "You are a text-to-speech voice. Speak the user's text EXACTLY, word for word, once. Do not translate, explain, answer, or add any words before or after.";
const STYLE = {
  somali: "The text is Somali (Af-Soomaali). Use native Somali pronunciation (x, c, dh, kh, q, long vowels aa ee ii oo uu). Warm, slow and clear, like a loving father talking to his small child.",
  excited: "The text is Somali (Af-Soomaali). Use native Somali pronunciation. You are a happy, proud Somali dad talking to his own 5-year-old son: casual, warm and natural, smiling, a little excited, NOT a commentator, not shouting.",
  mom: "The text is Somali (Af-Soomaali). Use native Somali pronunciation. You are a loving Somali mom talking to her own little son: casual, warm, gentle and happy, natural like at home, not shouting.",
  arabic: "The text is the name of one Arabic letter. Say it slowly and clearly in Arabic, like a kind Quran teacher teaching a small child. Say only the letter name.",
};

// pronunciation guides for the letters that are easy to get wrong
const HINT = {
  l_ttaa: "Ṭāʾ (ط, the heavy emphatic T, as in Ṭāhā)", l_dhaa: "Ẓāʾ (ظ, the heavy emphatic DH)", l_ghayn: "Ghayn (غ)",
  l_daad: "Ḍād (ض)", l_kaaf: "Kāf (ك, a plain K, not KH)", l_saad: "Ṣād (ص, the heavy emphatic S)", l_qaaf: "Qāf (ق, a deep Q from the throat)",
  l_cayn: "ʿAyn (ع)", l_hhaa: "Hāʾ (ه, a soft breathy H)", l_haa: "Ḥāʾ (ح, a strong throaty H)", l_khaa: "Khāʾ (خ)",
};
const jobs = [
  ...Object.entries(P.somali).map(([k, text]) => {
    const mom = k.startsWith("mom_") || k === "razan_mom";
    const excited = (P.excitedKeys || []).some((pre) => k.startsWith(pre));
    return { k, text, style: mom ? STYLE.mom : excited ? STYLE.excited : STYLE.somali, voice: mom ? MOM_VOICE : DAD_VOICE };
  }),
  ...Object.entries(P.arabic).map(([k, text]) => ({ k, text, voice: DAD_VOICE,
    style: STYLE.arabic + (HINT[k] ? ` The letter is ${HINT[k]}; pronounce it exactly that way.` : "") })),
].filter((j) => (only.length ? only.includes(j.k) : force || !existsSync(path.join(OUT, `${j.k}.mp3`))));

function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

let spent = 0;
async function speak(job, attempt = 1) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, stream: true, modalities: ["text", "audio"],
        audio: { voice: job.voice, format: "pcm16" },
        messages: [{ role: "system", content: `${RULES} ${job.style}` }, { role: "user", content: job.text }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const txt = await r.text();
    let b64 = "";
    for (const line of txt.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (d === "[DONE]") continue;
      try {
        const j = JSON.parse(d);
        const a = j.choices?.[0]?.delta?.audio;
        if (a?.data) b64 += a.data;
        if (j.usage?.cost) spent += j.usage.cost;
      } catch {}
    }
    if (!b64) throw new Error("no audio returned");
    return pcmToWav(Buffer.from(b64, "base64"));
  } catch (e) {
    if (attempt < 3) { console.log(`  retry ${job.k} (${e.message})`); return speak(job, attempt + 1); }
    throw e;
  }
}

console.log(`${jobs.length} clip(s) with ${MODEL} (dad: ${DAD_VOICE}, mom: ${MOM_VOICE})`);
let failed = 0;
for (let i = 0; i < jobs.length; i += 5) {
  await Promise.all(jobs.slice(i, i + 5).map(async (job) => {
    try {
      const wav = path.join(OUT, `${job.k}.wav`);
      writeFileSync(wav, await speak(job));
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav,
        "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16",
        "-ac", "1", "-ar", "24000", "-b:a", "64k", path.join(OUT, `${job.k}.mp3`)]);
      unlinkSync(wav);
      console.log(`  ✓ ${job.k}`);
    } catch (e) { failed++; console.log(`  ✗ ${job.k}: ${e.message}`); }
  }));
}
console.log(`cost ≈ $${spent.toFixed(3)}. ${failed ? `${failed} failed — run again to retry.` : "All done."}`);
process.exit(failed ? 1 : 0);
