// Ridwan's 3D Letter Race — a real 3D road with a chase camera.
// Ridwan drives a race car (Kenney Car Kit, CC0) or rides a sport motorbike; three letter gates come toward him;
// he steers into the gate with the letter the voice asks for. Mom and Dad cheer from the side.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { LETTERS } from "./letters.js";
import { photo } from "./photos.js";
import { sayAll, sfx, preload, preloadSounds, stopVoice } from "./audio.js";

const START_POOL = 3, UNLOCK_EVERY = 3, ROUND_GOAL = 12;
const LANES = [
  { color: "#fa5252", name: "red", x: -2.3 },
  { color: "#339af0", name: "blue", x: 0 },
  { color: "#fcc419", name: "yellow", x: 2.3 },
];
const RIGHT_LINES = 6, GO_LINES = 3, MOM_GO = 3, MOM_RIGHT = 2;
const MOM_BUBBLE = { go: "Ahow, Ridwan! 💪", right: "Waa sax! ❤️", miss: "Waad kartaa! 💕", cheer: "Hooyo way ku faantaa! 🎉" };
const DAD_BUBBLE = { go: "Orod, Ridwan! 🏁", right: "Geesi! 🏆", miss: "Mar kale! 👍", cheer: "Mashaa Allah! 🎉", hello: "Soo dhawoow! 👋" };
const HERO_SUBS = ["⭐ Waa sax! ⭐", "🏆 Geesi! 🏆", "🔥 Mashaa Allah! 🔥", "🎉 Hambalyo! 🎉"];
const CONFETTI = [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2, 0xffa94d];

const GATE_START_Z = -80;   // where letter gates appear
const GATE_HIT_Z = -3.2;
const STICKER = { y: 0.86, z: 0.5, rx: -1.25 };  // face sticker on the Ferrari engine cover (fractions of the car box)
const PLATE = { y: 0.6, dz: -0.06 };      // RIDWAN number plate on the rear bumper
const ROAD_LEN = 220;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const pick = (n) => 1 + Math.floor(Math.random() * n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lerp = (a, b, t) => a + (b - a) * t;

export function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export function startRace(root) {
  root.innerHTML = `
    <div class="moto race3d">
      <button class="target hidden" aria-label="Repeat"><span class="ch"></span><span class="spk">🔊</span></button>
      <div class="stars">⭐ <b>0</b></div>
      <div class="progress"><i></i></div>
      <div class="speed"><b>0</b><small>km/h</small></div>
      <div class="driver"><img src="${photo("ridwan")}" alt=""><span>RIDWAN</span></div>
      <div class="fan mom"><div class="bubble"></div><img src="${photo("mom")}" alt=""><div class="poms"><span>🎉</span><span>🎊</span></div><div class="tag">Hooyo</div></div>
      <div class="fan dad"><div class="bubble"></div><img src="${photo("dad")}" alt=""><div class="poms"><span>👏</span><span>🏁</span></div><div class="tag">Aabbe</div></div>
      <div class="hero hidden"><div class="rays"></div><img src="${photo("ridwan")}" alt=""><div class="name">RIDWAN!</div><div class="sub"></div></div>
      <div class="choose hidden">
        <h2>Dooro! 🏁</h2>
        <div class="opts">
          <button data-v="moto"><img src="images/moto.jpg" alt=""><span>🏍️ Mooto</span></button>
          <button data-v="car"><img src="images/car.jpg" alt=""><span>🏎️ Baabuur</span></button>
        </div>
      </div>
      <div class="paint hidden">
        <h2>Midabka! 🎨</h2>
        <div class="swatches">
          <button data-c="sky" style="--c:#5ec8ff" aria-label="Sky blue"></button>
          <button data-c="white" style="--c:#ffffff" aria-label="White"></button>
          <button data-c="red" style="--c:#d00000" aria-label="Red"></button>
        </div>
        <button class="go big">🏁 Bilow!</button>
      </div>
      <div class="done hidden">
        <img class="me" src="${photo("ridwan")}" alt=""><div class="trophy">🏆</div>
        <h2>Mashaa Allah, Ridwan!</h2>
        <p class="learned"></p>
        <button class="again big">🏁 Mar kale</button>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const wrap = $(".race3d");
  const targetBtn = $(".target"), starsEl = $(".stars b"), progEl = $(".progress i"), doneEl = $(".done");
  const speedEl = $(".speed b");
  const heroEl = $(".hero"), heroSub = $(".hero .sub");

  // ------------------------------------------------------------------ renderer / scene
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.className = "gl";
  wrap.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const SKY_TOP = new THREE.Color("#4da3ff"), SKY_HORIZON = new THREE.Color("#d6ecff");
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(SKY_HORIZON, 45, 150);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45; // reflections for the car paint without washing out the world
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5c9e3a, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
  sun.position.set(-8, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
  scene.add(sun, sun.target);

  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    camera.aspect = w / h;
    // narrow phones: widen the view so all three lanes fit
    camera.fov = w / h < 0.7 ? 72 : 60;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  // ------------------------------------------------------------------ world: ground, road, kerbs, scenery
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD_LEN + 100), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -ROAD_LEN / 2 + 20); ground.receiveShadow = true;
  ground.material.map.repeat.set(60, 40);
  scene.add(ground);

  const roadTex = roadTexture();
  roadTex.repeat.set(1, ROAD_LEN / 10);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(8.4, ROAD_LEN), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -ROAD_LEN / 2 + 20); road.receiveShadow = true;
  scene.add(road);

  // scenery that streams past: trees, palms, houses, a mosque, camels
  const scenery = [];
  const kinds = [makeTree, makePalm, makeHouse, makeTree, makePalm, makeBush, makeMosque, makeCamel];
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1;
    const obj = kinds[i % kinds.length]();
    obj.position.set(side * (6.5 + Math.random() * 14), 0, -i * 4.4);
    obj.rotation.y = Math.random() * Math.PI * 2;
    if (obj.userData.face) obj.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(obj); scenery.push(obj);
  }
  // distant hills
  for (let i = 0; i < 14; i++) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(18 + Math.random() * 14, 18, 10), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x7cc36a : 0x8fd07a, roughness: 1, flatShading: true }));
    h.scale.y = 0.35; h.position.set((i - 7) * 26 + Math.random() * 10, -2, -150 - Math.random() * 30);
    scene.add(h);
  }

  // ------------------------------------------------------------------ the player's vehicle
  const player = new THREE.Group();
  scene.add(player);
  let vehicle = store.get("ridwan.vehicle", "car");
  let carModel = null, motoModel = null, wheels = [];
  // his colour choice paints both vehicles
  const COLORS = {
    sky:   { hex: 0x3fb6ff, metal: 0.55, rough: 0.3 },
    white: { hex: 0xf4f6f8, metal: 0.15, rough: 0.25 },
    red:   { hex: 0xd00000, metal: 0.9, rough: 0.35 },
  };
  const carPaint = new THREE.MeshPhysicalMaterial({ color: 0xd00000, metalness: 0.9, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 });
  const motoPaint = new THREE.MeshStandardMaterial({ color: 0xd00000, metalness: 0.3, roughness: 0.3 });
  function setColor(name) {
    const c = COLORS[name] || COLORS.red;
    carPaint.color.setHex(c.hex); carPaint.metalness = c.metal; carPaint.roughness = c.rough;
    motoPaint.color.setHex(c.hex); motoPaint.metalness = Math.min(0.4, c.metal);
  }
  setColor(store.get("ridwan.color", "red"));
  const loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath("vendor/addons/libs/draco/gltf/");
  loader.setDRACOLoader(draco);
  // Detailed sports car (Ferrari 458 Italia by vicent091036, from the three.js examples): real paint, glass, chrome.
  const carReady = new Promise((res) => {
    loader.load("models/ferrari.glb", (g) => {
      const car = g.scene;
      const paint = carPaint;
      const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.4 });
      const glass = new THREE.MeshPhysicalMaterial({ color: 0x111418, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.6 });
      car.getObjectByName("body").material = paint;
      for (const n of ["rim_fl", "rim_fr", "rim_rr", "rim_rl", "trim"]) { const o = car.getObjectByName(n); if (o) o.material = chrome; }
      const gl = car.getObjectByName("glass"); if (gl) gl.material = glass;
      car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      // soft contact shadow under the car
      const ao = new THREE.Mesh(new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4), new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load("models/ferrari_ao.png"), blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true }));
      ao.rotation.x = -Math.PI / 2; ao.renderOrder = 2; ao.position.y = 0.01;
      car.add(ao);
      // this model already points its nose down the road (-Z); the back (toward the camera) is +Z
      const box = new THREE.Box3().setFromObject(car);
      // Ridwan in the driver's seat, behind the steering wheel
      const sw = car.getObjectByName("steering_wheel");
      const seat = new THREE.Vector3(-0.38, 0.42, 0.25);
      if (sw) { const b = new THREE.Box3().setFromObject(sw), cc = b.getCenter(new THREE.Vector3()); seat.set(cc.x, b.min.y - 0.32, cc.z + 0.55); }
      const driver = makeDriver(0.62); driver.position.copy(seat); car.add(driver);
      // his face as a team sticker on the engine cover, and a RIDWAN number plate
      const sticker = new THREE.Mesh(new THREE.CircleGeometry(0.3, 40), new THREE.MeshStandardMaterial({ map: faceStickerTexture(), roughness: 0.4, transparent: true }));
      sticker.position.set(0, box.max.y * STICKER.y, box.max.z * STICKER.z); sticker.rotation.x = STICKER.rx;
      car.add(sticker);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5 }));
      plate.position.set(0, PLATE.y, box.max.z + PLATE.dz); car.add(plate);
      car.userData.debug = { box, seat, sticker, plate };
      car.userData.wheelNames = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"];
      carModel = car;
      res();
    }, undefined, () => loadToyCar(res));
  });
  // fallback: the simpler Kenney race car
  const loadToyCar = (res) => {
    loader.load("models/race.glb", (g) => {
      carModel = g.scene;
      carModel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      carModel.scale.setScalar(1.55);
      carModel.rotation.y = Math.PI; // model faces +Z; we drive toward -Z
      // driver: Ridwan in his helmet, sitting in the open cockpit
      const driver = makeDriver(0.42);
      driver.position.set(0, 0.62, 0.05);
      carModel.add(driver);
      res();
    }, undefined, () => res());
  };
  motoModel = makeMotorbike(motoPaint);


  function useVehicle(v) {
    vehicle = v;
    player.remove(...player.children);
    const m = v === "car" ? carModel : motoModel;
    if (m) player.add(m);
    wheels = [];
    if (m?.userData.wheelNames) wheels = m.userData.wheelNames.map((n) => m.getObjectByName(n)).filter(Boolean);
    else m?.traverse((o) => { if (/wheel/.test(o.name)) wheels.push(o); });
  }

  // ------------------------------------------------------------------ letter gates
  const gateGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.22, 40);
  const faceGeo = new THREE.CircleGeometry(0.86, 40);
  const letterTex = new Map();
  function texFor(ch, color) {
    const k = ch + color;
    if (!letterTex.has(k)) letterTex.set(k, letterTexture(ch, color));
    return letterTex.get(k);
  }
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd43b, emissiveIntensity: 0.8 }));
  arrow.rotation.x = Math.PI; arrow.visible = false; scene.add(arrow);

  function makeGate(letter, laneIdx) {
    const L = LANES[laneIdx];
    const g = new THREE.Group();
    const ring = new THREE.Mesh(gateGeo, new THREE.MeshStandardMaterial({ color: L.color, roughness: 0.35, metalness: 0.1, emissive: L.color, emissiveIntensity: 0.15 }));
    ring.rotation.x = Math.PI / 2; ring.castShadow = true;
    const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: texFor(letter.ch, L.color), roughness: 0.6 }));
    face.position.z = 0.115;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 10), new THREE.MeshStandardMaterial({ color: 0xdee2e6, metalness: 0.6, roughness: 0.3 }));
    post.position.y = -1.55; post.castShadow = true;
    const disc = new THREE.Group(); disc.add(ring, face, post);
    disc.position.y = 2.2;
    g.add(disc);
    g.position.set(L.x, 0, GATE_START_Z);
    g.userData = { ...letter, lane: laneIdx, disc, ring, state: "idle", t: 0, phase: Math.random() * 6 };
    scene.add(g);
    return g;
  }

  // ------------------------------------------------------------------ particles (confetti + stars)
  const MAX_P = 260;
  const pGeo = new THREE.PlaneGeometry(0.16, 0.26);
  const pMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false });
  const confetti = new THREE.InstancedMesh(pGeo, pMat, MAX_P);
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const pColor = new THREE.Color();
  for (let i = 0; i < MAX_P; i++) confetti.setColorAt(i, pColor.set(CONFETTI[i % CONFETTI.length]));
  scene.add(confetti);
  const parts = Array.from({ length: MAX_P }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), vr: 0 }));
  const dummy = new THREE.Object3D();
  function burst(at, n = 80, power = 9) {
    let made = 0;
    for (const q of parts) {
      if (q.life > 0) continue;
      q.life = 1.6 + Math.random() * 0.6;
      q.p.copy(at);
      q.v.set((Math.random() - 0.5) * power, 4 + Math.random() * power, (Math.random() - 0.5) * power * 0.7);
      q.r.set(Math.random() * 6, Math.random() * 6, 0); q.vr = (Math.random() - 0.5) * 14;
      if (++made >= n) break;
    }
  }

  // speed streaks during turbo
  const streakGeo = new THREE.BufferGeometry();
  const STREAKS = 60, streakPos = new Float32Array(STREAKS * 6);
  streakGeo.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  const streakData = Array.from({ length: STREAKS }, () => ({ x: (Math.random() - 0.5) * 16, y: Math.random() * 5 + 0.3, z: -Math.random() * 60 }));
  scene.add(streaks);

  // ------------------------------------------------------------------ game state
  let pool = Math.max(START_POOL, store.get("ridwan.pool", START_POOL));
  const mastery = store.get("ridwan.mastery", {});
  let lane = 1, px = 0, lean = 0;
  let speed = 0, baseSpeed = 16, boost = 0, distance = 0;
  let target = null, lastTarget = null;
  let row = null; // array of 3 gate groups
  let state = "intro";
  let correct = 0, stars = store.get("ridwan.stars", 0);
  let rowsSinceCheer = 0, lastParent = "mom", cheering = null;
  let introT = -1, introHold = false; // camera swoop (held in front while choosing a colour)
  const nextParent = () => (lastParent = lastParent === "mom" ? "dad" : "mom");
  starsEl.textContent = stars;

  function pickTarget() {
    const avail = LETTERS.slice(0, pool).filter((l) => l !== lastTarget);
    const weighted = avail.flatMap((l) => { const m = mastery[l.key] || 0; return Array(m < 2 ? 3 : m < 5 ? 2 : 1).fill(l); });
    lastTarget = weighted[Math.floor(Math.random() * weighted.length)];
    return lastTarget;
  }

  function clearRow() { if (row) for (const g of row) scene.remove(g); row = null; arrow.visible = false; }

  function spawnRow() {
    clearRow();
    const near = LETTERS.filter((l) => l !== target).slice(0, Math.max(pool, 3));
    const two = near.sort(() => Math.random() - 0.5).slice(0, 2);
    const letters = [target, ...two].sort(() => Math.random() - 0.5);
    row = letters.map((l, i) => makeGate(l, i));
    const myRow = row;
    setTimeout(() => {
      if (!(alive && row === myRow && state === "riding")) return;
      if (++rowsSinceCheer < 3 || Math.random() < 0.4) return; // only now and then
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
  async function newRound() { target = pickTarget(); await ask(); }

  // ---- parents beside the road (DOM, their real photos)
  const momEl = $(".mom"), momBubble = $(".mom .bubble"), dadEl = $(".dad"), dadBubble = $(".dad .bubble");
  const fan = (el, bubble, texts) => {
    let timer = 0, token = 0;
    const cheer = (kind, ms = 2200) => {
      token++; bubble.textContent = texts[kind]; el.classList.add("cheer");
      clearTimeout(timer); timer = setTimeout(() => el.classList.remove("cheer"), ms);
    };
    const say = async (kind, keys) => {
      cheer(kind, 60000); const mine = token;
      const done = await sayAll(keys);
      if (token === mine) { clearTimeout(timer); timer = setTimeout(() => el.classList.remove("cheer"), 600); }
      return done;
    };
    return { cheer, say, stop: () => clearTimeout(timer) };
  };
  const mom = fan(momEl, momBubble, MOM_BUBBLE), dad = fan(dadEl, dadBubble, DAD_BUBBLE);
  const momSay = (kind, key, ...more) => mom.say(kind, [key, ...more]);
  const dadSay = (kind, keys) => dad.say(kind, keys);

  function showHero(sub) { heroSub.textContent = sub; heroEl.classList.remove("hidden", "out"); void heroEl.offsetWidth; heroEl.classList.add("in"); }
  function hideHero() { heroEl.classList.remove("in"); heroEl.classList.add("out"); setTimeout(() => { if (heroEl.classList.contains("out")) heroEl.classList.add("hidden"); }, 350); }

  async function resolve(hitGate) {
    state = "feedback";
    if (cheering) await Promise.race([cheering, wait(3000)]);
    if (!alive) return;
    const gate = row.find((g) => g.userData.lane === lane) || hitGate;
    const right = row.find((g) => g.userData.ch === target.ch);
    if (gate === right) {
      gate.userData.state = "hit";
      sfx.ding(); sfx.applause(); sfx.rev();
      boost = 1.8;
      burst(new THREE.Vector3(LANES[gate.userData.lane].x, 2.2, gate.position.z), 120, 10);
      stars++; correct++;
      mastery[target.key] = (mastery[target.key] || 0) + 1;
      if (correct % UNLOCK_EVERY === 0 && pool < LETTERS.length) { pool++; store.set("ridwan.pool", pool); }
      store.set("ridwan.stars", stars); store.set("ridwan.mastery", mastery);
      starsEl.textContent = stars;
      starsEl.parentElement.classList.remove("pop"); void starsEl.offsetWidth; starsEl.parentElement.classList.add("pop");
      progEl.style.width = `${(correct / ROUND_GOAL) * 100}%`;
      baseSpeed = 16 + correct * 0.6;
      showHero(HERO_SUBS[Math.floor(Math.random() * HERO_SUBS.length)]);
      const card = $(".driver"); card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
      const praise = nextParent() === "mom"
        ? (dad.cheer("cheer", 3000), momSay("right", `mom_right_${pick(MOM_RIGHT)}`, target.key))
        : (mom.cheer("cheer", 3000), dadSay("right", [`ridwan_right_${pick(RIGHT_LINES)}`, target.key]));
      await Promise.all([praise, wait(2200)]);
      hideHero();
      clearRow();
      if (!alive) return;
      if (correct >= ROUND_GOAL) return finish();
      newRound();
    } else {
      gate.userData.state = "miss";
      right.userData.state = "answer";
      sfx.boing();
      await Promise.all([dadSay("miss", [`ridwan_miss_${LANES[right.userData.lane].name}`]), wait(1800)]);
      clearRow();
      if (!alive) return;
      ask();
    }
  }

  async function finish() {
    state = "done";
    sfx.bigApplause();
    mom.cheer("cheer", 8000); dad.cheer("cheer", 8000);
    for (let i = 0; i < 6; i++) setTimeout(() => burst(new THREE.Vector3(px + (Math.random() - 0.5) * 6, 3, -8), 60, 12), i * 300);
    $(".learned").innerHTML = LETTERS.slice(0, pool).map((l) => `<span>${l.ch}</span>`).join("");
    doneEl.classList.remove("hidden");
    await sayAll(["ridwan_done"]);
  }

  // ---- input: tap left / right half (or swipe, or arrow keys)
  function move(dir) {
    if (state === "done" || state === "choosing") return;
    const n = Math.max(0, Math.min(2, lane + dir));
    if (n !== lane) { lane = n; sfx.whoosh(); }
  }
  let downX = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { e.preventDefault(); downX = e.clientX; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (downX == null) return;
    const dx = e.clientX - downX; downX = null;
    if (Math.abs(dx) > 30) move(dx < 0 ? -1 : 1);
    else move(e.clientX < root.clientWidth / 2 ? -1 : 1);
  });
  const onKey = (e) => { if (e.key === "ArrowLeft") move(-1); if (e.key === "ArrowRight") move(1); };
  window.addEventListener("keydown", onKey);
  targetBtn.addEventListener("click", () => { if (state === "riding" && target) sayAll(["ridwan_find", target.key]); });
  $(".again").addEventListener("click", () => { doneEl.classList.add("hidden"); correct = 0; progEl.style.width = "0%"; baseSpeed = 16; newRound(); });

  // ------------------------------------------------------------------ main loop
  let alive = true, last = performance.now();
  const CAM_Y = 3.2, CAM_Z = 7.6;
  const camPos = new THREE.Vector3(0, CAM_Y, CAM_Z), camLook = new THREE.Vector3();
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    boost = Math.max(0, boost - dt);
    const want = state === "done" ? 6 : baseSpeed * (boost > 0 ? 1.9 : 1);
    speed += (want - speed) * Math.min(1, dt * 2.2);
    distance += speed * dt;
    speedEl.textContent = Math.round(speed * 6.2);

    // world streams toward the camera
    roadTex.offset.y = (roadTex.offset.y + speed * dt / 10) % 1;
    ground.material.map.offset.y = (ground.material.map.offset.y + speed * dt * 40 / (ROAD_LEN + 100)) % 1;
    for (const s of scenery) {
      s.position.z += speed * dt;
      if (s.position.z > 12) { s.position.z -= 46 * 4.4; s.position.x = Math.sign(s.position.x) * (6.5 + Math.random() * 14); }
    }

    // vehicle: slide between lanes, lean into the turn
    const tx = LANES[lane].x;
    const prev = px;
    px = lerp(px, tx, Math.min(1, dt * 7));
    const vx = (px - prev) / Math.max(dt, 1e-3);
    lean = lerp(lean, -vx * (vehicle === "moto" ? 0.09 : 0.03), Math.min(1, dt * 8));
    player.position.x = px;
    player.rotation.z = lean;
    player.rotation.y = -vx * 0.025;
    player.position.y = Math.sin(now / 95) * 0.02 + (boost > 0 ? 0.03 : 0);
    for (const w of wheels) w.rotation.x -= speed * dt * 2.2;

    sun.position.set(px - 8, 16, 6); sun.target.position.set(px, 0, -4);

    // gates come toward him
    if (row) {
      for (const g of row) {
        const u = g.userData;
        if (state === "riding") g.position.z += speed * 0.95 * dt;
        u.disc.position.y = 2.2 + Math.sin(now / 300 + u.phase) * 0.12;
        u.disc.rotation.y = Math.sin(now / 500 + u.phase) * 0.15;
        if (u.state !== "idle") u.t += dt;
        if (u.state === "hit") { u.disc.scale.setScalar(1 + u.t * 2.5); u.disc.position.y += u.t * 6; u.ring.material.opacity = 1; g.visible = u.t < 0.45; }
        if (u.state === "miss") { u.disc.rotation.z = Math.sin(u.t * 30) * 0.3 * Math.max(0, 1 - u.t); u.disc.position.y -= Math.min(1, u.t * 2) * 0.8; }
        if (u.state === "answer") {
          const s = 1.15 + Math.sin(now / 140) * 0.1; u.disc.scale.setScalar(s);
          u.ring.material.emissiveIntensity = 0.6 + Math.sin(now / 140) * 0.3;
          arrow.visible = true; arrow.position.set(g.position.x, 4 + Math.sin(now / 150) * 0.25, g.position.z);
        }
      }
      if (state === "riding" && row[0].position.z >= GATE_HIT_Z) resolve(row[0]);
    }

    // confetti
    let n = 0;
    for (let i = 0; i < MAX_P; i++) {
      const q = parts[i];
      if (q.life > 0) {
        q.life -= dt; q.v.y -= 14 * dt; q.v.multiplyScalar(0.985); q.p.addScaledVector(q.v, dt); q.p.z += speed * dt * 0.5;
        q.r.x += q.vr * dt; q.r.y += q.vr * dt * 0.7;
        dummy.position.copy(q.p); dummy.rotation.copy(q.r); dummy.scale.setScalar(Math.min(1, q.life * 2));
      } else { dummy.position.set(0, -50, 0); dummy.scale.setScalar(0); }
      dummy.updateMatrix(); confetti.setMatrixAt(i, dummy.matrix); n++;
    }
    confetti.instanceMatrix.needsUpdate = true;

    // turbo streaks
    streaks.material.opacity = lerp(streaks.material.opacity, boost > 0 ? 0.55 : 0, dt * 6);
    if (streaks.material.opacity > 0.01) {
      streakData.forEach((s, i) => {
        s.z += speed * 2.2 * dt; if (s.z > 6) { s.z = -60; s.x = (Math.random() - 0.5) * 16; }
        streakPos.set([s.x, s.y, s.z, s.x, s.y, s.z - 2.5], i * 6);
      });
      streakGeo.attributes.position.needsUpdate = true;
    }

    // chase camera (with a swoop from the front at the start, like real racing games)
    const fovKick = boost > 0 ? 8 : 0;
    camera.fov = lerp(camera.fov, (root.clientWidth / root.clientHeight < 0.7 ? 72 : 60) + fovKick, dt * 4);
    camera.updateProjectionMatrix();
    if (introT >= 0 && introT < 1) {
      if (!introHold) introT = Math.min(1, introT + dt / 2.2);
      const e = 1 - Math.pow(1 - introT, 3);
      const ang = lerp(Math.PI * 0.95, 0, e);           // orbit from the front to behind
      const r = lerp(5.6, CAM_Z, e);
      camPos.set(px + Math.sin(ang) * r, lerp(1.4, CAM_Y, e), Math.cos(ang) * r);
      camLook.set(px, lerp(1.1, 1.0, e), lerp(0, -8, e));
    } else {
      camPos.set(lerp(camPos.x, px * 0.55, dt * 4), CAM_Y, CAM_Z);
      camLook.set(px * 0.75, 1.0, -8);
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------------------ start
  function chooseVehicle() {
    const box = $(".choose");
    box.classList.remove("hidden");
    state = "choosing";
    dadSay("hello", ["ridwan_choose"]);
    return new Promise((res) => {
      box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        store.set("ridwan.vehicle", b.dataset.v);
        box.classList.add("hidden");
        sfx.ding();
        res(b.dataset.v);
      }, { once: true }));
    });
  }

  /** Paint shop: he taps colours (the vehicle changes live, the voice names the colour), then 🏁. */
  function chooseColor() {
    const box = $(".paint");
    box.classList.remove("hidden");
    state = "painting";
    introT = 0; introHold = true; // camera parked in front of the vehicle
    sayAll(["ridwan_color"]);
    let chosen = store.get("ridwan.color", "red");
    const mark = () => box.querySelectorAll("[data-c]").forEach((b) => b.classList.toggle("on", b.dataset.c === chosen));
    mark();
    box.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => {
      chosen = b.dataset.c; setColor(chosen); mark();
      sfx.pop(); sayAll([`ridwan_color_${chosen}`]);
    }));
    return new Promise((res) => box.querySelector(".go").addEventListener("click", () => {
      store.set("ridwan.color", chosen);
      box.classList.add("hidden");
      introHold = false; state = "intro";
      sfx.ding(); sfx.start();
      res(chosen);
    }, { once: true }));
  }

  preloadSounds();
  preload([
    "ridwan_color", "ridwan_color_sky", "ridwan_color_white", "ridwan_color_red",
    "ridwan_hello", "ridwan_hello_car", "ridwan_choose", "ridwan_howto", "ridwan_find", "ridwan_done",
    ...Array.from({ length: RIGHT_LINES }, (_, i) => `ridwan_right_${i + 1}`),
    ...Array.from({ length: GO_LINES }, (_, i) => `ridwan_go_${i + 1}`),
    ...LANES.map((l) => `ridwan_miss_${l.name}`),
    "mom_go_1", "mom_go_2", "mom_go_3", "mom_right_1", "mom_right_2", "mom_miss",
    ...LETTERS.map((l) => l.key),
  ]);
  carReady.then(() => { if (state === "choosing" || state === "intro") useVehicle(vehicle); });
  useVehicle(vehicle);
  (async () => {
    const v = await chooseVehicle();
    if (!alive) return;
    await carReady;
    useVehicle(v);
    await chooseColor();
    if (!alive) return;
    introT = 0; // camera swoops from the front to behind
    showHero(v === "car" ? "🏎️ Darawalka! 🏎️" : "🏍️ Darawalka! 🏍️");
    await Promise.all([dadSay("hello", [v === "car" ? "ridwan_hello_car" : "ridwan_hello"]), wait(2400)]);
    hideHero();
    if (!alive) return;
    if (!store.get("ridwan.sawHowto", false)) { await sayAll(["ridwan_howto"]); store.set("ridwan.sawHowto", true); }
    if (!alive) return;
    target = pickTarget();
    ask();
  })();

  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.__moto = {
      get state() { return state; }, get target() { return target?.ch; }, get vehicle() { return vehicle; },
      laneOf: (ch) => row?.find((g) => g.userData.ch === ch)?.userData.lane, setLane: (n) => { lane = n; },
    };
  }

  return function stop() {
    alive = false;
    mom.stop(); dad.stop();
    stopVoice();
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", onKey);
    renderer.dispose();
  };
}

// ==================================================================== textures
function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function skyTexture() {
  return canvasTex(4, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#3d8bff"); g.addColorStop(0.55, "#8cc4ff"); g.addColorStop(0.75, "#d6ecff"); g.addColorStop(1, "#d6ecff");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}
function grassTexture() {
  const t = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = "#6dbb48"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { c.fillStyle = Math.random() < 0.5 ? "#62ad3f" : "#7cc957"; c.fillRect(Math.random() * w, Math.random() * h, 2, 3); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function roadTexture() {
  // 8.4 m wide: kerb 0.5 | 7.4 asphalt (3 lanes) | kerb 0.5 ; one tile = 10 m long
  const t = canvasTex(512, 512, (c, w, h) => {
    const m = w / 8.4;
    c.fillStyle = "#3f444b"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    // kerbs red/white
    for (let y = 0; y < h; y += h / 4) {
      c.fillStyle = (y / (h / 4)) % 2 ? "#fff" : "#e03131";
      c.fillRect(0, y, 0.5 * m, h / 4); c.fillRect(w - 0.5 * m, y, 0.5 * m, h / 4);
    }
    // white edge lines
    c.fillStyle = "#f1f3f5"; c.fillRect(0.6 * m, 0, 0.12 * m, h); c.fillRect(w - 0.72 * m, 0, 0.12 * m, h);
    // dashed lane lines (lanes centred at -2.3, 0, 2.3 m)
    c.fillStyle = "#ffe066";
    for (const xm of [4.2 - 1.15, 4.2 + 1.15]) c.fillRect(xm * m - 0.07 * m, 0, 0.14 * m, h * 0.5);
  });
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}
function letterTexture(ch, color) {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#fff"; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = color; c.lineWidth = 14; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 10, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#212529"; c.font = `bold 170px "Geeza Pro","Noto Naskh Arabic",Arial,sans-serif`;
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(ch, w / 2, h / 2 + 10);
  });
}
function faceStickerTexture() {
  const t = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#ffd43b"; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.fill();
  });
  const img = new Image();
  img.onload = () => {
    const c = t.image.getContext("2d");
    c.save(); c.beginPath(); c.arc(128, 128, 108, 0, Math.PI * 2); c.clip(); c.drawImage(img, 20, 20, 216, 216); c.restore();
    c.lineWidth = 10; c.strokeStyle = "#fff"; c.beginPath(); c.arc(128, 128, 110, 0, Math.PI * 2); c.stroke();
    t.needsUpdate = true;
  };
  img.src = photo("ridwan");
  return t;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ==================================================================== models (low-poly, matching the Kenney style)
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
function shadowAll(g) { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; }

/** Ridwan as a little racer: orange helmet with a dark visor, blue suit with a gold "R". */
function makeDriver(s = 1) {
  const g = new THREE.Group();
  const suit = mat(0x1c7ed6);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.35, 6, 12), suit); body.position.y = 0.32;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), mat(0xf76707, { roughness: 0.25, metalness: 0.1 }));
  helmet.position.y = 0.92;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 30, Math.PI), mat(0xffffff));
  stripe.position.y = 0.92; stripe.rotation.y = Math.PI / 2;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.305, 20, 12, -0.9, 1.8, 1.1, 0.75), mat(0x1b1f24, { roughness: 0.1, metalness: 0.6 }));
  visor.position.y = 0.92; visor.rotation.y = Math.PI; // faces forward (-Z)
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), mat(0xffd43b));
  badge.position.set(0, 0.42, 0.285); // on his back, toward the camera
  g.add(body, helmet, stripe, visor, badge);
  g.scale.setScalar(s);
  return shadowAll(g);
}

/** A sporty motorbike with Ridwan riding it, built from simple shapes (front = -Z). */
function makeMotorbike(paint) {
  const g = new THREE.Group();
  const red = paint || mat(0xe03131, { roughness: 0.3, metalness: 0.15 }), dark = mat(0x212529), chrome = mat(0xdee2e6, { metalness: 0.9, roughness: 0.2 });
  const wheel = (z) => {
    const w = new THREE.Group(); w.name = "wheel";
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.13, 12, 28), dark);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 20), mat(0xf59f00, { metalness: 0.4, roughness: 0.3 }));
    rim.rotation.z = Math.PI / 2; tyre.rotation.y = Math.PI / 2;
    w.add(tyre, rim); w.position.set(0, 0.49, z);
    return w;
  };
  const front = wheel(-0.85), back = wheel(0.8);
  // frame / body
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), red); tank.scale.set(0.9, 0.7, 1.4); tank.position.set(0, 1.0, -0.15);
  const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.55), red); fairing.position.set(0, 1.0, -0.72); fairing.rotation.x = 0.35;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.04), mat(0x99e9f2, { transparent: true, opacity: 0.6, roughness: 0.05 }));
  screen.position.set(0, 1.33, -0.86); screen.rotation.x = -0.5;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.9), dark); belly.position.set(0, 0.68, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.6), dark); seat.position.set(0, 1.08, 0.35);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.5), red); tail.position.set(0, 1.08, 0.78); tail.rotation.x = -0.25;
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.03), mat(0xff6b6b, { emissive: 0xff0000, emissiveIntensity: 1.2 }));
  light.position.set(0, 1.12, 1.04);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.16), new THREE.MeshStandardMaterial({ map: plateTexture() }));
  plate.position.set(0, 0.88, 1.02);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), chrome); fork.position.set(0, 0.88, -0.86); fork.rotation.x = 0.35;
  const swing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.8), chrome); swing.position.set(0.12, 0.55, 0.42);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 14), chrome); exhaust.rotation.x = Math.PI / 2 - 0.2; exhaust.position.set(0.22, 0.62, 0.65);
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8), dark); bars.rotation.z = Math.PI / 2; bars.position.set(0, 1.25, -0.6);
  g.add(front, back, tank, fairing, screen, belly, seat, tail, light, plate, fork, swing, exhaust, bars);
  // rider, leaning forward over the tank
  const rider = makeDriver(0.95);
  rider.position.set(0, 0.95, 0.25); rider.rotation.x = -0.55;
  const armMat = mat(0x1c7ed6);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), armMat);
    arm.position.set(sx * 0.27, 1.32, -0.3); arm.rotation.x = 1.1;
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.45, 4, 8), mat(0x364fc7));
    leg.position.set(sx * 0.22, 0.85, 0.3); leg.rotation.x = 0.9;
    g.add(arm, leg);
  }
  g.add(rider);
  g.scale.setScalar(1.05);
  return shadowAll(g);
}
function plateTexture() {
  return canvasTex(128, 64, (c, w, h) => {
    c.fillStyle = "#fff"; c.fillRect(0, 0, w, h); c.strokeStyle = "#fab005"; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = "#c92a2a"; c.font = "900 26px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("RIDWAN", w / 2, h / 2 + 2);
  });
}

function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 8), mat(0x8d5524));
  trunk.position.y = 0.7;
  const s = 0.8 + Math.random() * 0.6;
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 - i * 0.2, 0), mat(i % 2 ? 0x2f9e44 : 0x37b24d, { flatShading: true, roughness: 0.9 }));
    leaf.position.y = 1.6 + i * 0.6; g.add(leaf);
  }
  g.add(trunk); g.scale.setScalar(s * 1.3);
  return shadowAll(g);
}
function makePalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 3, 7), mat(0xa47148, { flatShading: true }));
  trunk.position.y = 1.5; trunk.rotation.z = 0.12; g.add(trunk);
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.7, 4), mat(0x2b8a3e, { flatShading: true }));
    leaf.position.set(0.18, 3.0, 0); leaf.rotation.set(0, (i / 7) * Math.PI * 2, 1.9);
    leaf.geometry.translate(0, 0.85, 0);
    g.add(leaf);
  }
  g.scale.setScalar(1.1 + Math.random() * 0.4);
  return shadowAll(g);
}
function makeBush() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.3, 0), mat(0x40c057, { flatShading: true }));
    b.position.set((i - 1) * 0.5, 0.4, Math.random() * 0.3); g.add(b);
  }
  return shadowAll(g);
}
function makeHouse() {
  const g = new THREE.Group();
  const colors = [0xfff3bf, 0xffe8cc, 0xe7f5ff, 0xf8f0fc, 0xfff9db];
  const w = 2.6 + Math.random(), h = 1.8 + Math.random() * 1.4;
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.4), mat(colors[Math.floor(Math.random() * colors.length)], { roughness: 0.9 }));
  box.position.y = h / 2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.18, 2.6), mat(0xe8590c)); roof.position.y = h + 0.09;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.05), mat(0x1971c2)); door.position.set(0, 0.5, 1.22);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.05), mat(0x74c0fc, { emissive: 0x1c7ed6, emissiveIntensity: 0.2 }));
  win.position.set(w * 0.28, h * 0.62, 1.22);
  g.add(box, roof, door, win);
  g.userData.face = true;
  return shadowAll(g);
}
function makeMosque() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 3), mat(0xf8f9fa, { roughness: 0.9 })); base.position.y = 1.1;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x37b24d, { roughness: 0.4 })); dome.position.y = 2.2;
  const minaret = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.6, 12), mat(0xf8f9fa)); minaret.position.set(1.9, 2.3, 0);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 12), mat(0x37b24d)); top.position.set(1.9, 4.95, 0);
  const moon = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 16, Math.PI * 1.4), mat(0xfab005, { metalness: 0.6, roughness: 0.3 }));
  moon.position.set(0, 3.65, 0);
  g.add(base, dome, minaret, top, moon);
  g.userData.face = true;
  return shadowAll(g);
}
function makeCamel() {
  const g = new THREE.Group();
  const tan = mat(0xd9a35b, { flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.55), tan); body.position.y = 1.4;
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), tan); hump.position.set(0, 1.8, 0); hump.scale.y = 0.8;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), tan); neck.position.set(0.75, 1.85, 0); neck.rotation.z = -0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.24), tan); head.position.set(1.05, 2.2, 0);
  g.add(body, hump, neck, head);
  for (const [x, z] of [[-0.5, -0.18], [-0.5, 0.18], [0.5, -0.18], [0.5, 0.18]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), tan); leg.position.set(x, 0.55, z); g.add(leg);
  }
  g.userData.face = true;
  return shadowAll(g);
}
