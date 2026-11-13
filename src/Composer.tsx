import { useState } from 'react';
import type { Block, Character } from './core';
import { fuzzyName, inheritCharacter } from './characters';
import { FacePicker } from './FacePicker';
export function Composer({
  characters,
  send,
}: {
  characters: Character[];
  send: (b: Block) => void;
}) {
  const [name, setName] = useState(''),
    [id, setId] = useState<string | null>(null),
    [icon, setIcon] = useState(''),
    [text, setText] = useState(''),
    [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  const character = characters.find((c) => c.id === id);
  const matches = characters.filter((c) => fuzzyName(c.name, name));
  const selected = Math.min(index, Math.max(0, matches.length - 1));
  function pick(c: Character) {
    setId(c.id);
    setName(c.name);
    setIcon(c.iconUrl || c.faces[0]?.iconUrl || '');
    setOpen(false);
  }
  function submit() {
    if (!text.trim()) return;
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
      channel: '메인',
    };
    if (c) {
      b = inheritCharacter(b, c);
      if (c.id === id && b.sourceType !== 'system') b.iconUrl = icon;
    }
    send(b);
    if (c && !character) pick(c);
    setText('');
  }
  return (
    <div className="composer">
      <div className="composer-top">
        {character && /^https?:\/\//.test(icon) && <img src={icon} alt="" />}
        <div className="composer-speaker">
          <input
            aria-label="전송 화자"
            placeholder="캐릭터 이름"
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
                  key={c.id}
                  aria-selected={matches[selected]?.id === c.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                >
                  {c.name}
                </button>
              ))}
              {!matches.length && <small>사용자 지정 화자</small>}
            </div>
          )}
        </div>
        <FacePicker character={character} value={icon} onChange={setIcon} />
        <button onClick={submit}>전송</button>
      </div>
      <textarea
        aria-label="전송 내용"
        placeholder="메시지를 입력 · Shift+Enter 줄바꿈"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
    </div>
  );
}
