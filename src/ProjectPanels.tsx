import { useMemo, useRef } from 'react';
import type { Project } from './core';
import { getUnusedImageStats, normalizeProjectImagePool, resolveImageUrl } from './imagePool';
import {
  defaultDisplay,
  displayTime,
  type MergeSeparatorMode,
} from './presentation';
import { removeQuickCharacterSlot, resolveQuickSlotForComposer } from './quickSlots';
import { exportStylesConfig, parseStylesConfig } from './styles';
import { SYSTEM_CHARACTER_ID } from './systemCharacter';

export { CharacterPanel } from './CharacterPanel';

function formatBytes(chars: number): string {
  if (chars < 1024) return `${chars}B`;
  const kb = chars / 1024;
  if (kb < 1024) return `${kb.toFixed(1)}KB`;
  return `${(kb / 1024).toFixed(2)}MB`;
}

export function SettingsPanel({
  project: p,
  commit,
  onDownload,
  onNotice,
  onError,
}: {
  project: Project;
  commit: (p: Project) => void;
  onDownload?: (content: string, filename: string) => void;
  onNotice?: (msg: string) => void;
  onError?: (err: unknown) => void;
}) {
  const settings = { ...defaultDisplay, ...p.display };
  const update = (patch: Partial<typeof settings>) =>
    commit({ ...p, display: { ...settings, ...patch } });

  const styleFileInputRef = useRef<HTMLInputElement>(null);

  const unusedStats = useMemo(() => getUnusedImageStats(p), [p]);
  const hasUnusedImages = unusedStats.unusedCount > 0;

  const handleCleanupImages = () => {
    const cleaned = normalizeProjectImagePool(p);
    if (cleaned === p && unusedStats.unusedCount === 0) {
      onNotice?.('정리할 미참조 내부 이미지가 없습니다.');
      return;
    }
    commit(cleaned);
    onNotice?.(
      `참조 없는 내부 이미지 ${unusedStats.unusedCount}개(${formatBytes(unusedStats.unusedBytes)})를 정리했습니다.`,
    );
  };

  const handleExportStyles = () => {
    const json = exportStylesConfig(p.styles);
    const filename = `${(p.title || 'log').trim() || 'log'}.styles.json`;
    if (onDownload) {
      onDownload(json, filename);
    } else {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([json], { type: 'application/json' })),
        download: filename,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    }
    onNotice?.(`스타일 설정 파일(${filename})을 내려받았습니다.`);
  };

  const handleClickImportStyles = () => {
    const ok = window.confirm(
      '스타일 설정 파일을 불러오면 현재 프로젝트의 스타일 카드와 전역 스타일 설정을 덮어씌웁니다. 계속할까요?',
    );
    if (!ok) return;
    styleFileInputRef.current?.click();
  };

  return (
    <>
      <section className="settings-card">
        <h2>표시 및 타임라인 설정</h2>
        <div className="settings-options">
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.showChannel}
              onChange={(e) => update({ showChannel: e.target.checked })}
            />
            <span>채널(탭) 이름 표시</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.showTimestamp}
              onChange={(e) => update({ showTimestamp: e.target.checked })}
            />
            <span>타임스탬프 표시</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(settings.applyStylesInEditor)}
              onChange={(e) => update({ applyStylesInEditor: e.target.checked })}
            />
            <span>로그 편집 화면에 스타일 적용</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.showScrollbarOverlay ?? true}
              onChange={(e) => update({ showScrollbarOverlay: e.target.checked })}
            />
            <span>스크롤바 오버레이</span>
          </label>
        </div>

        {settings.showTimestamp && (
          <div className="settings-row">
            <label className="stack-field">
              <span>타임스탬프 형식</span>
              <select
                disabled={!settings.showTimestamp}
                value={settings.timestampFormat}
                onChange={(e) => update({ timestampFormat: e.target.value })}
              >
                <option value="original">원본 표기</option>
                <option value="YYYY-MM-DD HH:mm:ss">년-월-일 시:분:초</option>
                <option value="YYYY-MM-DD">날짜만 (시·분 숨김)</option>
                <option value="HH:mm">시:분만</option>
                <option value="HH:mm:ss YYYY-MM-DD">시간 → 날짜</option>
                <option value="DD/MM/YYYY HH:mm">일/월/년 시:분</option>
              </select>
            </label>
            <div className="time-preview">
              <span className="field-label">미리보기</span>
              <code>{displayTime('2026. 11. 13. 오후 09:05:30', settings) || '숨김'}</code>
            </div>
          </div>
        )}

        <small className="muted-note">
          편집 화면과 모든 내보내기 형식에 적용되며, 원본 시각 데이터는 보존됩니다.
        </small>

        <div style={{ margin: '8px 0 4px', borderTop: '1px solid var(--border-subtle, #333)' }} />

        <h2 style={{ marginTop: 0 }}>타임라인 스크롤 및 성능</h2>
        <div className="settings-options">
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.virtualScroll ?? true}
              onChange={(e) => update({ virtualScroll: e.target.checked })}
            />
            <span>가상 스크롤 활성화</span>
          </label>
        </div>

        {(settings.virtualScroll ?? true) && (
          <div className="settings-row">
            <label className="stack-field">
              <span>스크롤 버퍼 크기 (위/아래 여유 메시지 수)</span>
              <select
                value={settings.virtualBuffer ?? 25}
                onChange={(e) => update({ virtualBuffer: Number(e.target.value) })}
              >
                <option value="15">15개 (절약 모드 · 저사양 기기)</option>
                <option value="25">25개 (권장 · 균형)</option>
                <option value="50">50개 (여유 · 빠른 스크롤)</option>
                <option value="100">100개 (최대 · 고사양 PC)</option>
              </select>
            </label>
          </div>
        )}

        <small className="muted-note">
          화면에 보이는 메시지 외에 위아래로 미리 렌더링해 둘 여유 개수입니다.
        </small>
      </section>

      <section className="settings-card">
        <h2>편집 동작 및 데이터 관리</h2>
        <div className="settings-row">
          <label className="stack-field">
            <span>연속 병합 시 줄바꿈 형식</span>
            <select
              value={settings.mergeSeparator ?? 'newline'}
              onChange={(e) =>
                update({ mergeSeparator: e.target.value as MergeSeparatorMode })
              }
            >
              <option value="newline">한 줄 바꿈 (\n · 기본)</option>
              <option value="doubleNewline">빈 줄 포함 (두 줄 바꿈, \n\n)</option>
              <option value="space">공백 한 칸으로 이어붙이기</option>
            </select>
          </label>

          <label className="stack-field">
            <span>최대 뒤로가기(Undo) 단계 수</span>
            <select
              value={settings.maxUndoSteps ?? 100}
              onChange={(e) => update({ maxUndoSteps: Number(e.target.value) })}
            >
              <option value="20">20단계 (메모리 절약)</option>
              <option value="50">50단계</option>
              <option value="100">100단계 (기본)</option>
              <option value="200">200단계</option>
              <option value="500">500단계</option>
            </select>
          </label>
        </div>

        <div className="settings-options">
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.autoWrapQuotes ?? true}
              onChange={(e) => update({ autoWrapQuotes: e.target.checked })}
            />
            <span>선택한 텍스트 따옴표·괄호 자동 감싸기</span>
          </label>
        </div>

        <div style={{ margin: '8px 0 4px', borderTop: '1px solid var(--border-subtle, #333)' }} />

        <h2 style={{ marginTop: 0 }}>스타일 카드 설정 & 내부 이미지</h2>
        <div className="settings-action-group">
          <div className="settings-action-row">
            <div className="settings-action-info">
              <strong>스타일 카드 설정 불러오기 / 내보내기</strong>
              <span className="muted-note">
                현재 {(p.styles?.cards ?? []).length}개의 스타일 카드와 전역 스타일을 JSON으로
                백업하거나 가져옵니다.
              </span>
            </div>
            <div className="settings-action-buttons">
              <button
                type="button"
                className="compact-btn"
                onClick={handleExportStyles}
              >
                스타일 내보내기
              </button>
              <button
                type="button"
                className="compact-btn"
                onClick={handleClickImportStyles}
              >
                스타일 불러오기
              </button>
              <input
                ref={styleFileInputRef}
                type="file"
                accept=".json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    const nextStyles = parseStylesConfig(await f.text());
                    commit({ ...p, styles: nextStyles });
                    onNotice?.(
                      `스타일 카드 ${nextStyles.cards.length}개와 전역 스타일을 불러왔습니다.`,
                    );
                  } catch (err) {
                    onError?.(err);
                  }
                }}
              />
            </div>
          </div>

          <div className="settings-action-row">
            <div className="settings-action-info">
              <strong>참조 없는 내부 이미지 정리</strong>
              <span className="muted-note">
                보관 중인 내부 이미지 {unusedStats.totalCount}개 · 미참조{' '}
                {unusedStats.unusedCount}개
                {hasUnusedImages ? ` (${formatBytes(unusedStats.unusedBytes)})` : ''}
              </span>
            </div>
            <button
              type="button"
              className={`compact-btn settings-cleanup-btn ${hasUnusedImages ? 'primary has-unused' : ''}`}
              onClick={handleCleanupImages}
            >
              {hasUnusedImages
                ? `미참조 이미지 정리 (${unusedStats.unusedCount}개)`
                : '참조 없는 내부 이미지 정리'}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card settings-card-wide">
        <h2>빠른 캐릭터 전환 슬롯 (Ctrl+1~9 / Alt+1~9)</h2>
        <small className="muted-note">
          채팅창의 화자·메시지 입력칸이나 타임라인 메시지에서 <code>Ctrl + 1~9</code>를
          눌러 캐릭터를 저장하고, <code>Alt + 1~9</code>로 빠르게 전환합니다. (채널은
          복사되지 않습니다)
        </small>
        {(() => {
          const slots = p.quickSlots ?? {};
          const entries = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
            .filter((k) => Boolean(slots[k]))
            .map((k) => ({
              key: k,
              slot: resolveQuickSlotForComposer(slots[k]!, p.characters ?? []),
            }));

          if (entries.length === 0) {
            return (
              <div className="quick-slots-empty">
                저장된 빠른 전환 캐릭터가 없습니다. 채팅창에서 <code>Ctrl + 1~9</code>를
                눌러 자주 쓰는 캐릭터를 등록해보세요.
              </div>
            );
          }

          return (
            <div className="quick-slots-grid">
              {entries.map(({ key, slot }) => {
                const isSystem = slot.characterId === SYSTEM_CHARACTER_ID;
                const isCustom = !slot.characterId;
                const resolvedIcon = resolveImageUrl(slot.iconUrl, p.images);
                return (
                  <div key={key} className="quick-slot-card">
                    <span className="quick-slot-key">Alt+{key}</span>
                    <div className="quick-slot-avatar">
                      {resolvedIcon ? (
                        <img src={resolvedIcon} alt="" />
                      ) : (
                        <span className="quick-slot-avatar-placeholder">
                          {isSystem ? 'SYS' : (slot.speaker || '?').slice(0, 1)}
                        </span>
                      )}
                    </div>
                    <div className="quick-slot-meta">
                      <strong
                        className="quick-slot-name"
                        style={slot.color ? { color: slot.color } : undefined}
                      >
                        {slot.speaker || '이름 없음'}
                      </strong>
                      <span className="quick-slot-badge">
                        {isSystem ? '시스템' : isCustom ? '사용자 지정' : '캐릭터'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ghost icon-btn quick-slot-remove-btn"
                      title={`슬롯 ${key} 지정 해제`}
                      aria-label={`슬롯 ${key} (${slot.speaker}) 지정 해제`}
                      onClick={() => {
                        const nextSlots = removeQuickCharacterSlot(p.quickSlots, key);
                        const nextProject = { ...p };
                        if (nextSlots) nextProject.quickSlots = nextSlots;
                        else delete nextProject.quickSlots;
                        commit(nextProject);
                        onNotice?.(`${key}번 빠른 전환 슬롯을 해제했습니다.`);
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </section>
    </>
  );
}
