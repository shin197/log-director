import { useEffect, useMemo, useRef, useState } from 'react';
import { type Project } from './core';
import { SYSTEM_CHARACTER_ID } from './systemCharacter';
import {
  DEFAULT_IMPORT_OPTIONS,
  type ImportManagerOptions,
  type ImportMergeMode,
  type ImportedLogItem,
  createImportedLogItem,
  mergeImportedLogs,
  moveImportedItem,
} from './importManager';
import { normalizeScenes } from './scenes';
import { isMeaningfulProject } from './storage';

type Props = {
  project: Project;
  initialItems: ImportedLogItem[];
  onClose: () => void;
  onApply: (nextProject: Project, summaryText: string) => void;
  onError: (message: string) => void;
};

export function ImportDialog({
  project,
  initialItems,
  onClose,
  onApply,
  onError,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scenes = useMemo(
    () => normalizeScenes(project.scenes ?? [], project.blocks),
    [project.scenes, project.blocks],
  );
  const hasExistingProject = isMeaningfulProject(project) && project.blocks.length > 0;

  const [items, setItems] = useState<ImportedLogItem[]>(initialItems);
  const [options, setOptions] = useState<ImportManagerOptions>(() => ({
    ...DEFAULT_IMPORT_OPTIONS,
    targetSceneId: scenes[0]?.id ?? '',
  }));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [fileDropActive, setFileDropActive] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  const appendFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const loaded: ImportedLogItem[] = [];
    for (const file of files) {
      try {
        const raw = await file.text();
        loaded.push(createImportedLogItem(file.name, raw));
      } catch (err) {
        onError(
          err instanceof Error
            ? `'${file.name}': ${err.message}`
            : `'${file.name}' 파일을 읽거나 해석하지 못했습니다.`,
        );
      }
    }
    if (loaded.length > 0) {
      setItems((prev) => [...prev, ...loaded]);
    }
  };

  const handleModeChange = (mode: ImportMergeMode) => {
    setOptions((prev) => ({
      ...prev,
      mode,
      targetSceneId:
        mode === 'insert-scene'
          ? prev.targetSceneId || scenes[0]?.id || ''
          : prev.targetSceneId,
    }));
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMoveItem = (fromIndex: number, toIndex: number) => {
    setItems((prev) => moveImportedItem(prev, fromIndex, toIndex));
  };

  const handleApply = () => {
    if (items.length === 0) return;
    try {
      const {
        project: merged,
        addedBlockCount,
        skippedDuplicateCount,
      } = mergeImportedLogs(project, items, options);
      const dupText =
        skippedDuplicateCount > 0 ? ` (경계 중복 ${skippedDuplicateCount}개 건너뜀)` : '';
      onApply(
        merged,
        `파일 ${items.length}개 · 메시지 ${addedBlockCount.toLocaleString()}개를 불러왔습니다${dupText}`,
      );
      onClose();
    } catch (err) {
      onError(
        err instanceof Error
          ? `로그 병합 오류: ${err.message}`
          : '로그를 병합하는 중 오류가 발생했습니다.',
      );
    }
  };

  const totalMessages = items.reduce((sum, item) => sum + item.project.blocks.length, 0);
  const modeSummary =
    options.mode === 'insert-scene'
      ? '선택한 장면 앞에 삽입합니다.'
      : options.mode === 'interleave'
        ? '타임스탬프 기준 시간순 교차 정렬합니다.'
        : hasExistingProject
          ? '현재 타임라인 맨 뒤에 추가합니다.'
          : '목록 순서대로 새 로그 생성합니다.';

  return (
    <dialog
      ref={dialog}
      className="export-dialog import-dialog"
      aria-labelledby="import-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="export-heading">
        <div className="export-heading-left">
          <h2 id="import-dialog-title">로그 불러오기 매니저</h2>
          <span className="count-pill">
            {items.length}개 파일 · {totalMessages.toLocaleString()}개 메시지
          </span>
        </div>
        <button
          type="button"
          className="ghost icon-btn"
          onClick={onClose}
          aria-label="불러오기 매니저 닫기"
        >
          ×
        </button>
      </div>

      <div className="import-body">
        <section className="import-queue-panel" aria-label="불러올 파일 목록">
          <div className="import-section-head">
            <span className="import-section-title">불러올 파일 목록</span>
            <button
              type="button"
              className="compact-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              ＋ 파일 추가
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".json,.html,.htm,.md,.markdown,.txt"
              hidden
              onChange={async (e) => {
                if (e.target.files) {
                  await appendFiles(e.target.files);
                }
                e.target.value = '';
              }}
            />
          </div>

          <div
            className={`import-queue-dropzone ${fileDropActive ? 'drop-active' : ''}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                setFileDropActive(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setFileDropActive(false);
              }
            }}
            onDrop={async (e) => {
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                setFileDropActive(false);
                await appendFiles(e.dataTransfer.files);
              }
            }}
          >
            {items.length === 0 ? (
              <div className="import-queue-empty">
                <p>불러올 로그 파일을 이곳에 끌어놓거나 [＋ 파일 추가]를 누르세요.</p>
                <small>JSON · HTML · Markdown · TXT 다중 선택 지원</small>
              </div>
            ) : (
              <>
                <div className="import-card-list" role="list">
                  {items.map((item, idx) => {
                    const charCount = (item.project.characters ?? []).filter(
                      (c) => c.id !== SYSTEM_CHARACTER_ID,
                    ).length;
                    const firstTs = item.project.blocks.find((b) =>
                      b.timestamp?.trim(),
                    )?.timestamp;
                    const isDragging = dragIndex === idx;
                    const isDragOver = dragOverIndex === idx && dragIndex !== idx;

                    return (
                      <div
                        key={item.id}
                        role="listitem"
                        draggable
                        className={`import-file-card ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''
                          }`}
                        onDragStart={(e) => {
                          setDragIndex(idx);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          if (dragIndex === null) return;
                          e.preventDefault();
                          setDragOverIndex(idx);
                        }}
                        onDrop={(e) => {
                          if (dragIndex === null) return;
                          e.preventDefault();
                          e.stopPropagation();
                          handleMoveItem(dragIndex, idx);
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                      >
                        <span className="import-card-order" title="드래그하여 순서 변경">
                          #{idx + 1}
                        </span>
                        <div className="import-card-main">
                          <strong className="import-card-name" title={item.name}>
                            {item.name}
                          </strong>
                          <span className="import-card-meta">
                            메시지 {item.project.blocks.length.toLocaleString()}개 ·
                            캐릭터 {charCount}명{firstTs ? ` · ${firstTs}` : ''}
                          </span>
                        </div>
                        <div className="import-card-actions">
                          <button
                            type="button"
                            className="ghost icon-btn"
                            disabled={idx === 0}
                            onClick={() => handleMoveItem(idx, idx - 1)}
                            aria-label={`${item.name} 위로 이동`}
                            title="위로 이동"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="ghost icon-btn"
                            disabled={idx === items.length - 1}
                            onClick={() => handleMoveItem(idx, idx + 1)}
                            aria-label={`${item.name} 아래로 이동`}
                            title="아래로 이동"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            className="ghost icon-btn danger"
                            onClick={() => handleRemoveItem(item.id)}
                            aria-label={`${item.name} 목록에서 제거`}
                            title="목록에서 제거"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="import-queue-hint">
                  카드를 드래그하거나 ▲/▼로 순서를 바꾸고, 파일을 끌어놓아 추가하세요.
                </div>
              </>
            )}
          </div>
        </section>

        <section className="import-options-panel" aria-label="불러오기 옵션">
          <div className="import-option-group">
            <span className="import-section-title">이어붙이기 모드</span>
            <div
              className="import-mode-list"
              role="radiogroup"
              aria-label="이어붙이기 모드"
            >
              <label
                className={`format-option ${options.mode === 'append' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="import-merge-mode"
                  checked={options.mode === 'append'}
                  onChange={() => handleModeChange('append')}
                />
                <span>
                  <strong>맨 뒤에 붙이기 (Append)</strong>
                  <small>
                    {hasExistingProject
                      ? '현재 작업 중인 타임라인의 맨 끝에 순서대로 추가합니다.'
                      : '선택한 파일들을 목록 순서대로 이어붙입니다.'}
                  </small>
                </span>
              </label>

              <label
                className={`format-option ${options.mode === 'insert-scene' ? 'active' : ''
                  } ${scenes.length === 0 ? 'disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="import-merge-mode"
                  disabled={scenes.length === 0}
                  checked={options.mode === 'insert-scene'}
                  onChange={() => handleModeChange('insert-scene')}
                />
                <span className="import-mode-content">
                  <strong>장면에 삽입 (Insert)</strong>
                  <small>
                    {scenes.length > 0
                      ? '선택한 장면으로 마킹된 메시지의 바로 앞에 삽입합니다.'
                      : '현재 타임라인에 등록된 장면이 없어 사용할 수 없습니다.'}
                  </small>
                  {options.mode === 'insert-scene' && scenes.length > 0 && (
                    <select
                      className="import-scene-select"
                      value={options.targetSceneId || scenes[0]?.id || ''}
                      onChange={(e) =>
                        setOptions((prev) => ({
                          ...prev,
                          targetSceneId: e.target.value,
                        }))
                      }
                      aria-label="삽입할 기준 장면 선택"
                    >
                      {scenes.map((scene, i) => {
                        const msgIndex = project.blocks.findIndex(
                          (b) => b.id === scene.messageId,
                        );
                        return (
                          <option key={scene.id} value={scene.id}>
                            #{i + 1} {scene.name} (메시지 #
                            {msgIndex >= 0 ? msgIndex + 1 : '?'})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </span>
              </label>

              <label
                className={`format-option ${options.mode === 'interleave' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="import-merge-mode"
                  checked={options.mode === 'interleave'}
                  onChange={() => handleModeChange('interleave')}
                />
                <span>
                  <strong>시간순 정렬 (Interleave)</strong>
                  <small>
                    타임스탬프를 해석해 시간순으로 교차 정렬합니다. 시각이 없는 메시지는
                    직전 메시지 시간대를 따라 원래 순서를 유지합니다.
                  </small>
                </span>
              </label>
            </div>
          </div>

          <div className="import-option-group import-checks-group">
            <span className="import-section-title">분할 세션 옵션</span>
            <label className="import-check-row">
              <input
                type="checkbox"
                checked={options.registerScenes}
                onChange={(e) =>
                  setOptions((prev) => ({ ...prev, registerScenes: e.target.checked }))
                }
              />
              <span>
                <strong>파일 시작점에 장면 등록</strong>
                <small>
                  각 파일 첫 메시지에 장면 북마크를 등록합니다.
                </small>
              </span>
            </label>
            <label className="import-check-row">
              <input
                type="checkbox"
                checked={options.mergeCharacters}
                onChange={(e) =>
                  setOptions((prev) => ({ ...prev, mergeCharacters: e.target.checked }))
                }
              />
              <span>
                <strong>동일 캐릭터 병합</strong>
                <small>
                  이름이 같은 캐릭터를 하나로 통합하고 새 표정을 표정 목록에 자동
                  추가합니다.
                </small>
              </span>
            </label>
            <label className="import-check-row">
              <input
                type="checkbox"
                checked={options.skipBoundaryDuplicates}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    skipBoundaryDuplicates: e.target.checked,
                  }))
                }
              />
              <span>
                <strong>파일 경계선의 중복 메시지 건너뛰기</strong>
                <small>
                  연속된 두 파일의 경계에서 겹치는 메시지를
                  걸러냅니다.
                </small>
              </span>
            </label>
          </div>
        </section>
      </div>

      <footer className="export-footer">
        <div className="export-footer-actions">
          <button type="button" className="ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="primary"
            disabled={items.length === 0}
            onClick={handleApply}
          >
            불러오기 적용
          </button>
        </div>
      </footer>
    </dialog>
  );
}
