import { useState, useRef, useEffect } from 'react';
import type { Character } from './core';
import { SYSTEM_CHARACTER_ID } from './systemCharacter';

export function FacePicker({
  character,
  value,
  onChange,
  imageButton = false,
}: {
  character?: Character;
  value: string;
  onChange: (url: string) => void;
  imageButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const disabled = !character || character.id === SYSTEM_CHARACTER_ID;

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div
      ref={root}
      className="face-picker"
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={imageButton ? 'face-btn-avatar' : 'face-btn-icon'}
        aria-label="표정 선택"
        title={disabled ? '연결된 캐릭터의 표정 선택' : '표정 선택'}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {imageButton && /^https?:\/\//.test(value) ? (
          <img src={value} alt="현재 표정" />
        ) : (
          '☺'
        )}
      </button>
      {open && !disabled && (
        <div className="face-options">
          {character.faces.length ? (
            character.faces.map((face, i) => (
              <button
                type="button"
                key={i}
                className={face.iconUrl === value ? 'active' : undefined}
                onClick={() => {
                  onChange(face.iconUrl);
                  setOpen(false);
                }}
              >
                <img src={face.iconUrl} alt="" loading="lazy" />
                <span>{face.name || `표정 ${i + 1}`}</span>
              </button>
            ))
          ) : (
            <p className="empty-faces">등록된 표정이 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
