import { useEffect, useRef, useState } from 'react';
import type { Block, Character } from './core';
import { fuzzyName, inheritCharacter } from './characters';
import { FacePicker } from './FacePicker';
import { ChannelPicker } from './ChannelPicker';
import type { ChannelSummary } from './channels';
import { handleWrapKeyDown } from './textEdit';
import { SYSTEM_CHARACTER_ID } from './systemCharacter';
import { CharacterCard } from './CharacterCard';

export type EyedropPayload = {
  speaker: string;
  characterId: string | null;
  iconUrl: string;
  channel: string;
  color?: string;
  key: number;
};

export function Composer({
  characters,
  channels = [],
  send,
  disabled = false,
  eyedrop = null,
  focusRequest = 0,
}: {
  characters: Character[];
  channels?: ChannelSummary[];
  send: (b: Block) => void;
  disabled?: boolean;
  eyedrop?: EyedropPayload | null;
  focusRequest?: number;
}) {
  const [name, setName] = useState(''),
    [id, setId] = useState<string | null>(null),
    [icon, setIcon] = useState(''),
    [color, setColor] = useState(''),
    [channel, setChannel] = useState('메인'),
    [text, setText] = useState(''),
    [open, setOpen] = useState(false),
    [index, setIndex] = useState(0),
    [collapsed, setCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusRequest) return;
    setCollapsed(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [focusRequest]);

  useEffect(() => {
    if (!eyedrop) return;
    setName(eyedrop.speaker);
    setId(eyedrop.characterId);
    setIcon(eyedrop.iconUrl);
    setColor(eyedrop.color ?? '');
    setChannel(eyedrop.channel);
    setOpen(false);
    setCollapsed(false);
  }, [eyedrop]);

  const character = characters.find((c) => c.id === id);
  const matches = characters.filter((c) => fuzzyName(c.name, name));
  const isCustomSpeaker = !character && !matches.length;
  const selected = Math.min(index, Math.max(0, matches.length - 1));

  function pick(c: Character) {
    setId(c.id);
    setName(c.name);
    setIcon(c.iconUrl || c.faces[0]?.iconUrl || '');
    setColor(c.id === SYSTEM_CHARACTER_ID ? '' : c.color || '');
    setOpen(false);
  }

  function submit() {
    if (disabled || !text.trim()) return;
    const c = character ?? characters.find((c) => c.name === name) ?? matches[0];
    let b: Block = {
      id: crypto.randomUUID(),
      speaker: name,
      sourceType: 'normal',
      characterId: null,
      iconUrl: '',
      text,
      diceResult: '',
      timestamp: '',
      channel,
    };
    if (c) {
      b = inheritCharacter(b, c);
      if (c.id === id && b.sourceType !== 'system') b.iconUrl = icon;
    } else if (color) {
      b.color = color;
    }
    send(b);
    if (c && !character) pick(c);
    setText('');
  }

  if (collapsed) {
    return (
      <div className="composer composer-collapsed">
        <div className="composer-inner">
          <button
            type="button"
            className="composer-expand-btn"
            onClick={() => setCollapsed(false)}
          >
            ＋ 새 메시지 입력 열기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="composer-top">
          <div className="composer-speaker-group">
            <div className="composer-avatar">
              <FacePicker
                character={character}
                value={icon}
                onChange={setIcon}
                imageButton
                fallbackText={(name || '?').slice(0, 1)}
              />
            </div>
            <div className="composer-speaker">
              <input
                aria-label="전송 화자"
                placeholder="화자"
                value={name}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onChange={(e) => {
                  setName(e.target.value);
                  setId(null);
                  setIcon('');
                  setOpen(true);
                  setIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setOpen(true);
                    setIndex(
                      (selected + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) %
                        Math.max(1, matches.length),
                    );
                  }
                  if (e.key === 'Enter' && open && matches.length) {
                    e.preventDefault();
                    pick(matches[selected]);
                  }
                }}
              />
              {open && (
                <div className="composer-candidates">
                  {matches.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      aria-selected={matches[selected]?.id === c.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(c)}
                    >
                      <CharacterCard
                        name={c.name}
                        iconUrl={c.iconUrl || c.faces[0]?.iconUrl || ''}
                        color={c.color}
                      />
                    </button>
                  ))}
                  {!matches.length && <small>사용자 지정 화자</small>}
                </div>
              )}
            </div>
            {isCustomSpeaker && (
              <div className="color-input-group composer-color-group" title="화자 색상">
                <input
                  type="color"
                  aria-label="색상 선택"
                  value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#888888'}
                  onChange={(e) => setColor(e.target.value)}
                />
                <input
                  aria-label="색상 (#RRGGBB)"
                  placeholder="#RRGGBB"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            )}
            <ChannelPicker
              value={channel}
              channels={channels}
              onChange={setChannel}
              compact
            />
          </div>
          <button
            type="button"
            className="ghost icon-btn composer-collapse-btn"
            title="입력창 접기"
            aria-label="입력창 접기"
            onClick={() => setCollapsed(true)}
          >
            ×
          </button>
        </div>
        <div className="composer-bottom">
          <textarea
            ref={textareaRef}
            aria-label="전송 내용"
            disabled={disabled}
            placeholder={
              disabled
                ? '편집 또는 오려붙이기 완료 후 새 메시지를 입력할 수 있습니다.'
                : '새 메시지 입력 (Enter 전송 · Shift+Enter 줄바꿈)'
            }
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (handleWrapKeyDown(e, text, setText)) return;
              if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                e.currentTarget.blur();
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="button"
            className="primary composer-send-btn"
            onClick={submit}
            disabled={disabled || !text.trim()}
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
