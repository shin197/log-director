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
  }, [editing]);
  const finish = () => {
    save({ ...draft, diceResult: dice ? draft.diceResult : '' });
    setEditing(false);
  };
  return (
    <article
      data-message-id={b.id}
      className={`log-message ${(editing ? draft : b).sourceType === 'system' ? 'system' : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${onJump ? 'has-jump' : ''} ${over}`}
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
      aria-label={`${b.speaker} 메시지`}
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
      {(editing ? draft : b).sourceType !== 'system' && (
        <div className="avatar">
          {editing && draft.characterId ? (
            <FacePicker
              character={characters.find((c) => c.id === draft.characterId)}
              value={draft.iconUrl ?? ''}
              onChange={(iconUrl) => setDraft({ ...draft, iconUrl })}
              imageButton
            />
          ) : (
            <>
              {b.iconUrl && /^https?:\/\//.test(b.iconUrl) && (
                <img
                  draggable={false}
                  src={b.iconUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
            </>
          )}{' '}
        </div>
      )}
      <div className="message-content">
        {editing ? (
          <div className="block-editor">
            <SpeakerPicker draft={draft} characters={characters} onChange={setDraft} />
            <label>
              <textarea
                autoFocus
                rows={Math.max(1, Math.min(15, draft.text.split('\n').length))}
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
            </label>
            {dice && (
              <label>
                주사위 판정
                <textarea
                  value={draft.diceResult}
                  onChange={(e) => setDraft({ ...draft, diceResult: e.target.value })}
                />
              </label>
            )}
            {options && (
              <div className="extra-options">
                {draft.sourceType !== 'system' && (
                  <label>
                    표정
                    <input
                      type="url"
                      placeholder="https://…"
                      value={draft.iconUrl ?? ''}
                      onChange={(e) => setDraft({ ...draft, iconUrl: e.target.value })}
                    />
                  </label>
                )}
                <label>
                  타임스탬프
                  <input
                    value={draft.timestamp ?? ''}
                    onChange={(e) => setDraft({ ...draft, timestamp: e.target.value })}
                  />
                </label>
                <label>
                  채널
                  <input
                    value={draft.channel ?? ''}
                    onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
                  />
                </label>
                <button onClick={() => setDice(!dice)}>
                  {dice ? '주사위 판정 제거' : '주사위 판정 추가'}
                </button>
              </div>
            )}
            <div className="editor-actions">
              <button
                aria-label="추가 옵션"
                aria-expanded={options}
                onClick={() => setOptions(!options)}
              >
                확장
              </button>
              <button onClick={() => setEditing(false)}>취소</button>
              <button onClick={finish}>저장</button>
              <button className="danger" onClick={remove}>
                삭제
              </button>
            </div>
          </div>
        ) : (
          <div className="message-read">
            <div className="message-header">
              {b.sourceType !== 'system' && (
                <strong style={{ color: b.color || '#ddd' }}>{b.speaker}</strong>
              )}
              <time>{displayTime(b.timestamp, display)}</time>
              <span>{display.showChannel && b.channel && `[${b.channel}]`}</span>
            </div>
            <div className="message-text">
              {b.text || (!b.diceResult ? '빈 메시지 · 더블클릭하여 작성' : '')}
            </div>
            {b.diceResult && <div className="roll-result">{b.diceResult}</div>}
          </div>
        )}
      </div>
      {onJump && (
        <button
          className="message-jump"
          title="필터를 해제하고 전체 로그의 이 메시지로 이동"
          aria-label="전체 로그에서 이 메시지로 이동"
          onClick={(e) => {
            e.stopPropagation();
            if (editing) save({ ...draft, diceResult: dice ? draft.diceResult : '' });
            onJump();
          }}
        >
          이동 ↗
        </button>
      )}
    </article>
  );
}
