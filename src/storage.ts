import { parse, type Project } from './core.ts';

export const AUTOSAVE_KEY = 'log-studio:autosave';

export type AutosavePayload = {
  version: 1;
  savedAt: number;
  project: Project;
};

export function isMeaningfulProject(p: Project): boolean {
  if (p.blocks.length > 0) return true;
  if (p.original !== null) return true;
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

export function saveAutosave(p: Project, now = Date.now()): boolean {
  if (!isMeaningfulProject(p)) return false;
  try {
    const payload: AutosavePayload = {
      version: 1,
      savedAt: now,
      project: p,
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn('자동저장 실패 (로컬 스토리지 한도 등):', err);
    return false;
  }
}

export function loadAutosave(): AutosavePayload | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.savedAt || typeof parsed.savedAt !== 'number') return null;

    // Project 유효성 검증은 core parse를 활용
    const project = parse(JSON.stringify(parsed.project), 'autosave.json');
    if (!isMeaningfulProject(project)) return null;

    return {
      version: 1,
      savedAt: parsed.savedAt,
      project,
    };
  } catch (err) {
    console.warn('자동저장 불러오기 실패:', err);
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
