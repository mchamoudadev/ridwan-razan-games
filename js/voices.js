// Family voice recordings (Mom / Dad recording their own lines), kept on this phone in IndexedDB.
const DB = "rr-voices", STORE = "clips";

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
    const out = fn(st);
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  }));
}

/** All saved recordings as a Map(key -> Blob). Empty map if storage isn't available. */
export async function loadAll() {
  const map = new Map();
  try {
    await open().then((db) => new Promise((res) => {
      const st = db.transaction(STORE).objectStore(STORE);
      const req = st.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) { map.set(cur.key, cur.value); cur.continue(); } else res();
      };
      req.onerror = () => res();
    }));
  } catch {}
  return map;
}
export const saveClip = (key, blob) => tx("readwrite", (st) => st.put(blob, key));
export const deleteClip = (key) => tx("readwrite", (st) => st.delete(key));
