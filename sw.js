// Offline support: cache the app + every voice clip so the games work with no internet.
const VERSION = "v17";
const CORE = ["./", "index.html", "phrases.json", "manifest.webmanifest", "js/app.js", "js/audio.js", "js/moto.js", "js/baby.js", "js/record.js", "js/voices.js", "js/race3d.js", "js/letters.js", "js/photos.js", "vendor/three.module.min.js", "vendor/addons/loaders/GLTFLoader.js", "vendor/addons/utils/BufferGeometryUtils.js", "models/race.glb", "models/ferrari.glb", "models/motorcycle.glb", "models/ferrari_ao.png", "vendor/addons/loaders/DRACOLoader.js", "vendor/addons/environments/RoomEnvironment.js", "vendor/addons/libs/draco/gltf/draco_decoder.wasm", "vendor/addons/libs/draco/gltf/draco_wasm_wrapper.js", "models/Textures/colormap.png", "icons/icon-192.png", "icons/icon-512.png",
  ...["cat","dog","cow","camel","goat","chicken","bird","lion","moto","car","sheep","moon"].map((k) => `images/${k}.jpg`), "images/vehicles/moto.png", "images/vehicles/car.png",
  ...["applause_1","applause_2","applause_big","rev","start"].map((k) => `sounds/${k}.mp3`)];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    try {
      const p = await (await fetch("phrases.json")).json();
      const clips = [...Object.keys(p.somali), ...Object.keys(p.arabic)].map((k) => `audio/${k}.mp3`);
      await Promise.all(clips.map((u) => cache.add(u).catch(() => {})));
    } catch {}
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    self.clients.claim();
  })());
});
// network first (so updates arrive), falling back to cache when offline
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      // always ask the server if there is a newer version (cheap 304 when unchanged); fall back to cache offline
      const res = await fetch(e.request, { cache: "no-cache" });
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request)) || Response.error();
    }
  })());
});
