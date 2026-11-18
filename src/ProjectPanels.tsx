import { useMemo, useRef, useState } from 'react';
import type { Project } from './core';
import {
  blobToDataUrl,
  collectExternalImageUrls,
  embedExternalImagesInProject,
  getUnusedImageStats,
  normalizeProjectImagePool,
  resolveImageUrl,
} from './imagePool';
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
  const [openOriginals, setOpenOriginals] = useState<Set<number>>(new Set());
  const [convertingUrls, setConvertingUrls] = useState(false);

  const externalUrls = useMemo(() => collectExternalImageUrls(p), [p]);
  const externalUrlCount = externalUrls.size;

  const handleConvertUrlsToBase64 = async () => {
    if (convertingUrls) return;
    const urls = [...externalUrls];
    if (urls.length === 0) {
      onNotice?.('변환할 외부 이미지 URL이 없습니다.');
      return;
    }

    setConvertingUrls(true);
    try {
      const results = await Promise.all(
        urls.map(async (url) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const blob = await res.blob();
            const dataUri = await blobToDataUrl(blob);
            return [url, dataUri] as const;
          } catch {
            return null;
          }
        }),
      );

      const map: Record<string, string> = {};
      let successCount = 0;
      let failCount = 0;
      for (const item of results) {
        if (item) {
          map[item[0]] = item[1];
          successCount++;
        } else {
          failCount++;
        }
      }

      if (successCount === 0) {
        throw new Error(
          '외부 이미지를 다운로드하지 못했습니다. (외부 서버의 CORS 보안 정책 또는 잘못된 URL)',
        );
      }

      const nextProject = embedExternalImagesInProject(p, map);
      commit(nextProject);

      if (failCount > 0) {
        onNotice?.(
          `외부 이미지 ${urls.length}개 중 ${successCount}개를 Base64로 변환하여 저장했습니다. (${failCount}개는 CORS 또는 네트워크 오류로 실패)`,
        );
      } else {
        onNotice?.(
          `외부 이미지 ${successCount}개를 모두 Base64로 변환하여 내부 풀에 저장했습니다.`,
        );
      }
    } catch (err) {
      onError?.(err);
    } finally {
      setConvertingUrls(false);
    }
  };

  const handleDownloadOriginal = (raw: string, filename: string) => {
    if (onDownload) {
      onDownload(raw, filename);
    } else {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([raw], { type: 'text/plain' })),
        download: filename,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

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

  const slots = p.quickSlots ?? {};
  const slotEntries = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    .filter((k) => Boolean(slots[k]))
    .map((k) => ({
      key: k,
      slot: resolveQuickSlotForComposer(slots[k]!, p.characters ?? []),
    }));

  return (
    <>
      <section className="settings-card">
        <h2>표시 및 타임라인</h2>
        <div className="settings-check-grid">
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.showChannel}
              onChange={(e) => update({ showChannel: e.target.checked })}
            />
            <span>채널 이름 표시</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(settings.applyStylesInEditor)}
              onChange={(e) => update({ applyStylesInEditor: e.target.checked })}
            />
            <span>편집 화면에 스타일 적용</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.showScrollbarOverlay ?? true}
              onChange={(e) => update({ showScrollbarOverlay: e.target.checked })}
            />
            <span>스크롤바 오버레이 표시</span>
          </label>
          <label
            className="check-field"
            title="상단 바에서 특정 채널만 골라 볼 때, 메시지 번호를 전체 로그 기준 대신 해당 채널의 1번부터 다시 매깁니다."
          >
            <input
              type="checkbox"
              checked={settings.channelRelativeLineNumbers ?? false}
              onChange={(e) => update({ channelRelativeLineNumbers: e.target.checked })}
            />
            <span>채널 보기 시 번호 재정렬</span>
          </label>
        </div>
        <div className="settings-compact-grid">
          <div className="settings-timestamp-box">
            <label className="check-field">
              <input
                type="checkbox"
                checked={settings.showTimestamp}
                onChange={(e) => update({ showTimestamp: e.target.checked })}
              />
              <strong>타임스탬프 표시</strong>
            </label>

            <label
              className={`stack-field timestamp-format-field ${!settings.showTimestamp ? 'is-disabled' : ''}`}
            >
              <div className="timestamp-format-label">
                <span>표기 형식</span>
                <span className="muted-note">
                  <code>{displayTime('2026. 11. 13. 오후 09:05:30', settings)}</code>
                </span>
              </div>
              <select
                value={settings.timestampFormat}
                disabled={!settings.showTimestamp}
                onChange={(e) => update({ timestampFormat: e.target.value })}
              >
                <option value="original">원본 표기</option>
                <option value="YYYY-MM-DD HH:mm:ss">년-월-일 시:분:초 (YYYY-MM-DD HH:mm:ss)</option>
                <option value="YYYY-MM-DD">날짜만 (YYYY-MM-DD)</option>
                <option value="HH:mm">시:분만 (HH:mm)</option>
                <option value="HH:mm:ss YYYY-MM-DD">시간 → 날짜 (HH:mm:ss YYYY-MM-DD)</option>
                <option value="DD/MM/YYYY HH:mm">일/월/년 시:분 (DD/MM/YYYY HH:mm)</option>
              </select>
            </label>
          </div>
          <label
            className="stack-field"
            title="화면 위아래로 미리 렌더링할 여유 메시지 개수입니다."
          >
            <div className="settings-field-head">
              <span>가상 스크롤 버퍼 크기</span>
              <span className="muted-note">상하 렌더링 여유분</span>
            </div>
            <select
              value={settings.virtualBuffer ?? 25}
              onChange={(e) => update({ virtualBuffer: Number(e.target.value) })}
            >
              <option value="15">15개 (절약)</option>
              <option value="25">25개 (권장 · 기본)</option>
              <option value="50">50개 (여유)</option>
              <option value="100">100개 (최대)</option>
            </select>
          </label>
        </div>



      </section>



      <section className="settings-card">
        <h2>캐릭터 전환 슬롯</h2>
        <small className="muted-note">
          채팅창·메시지에서 <code>Ctrl+1~9</code>로 저장하고 <code>Alt+1~9</code>로
          전환합니다.
        </small>
        {slotEntries.length === 0 ? (
          <div className="quick-slots-empty">
            등록된 슬롯이 없습니다. 채팅창에서 <code>Ctrl + 1~9</code>를 눌러보세요.
          </div>
        ) : (
          <div className="quick-slots-list">
            {slotEntries.map(({ key, slot }) => {
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
        )}
      </section>

      <section className="settings-card">
        <h2>편집 동작 및 데이터 관리</h2>
        <div className="settings-compact-grid">
          <label className="stack-field">
            <span>연속 병합 시 줄바꿈</span>
            <select
              value={settings.mergeSeparator ?? 'newline'}
              onChange={(e) =>
                update({ mergeSeparator: e.target.value as MergeSeparatorMode })
              }
            >
              <option value="newline">한 줄 바꿈 (\n · 기본)</option>
              <option value="doubleNewline">빈 줄 포함 (\n\n)</option>
              <option value="space">공백 한 칸</option>
            </select>
          </label>

          <label className="stack-field">
            <span>최대 뒤로가기 단계 수</span>
            <select
              value={settings.maxUndoSteps ?? 100}
              onChange={(e) => update({ maxUndoSteps: Number(e.target.value) })}
            >
              <option value="20">20단계 (절약)</option>
              <option value="50">50단계</option>
              <option value="100">100단계 (기본)</option>
              <option value="200">200단계</option>
              <option value="500">500단계</option>
            </select>
          </label>
        </div>

        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.mergeDifferentFaces ?? false}
            onChange={(e) => update({ mergeDifferentFaces: e.target.checked })}
          />
          <span>연속 병합 시 표정이 달라도 합치기</span>
        </label>

        <label
          className="check-field"
          title="연속 병합 시 두 메시지 사이에 다른 채널의 메시지가 끼어 있어도 같은 채널의 첫 번째 메시지 위치로 병합합니다."
        >
          <input
            type="checkbox"
            checked={settings.mergeIgnoreOtherChannels ?? false}
            onChange={(e) => update({ mergeIgnoreOtherChannels: e.target.checked })}
          />
          <span>연속 병합시 중간의 다른 채널의 메시지 무시</span>
        </label>

        <label
          className="check-field"
          title="따옴표나 괄호 입력 시 자동으로 닫고 안으로 커서를 이동하며, 텍스트를 선택한 상태에서 입력하면 선택 영역을 감쌉니다."
        >
          <input
            type="checkbox"
            checked={settings.autoWrapQuotes ?? true}
            onChange={(e) => update({ autoWrapQuotes: e.target.checked })}
          />
          <span>따옴표·괄호 자동 감싸기 및 닫기</span>
        </label>

        <div className="settings-compact-grid">
          <div className="settings-action-row">
            <div className="settings-action-info">
              <strong>스타일 카드 설정 ({(p.styles?.cards ?? []).length}개)</strong>
            </div>
            <div className="settings-action-buttons">
              <button type="button" className="compact-btn" onClick={handleExportStyles}>
                내보내기
              </button>
              <button
                type="button"
                className="compact-btn"
                onClick={handleClickImportStyles}
              >
                불러오기
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
              <strong>내부 이미지 풀</strong>
              <span className="muted-note">
                전체 {unusedStats.totalCount}개 · 미참조 {unusedStats.unusedCount}개
                {hasUnusedImages ? ` (${formatBytes(unusedStats.unusedBytes)})` : ''}
                {externalUrlCount > 0 ? ` · 외부 URL ${externalUrlCount}개` : ''}
              </span>
            </div>
            <div className="settings-action-buttons">
              <button
                type="button"
                className={`compact-btn ${externalUrlCount > 0 ? 'primary has-unused' : ''}`}
                disabled={convertingUrls || externalUrlCount === 0}
                onClick={handleConvertUrlsToBase64}
                title="외부 웹 URL로 연결된 이미지를 다운로드하여 프로젝트 내부에 Base64로 영구 저장합니다."
              >
                {convertingUrls
                  ? '변환 중...'
                  : externalUrlCount > 0
                    ? `URL 변환 (${externalUrlCount})`
                    : 'URL 변환'}
              </button>
              <button
                type="button"
                className={`compact-btn settings-cleanup-btn ${hasUnusedImages ? 'primary has-unused' : ''}`}
                onClick={handleCleanupImages}
              >
                {hasUnusedImages
                  ? `미참조 정리 (${unusedStats.unusedCount})`
                  : '미참조 정리'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2>원본 보관함</h2>
        <div className="original-box">
          <div className="original-box-head">
            <div>
              <strong>보관된 원본 ({p.original.length}개)</strong>
              <span className="muted-note">
                {p.original.length > 0
                  ? p.original.map((o) => o.name).join(', ')
                  : '원본 파일 없음 (새로 작성)'}
              </span>
            </div>
            {!(settings.preserveOriginals ?? true) && (
              <button
                type="button"
                className="danger compact-btn"
                disabled={p.original.length === 0}
                onClick={() => {
                  if (
                    !window.confirm(
                      `보관된 원본 ${p.original.length}개를 모두 삭제할까요? (실행 취소로 되돌릴 수 있습니다)`,
                    )
                  )
                    return;
                  commit({ ...p, original: [] });
                  onNotice?.('보관된 원본 데이터를 모두 삭제했습니다.');
                }}
              >
                모두 삭제
              </button>
            )}
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.preserveOriginals ?? true}
              onChange={(e) =>
                update({
                  preserveOriginals: e.target.checked,
                })
              }
            />
            <span>원본 로그 보존 (해제 시 프로젝트 저장 파일에서 원본 제외)</span>
          </label>
          <small className="muted-note">
            {(settings.preserveOriginals ?? true)
              ? '원본 문자열과 모든 원본 필드는 프로젝트 안에 각각 별도 보존되며 편집 시 훼손되지 않습니다.'
              : '프로젝트 파일(.project.json) 저장 시 원본 데이터가 제외되어 파일 용량이 줄어듭니다.'}
          </small>
          {p.original.length > 0 && (
            <div className="original-accordion-list">
              {p.original.map((orig, idx) => {
                const isOpen = openOriginals.has(idx);
                const toggleOpen = () => {
                  setOpenOriginals((prev) => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx);
                    else next.add(idx);
                    return next;
                  });
                };
                return (
                  <div
                    key={`${orig.name}-${idx}`}
                    className={`original-accordion-item ${isOpen ? 'open' : ''}`}
                  >
                    <div className="original-accordion-head">
                      <button
                        type="button"
                        className="original-accordion-toggle"
                        onClick={toggleOpen}
                        aria-expanded={isOpen}
                      >
                        <span className="original-accordion-caret">
                          {isOpen ? '▾' : '▸'}
                        </span>
                        <span className="original-accordion-badge">#{idx + 1}</span>
                        <strong className="original-accordion-name">
                          {orig.name}
                        </strong>
                        <span className="muted-note">
                          ({orig.raw.length.toLocaleString()}자)
                        </span>
                      </button>
                      <div className="original-box-actions">
                        <button
                          type="button"
                          className="compact-btn"
                          onClick={toggleOpen}
                        >
                          {isOpen ? '원본 닫기' : '원본 보기'}
                        </button>
                        <button
                          type="button"
                          className="compact-btn"
                          onClick={() => handleDownloadOriginal(orig.raw, orig.name)}
                        >
                          원문 내려받기
                        </button>
                      </div>
                    </div>
                    {isOpen && <pre className="original">{orig.raw}</pre>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
