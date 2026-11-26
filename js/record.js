import { photo, SLOTS, savePhoto, removePhoto, hasPhoto } from "./photos.js";
// Parent screen: record (or upload) your own voice for any line. Your recording replaces the AI voice.
import { sayAll, getPhrases, hasRecording, setOverride, stopVoice } from "./audio.js";
import { saveClip, deleteClip } from "./voices.js";

const GROUPS = [
  { title: "👩 Hooyo — Mom cheering Ridwan", match: (k) => k.startsWith("mom_") },
  { title: "👨 Aabbe & 🏍️ Ridwan's game", match: (k) => k.startsWith("ridwan_") },
  { title: "🐱 Razan's game", match: (k) => k.startsWith("razan_") },
];
const MAX_SECONDS = 15;

export function startRecorder(root) {
  const lines = getPhrases().somali || {};
  root.innerHTML = `
    <div class="rec">
      <header>
        <img src="${photo("mom")}" alt="">
        <div><h2>Qoyska · Family</h2><p>Add your family photos and record your own voice. Everything stays <b>on this phone only</b> — it is never uploaded.</p></div>
      </header>
      <h3>📷 Sawirrada qoyska — Family photos</h3>
      <div class="photos">
        ${SLOTS.map((p) => `
          <label class="ph" data-id="${p.id}">
            <img src="${photo(p.id)}" alt="">
            <span>${p.label}</span>
            <input type="file" accept="image/*" hidden>
            <button class="rm" type="button" aria-label="Remove photo">✕</button>
          </label>`).join("")}
      </div>
      <p class="hint">Tap a picture to choose a photo from your gallery.</p>
      <h3 style="margin-top:26px">🎙️ Codadka — Voices</h3>
      <p class="hint" style="text-align:left;margin:0 0 6px">Tap 🎙 to record, ⏹ to stop. The kids hear <b>you</b> instead of the computer voice.</p>
      ${GROUPS.map((g) => `
        <h3>${g.title}</h3>
        ${Object.keys(lines).filter(g.match).map((k) => `
          <div class="line" data-key="${k}">
            <div class="txt">${lines[k]}<span class="who"></span></div>
            <div class="btns">
              <button class="play" aria-label="Play">▶️</button>
              <button class="mic" aria-label="Record">🎙️</button>
              <label class="up" aria-label="Upload">⬆️<input type="file" accept="audio/*" hidden></label>
              <button class="reset" aria-label="Use computer voice">↩️</button>
            </div>
          </div>`).join("")}`).join("")}
      <p class="hint">Photos and recordings stay on this phone only.</p>
    </div>`;

  // ---- family photos
  const markPhoto = (el) => {
    el.classList.toggle("set", hasPhoto(el.dataset.id));
    el.querySelector("img").src = photo(el.dataset.id);
  };
  root.querySelectorAll(".ph").forEach((el) => {
    markPhoto(el);
    el.querySelector("input").addEventListener("change", async (e) => {
      const f = e.target.files?.[0]; e.target.value = "";
      if (!f) return;
      try { await savePhoto(el.dataset.id, f); markPhoto(el); } catch { el.querySelector("span").textContent = "⚠️ try another photo"; }
    });
    el.querySelector(".rm").addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      await removePhoto(el.dataset.id); markPhoto(el);
    });
  });

  const refresh = (row) => {
    const mine = hasRecording(row.dataset.key);
    row.classList.toggle("mine", mine);
    row.querySelector(".who").textContent = mine ? " · 🎙️ your voice" : "";
  };
  root.querySelectorAll(".line").forEach(refresh);

  let rec = null; // { mr, row, stream, timer }
  async function store(row, blob) {
    const key = row.dataset.key;
    await saveClip(key, blob);
    setOverride(key, blob);
    refresh(row);
    sayAll([key]); // play it back right away
  }

  function stopRec() {
    if (!rec) return;
    clearTimeout(rec.timer);
    if (rec.mr.state !== "inactive") rec.mr.stop();
  }

  async function startRec(row) {
    stopVoice();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { row.querySelector(".who").textContent = " · ⚠️ allow the microphone to record"; return; }
    const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      row.classList.remove("recording");
      row.querySelector(".mic").textContent = "🎙️";
      const blob = new Blob(chunks, { type: mr.mimeType || type || "audio/webm" });
      rec = null;
      if (blob.size > 1000) store(row, blob);
    };
    mr.start();
    row.classList.add("recording");
    row.querySelector(".mic").textContent = "⏹️";
    rec = { mr, row, timer: setTimeout(stopRec, MAX_SECONDS * 1000) };
  }

  root.querySelector(".rec").addEventListener("click", (e) => {
    const row = e.target.closest(".line");
    if (!row) return;
    const key = row.dataset.key;
    if (e.target.closest(".play")) sayAll([key]);
    else if (e.target.closest(".mic")) {
      if (rec && rec.row === row) stopRec();
      else if (!rec) startRec(row);
    } else if (e.target.closest(".reset")) {
      deleteClip(key).then(() => { setOverride(key, null); refresh(row); });
    }
  });
  root.querySelectorAll(".up input").forEach((inp) => inp.addEventListener("change", () => {
    const f = inp.files?.[0];
    if (f) store(inp.closest(".line"), f);
    inp.value = "";
  }));

  return () => { stopRec(); stopVoice(); };
}
