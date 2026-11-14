import { SYSTEM_CHARACTER_ID } from './systemCharacter';
import { useState, useId } from 'react';
import type { Block, Character } from './core';
import { fuzzyName, inheritCharacter } from './characters';
import { CharacterCard } from './CharacterCard';

export function SpeakerPicker({
  draft,
  characters,
  onChange,
  onPickCharacter,
  onUnlink,
  onCustomSpeaker,
  mixed = false,
}: {
  draft: Block;
  characters: Character[];
  onChange?: (b: Block) => void;
  onPickCharacter?: (c: Character) => void;
  onUnlink?: () => void;
  onCustomSpeaker?: (name: string) => void;
  mixed?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  const id = useId();
  const queryText = mixed ? '' : (draft.speaker ?? '');
  const matches = characters.filter(
    (c) => c.id === SYSTEM_CHARACTER_ID || fuzzyName(c.name, queryText),
  );
  const current = Math.min(index, matches.length);

  function pick(i: number) {
    if (i === matches.length) {
      if (onUnlink) {
        onUnlink();
      } else {
        onChange?.({
          ...draft,
          characterId: null,
          sourceType: 'normal',
          speaker: draft.speaker ?? '',
        });
      }
    } else {
      const target = matches[i];
      if (onPickCharacter) {
        onPickCharacter(target);
      } else {
        onChange?.(inheritCharacter(draft, target));
      }
    }
    setOpen(false);
  }

  const statusText = mixed
    ? '다중 화자'
    : draft.sourceType === 'system'
      ? '시스템'
      : draft.characterId
        ? '캐릭터'
        : '직접 입력';
  const statusClass = mixed
    ? 'is-mixed'
    : draft.sourceType === 'system'
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
          placeholder={mixed ? '여러 화자 (선택/입력으로 통일)' : '화자 이름'}
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${id}-${current}` : undefined}
          value={
            mixed ? '' : draft.sourceType === 'system' ? '시스템' : (draft.speaker ?? '')
          }
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            if (onCustomSpeaker) {
              onCustomSpeaker(e.target.value);
            } else {
              onChange?.({
                ...draft,
                speaker: e.target.value,
                characterId: null,
                sourceType: 'normal',
              });
            }
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
          {matches.map((c, i) => (
            <button
              type="button"
              role="option"
              aria-selected={current === i}
              id={`${id}-${i}`}
              key={c.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              <CharacterCard
                name={c.name}
                iconUrl={c.iconUrl || c.faces[0]?.iconUrl || ''}
                color={c.color}
              />
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={current === matches.length}
            id={`${id}-${matches.length}`}
            className="speaker-option-custom"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(matches.length)}
          >
            사용자 지정...
          </button>
        </div>
      )}
    </div>
  );
}
