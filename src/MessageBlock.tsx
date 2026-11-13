import { FacePicker } from './FacePicker';
import { SpeakerPicker } from './SpeakerPicker';
import { defaultDisplay, displayTime, type DisplaySettings } from './presentation';
import type { SelectionKeys } from './selection';
import { useState, useEffect } from 'react';
import type { Block, Character } from './core';

export function MessageBlock({
  block: b,
  characters = [],
  display = defaultDisplay,
  editing,
  setEditing,
  selected,
  toggle,
  save,
  remove,
  drop,
  onJump,
}: {
  block: Block;
  onJump?: () => void;
  characters?: Character[];
  display?: DisplaySettings;
  editing: boolean;
  setEditing: (v: boolean) => void;
  selected: boolean;
  toggle: (keys: SelectionKeys) => void;
  save: (b: Block) => void;
  remove: () => void;
  drop: (id: string, after: boolean) => void;
}) {
  const [draft, setDraft] = useState(b);
  const [options, setOptions] = useState(false);
  const [dice, setDice] = useState(!!b.diceResult);
  const [over, setOver] = useState('');

  useEffect(() => {
    if (editing) {
      setDraft(b);
      setDice(!!b.diceResult);
      setOptions(false);
    }
  }, [editing, b]);

  const finish = () => {
    save({ ...draft, diceResult: dice ? draft.diceResult : '' });
    setEditing(false);
  };

  const activeBlock = editing ? draft : b;
  const isSystem = activeBlock.sourceType === 'system';
  const timeText = displayTime(b.timestamp, display);

  return (
    <article
      data-message-id={b.id}
      className={`log-message ${isSystem ? 'system' : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${onJump ? 'has-jump' : ''} ${over}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/log-block', b.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(
          e.clientY <
            e.currentTarget.getBoundingClientRect().top + e.currentTarget.clientHeight / 2
            ? 'drop-before'
            : 'drop-after',
        );
      }}
      onDragLeave={() => setOver('')}
      onDrop={(e) => {
        e.preventDefault();
        drop(e.dataTransfer.getData('text/log-block'), over === 'drop-after');
        setOver('');
      }}
      onDragEnd={() => setOver('')}
      onClick={(e) => {
        if (editing || (e.target as HTMLElement).closest('button,input,textarea')) return;
        if (e.detail === 1) toggle({ ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        editing ? finish() : setEditing(true);
      }}
      tabIndex={0}
      aria-label={`${b.speaker || '시스템'} 메시지`}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === ' ') {
          e.preventDefault();
          toggle({ ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          editing ? finish() : setEditing(true);
        }
      }}
    >
      {!isSystem && (
        <div className="avatar">
          {editing && draft.characterId ? (
            <FacePicker
              character={characters.find((c) => c.id === draft.characterId)}
              value={draft.iconUrl ?? ''}
              onChange={(iconUrl) => setDraft({ ...draft, iconUrl })}
              imageButton
            />
          ) : b.iconUrl && /^https?:\/\//.test(b.iconUrl) ? (
            <img
              draggable={false}
              src={b.iconUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              className="avatar-placeholder"
              style={{ borderColor: b.color || undefined }}
            >
              {(b.speaker || '?').slice(0, 1)}
            </span>
          )}
        </div>
      )}
      <div className="message-content">
        {editing ? (
          <div className="block-editor">
            <div className="editor-meta-row">
              <SpeakerPicker draft={draft} characters={characters} onChange={setDraft} />
              <input
                className="meta-channel"
                aria-label="채널"
                placeholder="채널"
                value={draft.channel ?? ''}
                onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
              />
              <input
                className="meta-time"
                aria-label="타임스탬프"
                placeholder="타임스탬프"
                value={draft.timestamp ?? ''}
                onChange={(e) => setDraft({ ...draft, timestamp: e.target.value })}
              />
              <button
                type="button"
                className="compact-btn"
                aria-pressed={dice}
                title={dice ? '주사위 판정 제거' : '주사위 판정 추가'}
                onClick={() => setDice(!dice)}
              >
                판정
              </button>
              {!isSystem && (
                <button
                  type="button"
                  className="compact-btn"
                  aria-label="표정 URL 직접 입력"
                  aria-expanded={options}
                  title="표정 이미지 URL"
                  onClick={() => setOptions(!options)}
                >
                  URL
                </button>
              )}
            </div>

            {options && !isSystem && (
              <input
                className="editor-url-input"
                type="url"
                aria-label="표정 이미지 URL"
                placeholder="표정 이미지 URL (https://…)"
                value={draft.iconUrl ?? ''}
                onChange={(e) => setDraft({ ...draft, iconUrl: e.target.value })}
              />
            )}

            <textarea
              autoFocus
              aria-label="메시지 본문"
              placeholder="메시지 본문…"
              rows={Math.max(2, Math.min(18, draft.text.split('\n').length))}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  finish();
                }
              }}
            />

            {dice && (
              <textarea
                className="dice-textarea"
                aria-label="주사위 판정"
                placeholder="주사위 판정 결과…"
                rows={Math.max(
                  1,
                  Math.min(6, (draft.diceResult || '').split('\n').length),
                )}
                value={draft.diceResult}
                onChange={(e) => setDraft({ ...draft, diceResult: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    finish();
                  }
                }}
              />
            )}

            <div className="editor-actions">
              <span className="editor-hint">Ctrl+Enter 저장 · Esc 취소</span>
              <button type="button" className="danger ghost" onClick={remove}>
                삭제
              </button>
              <button type="button" className="ghost" onClick={() => setEditing(false)}>
                취소
              </button>
              <button type="button" className="primary" onClick={finish}>
                저장
              </button>
            </div>
          </div>
        ) : (
          <div className="message-read">
            <div className="message-header">
              {!isSystem && (
                <strong style={{ color: b.color || 'var(--text-primary)' }}>
                  {b.speaker}
                </strong>
              )}
              {isSystem && <span className="system-tag">SYSTEM</span>}
              {display.showChannel && b.channel && (
                <span className="channel-tag">{b.channel}</span>
              )}
              {timeText && <time>{timeText}</time>}
            </div>
            <div className="message-text">
              {b.text ||
                (!b.diceResult ? (
                  <span className="empty-placeholder">빈 메시지 · 더블클릭하여 작성</span>
                ) : (
                  ''
                ))}
            </div>
            {b.diceResult && <div className="roll-result">{b.diceResult}</div>}
          </div>
        )}
      </div>
      {!editing && (
        <div className="message-hover-actions">
          {onJump && (
            <button
              type="button"
              className="message-jump"
              title="필터를 해제하고 전체 로그의 이 메시지로 이동"
              aria-label="전체 로그에서 이 메시지로 이동"
              onClick={(e) => {
                e.stopPropagation();
                onJump();
              }}
            >
              위치 이동 ↗
            </button>
          )}
          <button
            type="button"
            className="message-edit-trigger"
            title="메시지 편집 (더블클릭)"
            aria-label="메시지 편집"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            편집
          </button>
        </div>
      )}
    </article>
  );
}
