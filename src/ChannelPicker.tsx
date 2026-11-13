import { useEffect, useId, useRef, useState } from 'react';
import { formatChannelLabel, type ChannelSummary } from './channels';

export function ChannelPicker({
  value,
  channels,
  mixed = false,
  onChange,
  compact = false,
}: {
  value: string;
  channels: ChannelSummary[];
  mixed?: boolean;
  onChange: (channel: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();

  // 방금 새로 추가한 미저장 채널도 드롭다운에 현재 선택값으로 표시
  const hasCurrent = mixed || channels.some((c) => c.name === value);
  const options: ChannelSummary[] = hasCurrent
    ? channels
    : [...channels, { name: value, count: 0, isDefault: false }];

  const totalItems = options.length + 1; // +1은 맨 아래 '+ 추가' 버튼
  const current = Math.min(index, totalItems - 1);

  useEffect(() => {
    if (adding) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [adding]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function startAdding() {
    setOpen(false);
    setCustomValue('');
    setAdding(true);
  }

  function commitCustom() {
    const trimmed = customValue.trim();
    if (trimmed) onChange(trimmed);
    setAdding(false);
  }

  function pick(i: number) {
    if (i === options.length) {
      startAdding();
      return;
    }
    const chosen = options[i];
    if (chosen) onChange(chosen.name);
    setOpen(false);
  }

  if (adding) {
    return (
      <div
        className={`channel-picker${compact ? ' is-compact' : ''}`}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="channel-custom-input"
          aria-label="새 채널 이름"
          placeholder="새 채널 이름"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onBlur={commitCustom}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              commitCustom();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setAdding(false);
            }
          }}
        />
      </div>
    );
  }

  const label = mixed ? '여러 채널' : formatChannelLabel(value);
  const triggerClass = [
    'channel-trigger',
    mixed ? 'is-mixed' : value === '' ? 'is-empty' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={wrapRef}
      className={`channel-picker${compact ? ' is-compact' : ''}`}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="combobox"
        className={triggerClass}
        aria-label="채널"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={open ? `${id}-${current}` : undefined}
        onClick={() => {
          const activeIdx = mixed
            ? 0
            : Math.max(
                0,
                options.findIndex((c) => c.name === value),
              );
          setIndex(activeIdx);
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            if (!open) {
              const activeIdx = mixed
                ? 0
                : Math.max(
                    0,
                    options.findIndex((c) => c.name === value),
                  );
              setIndex(activeIdx);
              setOpen(true);
            } else {
              setIndex(
                (current + (e.key === 'ArrowDown' ? 1 : totalItems - 1)) % totalItems,
              );
            }
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            e.stopPropagation();
            pick(current);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span className="channel-trigger-label">{label}</span>
        <span className="channel-trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div id={id} role="listbox" className="channel-options">
          {options.map((c, i) => {
            const isSelected = !mixed && c.name === value;
            return (
              <button
                type="button"
                role="option"
                id={`${id}-${i}`}
                key={c.name || '__empty__'}
                aria-selected={current === i}
                className={isSelected ? 'is-current' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className="channel-option-name">{formatChannelLabel(c.name)}</span>
                <span className="channel-option-meta">
                  {c.count > 0 ? c.count : c.isDefault ? '기본' : ''}
                </span>
              </button>
            );
          })}
          <div className="channel-options-divider" />
          <button
            type="button"
            role="option"
            id={`${id}-${options.length}`}
            aria-selected={current === options.length}
            className="channel-add-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(options.length)}
          >
            + 추가
          </button>
        </div>
      )}
    </div>
  );
}
