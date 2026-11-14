import { useEffect, useRef, useState } from 'react';
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
  open: boolean;
  project: Project;
  initialItems: ImportedLogItem[];
  onClose: () => void;
  onApply: (nextProject: Project, summaryText: string) => void;
  onError: (message: string, detail?: unknown) => void;
};

export function ImportDialog({
  open,
  project,
  initialItems,
  onClose,
  onApply,
  onError,
}: Props) {
  const [items, setItems] = useState<ImportedLogItem[]>(initialItems);
  const [options, setOptions] = useState<ImportManagerOptions>(DEFAULT_IMPORT_OPTIONS);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [fileDropActive, setFileDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scenes = normalizeScenes(project.scenes ?? [], project.blocks);
  const hasExistingProject = isMeaningfulProject(project) && project.blocks.length > 0;

  useEffect(() => {
    if (!open) return;
    setItems(initialItems);
    setOptions((prev) => ({
      ...DEFAULT_IMPORT_OPTIONS,
      mode: prev.mode === 'insert-scene' && scenes.length === 0 ? 'append' : prev.mode,
      targetSceneId: scenes[0]?.id ?? '',
    }));
  }, [open, initialItems]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const appendFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const loaded: ImportedLogItem[] = [];
    for (const file of files) {
      try {
        const raw = await file.text();
        loaded.push(createImportedLogItem(file.name, raw));
      } catch (err) {
        onError(`'${file.name}' 파일을 읽거나 해석하지 못했습니다.`, err);
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
        `파일 ${items.length}개 · 메시지 ${addedBlockCount}개를 불러왔습니다${dupText}`,
      );
      onClose();
    } catch (err) {
      onError('로그를 병합하는 중 오류가 발생했습니다.', err);
    }
  };

  const totalMessages = items.reduce((sum, item) => sum + item.project.blocks.length, 0);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="export-dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
      >
        <header className="export-dialog-header">
          <div>
            <p className="eyebrow">IMPORT MANAGER</p>
            <h2 id="import-dialog-title">로그 불러오기 매니저</h2>
          </div>
          <button
            type="button"
            className="ghost-icon"
            onClick={onClose}
            aria-label="불러오기 매니저 닫기"
          >
            ✕
          </button>
        </header>

        <div className="export-dialog-body import-dialog-body">
          <div className="export-field">
            <div className="import-queue-header">
              <span>불러올 파일 목록 ({items.length}개)</span>
              <button
                type="button"
                className="mini"
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
              onDragLeave={() => setFileDropActive(false)}
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
                  <p>
                    불러올 로그 파일을 이곳에 끌어놓거나 [＋ 파일 추가] 버튼을 눌러
                    선택하세요.
                  </p>
                  <small>
                    JSON · HTML · Markdown · TXT 파일을 여러 개 선택할 수 있습니다.
                  </small>
                </div>
              ) : (
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
                        className={`import-file-card ${isDragging ? 'dragging' : ''} ${
                          isDragOver ? 'drag-over' : ''
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
                            메시지 {item.project.blocks.length}개 · 캐릭터 {charCount}명
                            {firstTs ? ` · 시작 ${firstTs}` : ''}
                          </span>
                        </div>
                        <div className="import-card-actions">
                          <button
                            type="button"
                            className="mini ghost-icon"
                            disabled={idx === 0}
                            onClick={() => handleMoveItem(idx, idx - 1)}
                            aria-label={`${item.name} 위로 이동`}
                            title="위로 이동"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="mini ghost-icon"
                            disabled={idx === items.length - 1}
                            onClick={() => handleMoveItem(idx, idx + 1)}
                            aria-label={`${item.name} 아래로 이동`}
                            title="아래로 이동"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            className="mini ghost-icon danger-icon"
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
              )}
            </div>
          </div>

          <div className="export-field">
            <span>이어붙이기 모드</span>
            <div
              className="import-mode-list"
              role="radiogroup"
              aria-label="이어붙이기 모드"
            >
              <label
                className={`import-mode-card ${options.mode === 'append' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="import-merge-mode"
                  checked={options.mode === 'append'}
                  onChange={() => handleModeChange('append')}
                />
                <div className="import-mode-info">
                  <strong>맨 뒤에 붙이기 (Append)</strong>
                  <small>
                    {hasExistingProject
                      ? '현재 작업중인 타임라인의 맨 끝에 순서대로 이어붙입니다.'
                      : '선택한 파일들을 목록 순서대로 이어붙입니다.'}
                  </small>
                </div>
              </label>

              <label
                className={`import-mode-card ${options.mode === 'insert-scene' ? 'active' : ''} ${
                  scenes.length === 0 ? 'disabled' : ''
                }`}
              >
                <input
                  type="radio"
                  name="import-merge-mode"
                  disabled={scenes.length === 0}
                  checked={options.mode === 'insert-scene'}
                  onChange={() => handleModeChange('insert-scene')}
                />
                <div className="import-mode-info">
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
                        setOptions((prev) => ({ ...prev, targetSceneId: e.target.value }))
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
                </div>
              </label>

              <label
                className={`import-mode-card ${options.mode === 'interleave' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="import-merge-mode"
                  checked={options.mode === 'interleave'}
                  onChange={() => handleModeChange('interleave')}
                />
                <div className="import-mode-info">
                  <strong>시간순 정렬 (Interleave)</strong>
                  <small>
                    로그들의 타임스탬프를 해석해 시간순으로 교차 인터리빙합니다.
                    타임스탬프가 없는 메시지는 직전 메시지의 시간대를 따라 원래 순서를
                    유지합니다.
                  </small>
                </div>
              </label>
            </div>
          </div>

          <div className="export-field">
            <span>분할 세션 옵션</span>
            <div className="export-Checks">
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={options.registerScenes}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, registerScenes: e.target.checked }))
                  }
                />
                <div>
                  <strong>각 파일 시작점에 장면(북마크) 등록하기</strong>
                  <small>
                    각 파일의 첫 번째 메시지에 파일 이름으로 장면 북마크를 자동
                    등록합니다.
                  </small>
                </div>
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={options.mergeCharacters}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, mergeCharacters: e.target.checked }))
                  }
                />
                <div>
                  <strong>동일 캐릭터 및 표정 목록 병합하기</strong>
                  <small>
                    이름이 같은 캐릭터를 하나로 통합하고, 새로운 표정 이미지를 해당
                    캐릭터의 표정 목록에 자동 추가합니다.
                  </small>
                </div>
              </label>
              <label className="check-line">
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
                <div>
                  <strong>파일 경계선의 중복 메시지 건너뛰기</strong>
                  <small>
                    연속된 두 파일의 경계에서 화자와 본문이 일치하는 중복 메시지를
                    자동으로 걸러냅니다.
                  </small>
                </div>
              </label>
            </div>
          </div>
        </div>

        <footer className="export-dialog-footer">
          <span className="export-summary">
            파일 {items.length}개 · 총 메시지 {totalMessages}개
          </span>
          <div className="export-dialog-actions">
            <button type="button" onClick={onClose}>
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
      </section>
    </div>
  );
}
