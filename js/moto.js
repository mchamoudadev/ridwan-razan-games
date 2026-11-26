// Ridwan's Moto Alphabet: Ridwan (his own face in the helmet!) rides into the lane with the letter
// the voice asks for. Big celebrations when he's right; the voice tells him the colour when he's not.
import { LETTERS } from "./letters.js";
import { photo } from "./photos.js";
import { sayAll, sfx, preload, preloadSounds, stopVoice } from "./audio.js";

const START_POOL = 3;        // letters he starts with
const UNLOCK_EVERY = 3;      // a new letter every N correct answers
const ROUND_GOAL = 12;       // correct answers to finish a ride
// each lane has a fixed, clearly different colour, so the voice can say "the blue one"
const LANES = [
  { color: "#fa5252", dark: "#c92a2a", name: "red" },
  { color: "#339af0", dark: "#1864ab", name: "blue" },
  { color: "#fcc419", dark: "#e67700", name: "yellow" },
];
const RIGHT_LINES = 6, GO_LINES = 3, MOM_GO = 3, MOM_RIGHT = 2;
const MOM_BUBBLE = { go: "Ahow, Ridwan! 💪", right: "Waa sax! ❤️", miss: "Waad kartaa! 💕", cheer: "Hooyo way ku faantaa! 🎉" };
const DAD_BUBBLE = { go: "Orod, Ridwan! 🏍️", right: "Geesi! 🏆", miss: "Mar kale! 👍", cheer: "Mashaa Allah! 🎉", hello: "Soo dhawoow! 👋" };
const CONFETTI = ["#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7", "#da77f2", "#ffa94d"];
const HERO_SUBS = ["⭐ Waa sax! ⭐", "🏆 Geesi! 🏆", "🔥 Mashaa Allah! 🔥", "🎉 Hambalyo! 🎉"];

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const pick = (n) => 1 + Math.floor(Math.random() * n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function startMoto(root) {
  root.innerHTML = `
    <div class="moto">
      <canvas></canvas>
      <button class="target hidden" aria-label="Repeat"><span class="ch"></span><span class="spk">🔊</span></button>
      <div class="stars">⭐ <b>0</b></div>
      <div class="progress"><i></i></div>
      <div class="fan mom"><div class="bubble"></div><img src="${photo("mom")}" alt=""><div class="poms"><span>🎉</span><span>🎊</span></div><div class="tag">Hooyo</div></div>
      <div class="fan dad"><div class="bubble"></div><img src="${photo("dad")}" alt=""><div class="poms"><span>👏</span><span>🏁</span></div><div class="tag">Aabbe</div></div>
      <div class="hero hidden">
        <div class="rays"></div>
        <img src="${photo("ridwan")}" alt="">
        <div class="name">RIDWAN!</div>
        <div class="sub"></div>
      </div>
      <div class="choose hidden">
        <h2>Dooro! 🏁</h2>
        <div class="opts">
          <button data-v="moto"><img src="images/moto.jpg" alt=""><span>🏍️ Mooto</span></button>
          <button data-v="car"><img src="images/car.jpg" alt=""><span>🚗 Baabuur</span></button>
        </div>
      </div>
      <div class="done hidden">
        <img class="me" src="${photo("ridwan")}" alt=""><div class="trophy">🏆</div>
        <h2>Mashaa Allah, Ridwan!</h2>
        <p class="learned"></p>
        <button class="again big">🏁 Mar kale</button>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const canvas = $("canvas"), c = canvas.getContext("2d");
  const targetBtn = $(".target"), starsEl = $(".stars b"), progEl = $(".progress i"), doneEl = $(".done");
  const heroEl = $(".hero"), heroSub = $(".hero .sub");
  const momEl = $(".mom"), momBubble = $(".mom .bubble");
  const dadEl = $(".dad"), dadBubble = $(".dad .bubble");
  let dadTimer = 0, dadToken = 0;
  function dadCheer(kind, ms = 2200) {
    dadToken++;
    dadBubble.textContent = DAD_BUBBLE[kind];
    dadEl.classList.add("cheer");
    clearTimeout(dadTimer);
    dadTimer = setTimeout(() => dadEl.classList.remove("cheer"), ms);
  }
  /** Dad's lines (the male voice): he bounces and waves while they play. */
  async function dadSay(kind, keys) {
    dadCheer(kind, 60000);
    const mine = dadToken;
    const done = await sayAll(keys);
    if (dadToken === mine) { clearTimeout(dadTimer); dadTimer = setTimeout(() => dadEl.classList.remove("cheer"), 600); }
    return done;
  }
  let momTimer = 0, momToken = 0;
  function momCheer(kind, ms = 2200) {
    momToken++;
    momBubble.textContent = MOM_BUBBLE[kind];
    momEl.classList.add("cheer");
    clearTimeout(momTimer); clearTimeout(dadTimer);
    momTimer = setTimeout(() => momEl.classList.remove("cheer"), ms);
  }
  /** Mom speaks (female voice) while she bounces with her pom-poms. */
  async function momSay(kind, key, ...more) {
    momCheer(kind, 60000);
    const mine = momToken;
    const done = await sayAll([key, ...more]);
    if (momToken === mine) { clearTimeout(momTimer); momTimer = setTimeout(() => momEl.classList.remove("cheer"), 600); }
    return done;
  }

  const face = new Image(); face.src = photo("ridwan");
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth; H = root.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  const geo = () => {
    // leave room on the left for Mom on narrow phones
    const roadW = W < 600 ? W - 136 : Math.min(W * 0.92, 480);
    const left = (W - roadW) / 2, laneW = roadW / 3;
    return {
      roadW, left, laneW, bikeY: H * 0.72, bikeS: Math.min(1.5, laneW / 85),
      laneX: (i) => left + laneW * (i + 0.5), r: Math.min(laneW * 0.38, 62),
    };
  };

  // ---- game state
  let pool = Math.max(START_POOL, store.get("ridwan.pool", START_POOL));
  const mastery = store.get("ridwan.mastery", {});
  let lane = 1, bikeX = null, lean = 0;
  let vehicle = store.get("ridwan.vehicle", "moto");
  let scroll = 0, speed = 0, baseSpeed = 260;
  let boost = 0;        // seconds of turbo left (after a correct answer)
  let glow = 0;         // golden glow around the rider
  let intro = -1;       // 0..1 while his face flies onto the helmet
  let target = null, lastTarget = null;
  let row = null;       // { y, items:[{ch,key,lane,state,t}] }
  let state = "intro";
  let correct = 0, stars = store.get("ridwan.stars", 0);
  let rowsSinceCheer = 0, lastParent = "mom", cheering = null;
  const nextParent = () => (lastParent = lastParent === "mom" ? "dad" : "mom");
  const particles = [];
  const scenery = Array.from({ length: 10 }, (_, i) => ({
    side: i % 2, y: i * 120, e: ["🌳", "🌴", "🌵", "🏠", "🌳", "🐪", "🌼", "🕌"][i % 8],
  }));
  starsEl.textContent = stars;

  function pickTarget() {
    const avail = LETTERS.slice(0, pool).filter((l) => l !== lastTarget);
    // less-practised letters come up more often
    const weighted = avail.flatMap((l) => {
      const m = mastery[l.key] || 0;
      return Array(m < 2 ? 3 : m < 5 ? 2 : 1).fill(l);
    });
    lastTarget = weighted[Math.floor(Math.random() * weighted.length)];
    return lastTarget;
  }

  function spawnRow() {
    const near = LETTERS.filter((l) => l !== target).slice(0, Math.max(pool, 3));
    const two = near.sort(() => Math.random() - 0.5).slice(0, 2);
    const letters = [target, ...two].sort(() => Math.random() - 0.5);
    row = { y: -80, items: letters.map((l, i) => ({ ...l, lane: i, state: "idle", t: 0 })) };
    // commentary while he rides: "Orod, Ridwan, orod!"
    const myRow = row;
    // commentary while he rides: Dad's "Orod, Ridwan, orod!" or Mom's "Ahow, ahow, Ridwan! Waad kartaa!"
    setTimeout(() => {
      if (!(alive && row === myRow && state === "riding")) return;
      if (++rowsSinceCheer < 3 || Math.random() < 0.4) return;   // only now and then
      rowsSinceCheer = 0;
      cheering = nextParent() === "mom" ? momSay("go", `mom_go_${pick(MOM_GO)}`) : dadSay("go", [`ridwan_go_${pick(GO_LINES)}`]);
      cheering.finally(() => { cheering = null; });
    }, 250);
  }

  async function ask() {
    state = "asking";
    targetBtn.classList.remove("hidden");
    targetBtn.querySelector(".ch").textContent = target.ch;
    targetBtn.classList.remove("pulse"); void targetBtn.offsetWidth; targetBtn.classList.add("pulse");
    await sayAll(["ridwan_find", target.key]);
    if (!alive) return;
    spawnRow();
    state = "riding";
  }

  async function newRound() {
    target = pickTarget();
    await ask();
  }

  function showHero(sub) {
    heroSub.textContent = sub;
    heroEl.classList.remove("hidden", "out"); void heroEl.offsetWidth; heroEl.classList.add("in");
  }
  function hideHero() {
    heroEl.classList.remove("in"); heroEl.classList.add("out");
    setTimeout(() => { if (heroEl.classList.contains("out")) heroEl.classList.add("hidden"); }, 350);
  }

  async function resolve(item) {
    state = "feedback";
    // let a parent finish their "go, go!" before the next line (no talking over each other)
    if (cheering) await Promise.race([cheering, wait(3000)]);
    const g = geo();
    if (item.ch === target.ch) {
      // ---- RIGHT: celebrate big!
      item.state = "hit";
      sfx.ding(); sfx.applause(); sfx.rev();
      boost = 1.6; glow = 2.5;
      confetti(W / 2, H * 0.35, 90);
      burst(g.laneX(item.lane), g.bikeY - 60, ["⭐", "🌟", "✨"], 14);
      stars++; correct++;
      mastery[target.key] = (mastery[target.key] || 0) + 1;
      if (correct % UNLOCK_EVERY === 0 && pool < LETTERS.length) { pool++; store.set("ridwan.pool", pool); }
      store.set("ridwan.stars", stars); store.set("ridwan.mastery", mastery);
      starsEl.textContent = stars;
      starsEl.parentElement.classList.remove("pop"); void starsEl.offsetWidth; starsEl.parentElement.classList.add("pop");
      progEl.style.width = `${(correct / ROUND_GOAL) * 100}%`;
      baseSpeed = 260 + correct * 12;
      showHero(HERO_SUBS[Math.floor(Math.random() * HERO_SUBS.length)]);
      // ONE parent answers (they take turns); the other just bounces and waves
      const praise = nextParent() === "mom"
        ? (dadCheer("cheer", 3000), momSay("right", `mom_right_${pick(MOM_RIGHT)}`, target.key))
        : (momCheer("cheer", 3000), dadSay("right", [`ridwan_right_${pick(RIGHT_LINES)}`, target.key]));
      await Promise.all([praise, wait(2200)]);
      hideHero();
      row = null;
      if (!alive) return;
      if (correct >= ROUND_GOAL) return finish();
      newRound();
    } else {
      // ---- WRONG: gently show which one was right, and say its colour
      item.state = "miss";
      const right = row.items.find((it) => it.ch === target.ch);
      right.state = "answer";
      sfx.boing();
      burst(g.laneX(item.lane), g.bikeY - 50, ["💨"], 6);
      await Promise.all([dadSay("miss", [`ridwan_miss_${LANES[right.lane].name}`]), wait(1800)]);
      row = null;
      if (!alive) return;
      ask();
    }
  }

  async function finish() {
    state = "done";
    baseSpeed = 0;
    sfx.bigApplause();
    momCheer("cheer", 8000); dadCheer("cheer", 8000);
    for (let i = 0; i < 6; i++) setTimeout(() => confetti(Math.random() * W, H * 0.3, 60), i * 300);
    $(".learned").innerHTML = LETTERS.slice(0, pool).map((l) => `<span>${l.ch}</span>`).join("");
    doneEl.classList.remove("hidden");
    await sayAll(["ridwan_done"]);
  }

  function burst(x, y, emojis, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 240;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 180, life: 1, e: emojis[i % emojis.length], size: 18 + Math.random() * 20 });
    }
  }
  function confetti(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, s = 250 + Math.random() * 500;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.6, rect: true,
        color: CONFETTI[i % CONFETTI.length], w: 6 + Math.random() * 6, h: 10 + Math.random() * 8,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  // ---- input: tap a lane (or left/right half; arrow keys on a keyboard)
  function move(dir) {
    if (state === "done") return;
    const n = Math.max(0, Math.min(2, lane + dir));
    if (n !== lane) { lane = n; sfx.whoosh(); }
  }
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === "done") return;
    const g = geo();
    const tapped = Math.floor((e.clientX - g.left) / g.laneW);
    if (tapped >= 0 && tapped <= 2 && e.clientY > H * 0.45) { if (tapped !== lane) { lane = tapped; sfx.whoosh(); } }
    else move(e.clientX < W / 2 ? -1 : 1);
  });
  const onKey = (e) => { if (e.key === "ArrowLeft") move(-1); if (e.key === "ArrowRight") move(1); };
  window.addEventListener("keydown", onKey);
  targetBtn.addEventListener("click", () => { if (state === "riding" && target) sayAll(["ridwan_find", target.key]); });
  $(".again").addEventListener("click", () => {
    doneEl.classList.add("hidden");
    correct = 0; progEl.style.width = "0%"; baseSpeed = 260;
    newRound();
  });

  // ---- drawing
  function drawRoad(g) {
    c.fillStyle = "#7bc950"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#6fbd45";
    for (let y = (scroll * 0.5) % 80 - 80; y < H; y += 80) c.fillRect(0, y, W, 40);
    // red/white kerbs
    for (let y = (scroll % 60) - 60; y < H; y += 60) {
      c.fillStyle = "#fff"; c.fillRect(g.left - 14, y, 14, 30); c.fillRect(g.left + g.roadW, y, 14, 30);
      c.fillStyle = "#fa5252"; c.fillRect(g.left - 14, y + 30, 14, 30); c.fillRect(g.left + g.roadW, y + 30, 14, 30);
    }
    c.fillStyle = "#4a4f57"; c.fillRect(g.left, 0, g.roadW, H);
    // faint lane tint, so each lane "is" its colour
    LANES.forEach((l, i) => { c.fillStyle = l.color + "18"; c.fillRect(g.left + g.laneW * i, 0, g.laneW, H); });
    c.fillStyle = "#ffe066";
    for (let i = 1; i < 3; i++) {
      const x = g.left + g.laneW * i - 3;
      for (let y = (scroll % 70) - 70; y < H; y += 70) c.fillRect(x, y, 6, 38);
    }
    // his name painted on the road
    const ny = ((scroll + 300) % 1100) - 120;
    c.save(); c.globalAlpha = 0.22; c.fillStyle = "#fff";
    c.font = `900 ${g.roadW * 0.17}px ui-rounded, "Arial Rounded MT Bold", sans-serif`;
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("RIDWAN", W / 2, ny);
    c.restore();
    // roadside scenery
    c.textAlign = "center"; c.textBaseline = "middle";
    const sideW = g.left - 14;
    if (sideW > 24) {
      c.font = `${Math.min(sideW * 0.8, 54)}px serif`;
      for (const s of scenery) {
        const y = ((s.y + scroll) % (H + 200)) - 100;
        c.fillText(s.e, s.side ? W - sideW / 2 : sideW / 2, y);
      }
    }
    // speed lines during turbo
    if (boost > 0) {
      c.strokeStyle = `rgba(255,255,255,${Math.min(0.6, boost)})`; c.lineWidth = 3;
      for (let i = 0; i < 14; i++) {
        const x = g.left + ((i * 97 + scroll * 0.3) % g.roadW), y = (i * 173 + scroll * 2.5) % H;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 60); c.stroke();
      }
    }
  }

  function drawBubble(g, it, y, now) {
    const x = g.laneX(it.lane), L = LANES[it.lane];
    let r = g.r, alpha = 1, dx = 0, dy = 0;
    if (it.state === "hit") { r *= 1 + it.t * 1.5; alpha = Math.max(0, 1 - it.t * 2); }
    if (it.state === "miss") { dx = Math.sin(it.t * 40) * 8 * Math.max(0, 1 - it.t); alpha = Math.max(0.25, 1 - it.t * 1.2); }
    if (it.state === "answer") { r *= 1.12 + Math.sin(now / 150) * 0.08; dy = -40 * Math.min(1, it.t * 3); }
    c.save(); c.globalAlpha = alpha;
    if (it.state === "answer") { c.shadowColor = "#fff"; c.shadowBlur = 30; }
    c.fillStyle = "rgba(0,0,0,.18)";
    c.beginPath(); c.ellipse(x + dx, y + dy + r * 0.95, r * 0.8, r * 0.22, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = L.color; c.beginPath(); c.arc(x + dx, y + dy, r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "#fff"; c.beginPath(); c.arc(x + dx, y + dy, r * 0.76, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(255,255,255,.5)"; c.beginPath(); c.ellipse(x + dx - r * 0.45, y + dy - r * 0.55, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#212529"; c.font = `bold ${r * 1.05}px "Geeza Pro","Noto Naskh Arabic","Arial",sans-serif`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(it.ch, x + dx, y + dy + r * 0.08);
    if (it.state === "answer") {
      c.font = `${r * 0.9}px serif`;
      c.fillText("👇", x, y + dy - r * 1.55 + Math.sin(now / 120) * 8);
    }
    c.restore();
  }

  function rr(x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function grad(y0, y1, a, b) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }

  const BIKE_HELMET = { x: 0, y: -60, r: 27, face: 21 };
  const CAR_HELMET = { x: 0, y: -30, r: 22, face: 17 };
  // Real photos (background removed). Positions are fractions of the picture: where his face goes,
  // where the number plate is, where the exhausts are (for turbo flames).
  const PHOTO = {
    moto: { src: "images/vehicles/moto.png", w: 122, bottom: 62, face: { rx: 0.47, ry: 0.13, r: 15 },
            plate: { rx: 0.355, ry: 0.5, rw: 0.15, rh: 0.06 }, exhaust: [{ rx: 0.49, ry: 0.44 }], rider: true },
    car:  { src: "images/vehicles/car.png", w: 124, bottom: 50, face: { rx: 0.5, ry: 0.17, r: 11 },
            plate: { rx: 0.49, ry: 0.865, rw: 0.17, rh: 0.1 }, exhaust: [{ rx: 0.4, ry: 0.97 }, { rx: 0.6, ry: 0.97 }] },
  };
  for (const v of Object.values(PHOTO)) { v.img = new Image(); v.img.src = v.src; }
  const photoReady = (v) => v.img.complete && v.img.naturalWidth > 0;
  const photoBox = (v) => { const h = v.w * v.img.naturalHeight / v.img.naturalWidth; return { w: v.w, h, top: v.bottom - h, left: -v.w / 2 }; };
  const helmet = () => {
    const v = PHOTO[vehicle];
    if (photoReady(v)) { const b = photoBox(v); return { x: b.left + v.face.rx * b.w, y: b.top + v.face.ry * b.h, face: v.face.r }; }
    return vehicle === "car" ? CAR_HELMET : BIKE_HELMET;
  };

  /** Draw the real motorbike / car photo with Ridwan on it. */
  function drawPhotoVehicle(x, y, s, tilt, now) {
    const v = PHOTO[vehicle], b = photoBox(v);
    c.save(); c.translate(x, y); c.rotate(tilt); c.scale(s, s);
    c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(0, v.bottom - 2, b.w * 0.42, 9, 0, 0, Math.PI * 2); c.fill();
    if (boost > 0) for (const e of v.exhaust) {
      const ex = b.left + e.rx * b.w, ey = b.top + e.ry * b.h, len = 26 + Math.random() * 24;
      c.fillStyle = "#ffd43b"; c.beginPath(); c.moveTo(ex - 6, ey); c.lineTo(ex, ey + len); c.lineTo(ex + 6, ey); c.fill();
      c.fillStyle = "#ff922b"; c.beginPath(); c.moveTo(ex - 4, ey); c.lineTo(ex, ey + len * 0.6); c.lineTo(ex + 4, ey); c.fill();
    }
    c.drawImage(v.img, b.left, b.top, b.w, b.h);
    // number plate: RIDWAN
    const p = v.plate, pw = p.rw * b.w, ph = p.rh * b.h, px = b.left + p.rx * b.w - pw / 2, py = b.top + p.ry * b.h - ph / 2;
    c.fillStyle = "#fff"; rr(px, py, pw, ph, 2); c.fill(); c.strokeStyle = "#fab005"; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = "#c92a2a"; c.font = `900 ${ph * 0.62}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("RIDWAN", px + pw / 2, py + ph / 2 + 0.5);
    const hx = b.left + v.face.rx * b.w, hy = b.top + v.face.ry * b.h, fr = v.face.r;
    if (v.rider) {
      // Ridwan sitting on the bike: jacket + arms reaching to the handlebars
      c.fillStyle = grad(hy, hy + 44, "#4dabf7", "#1864ab"); rr(hx - 15, hy + fr - 4, 30, 40, 12); c.fill();
      c.strokeStyle = "#1c7ed6"; c.lineWidth = 7; c.lineCap = "round";
      c.beginPath(); c.moveTo(hx - 11, hy + fr + 4); c.lineTo(hx - 30, hy + fr + 8); c.moveTo(hx + 11, hy + fr + 4); c.lineTo(hx + 28, hy + fr + 2); c.stroke();
      c.fillStyle = "#212529"; c.beginPath(); c.arc(hx - 31, hy + fr + 8, 4.5, 0, 7); c.arc(hx + 29, hy + fr + 2, 4.5, 0, 7); c.fill();
      c.fillStyle = "#ffd43b"; c.beginPath(); c.arc(hx, hy + fr + 16, 7, 0, 7); c.fill();
      c.fillStyle = "#1864ab"; c.font = "900 10px sans-serif"; c.fillText("R", hx, hy + fr + 16.5);
    }
    if (glow > 0) { c.save(); c.shadowColor = "#ffd43b"; c.shadowBlur = 26 * Math.min(1, glow); }
    c.fillStyle = grad(hy - fr - 6, hy + fr + 6, "#ff922b", "#e8590c"); c.beginPath(); c.arc(hx, hy, fr + 6, 0, Math.PI * 2); c.fill();
    if (glow > 0) c.restore();
    if (intro < 0 || intro >= 1) drawFace(hx, hy, fr);
    c.strokeStyle = "#fff"; c.lineWidth = 2.5; c.beginPath(); c.arc(hx, hy, fr, 0, Math.PI * 2); c.stroke();
    if (correct >= 3) { c.font = "20px serif"; c.textAlign = "center"; c.fillText("👑", hx, hy - fr - 14); }
    c.restore();
  }
  const HELMET = BIKE_HELMET;
  function drawBike(x, y, s, tilt, now) {
    c.save(); c.translate(x, y); c.rotate(tilt); c.scale(s, s);
    // shadow
    c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(0, 66, 44, 11, 0, 0, Math.PI * 2); c.fill();
    // turbo flames from both exhausts
    if (boost > 0) {
      for (const ex of [-27, 27]) {
        const len = 26 + Math.random() * 22;
        c.fillStyle = "#ffd43b"; c.beginPath(); c.moveTo(ex - 6, 58); c.lineTo(ex, 58 + len); c.lineTo(ex + 6, 58); c.fill();
        c.fillStyle = "#ff922b"; c.beginPath(); c.moveTo(ex - 4, 58); c.lineTo(ex, 58 + len * 0.6); c.lineTo(ex + 4, 58); c.fill();
      }
    }
    // chrome exhausts
    for (const ex of [-32, 22]) { c.fillStyle = grad(34, 58, "#f1f3f5", "#868e96"); rr(ex, 34, 10, 24, 4); c.fill(); }
    // rear tyre
    c.fillStyle = "#1a1a1a"; rr(-14, 28, 28, 40, 11); c.fill();
    c.fillStyle = "#3d3d3d"; for (let i = 0; i < 4; i++) c.fillRect(-14, 34 + i * 8 + ((scroll / 6) % 8), 28, 3);
    // body
    c.fillStyle = grad(2, 40, "#ff6b6b", "#c92a2a"); rr(-30, 2, 60, 38, 16); c.fill();
    c.fillStyle = "rgba(255,255,255,.35)"; c.beginPath(); c.ellipse(-12, 9, 12, 4, -0.2, 0, Math.PI * 2); c.fill();
    // tail light (glows)
    c.save(); c.shadowColor = "#ff0000"; c.shadowBlur = 14; c.fillStyle = "#ff8787"; rr(-13, 8, 26, 7, 3); c.fill(); c.restore();
    c.fillStyle = "#ffa94d"; c.beginPath(); c.arc(-25, 13, 4, 0, 7); c.fill(); c.beginPath(); c.arc(25, 13, 4, 0, 7); c.fill();
    // number plate
    c.fillStyle = "#fff"; rr(-19, 22, 38, 13, 3); c.fill();
    c.strokeStyle = "#fab005"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "#c92a2a"; c.font = "900 9px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("RIDWAN", 0, 29);
    // seat
    c.fillStyle = "#212529"; rr(-16, -4, 32, 12, 6); c.fill();
    // legs + shoes on the foot pegs
    c.strokeStyle = "#364fc7"; c.lineWidth = 11; c.lineCap = "round";
    c.beginPath(); c.moveTo(-11, -2); c.lineTo(-30, 24); c.moveTo(11, -2); c.lineTo(30, 24); c.stroke();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(-31, 27, 6, 0, 7); c.arc(31, 27, 6, 0, 7); c.fill();
    // handlebar + mirrors
    c.strokeStyle = "#343a40"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(-42, -26); c.lineTo(42, -26); c.stroke();
    c.lineWidth = 2; c.beginPath(); c.moveTo(-36, -26); c.lineTo(-40, -40); c.moveTo(36, -26); c.lineTo(40, -40); c.stroke();
    c.fillStyle = "#ced4da"; c.beginPath(); c.arc(-40, -42, 5, 0, 7); c.arc(40, -42, 5, 0, 7); c.fill();
    // jacket with a big "R"
    c.fillStyle = grad(-44, 4, "#4dabf7", "#1864ab"); rr(-20, -44, 40, 46, 15); c.fill();
    c.fillStyle = "#fff"; c.fillRect(-20, -34, 40, 4);
    c.fillStyle = "#ffd43b"; c.beginPath(); c.arc(0, -15, 10, 0, 7); c.fill();
    c.fillStyle = "#1864ab"; c.font = "900 14px sans-serif"; c.fillText("R", 0, -14);
    // arms + gloves
    c.strokeStyle = "#1c7ed6"; c.lineWidth = 9;
    c.beginPath(); c.moveTo(-16, -36); c.lineTo(-38, -27); c.moveTo(16, -36); c.lineTo(38, -27); c.stroke();
    c.fillStyle = "#212529"; c.beginPath(); c.arc(-39, -26, 5.5, 0, 7); c.arc(39, -26, 5.5, 0, 7); c.fill();
    // scarf flapping in the wind
    const wave = Math.sin(now / 80) * 5;
    c.strokeStyle = "#ffd43b"; c.lineWidth = 6;
    c.beginPath(); c.moveTo(6, -44); c.quadraticCurveTo(22, -46 + wave, 34, -38 - wave); c.stroke();
    // helmet with Ridwan's face
    const H_ = HELMET;
    if (glow > 0) { c.save(); c.shadowColor = "#ffd43b"; c.shadowBlur = 30 * Math.min(1, glow); }
    c.fillStyle = grad(H_.y - H_.r, H_.y + H_.r, "#ff922b", "#e8590c"); c.beginPath(); c.arc(H_.x, H_.y, H_.r, 0, Math.PI * 2); c.fill();
    if (glow > 0) c.restore();
    c.fillStyle = "#fff"; c.fillRect(-3, H_.y - H_.r, 6, 6);
    if (intro < 0 || intro >= 1) drawFace(H_.x, H_.y, H_.face);
    c.strokeStyle = "#fff"; c.lineWidth = 3; c.beginPath(); c.arc(H_.x, H_.y, H_.face, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "rgba(255,255,255,.45)"; c.beginPath(); c.ellipse(H_.x - 14, H_.y - 17, 6, 3, -0.7, 0, Math.PI * 2); c.fill();
    // a crown once he's on a streak
    if (correct >= 3) { c.font = "22px serif"; c.textAlign = "center"; c.fillText("👑", 0, H_.y - H_.r - 6); }
    c.restore();
  }
  // Rear view of a little race car, Ridwan at the wheel (his face in the helmet through the back window)
  function drawCar(x, y, s, tilt, now) {
    c.save(); c.translate(x, y); c.rotate(tilt); c.scale(s, s);
    c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(0, 50, 56, 11, 0, 0, Math.PI * 2); c.fill();
    if (boost > 0) {
      for (const ex of [-12, 12]) {
        const len = 24 + Math.random() * 22;
        c.fillStyle = "#ffd43b"; c.beginPath(); c.moveTo(ex - 6, 44); c.lineTo(ex, 44 + len); c.lineTo(ex + 6, 44); c.fill();
        c.fillStyle = "#ff922b"; c.beginPath(); c.moveTo(ex - 4, 44); c.lineTo(ex, 44 + len * 0.6); c.lineTo(ex + 4, 44); c.fill();
      }
    }
    // tyres
    c.fillStyle = "#1a1a1a"; rr(-56, 14, 20, 36, 7); c.fill(); rr(36, 14, 20, 36, 7); c.fill();
    c.fillStyle = "#3d3d3d"; for (let i = 0; i < 3; i++) { const ty = 20 + i * 10 + ((scroll / 6) % 10); c.fillRect(-56, ty, 20, 3); c.fillRect(36, ty, 20, 3); }
    // body
    c.fillStyle = grad(-6, 46, "#ff6b6b", "#c92a2a"); rr(-46, -6, 92, 50, 18); c.fill();
    c.fillStyle = "rgba(255,255,255,.3)"; c.beginPath(); c.ellipse(-22, 2, 18, 4, -0.1, 0, Math.PI * 2); c.fill();
    // racing stripes
    c.fillStyle = "#fff"; c.fillRect(-9, -6, 6, 50); c.fillRect(3, -6, 6, 50);
    // cabin roof + back window
    c.fillStyle = grad(-60, -4, "#ff8787", "#e03131"); rr(-32, -58, 64, 56, 18); c.fill();
    c.fillStyle = grad(-52, -10, "#a5d8ff", "#4dabf7"); rr(-25, -52, 50, 40, 12); c.fill();
    // spoiler
    c.fillStyle = "#212529"; rr(-50, -14, 100, 7, 3); c.fill(); c.fillRect(-36, -8, 5, 8); c.fillRect(31, -8, 5, 8);
    // tail lights (glow)
    c.save(); c.shadowColor = "#ff0000"; c.shadowBlur = 14; c.fillStyle = "#ff8787";
    rr(-42, 6, 22, 9, 4); c.fill(); rr(20, 6, 22, 9, 4); c.fill(); c.restore();
    // plate + exhausts
    c.fillStyle = "#fff"; rr(-20, 24, 40, 13, 3); c.fill(); c.strokeStyle = "#fab005"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "#c92a2a"; c.font = "900 9px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("RIDWAN", 0, 31);
    c.fillStyle = grad(38, 46, "#f1f3f5", "#868e96"); rr(-17, 38, 10, 7, 3); c.fill(); rr(7, 38, 10, 7, 3); c.fill();
    // driver: helmet with his face, seen through the back window
    const H_ = CAR_HELMET;
    if (glow > 0) { c.save(); c.shadowColor = "#ffd43b"; c.shadowBlur = 26 * Math.min(1, glow); }
    c.fillStyle = grad(H_.y - H_.r, H_.y + H_.r, "#ff922b", "#e8590c"); c.beginPath(); c.arc(H_.x, H_.y, H_.r, 0, Math.PI * 2); c.fill();
    if (glow > 0) c.restore();
    if (intro < 0 || intro >= 1) drawFace(H_.x, H_.y, H_.face);
    c.strokeStyle = "#fff"; c.lineWidth = 3; c.beginPath(); c.arc(H_.x, H_.y, H_.face, 0, Math.PI * 2); c.stroke();
    // glass shine over him
    c.fillStyle = "rgba(255,255,255,.25)"; c.beginPath(); c.moveTo(-22, -50); c.lineTo(-8, -50); c.lineTo(-20, -14); c.lineTo(-25, -14); c.fill();
    if (correct >= 3) { c.font = "22px serif"; c.textAlign = "center"; c.fillText("👑", 0, -66); }
    c.restore();
  }
  function drawFace(x, y, r) {
    c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
    if (face.complete && face.naturalWidth) c.drawImage(face, x - r, y - r, r * 2, r * 2);
    else { c.fillStyle = "#c68a5a"; c.fillRect(x - r, y - r, r * 2, r * 2); }
    c.restore();
  }

  // ---- main loop
  let alive = true, last = performance.now();
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const g = geo();
    boost = Math.max(0, boost - dt); glow = Math.max(0, glow - dt);
    const want = baseSpeed * (boost > 0 ? 1.8 : 1);
    speed += (want - speed) * Math.min(1, dt * 2.5);
    scroll += speed * dt;

    const tx = g.laneX(lane);
    if (bikeX == null) bikeX = tx;
    const prev = bikeX;
    bikeX += (tx - bikeX) * Math.min(1, dt * 10);
    lean += (((bikeX - prev) / Math.max(dt, 0.001)) * 0.0012 - lean) * Math.min(1, dt * 8);

    if (row && state === "riding") {
      row.y += baseSpeed * 0.9 * dt;
      if (row.y >= g.bikeY - 60 * g.bikeS) resolve(row.items.find((it) => it.lane === lane));
    }
    if (row) for (const it of row.items) if (it.state !== "idle") it.t += dt;

    drawRoad(g);
    if (row) for (const it of row.items) drawBubble(g, it, row.y, now);
    const bob = Math.sin(now / 90) * 1.2;
    const by = g.bikeY + bob;
    (photoReady(PHOTO[vehicle]) ? drawPhotoVehicle : vehicle === "car" ? drawCar : drawBike)(bikeX, by, g.bikeS, Math.max(-0.35, Math.min(0.35, lean)) * (vehicle === "car" ? 0.35 : 1), now);

    // intro: his big face flies down onto the helmet
    if (intro >= 0 && intro < 1) {
      intro = Math.min(1, intro + dt / 1.1);
      const e = 1 - Math.pow(1 - intro, 3);
      const hx = bikeX + helmet().x * g.bikeS, hy = by + helmet().y * g.bikeS;
      const r0 = Math.min(W, H) * 0.3, r1 = helmet().face * g.bikeS;
      const fx = W / 2 + (hx - W / 2) * e, fy = H * 0.4 + (hy - H * 0.4) * e, fr = r0 + (r1 - r0) * e;
      c.save(); c.shadowColor = "#ffd43b"; c.shadowBlur = 40 * (1 - e);
      c.fillStyle = "#fff"; c.beginPath(); c.arc(fx, fy, fr + 6, 0, Math.PI * 2); c.fill(); c.restore();
      drawFace(fx, fy, fr);
      if (intro >= 1) { glow = 1.2; sfx.ding(); }
    }

    c.textAlign = "center"; c.textBaseline = "middle";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += (p.rect ? 380 : 500) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.9;
      if (p.rect) { p.vx *= 0.985; p.rot += p.vr * dt; }
      if (p.life <= 0 || p.y > H + 40) { particles.splice(i, 1); continue; }
      c.globalAlpha = Math.min(1, p.life * 2);
      if (p.rect) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color;
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.7))); c.restore();
      } else { c.font = `${p.size}px serif`; c.fillText(p.e, p.x, p.y); }
    }
    c.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /** Show the motorbike / car choice; resolves with "moto" or "car". */
  function chooseVehicle() {
    const box = $(".choose");
    box.classList.remove("hidden");
    state = "choosing";
    dadSay("hello", ["ridwan_choose"]);
    return new Promise((res) => {
      box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        const v = b.dataset.v;
        store.set("ridwan.vehicle", v);
        box.classList.add("hidden");
        sfx.ding(); sfx.start();
        res(v);
      }, { once: true }));
    });
  }

  // ---- start: big "RIDWAN!" welcome, then his face lands on the helmet
  preloadSounds();
  preload([
    "ridwan_hello", "ridwan_hello_car", "ridwan_choose", "ridwan_howto", "ridwan_find", "ridwan_done",
    ...Array.from({ length: RIGHT_LINES }, (_, i) => `ridwan_right_${i + 1}`),
    ...Array.from({ length: GO_LINES }, (_, i) => `ridwan_go_${i + 1}`),
    ...LANES.map((l) => `ridwan_miss_${l.name}`),
    "mom_go_1", "mom_go_2", "mom_go_3", "mom_right_1", "mom_right_2", "mom_miss",
    ...LETTERS.map((l) => l.key),
  ]);
  (async () => {
    vehicle = await chooseVehicle();
    if (!alive) return;
    showHero(vehicle === "car" ? "🚗 Darawalka! 🚗" : "🏍️ Darawalka! 🏍️");
    await Promise.all([dadSay("hello", [vehicle === "car" ? "ridwan_hello_car" : "ridwan_hello"]), wait(2200)]);
    hideHero();
    if (!alive) return;
    intro = 0;
    await new Promise((r) => setTimeout(r, 1200));
    if (!alive) return;
    if (!store.get("ridwan.sawHowto", false)) { await sayAll(["ridwan_howto"]); store.set("ridwan.sawHowto", true); }
    if (!alive) return;
    target = pickTarget();
    ask();
  })();

  // test hook, only when running on this computer
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.__moto = { get state() { return state; }, get target() { return target?.ch; }, get vehicle() { return vehicle; },
      laneOf: (ch) => row?.items.find((it) => it.ch === ch)?.lane, setLane: (n) => { lane = n; } };
  }

  return function stop() {
    alive = false;
    clearTimeout(momTimer); clearTimeout(dadTimer);
    stopVoice();
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", onKey);
  };
}
