import { photo, hasPhoto } from "./photos.js";
// Razan's Tap & Hear: one big friendly picture. Any tap = it bounces and Daddy's voice names it.
import { sayAll, sfx, preload, stopVoice, isSpeaking } from "./audio.js";

const THINGS = [
  { key: "razan_cat", img: "images/cat.jpg", word: "Bisad", bg: "#ffd8a8" },
  { key: "razan_dog", img: "images/dog.jpg", word: "Eey", bg: "#d0ebff" },
  { key: "razan_cow", img: "images/cow.jpg", word: "Sac", bg: "#d3f9d8" },
  { key: "razan_camel", img: "images/camel.jpg", word: "Geel", bg: "#fff3bf" },
  { key: "razan_goat", img: "images/goat.jpg", word: "Ri'", bg: "#e5dbff" },
  { key: "razan_chicken", img: "images/chicken.jpg", word: "Digaag", bg: "#ffe3e3" },
  { key: "razan_bird", img: "images/bird.jpg", word: "Shimbir", bg: "#c5f6fa" },
  { key: "razan_lion", img: "images/lion.jpg", word: "Libaax", bg: "#ffec99" },
  { key: "razan_moto", img: "images/moto.jpg", word: "Mooto", bg: "#ffc9c9" },
  { key: "razan_car", img: "images/car.jpg", word: "Baabuur", bg: "#d0ebff" },
  { key: "razan_sheep", img: "images/sheep.jpg", word: "Lax", bg: "#d8f5a2" },
  { key: "razan_self", photo: "razan", word: "Razan", bg: "#fcc2d7" },
  { key: "razan_mom", photo: "mom", word: "Hooyo", bg: "#fcc2d7" },
  { key: "razan_dad", photo: ["dad-razan", "dad"], word: "Aabbe", bg: "#a5d8ff" },
  { key: "razan_brother", photo: "ridwan", word: "Ridwan", bg: "#b2f2bb" },
  { key: "razan_family", photo: "family", word: "Qoyskeenna", bg: "#ffe8cc" },
  { key: "razan_moon", img: "images/moon.jpg", word: "Dayax", bg: "#dbe4ff" },
];

// family cards appear only once that photo has been added on this phone
function availableThings() {
  return THINGS.map((t) => {
    if (!t.photo) return t;
    const id = [].concat(t.photo).find(hasPhoto);
    return id ? { ...t, img: photo(id) } : null;
  }).filter(Boolean);
}

export function startBaby(root) {
  const LIST = availableThings();
  root.innerHTML = `
    <div class="baby">
      <div class="thing"><img class="photo" alt="" draggable="false"></div>
      <div class="word"></div>
    </div>`;
  const box = root.querySelector(".baby"), photo = root.querySelector(".photo"), word = root.querySelector(".word");
  const thingEl = root.querySelector(".thing");
  let order = [], idx = -1, busy = false, alive = true;

  function next() {
    if (++idx >= order.length) { order = [...LIST].sort(() => Math.random() - 0.5); idx = 0; }
    const t = order[idx];
    photo.src = t.img; word.textContent = t.word;
    box.style.background = t.bg;
    thingEl.classList.remove("enter", "bounce"); void thingEl.offsetWidth; thingEl.classList.add("enter");
  }

  function hearts(x, y) {
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("span");
      s.className = "heart";
      s.textContent = ["❤️", "⭐", "💛", "✨", "💜"][i % 5];
      const a = (Math.PI * 2 * i) / 8, d = 80 + Math.random() * 90;
      s.style.left = x + "px"; s.style.top = y + "px";
      s.style.setProperty("--dx", Math.cos(a) * d + "px");
      s.style.setProperty("--dy", Math.sin(a) * d + "px");
      box.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    }
  }

  box.addEventListener("pointerdown", async (e) => {
    e.preventDefault();
    sfx.pop(); hearts(e.clientX, e.clientY);
    thingEl.classList.remove("enter", "bounce"); void thingEl.offsetWidth; thingEl.classList.add("bounce");
    if (busy) return;           // tapping while talking = just fun pops, no interruptions
    busy = true;
    await sayAll([order[idx].key]);
    if (!alive) return;
    await new Promise((r) => setTimeout(r, 700));
    busy = false;
    if (alive) next();
  });

  preload(["razan_hello", ...LIST.map((t) => t.key)]);
  LIST.forEach((t) => { new Image().src = t.img; }); // warm the image cache
  next();
  sayAll(["razan_hello"]);

  return () => { alive = false; stopVoice(); };
}
