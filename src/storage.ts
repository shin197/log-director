import { validateLogStudioProject, type Project } from './core.ts';

export const AUTOSAVE_DB_NAME = 'log-studio';
export const AUTOSAVE_DB_VERSION = 1;
export const AUTOSAVE_STORE_NAME = 'autosave';
export const AUTOSAVE_KEY = 'log-studio:autosave';

export type AutosavePayload = {
  version: 1;
  savedAt: number;
  project: Project;
};

export function isMeaningfulProject(p: Project): boolean {
  if (p.blocks.length > 0) return true;
  if (p.original.length > 0) return true;
  if (p.title.trim() && p.title.trim() !== '새 로그') return true;
  return false;
}

export function formatRelativeTime(savedAt: number, now = Date.now()): string {
  const diffMs = Math.max(0, now - savedAt);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;

  const d = new Date(savedAt);
  const month = d.getMonth() + 1;
  const date = d.getDate();
  return `${month}월 ${date}일`;
}

function openAutosaveDb(): Promise<IDBDatabase | null> {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const req = idb.open(AUTOSAVE_DB_NAME, AUTOSAVE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE_NAME)) {
        db.createObjectStore(AUTOSAVE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 열기 실패'));
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openAutosaveDb();
  if (!db) return undefined;
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readonly');
      const store = tx.objectStore(AUTOSAVE_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 읽기 실패'));
    });
  } finally {
    db.close();
  }
}

async function idbPut(key: string, value: unknown): Promise<boolean> {
  const db = await openAutosaveDb();
  if (!db) return false;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUTOSAVE_STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 쓰기 실패'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 쓰기 중단'));
    });
    return true;
  } finally {
    db.close();
  }
}

async function idbDelete(key: string): Promise<void> {
  const db = await openAutosaveDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUTOSAVE_STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 삭제 실패'));
    });
  } finally {
    db.close();
  }
}

export async function saveAutosave(p: Project, now = Date.now()): Promise<boolean> {
  if (!isMeaningfulProject(p)) return false;
  try {
    const payload: AutosavePayload = {
      version: 1,
      savedAt: now,
      project: p,
    };
    return await idbPut(AUTOSAVE_KEY, payload);
  } catch (err) {
    console.warn('자동저장 실패 (IndexedDB):', err);
    return false;
  }
}

function parseAutosaveRecord(parsed: unknown): AutosavePayload | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (!record.savedAt || typeof record.savedAt !== 'number') return null;

  const project = validateLogStudioProject(record.project);
  if (!isMeaningfulProject(project)) return null;

  return {
    version: 1,
    savedAt: record.savedAt,
    project,
  };
}

export async function loadAutosave(): Promise<AutosavePayload | null> {
  try {
    const record = await idbGet(AUTOSAVE_KEY);
    if (record !== undefined) {
      return parseAutosaveRecord(record);
    }

    // 기존 localStorage 자동저장 데이터가 남아 있는 경우 1회 호환 읽기
    const legacyRaw = globalThis.localStorage?.getItem(AUTOSAVE_KEY);
    if (!legacyRaw) return null;
    return parseAutosaveRecord(JSON.parse(legacyRaw));
  } catch (err) {
    console.warn('자동저장 불러오기 실패:', err);
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    await idbDelete(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
  try {
    globalThis.localStorage?.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
