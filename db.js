// db.js
// IndexedDBへのWAV等の音源Blobとメタデータの永続化を担当する。
// 重要: ここでは一切のデコード・再エンコード・圧縮を行わない。
// 選択されたFileオブジェクトをそのままBlobとしてstoreに書き込むだけ。

const DB_NAME = "demo-player-db";
const DB_VERSION = 1;
const STORE_NAME = "tracks";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("importedAt", "importedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// トラックレコード形状:
// { id: string, title: string, importedAt: number(epoch ms), mimeType: string, blob: Blob, sortOrder: number }
// sortOrder が小さいほどライブラリの上位に表示される。
// 取り込み時は importedAt の降順になるよう自動採番し、
// ユーザーが並び替えを行った場合はその順序で上書きされる。

async function addTrack(track) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(track);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllTracks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result || [];
      // sortOrder が未設定の古いレコードのために importedAt の降順をフォールバックにする
      results.sort((a, b) => {
        const ao = typeof a.sortOrder === "number" ? a.sortOrder : -a.importedAt;
        const bo = typeof b.sortOrder === "number" ? b.sortOrder : -b.importedAt;
        return ao - bo;
      });
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteTrack(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 曲順の入れ替え。[{id, sortOrder}, ...] を一括で書き込む。
// Blobは書き換えないよう、既存レコードを取得してsortOrderだけ更新する。
// 単一トランザクション内で完結させ、tx.oncomplete で確定を待つことで、
// 連続した並び替え操作が競合しても最後に発行した内容が確実に反映されるようにする。
async function updateSortOrders(orderList) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (orderList.length === 0) {
      resolve();
      return;
    }

    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));

    orderList.forEach(({ id, sortOrder }) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (!record) return;
        record.sortOrder = sortOrder;
        store.put(record);
      };
    });
  });
}

// ストレージの空き容量見積もり（対応ブラウザのみ）。
// Safariでも navigator.storage.estimate() は利用可能（iOS 13+ で概ね対応）。
async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return estimate; // { usage, quota }
    } catch (e) {
      return null;
    }
  }
  return null;
}

window.DemoPlayerDB = {
  addTrack,
  getAllTracks,
  deleteTrack,
  updateSortOrders,
  getStorageEstimate,
};
