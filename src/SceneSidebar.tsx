import { useEffect, useRef, useState } from 'react';
import type { Block, Scene } from './core';
import { computeSceneRanges } from './scenes';
import { BookmarkRibbon } from './BookmarkRibbon';

export function SceneSidebar({
  open,
  onToggleOpen,
  scenes,
  blocks,
  activeMessageId,
  canAddFromSelection,
  focusSceneId,
  onClearFocusScene,
  onAddFromSelection,
  onSelectScene,
  onRenameScene,
  onRemoveScene,
}: {
  open: boolean;
  onToggleOpen: () => void;
  scenes: Scene[];
  blocks: Block[];
  activeMessageId: string | null;
  canAddFromSelection: boolean;
  focusSceneId: string | null;
  onClearFocusScene: () => void;
  onAddFromSelection: () => void;
  onSelectScene: (scene: Scene) => void;
  onRenameScene: (sceneId: string, name: string) => void;
  onRemoveScene: (sceneId: string) => void;
}) {
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ranges = computeSceneRanges(scenes, blocks);
  const blockMap = new Map(blocks.map((b) => [b.id, b]));

  function startEdit(scene: Scene) {
    setEditingSceneId(scene.id);
    setDraftName(scene.name);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function commitEdit(scene: Scene) {
    const nextName = draftName.trim() || scene.name || '장면';
    if (nextName !== scene.name) {
      onRenameScene(scene.id, nextName);
    }
    setEditingSceneId(null);
  }

  useEffect(() => {
    if (!open || !focusSceneId) return;
    const target = scenes.find((s) => s.id === focusSceneId);
    if (!target) return;
    setEditingSceneId(target.id);
    setDraftName(target.name);
    onClearFocusScene();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open, focusSceneId, scenes, onClearFocusScene]);

  if (!open) {
    return (
      <aside className="scene-sidebar is-collapsed" aria-label="장면 사이드바 (접힘)">
        <button
          type="button"
          className="scene-sidebar-expand-btn"
          title="장면 바 열기"
          aria-label="장면 바 열기"
          onClick={onToggleOpen}
        >
          <span className="scene-star-icon">★</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="scene-sidebar" aria-label="장면 관리 바">
      <div className="scene-sidebar-head">
        <div className="scene-sidebar-title">
          <span className="scene-star-icon">★</span>
          <span>장면 {ranges.length}개</span>
        </div>
        <div className="scene-sidebar-actions">
          {/* <button
            type="button"
            className="primary compact-btn"
            disabled={!canAddFromSelection}
            title={
              canAddFromSelection
                ? '현재 선택한 메시지에 장면(북마크) 추가'
                : '타임라인에서 장면을 등록할 메시지를 먼저 선택하세요'
            }
            onClick={onAddFromSelection}
          >
            ＋ 추가
          </button> */}
          <button
            type="button"
            className="ghost icon-btn"
            title="장면 바 접기"
            aria-label="장면 바 접기"
            onClick={onToggleOpen}
          >
            ▸
          </button>
        </div>
      </div>

      <div className="scene-sidebar-list" role="list">
        {!ranges.length && (
          <div className="scene-empty">
            <p>등록된 장면이 없습니다.</p>
            <small>
              메시지를 선택한 뒤 우상단의 <strong>★</strong> 버튼이나 상단{' '}
              <strong>＋ 추가</strong>를 눌러 장면을 등록하세요.
            </small>
          </div>
        )}
        {ranges.map(({ scene, startIndex, count }, idx) => {
          const refBlock = blockMap.get(scene.messageId);
          const isCurrent = activeMessageId === scene.messageId;
          const isEditing = editingSceneId === scene.id;
          const speakerLabel =
            refBlock?.sourceType === 'system'
              ? 'SYSTEM'
              : refBlock?.speaker || '이름 없음';
          const snippet = (refBlock?.text || refBlock?.diceResult || '빈 메시지').replace(
            /\s+/g,
            ' ',
          );

          return (
            <div
              key={scene.id}
              role="listitem"
              className={`scene-card ${isCurrent ? 'is-active' : ''} ${isEditing ? 'is-editing' : ''}`}
              onClick={() => onSelectScene(scene)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startEdit(scene);
              }}
            >
              <div className="scene-card-top">
                <button
                  type="button"
                  className="scene-index-ribbon-btn"
                  title="장면 제목 편집"
                  aria-label={`장면 ${idx + 1} 제목 편집`}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(scene);
                  }}
                >
                  <BookmarkRibbon className="scene-index-ribbon">
                    #{idx + 1}
                  </BookmarkRibbon>
                </button>
                {isEditing ? (
                  <input
                    ref={inputRef}
                    className="scene-name-input"
                    aria-label={`장면 ${idx + 1} 이름`}
                    placeholder="장면 이름 입력…"
                    value={draftName}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        commitEdit(scene);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingSceneId(null);
                      }
                    }}
                  />
                ) : (
                  <strong className="scene-name-text" title="더블클릭하여 장면 이름 수정">
                    {scene.name || '이름 없는 장면'}
                  </strong>
                )}
                {isEditing ? (
                  <button
                    type="button"
                    className="primary compact-btn scene-save-btn"
                    title="장면 이름 저장 (Enter)"
                    onClick={(e) => {
                      e.stopPropagation();
                      commitEdit(scene);
                    }}
                  >
                    저장
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost icon-btn scene-remove-btn"
                    title="장면 북마크 삭제"
                    aria-label={`${scene.name || '장면'} 삭제`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveScene(scene.id);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="scene-card-ref">
                <span className="scene-ref-meta">
                  #{startIndex + 1} · <strong>{speakerLabel}</strong>
                  <span className="scene-ref-count">{count}개 메시지</span>
                </span>
                <span className="scene-ref-snippet">{snippet}</span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
