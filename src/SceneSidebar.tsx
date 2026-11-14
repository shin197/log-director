import { useEffect, useRef } from 'react';
import type { Block, Scene } from './core';
import { computeSceneRanges } from './scenes';

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
  onFilterScene,
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
  onFilterScene: (scene: Scene) => void;
  onRenameScene: (sceneId: string, name: string) => void;
  onRemoveScene: (sceneId: string) => void;
}) {
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const ranges = computeSceneRanges(scenes, blocks);
  const blockMap = new Map(blocks.map((b) => [b.id, b]));

  useEffect(() => {
    if (!open || !focusSceneId) return;
    const input = inputRefs.current.get(focusSceneId);
    if (input) {
      requestAnimationFrame(() => {
        input.focus();
        input.select();
        onClearFocusScene();
      });
    }
  }, [open, focusSceneId, onClearFocusScene]);

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
          <span className="scene-collapsed-label">장면</span>
          <span className="count-pill">{ranges.length}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="scene-sidebar" aria-label="장면 관리 바">
      <div className="scene-sidebar-head">
        <div className="scene-sidebar-title">
          <span className="scene-star-icon">★</span>
          <span>장면 {ranges.length}</span>
        </div>
        <div className="scene-sidebar-actions">
          <button
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
          </button>
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
              className={`scene-card ${isCurrent ? 'is-active' : ''}`}
              onClick={() => onSelectScene(scene)}
            >
              <div className="scene-card-top">
                <span className="scene-index-badge">#{idx + 1}</span>
                <input
                  ref={(el) => {
                    if (el) inputRefs.current.set(scene.id, el);
                    else inputRefs.current.delete(scene.id);
                  }}
                  className="scene-name-input"
                  aria-label={`장면 ${idx + 1} 이름`}
                  placeholder="장면 이름 입력…"
                  value={scene.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onRenameScene(scene.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.currentTarget.blur();
                    }
                  }}
                />
                <button
                  type="button"
                  className="ghost icon-btn scene-filter-btn"
                  title="이 장면 구간만 검색 필터로 보기"
                  aria-label={`${scene.name || '장면'} 구간 필터`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterScene(scene);
                  }}
                >
                  🔍
                </button>
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
      <div className="scene-sidebar-foot">
        <small>클릭하여 장면 시작 위치로 이동 · Ctrl+PgUp/PgDn 전환</small>
      </div>
    </aside>
  );
}
