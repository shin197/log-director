import { useEffect, useRef } from 'react';
import { getWrapPair, handleWrapKeyDown } from './textEdit';

export function BulkTextEditor({
  previewText,
  prefix,
  suffix,
  onChangePrefix,
  onChangeSuffix,
  onSave,
  replaceOpen,
  replaceFind,
  replaceTo,
  replaceMatchCount,
  onToggleReplace,
  onCloseReplace,
  onChangeReplaceFind,
  onChangeReplaceTo,
  onClearReplace,
}: {
  previewText: string;
  prefix: string;
  suffix: string;
  onChangePrefix: (v: string) => void;
  onChangeSuffix: (v: string) => void;
  onSave: () => void;
  replaceOpen: boolean;
  replaceFind: string;
  replaceTo: string;
  replaceMatchCount: number;
  onToggleReplace: () => void;
  onCloseReplace: () => void;
  onChangeReplaceFind: (v: string) => void;
  onChangeReplaceTo: (v: string) => void;
  onClearReplace: () => void;
}) {
  const prefixRef = useRef<HTMLTextAreaElement>(null);
  const suffixRef = useRef<HTMLTextAreaElement>(null);
  const replaceFindRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replaceOpen) {
      replaceFindRef.current?.focus();
      replaceFindRef.current?.select();
    }
  }, [replaceOpen]);

  const focusPrefixEnd = () => {
    const el = prefixRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  };

  const focusSuffixStart = () => {
    const el = suffixRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, 0);
  };

  const handleGlobalShortcuts = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave();
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      onToggleReplace();
      return true;
    }
    return false;
  };

  return (
    <div className="bulk-text-editor-wrap">
      {(replaceOpen || replaceFind) && (
        <div
          className="bulk-replace-bar"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onCloseReplace();
              prefixRef.current?.focus();
            }
          }}
        >
          {replaceOpen ? (
            <>
              <input
                ref={replaceFindRef}
                aria-label="대사 내부에서 찾을 문자열"
                placeholder="대사 내 찾을 문자열"
                value={replaceFind}
                onChange={(e) => onChangeReplaceFind(e.target.value)}
                onKeyDown={(e) => {
                  handleGlobalShortcuts(e);
                }}
              />
              <span className="replace-arrow">→</span>
              <input
                aria-label="대사 내부에서 바꿀 문자열"
                placeholder="바꿀 문자열"
                value={replaceTo}
                onChange={(e) => onChangeReplaceTo(e.target.value)}
                onKeyDown={(e) => {
                  handleGlobalShortcuts(e);
                }}
              />
              <span className="count-pill" title="선택된 메시지 중 치환 대상 수">
                {replaceFind ? `${replaceMatchCount}건 일치` : '치환 대기'}
              </span>
              {replaceFind && (
                <button
                  type="button"
                  className="compact-btn ghost"
                  onClick={onClearReplace}
                  title="치환 입력 초기화"
                >
                  초기화
                </button>
              )}
              <button
                type="button"
                className="ghost icon-btn"
                aria-label="치환 바 닫기"
                onClick={onCloseReplace}
              >
                ×
              </button>
            </>
          ) : (
            <div className="bulk-replace-summary">
              <span>
                치환 적용 중: <code>{replaceFind}</code> →{' '}
                <code>{replaceTo || '(삭제)'}</code> ({replaceMatchCount}건)
              </span>
              <button
                type="button"
                className="compact-btn ghost"
                onClick={onToggleReplace}
              >
                편집
              </button>
              <button
                type="button"
                className="compact-btn ghost danger"
                onClick={onClearReplace}
              >
                해제
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bulk-text-editor">
        <textarea
          ref={prefixRef}
          autoFocus
          className="bulk-part-input bulk-prefix-input"
          aria-label="기존 대사 앞에 추가할 텍스트"
          placeholder=""
          rows={Math.max(1, Math.min(8, prefix.split('\n').length))}
          value={prefix}
          onChange={(e) => onChangePrefix(e.target.value)}
          onKeyDown={(e) => {
            if (handleWrapKeyDown(e, prefix, onChangePrefix)) return;
            if (handleGlobalShortcuts(e)) return;
            if (
              e.nativeEvent.isComposing ||
              e.shiftKey ||
              e.altKey ||
              e.ctrlKey ||
              e.metaKey
            )
              return;
            const el = e.currentTarget;
            const atEnd =
              el.selectionStart === prefix.length && el.selectionEnd === prefix.length;
            const onLastLine = !prefix.slice(el.selectionEnd ?? 0).includes('\n');
            if (
              (e.key === 'ArrowRight' && atEnd) ||
              (e.key === 'ArrowDown' && onLastLine)
            ) {
              e.preventDefault();
              focusSuffixStart();
            }
          }}
        />

        <div
          className="bulk-original-token"
          tabIndex={0}
          role="textbox"
          aria-readonly="true"
          aria-label="기존 대사 블럭 (수정 불가, 따옴표·괄호 입력 시 앞뒤 감싸기)"
          title="기존 대사 블럭 · 클릭 후 따옴표/괄호를 누르면 앞뒤로 감쌉니다"
          onKeyDown={(e) => {
            if (handleGlobalShortcuts(e)) return;
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              focusPrefixEnd();
              return;
            }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              focusSuffixStart();
              return;
            }
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
              const pair = getWrapPair(e.key);
              if (pair) {
                e.preventDefault();
                onChangePrefix(prefix + pair[0]);
                onChangeSuffix(pair[1] + suffix);
              }
            }
          }}
        >
          {/* <span className="bulk-token-badge">기존 대사</span> */}
          <span className="bulk-token-preview">
            {previewText || <em className="empty-placeholder">(빈 대사)</em>}
          </span>
        </div>

        <textarea
          ref={suffixRef}
          className="bulk-part-input bulk-suffix-input"
          aria-label="기존 대사 뒤에 추가할 텍스트"
          placeholder=""
          rows={Math.max(1, Math.min(8, suffix.split('\n').length))}
          value={suffix}
          onChange={(e) => onChangeSuffix(e.target.value)}
          onKeyDown={(e) => {
            if (handleWrapKeyDown(e, suffix, onChangeSuffix)) return;
            if (handleGlobalShortcuts(e)) return;
            if (
              e.nativeEvent.isComposing ||
              e.shiftKey ||
              e.altKey ||
              e.ctrlKey ||
              e.metaKey
            )
              return;
            const el = e.currentTarget;
            const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
            const onFirstLine = !suffix.slice(0, el.selectionStart ?? 0).includes('\n');
            if (
              (e.key === 'ArrowLeft' && atStart) ||
              (e.key === 'ArrowUp' && onFirstLine)
            ) {
              e.preventDefault();
              focusPrefixEnd();
              return;
            }
            if (e.key === 'Backspace' && atStart) {
              e.preventDefault();
            }
          }}
        />
      </div>
    </div>
  );
}
