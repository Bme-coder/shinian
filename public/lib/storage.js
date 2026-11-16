let database;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("shinian-private", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("kv");
        request.result.createObjectStore("notes", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return database;
}
async function transaction(store, mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("无法保存到设备"));
  });
}
export const storage = {
  get: (key) => transaction("kv", "readonly", (s) => s.get(key)),
  set: (key, value) => transaction("kv", "readwrite", (s) => s.put(value, key)),
  remove: (key) => transaction("kv", "readwrite", (s) => s.delete(key)),
  all: () => transaction("notes", "readonly", (s) => s.getAll()),
  save: (note) => transaction("notes", "readwrite", (s) => s.put(note)),
  delete: (id) => transaction("notes", "readwrite", (s) => s.delete(id)),
  importNotes: async (notes) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("notes", "readwrite"),
        store = tx.objectStore("notes");
      for (const note of notes) store.put(note);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
};
