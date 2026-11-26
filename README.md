# Ridwan & Razan — family learning games

A phone web app (works on iPhone + Android, installable to the home screen, works offline).

- **Ridwan (5): 3D Letter Race.** Drive a car or motorbike (his choice of colour) through the gate with the Arabic letter
  the voice asks for — all 28 letters, ا to ي. Starts with 3 letters, unlocks a new one every 3 correct answers. Tap a lane or the
  left/right side of the screen to steer. Tap the big letter at the top to hear it again.
- **Razan (1½): Tap & Hear.** One big photo at a time. Any tap → bounce, hearts, and the voice says
  "Razan, eeg! Waa bisad. Miyaw, miyaw!" — then the next picture.
- **Mom (Hooyo) cheers beside the road** with her photo and pom-poms, in a female voice (Gemini "Sulafat"):
  "Ahow, ahow, Ridwan! Waad kartaa!"
- **Family voices:** on the home screen, hold **🎙️ Codadka qoyska** for 1.5 s. Record (or upload) your own voice
  for any line; it replaces the computer voice. Recordings stay on that phone (IndexedDB).
- **Parent exit:** hold the 🏠 button for 1.5 s.

## Voices (Somali + Arabic letter names)
All spoken lines live in `phrases.json`. Generate the mp3s once with Gemini TTS:

```sh
GEMINI_API_KEY=your-key node tools/gen-audio.mjs           # missing clips only
GEMINI_API_KEY=your-key node tools/gen-audio.mjs --force   # redo everything
GEMINI_API_KEY=your-key node tools/gen-audio.mjs razan_cat # redo one clip
```

Until the clips exist the game shows the Somali text as captions instead.

## Run locally
```sh
python3 -m http.server 8765   # then open http://localhost:8765
```

## Family photos (private)
Family photos are **not** part of this website. On each phone: hold **🎙️ Qoyska** on the home screen for 1.5 s,
then tap a picture to add Ridwan, Razan, Mom, Dad… from the gallery. They are stored only on that phone (IndexedDB).

## Credits
- Photos of animals/vehicles: Wikimedia Commons — `images/CREDITS.md`
- 3D models: `models/CREDITS.md` · Sounds: `sounds/CREDITS.md`
- 3D engine: three.js (MIT), in `vendor/`
