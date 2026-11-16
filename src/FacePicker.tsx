import { useState, useRef, useEffect } from 'react';
import type { Character } from './core';
import { SYSTEM_CHARACTER_ID } from './systemCharacter';
import { isSafeImageUrl } from './importFormats';
import { resolveImageUrl } from './imagePool';
import { useImagePool } from './ImagePoolContext';

export function FacePicker({
  character,
  value,
  onChange,
  onRequestCustomUrl,
  disabled: disabledProp = false,
  imageButton = false,
  fallbackText,
}: {
  character?: Character;
  value: string;
  onChange: (url: string) => void;
  onRequestCustomUrl?: () => void;
  disabled?: boolean;
  imageButton?: boolean;
  fallbackText?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const images = useImagePool();
  const resolvedValue = resolveImageUrl(value, images);
  const isSystemChar = character?.id === SYSTEM_CHARACTER_ID;
  const disabled = disabledProp || isSystemChar || (!character && !onRequestCustomUrl);

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
        {imageButton && isSafeImageUrl(resolvedValue) ? (
          <img src={resolvedValue} alt="현재 표정" />
        ) : (
          fallbackText || '☺'
        )}
      </button>
      {open && !disabled && (
        <div className="face-options">
          {character && character.faces.length ? (
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
                <img src={resolveImageUrl(face.iconUrl, images)} alt="" loading="lazy" />
                <span>{face.name || `표정 ${i + 1}`}</span>
              </button>
            ))
          ) : (
            <p className="empty-faces">
              {character ? '등록된 표정이 없습니다.' : '사용자 지정 화자'}
            </p>
          )}
          {onRequestCustomUrl && (
            <button
              type="button"
              className="face-option-custom"
              onClick={() => {
                onRequestCustomUrl();
                setOpen(false);
              }}
            >
              URL 직접 입력...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
