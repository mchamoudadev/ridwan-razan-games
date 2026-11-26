import { initAudio, unlock } from "./audio.js";
import { startMoto } from "./moto.js";
import { startRace, webglOK } from "./race3d.js";
import { startBaby } from "./baby.js";
import { startRecorder } from "./record.js";
import { initPhotos, photo } from "./photos.js";

const home = document.getElementById("home");
const game = document.getElementById("game");
const exitBtn = document.getElementById("exit");
let stopGame = null;

await initAudio(document.getElementById("caption"));
await initPhotos();
const showHomePhotos = () => document.querySelectorAll("[data-photo]").forEach((im) => { im.src = photo(im.dataset.photo); });
showHomePhotos();

function open(which) {
  unlock();
  home.classList.add("hidden");
  game.classList.remove("hidden");
  exitBtn.classList.remove("hidden");
  game.innerHTML = "";
  stopGame = which === "ridwan" ? (webglOK() ? startRace(game) : startMoto(game)) : which === "record" ? startRecorder(game) : startBaby(game);
  try { navigator.wakeLock?.request("screen").catch(() => {}); } catch {}
}

function goHome() {
  stopGame?.(); stopGame = null;
  game.innerHTML = "";
  game.classList.add("hidden");
  exitBtn.classList.add("hidden");
  home.classList.remove("hidden");
  showHomePhotos();
}

document.querySelectorAll("[data-kid]").forEach((b) => b.addEventListener("click", () => open(b.dataset.kid)));

// Parent voice-recording screen: hold the 🎙️ button on the home screen for 1.5 s.
const recBtn = document.getElementById("recbtn");
let recTimer = 0;
recBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); recBtn.classList.add("holding"); recTimer = setTimeout(() => { recBtn.classList.remove("holding"); open("record"); }, 1500); });
["pointerup", "pointerleave", "pointercancel"].forEach((ev) => recBtn.addEventListener(ev, () => { clearTimeout(recTimer); recBtn.classList.remove("holding"); }));

// Parent gate: the 🏠 button must be HELD for 1.5 s, so little fingers don't leave the game by accident.
let holdTimer = 0;
const startHold = (e) => { e.preventDefault(); exitBtn.classList.add("holding"); holdTimer = setTimeout(() => { exitBtn.classList.remove("holding"); goHome(); }, 1500); };
const endHold = () => { clearTimeout(holdTimer); exitBtn.classList.remove("holding"); };
exitBtn.addEventListener("pointerdown", startHold);
["pointerup", "pointerleave", "pointercancel"].forEach((ev) => exitBtn.addEventListener(ev, endHold));

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  // when a new version of the game is published, reload once so the phone shows it
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !reloaded && home && !home.classList.contains("hidden")) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((r) => r.update()).catch(() => {});
}
