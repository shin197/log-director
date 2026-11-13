import { SYSTEM_CHARACTER_ID } from './systemCharacter';
import { useState, useId } from 'react';
import type { Block, Character } from './core';
import { fuzzyName, inheritCharacter } from './characters';

export function SpeakerPicker({
  draft,
  characters,
  onChange,
}: {
  draft: Block;
  characters: Character[];
  onChange: (b: Block) => void;
}) {
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  const id = useId();
  const matches = characters.filter(
    (c) => c.id === SYSTEM_CHARACTER_ID || fuzzyName(c.name, draft.speaker ?? ''),
  );
  const current = Math.min(index, matches.length);

  function pick(i: number) {
    onChange(
      i === matches.length
        ? {
            ...draft,
            characterId: null,
            sourceType: 'normal',
            speaker: draft.speaker ?? '',
          }
        : inheritCharacter(draft, matches[i]),
    );
    setOpen(false);
  }

  const statusText =
    draft.sourceType === 'system' ? '시스템' : draft.characterId ? '캐릭터' : '직접 입력';
  const statusClass =
    draft.sourceType === 'system'
      ? 'is-system'
      : draft.characterId
        ? 'is-linked'
        : 'is-custom';

  return (
    <div className="speaker-picker" onDoubleClick={(e) => e.stopPropagation()}>
      <div className="speaker-input-wrap">
        <input
          role="combobox"
          aria-label="화자"
          placeholder="화자 이름"
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${id}-${current}` : undefined}
          value={draft.sourceType === 'system' ? '시스템' : (draft.speaker ?? '')}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            onChange({
              ...draft,
              speaker: e.target.value,
              characterId: null,
              sourceType: 'normal',
            });
            setIndex(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setIndex(
                (current + (e.key === 'ArrowDown' ? 1 : matches.length)) %
                  (matches.length + 1),
              );
            }
            if (e.key === 'Enter' && open) {
              e.preventDefault();
              e.stopPropagation();
              pick(current);
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        <span className={`speaker-badge ${statusClass}`}>{statusText}</span>
      </div>
      {open && (
        <div id={id} role="listbox" className="speaker-options">
          {[...matches.map((c) => c.name), '사용자 지정...'].map((name, i) => (
            <button
              type="button"
              role="option"
              aria-selected={current === i}
              id={`${id}-${i}`}
              key={i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
