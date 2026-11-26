// Voice clips (pre-generated mp3) + little synthesized sound effects, via Web Audio.
// iPhone needs the AudioContext to be started from a tap: call unlock() in a tap handler.

import { loadAll } from "./voices.js";

let ctx = null;
let overrides = new Map(); // family recordings: key -> Blob
const buffers = new Map();
let current = null; // currently playing voice source
let phrases = { somali: {}, arabic: {} };
let captionEl = null;
const missing = new Set();

export async function initAudio(captionElement) {
  captionEl = captionElement;
  try { phrases = await (await fetch("phrases.json")).json(); } catch {}
  overrides = await loadAll();
}
export const getPhrases = () => phrases;
export const hasRecording = (key) => overrides.has(key);
/** Use (or stop using, with null) a family recording for this line. */
export function setOverride(key, blob) {
  if (blob) overrides.set(key, blob); else overrides.delete(key);
  buffers.delete(key); missing.delete(key);
}
export function getContext() { if (!ctx) unlock(); return ctx; }

export function unlock() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  // play a silent blip — required by older iOS to fully unlock
  const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
  s.buffer = b; s.connect(ctx.destination); s.start(0);
}

export function captionFor(key) {
  return phrases.somali?.[key] ?? phrases.arabic?.[key] ?? "";
}

async function load(key) {
  if (buffers.has(key)) return buffers.get(key);
  if (missing.has(key)) return null;
  try {
    let data;
    if (overrides.has(key)) data = await overrides.get(key).arrayBuffer();
    else {
      const r = await fetch(`audio/${key}.mp3`);
      if (!r.ok) throw 0;
      data = await r.arrayBuffer();
    }
    const buf = await new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
    buffers.set(key, buf);
    return buf;
  } catch { missing.add(key); return null; }
}

export function preload(keys) { if (ctx) keys.forEach(load); }

export function stopVoice() {
  // stopping fires onended, which resolves whoever was waiting on that clip
  const c = current; current = null;
  if (c) { try { c.stop(); } catch {} }
}

let captionTimer = 0;
function showCaption(text) {
  return; // voice only (no subtitles), as the family asked
  if (!captionEl || !text) return;
  clearTimeout(captionTimer);
  captionEl.textContent = text;
  captionEl.classList.add("show");
}
function hideCaptionSoon() {
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => captionEl?.classList.remove("show"), 250);
}

/** Speak one clip. Resolves when it finishes (or is interrupted). Missing clips wait a moment instead. */
export async function say(key) {
  if (!ctx) unlock();
  stopVoice();
  const buf = await load(key);
  return new Promise((resolve) => {
    if (!buf) {
      const t = setTimeout(done, 1200);
      current = { stop() { clearTimeout(t); done(); } };
      function done() { if (current?.t === t) current = null; resolve(); }
      current.t = t;
      return;
    }
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(safety); if (current === src) current = null; resolve(); };
    // safety net: if the phone has paused audio (call, app switch…), don't wait forever
    const safety = setTimeout(finish, buf.duration * 1000 + 600);
    src.onended = finish;
    current = src;
    src.start();
  });
}

/** Speak several clips back to back; caption shows the joined text.
 *  A newer sayAll() interrupts this one. Resolves true if it played to the end. */
let seq = 0;
export async function sayAll(keys) {
  const my = ++seq;
  duck(true);
  showCaption(keys.map(captionFor).join(" "));
  for (const k of keys) {
    await say(k);
    if (my !== seq) return false;
  }
  hideCaptionSoon();
  duck(false);
  return true;
}

export const isSpeaking = () => !!current;

// ---------- sound effects ----------
// Real recordings (sounds/*.mp3) for applause, engine and music; a few soft synth blips for taps.
const files = new Map();
async function loadFile(name) {
  if (files.has(name)) return files.get(name);
  const p = (async () => {
    try {
      const data = await (await fetch(`sounds/${name}.mp3`)).arrayBuffer();
      return await new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
    } catch { return null; }
  })();
  files.set(name, p);
  return p;
}
export function preloadSounds() { if (ctx) ["applause_1", "applause_2", "applause_big", "rev", "start"].forEach(loadFile); }

async function playFile(name, vol = 1) {
  if (!ctx) return;
  const buf = await loadFile(name);
  if (!buf) return;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; g.gain.value = vol;
  s.connect(g).connect(ctx.destination); s.start();
}

function tone({ freq = 440, to = null, dur = 0.15, type = "sine", vol = 0.25, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
let noise = null;
function swish(vol = 0.25) {
  if (!ctx) return;
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; f.type = "bandpass"; f.Q.value = 1.2;
  f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  s.connect(f).connect(g).connect(ctx.destination); s.start(t); s.stop(t + 0.35);
}

export const sfx = {
  // bright "you got it" chime (bell-like: sine + octave)
  ding() { [1047, 1319, 1568].forEach((f, i) => { tone({ freq: f, dur: 0.5, vol: 0.18, delay: i * 0.07 }); tone({ freq: f * 2, dur: 0.3, vol: 0.05, delay: i * 0.07 }); }); },
  boing() { tone({ freq: 420, to: 260, dur: 0.25, vol: 0.18 }); tone({ freq: 330, to: 200, dur: 0.3, vol: 0.14, delay: 0.12 }); },
  pop() { tone({ freq: 600 + Math.random() * 300, to: 1400, dur: 0.1, vol: 0.18 }); },
  whoosh() { swish(0.22); },
  applause() { playFile(Math.random() < 0.6 ? "applause_1" : "applause_2", 0.9); },
  bigApplause() { playFile("applause_big", 1); },
  rev() { playFile("rev", 0.55); },
  start() { playFile("start", 0.6); },
};

// ---------- background music (loops; ducks under the voice) ----------
let music = null;
const MUSIC_VOL = 0.32, MUSIC_DUCK = 0.1;
export async function musicOn() {
  if (!ctx || music) return;
  music = { pending: true };
  const buf = await loadFile("music");
  if (!buf || !music) return;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; s.loop = true;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(current ? MUSIC_DUCK : MUSIC_VOL, ctx.currentTime + 1.2);
  s.connect(g).connect(ctx.destination); s.start();
  music = { s, g };
}
export function musicOff() {
  if (music?.s) {
    const t = ctx.currentTime;
    music.g.gain.cancelScheduledValues(t); music.g.gain.setValueAtTime(music.g.gain.value, t);
    music.g.gain.linearRampToValueAtTime(0, t + 0.4);
    music.s.stop(t + 0.45);
  }
  music = null;
}
function duck(on) {
  if (!music?.g) return;
  const t = ctx.currentTime;
  music.g.gain.cancelScheduledValues(t); music.g.gain.setValueAtTime(music.g.gain.value, t);
  music.g.gain.linearRampToValueAtTime(on ? MUSIC_DUCK : MUSIC_VOL, t + 0.25);
}
