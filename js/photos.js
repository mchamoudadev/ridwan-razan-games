// Family photos live ONLY on this phone (IndexedDB) — they are never part of the website.
// Until a parent adds one, a friendly placeholder is shown.
const DB = "rr-photos", STORE = "photos";

export const SLOTS = [
  { id: "ridwan", label: "Ridwan", emoji: "🧒", bg: "#a5d8ff" },
  { id: "razan", label: "Razan", emoji: "👶", bg: "#fcc2d7" },
  { id: "mom", label: "Hooyo · Mom", emoji: "👩", bg: "#ffdeeb" },
  { id: "dad", label: "Aabbe · Dad", emoji: "👨", bg: "#d0ebff" },
  { id: "dad-razan", label: "Aabbe & Razan", emoji: "👨‍👧", bg: "#d0ebff" },
  { id: "family", label: "Qoyska · Family", emoji: "👨‍👩‍👧‍👦", bg: "#ffe8cc" },
];
const byId = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
const urls = new Map();

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function run(mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result);
    t.onerror = () => rej(t.error);
  }));
}

export async function initPhotos() {
  try {
    const d = await db();
    await new Promise((res) => {
      const req = d.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) { urls.set(c.key, URL.createObjectURL(c.value)); c.continue(); } else res();
      };
      req.onerror = () => res();
    });
  } catch {}
}

export const hasPhoto = (id) => urls.has(id);

/** URL to use in <img src> or for a canvas texture: the family photo, or a placeholder. */
export function photo(id) {
  if (urls.has(id)) return urls.get(id);
  const s = byId[id] || { emoji: "🙂", bg: "#e9ecef" };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${s.bg}"/><text x="128" y="160" font-size="128" text-anchor="middle">${s.emoji}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** Square-crop (a little above centre, where faces usually are), shrink, and save on this phone. */
export async function savePhoto(id, file) {
  const img = await loadImage(file);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, s = Math.min(w, h);
  const sx = (w - s) / 2, sy = h > w ? (h - s) * 0.22 : 0;
  const cv = document.createElement("canvas"); cv.width = cv.height = 600;
  cv.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, 600, 600);
  const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.86));
  await run("readwrite", (st) => st.put(blob, id));
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.set(id, URL.createObjectURL(blob));
}
export async function removePhoto(id) {
  await run("readwrite", (st) => st.delete(id));
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
}
function loadImage(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { res(im); URL.revokeObjectURL(u); };
    im.onerror = () => { rej(new Error("Can't read this photo")); URL.revokeObjectURL(u); };
    im.src = u;
  });
}
