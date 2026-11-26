#!/usr/bin/env node
/**
 * Generate every spoken line in phrases.json as an .mp3 in audio/ using Gemini TTS.
 * Run once (and again whenever phrases.json changes):
 *
 *   GEMINI_API_KEY=... node tools/gen-audio.mjs            # only missing clips
 *   GEMINI_API_KEY=... node tools/gen-audio.mjs --force    # regenerate all
 *   GEMINI_API_KEY=... node tools/gen-audio.mjs razan_cat  # just these keys
 *
 * Needs ffmpeg (WAV -> MP3, which plays on both iPhone and Android).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "audio");
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("Set GEMINI_API_KEY first."); process.exit(1); }

const P = JSON.parse(readFileSync(path.join(ROOT, "phrases.json"), "utf8"));
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
mkdirSync(OUT, { recursive: true });

const jobs = [
  ...Object.entries(P.somali).map(([k, t]) => {
    const mom = k.startsWith("mom_") || k === "razan_mom";
    const excited = (P.excitedKeys || []).some((pre) => k.startsWith(pre));
    const style = mom ? P.momStyle : excited ? P.excitedStyle : P.somaliStyle;
    return { k, text: `${style} ${t}`, lang: "so-SO", voice: mom ? P.momVoice : P.voice };
  }),
  ...Object.entries(P.arabic).map(([k, t]) => ({ k, text: `${P.arabicStyle} ${t}`, lang: null })),
].filter((j) => (only.length ? only.includes(j.k) : true))
 .filter((j) => force || only.length || !existsSync(path.join(OUT, `${j.k}.mp3`)));

function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function tts(job, attempt = 1) {
  const body = {
    contents: [{ parts: [{ text: job.text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      temperature: 0.55,
      speechConfig: {
        ...(job.lang ? { languageCode: job.lang } : {}),
        voiceConfig: { prebuiltVoiceConfig: { voiceName: job.voice || P.voice } },
      },
    },
  };
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${P.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${j?.error?.message}`);
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) throw new Error(`no audio (finishReason ${j.candidates?.[0]?.finishReason})`);
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] || 24000);
    return pcmToWav(Buffer.from(part.inlineData.data, "base64"), rate);
  } catch (e) {
    if (attempt < 3 && !/HTTP 4(0[013])/.test(e.message)) {
      console.log(`  retry ${job.k} (${e.message})`);
      return tts(job, attempt + 1);
    }
    throw e;
  }
}

console.log(`${jobs.length} clip(s) to generate with ${P.model} / ${P.voice}`);
let failed = 0;
// A few at a time: fast, but gentle on the API.
for (let i = 0; i < jobs.length; i += 4) {
  await Promise.all(jobs.slice(i, i + 4).map(async (job) => {
    try {
      const wav = path.join(OUT, `${job.k}.wav`);
      writeFileSync(wav, await tts(job));
      // trim leading/trailing silence, normalise loudness, mono mp3
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav,
        "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16",
        "-ac", "1", "-ar", "24000", "-b:a", "64k", path.join(OUT, `${job.k}.mp3`)]);
      unlinkSync(wav);
      console.log(`  ✓ ${job.k}`);
    } catch (e) { failed++; console.log(`  ✗ ${job.k}: ${e.message}`); }
  }));
}
console.log(failed ? `${failed} failed — run again to retry just those.` : "All done.");
process.exit(failed ? 1 : 0);
