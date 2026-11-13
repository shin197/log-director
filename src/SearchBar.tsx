import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Block, Character } from './core';
import { SYSTEM_CHARACTER_ID } from './systemCharacter';
import { fuzzyName } from './characters';
import { formatChannelLabel, type ChannelSummary } from './channels';
import {
  formatChipDisplay,
  formatChipToken,
  IS_FLAGS,
  parseQueryToChipsAndText,
  tryParseFilterToken,
  type SearchChip,
} from './query';

const HISTORY_STORAGE_KEY = 'log-studio:search-history';
const MAX_HISTORY = 6;

type SuggestionItem =
  | {
      id: string;
      section: string;
      kind: 'prefix';
      prefix: string;
      icon: string;
      label: string;
      syntax: string;
      description: string;
    }
  | {
      id: string;
      section: string;
      kind: 'chip';
      chip: Omit<SearchChip, 'id'>;
      icon: string;
      label: string;
      syntax: string;
      meta?: string;
    }
  | {
      id: string;
      section: string;
      kind: 'text-commit';
      icon: string;
      label: string;
      syntax: string;
    }
  | {
      id: string;
      section: string;
      kind: 'history';
      query: string;
      icon: string;
      label: string;
    };

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && !!x.trim());
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function saveSearchHistory(list: string[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    // ignore storage errors
  }
}

function splitTrailingToken(input: string): {
  leading: string;
  activeToken: string;
} {
  if (!input || /\s$/.test(input)) {
    return { leading: input, activeToken: '' };
  }
  const tokens = input.match(/(?:[^\s"]|"[^"]*")+/g);
  if (!tokens || !tokens.length) {
    return { leading: '', activeToken: input };
  }
  const last = tokens[tokens.length - 1];
  const idx = input.lastIndexOf(last);
  return {
    leading: input.slice(0, idx),
    activeToken: input.slice(idx),
  };
}

export function SearchBar({
  inputRef,
  query,
  searchActive,
  blocks,
  characters,
  channels,
  onActivate,
  onChangeQuery,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  searchActive: boolean;
  blocks: Block[];
  characters: Character[];
  channels: ChannelSummary[];
  onActivate: () => void;
  onChangeQuery: (nextQuery: string) => void;
}) {
  const initialParsed = useMemo(() => parseQueryToChipsAndText(query), []);
  const [chips, setChips] = useState<SearchChip[]>(initialParsed.chips);
  const [text, setText] = useState<string>(initialParsed.text);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusedChipIndex, setFocusedChipIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>(() => loadSearchHistory());

  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  function buildFullQuery(nextChips: SearchChip[], nextText: string): string {
    const chipPart = nextChips.map(formatChipToken).join(' ');
    const textPart = nextText.trim();
    return [chipPart, textPart].filter(Boolean).join(' ');
  }

  // 외부에서 query가 초기화된 경우(예: 필터 해제, Ctrl+A 등) 동기화
  useEffect(() => {
    const currentBuilt = buildFullQuery(chips, text);
    if (query === currentBuilt) return;
    if (!query.trim()) {
      setChips([]);
      setText('');
      setFocusedChipIndex(null);
    } else {
      const parsed = parseQueryToChipsAndText(query);
      setChips(parsed.chips);
      setText(parsed.text);
    }
  }, [query]);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (target.isConnected && !containerRef.current?.contains(target)) {
        setDropdownOpen(false);
        setFocusedChipIndex(null);
      }
    }
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [dropdownOpen]);

  function recordHistory(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(
        0,
        MAX_HISTORY,
      );
      saveSearchHistory(next);
      return next;
    });
  }

  function removeHistoryItem(targetQuery: string) {
    setHistory((prev) => {
      const next = prev.filter((item) => item !== targetQuery);
      saveSearchHistory(next);
      return next;
    });
  }

  function updateSearch(
    nextChips: SearchChip[],
    nextText: string,
    saveToHistory = false,
  ) {
    setChips(nextChips);
    setText(nextText);
    setFocusedChipIndex(null);
    const full = buildFullQuery(nextChips, nextText);
    onActivate();
    onChangeQuery(full);
    if (saveToHistory && full) {
      recordHistory(full);
    }
  }

  // 캐릭터 및 미연결 화자 목록 집계
  const speakerCandidates = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; isLinked: boolean }>();
    for (const c of characters) {
      if (c.id === SYSTEM_CHARACTER_ID) continue;
      counts.set(c.name, { name: c.name, count: 0, isLinked: true });
    }
    for (const b of blocks) {
      if (b.sourceType === 'system' || b.characterId === SYSTEM_CHARACTER_ID) continue;
      const linkedChar = b.characterId
        ? characters.find((c) => c.id === b.characterId)
        : undefined;
      const speakerName = linkedChar?.name || b.speaker || '';
      if (!speakerName) continue;
      const existing = counts.get(speakerName);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(speakerName, {
          name: speakerName,
          count: 1,
          isLinked: !!linkedChar,
        });
      }
    }
    return [...counts.values()];
  }, [blocks, characters]);

  const { leading, activeToken } = splitTrailingToken(text);

  // 컨텍스트 드롭다운 항목 생성
  const suggestions = useMemo<SuggestionItem[]>(() => {
    const items: SuggestionItem[] = [];
    const lowerToken = activeToken.toLowerCase();

    // 1. from: 또는 -from: (캐릭터 검색)
    if (lowerToken.startsWith('from:') || lowerToken.startsWith('-from:')) {
      const negative = lowerToken.startsWith('-');
      const rawVal = activeToken.slice(negative ? 6 : 5).replace(/^"|"$/g, '');
      const sub = rawVal.toLowerCase();
      const section = negative ? '제외할 캐릭터 (-from:)' : '캐릭터로 검색 (from:)';

      const matched = speakerCandidates.filter(
        (s) => !sub || fuzzyName(s.name, sub) || s.name.toLowerCase().includes(sub),
      );

      for (const s of matched) {
        items.push({
          id: `from-${negative ? 'neg' : 'pos'}-${s.name}`,
          section,
          kind: 'chip',
          chip: { key: 'from', value: s.name, negative },
          icon: negative ? '-👤' : '👤',
          label: s.name,
          syntax: `${negative ? '-' : ''}from:${s.name}`,
          meta: `${s.isLinked ? '캐릭터' : '화자'} · ${s.count}`,
        });
      }

      if (
        rawVal.trim() &&
        !matched.some((s) => s.name.toLowerCase() === rawVal.trim().toLowerCase())
      ) {
        const clean = rawVal.trim();
        items.push({
          id: `from-custom-${clean}`,
          section,
          kind: 'chip',
          chip: { key: 'from', value: clean, negative },
          icon: negative ? '-👤' : '👤',
          label: `"${clean}" 화자 지정`,
          syntax: `${negative ? '-' : ''}from:${clean}`,
          meta: '직접 지정',
        });
      }
      return items;
    }

    // 2. in: 또는 -in: (채널 검색)
    if (lowerToken.startsWith('in:') || lowerToken.startsWith('-in:')) {
      const negative = lowerToken.startsWith('-');
      const rawVal = activeToken.slice(negative ? 4 : 3).replace(/^"|"$/g, '');
      const sub = rawVal.toLowerCase();
      const section = negative ? '제외할 채널 (-in:)' : '채널로 검색 (in:)';

      for (const ch of channels) {
        const label = formatChannelLabel(ch.name);
        const tokenValue = ch.name === '' ? 'none' : ch.name;
        if (
          !sub ||
          label.toLowerCase().includes(sub) ||
          tokenValue.toLowerCase().includes(sub)
        ) {
          items.push({
            id: `in-${negative ? 'neg' : 'pos'}-${tokenValue}`,
            section,
            kind: 'chip',
            chip: { key: 'in', value: tokenValue, negative },
            icon: negative ? '-#' : '#',
            label,
            syntax: `${negative ? '-' : ''}in:${tokenValue}`,
            meta: `${ch.count}건`,
          });
        }
      }

      if (
        rawVal.trim() &&
        !channels.some((c) => c.name.toLowerCase() === rawVal.trim().toLowerCase())
      ) {
        const clean = rawVal.trim();
        items.push({
          id: `in-custom-${clean}`,
          section,
          kind: 'chip',
          chip: { key: 'in', value: clean, negative },
          icon: negative ? '-#' : '#',
          label: `"${clean}" 채널 지정`,
          syntax: `${negative ? '-' : ''}in:${clean}`,
        });
      }
      return items;
    }

    // 3. dice: 또는 -dice: (주사위 판정 텍스트 필터)
    if (lowerToken.startsWith('dice:') || lowerToken.startsWith('-dice:')) {
      const negative = lowerToken.startsWith('-');
      const rawVal = activeToken.slice(negative ? 6 : 5).replace(/^"|"$/g, '');
      const clean = rawVal.trim();
      const section = negative ? '제외할 주사위 판정 (-dice:)' : '주사위 필터 (dice:)';

      if (clean) {
        items.push({
          id: `dice-custom-${clean}`,
          section,
          kind: 'chip',
          chip: { key: 'dice', value: clean, negative },
          icon: negative ? '-🎲' : '🎲',
          label: `"${clean}" 판정 검색`,
          syntax: `${negative ? '-' : ''}dice:${clean}`,
        });
      }

      const presets = ['성공', '실패', '크리티컬', '펌블', '1D100', '2D6'];
      for (const kw of presets) {
        if (!clean || (kw.toLowerCase().includes(clean.toLowerCase()) && kw !== clean)) {
          items.push({
            id: `dice-preset-${kw}`,
            section,
            kind: 'chip',
            chip: { key: 'dice', value: kw, negative },
            icon: negative ? '-🎲' : '🎲',
            label: kw,
            syntax: `${negative ? '-' : ''}dice:${kw}`,
            meta: '판정 키워드',
          });
        }
      }
      return items;
    }

    // 4. is: 또는 -is: (상태 필터)
    if (lowerToken.startsWith('is:') || lowerToken.startsWith('-is:')) {
      const negative = lowerToken.startsWith('-');
      const sub = activeToken.slice(negative ? 4 : 3).toLowerCase();
      const section = negative ? '제외할 상태 (-is:)' : '상태 필터 (is:)';

      for (const flag of IS_FLAGS) {
        if (
          !sub ||
          flag.value.includes(sub) ||
          flag.label.includes(sub) ||
          flag.description.includes(sub)
        ) {
          items.push({
            id: `is-${negative ? 'neg' : 'pos'}-${flag.value}`,
            section,
            kind: 'chip',
            chip: { key: 'is', value: flag.value, negative },
            icon: `${negative ? '-' : ''}${flag.icon}`,
            label: `${flag.label} — ${flag.description}`,
            syntax: `${negative ? '-' : ''}is:${flag.value}`,
          });
        }
      }
      return items;
    }

    // 5. 제외 조건 (-)
    if (lowerToken.startsWith('-')) {
      const sub = activeToken.slice(1).replace(/^"|"$/g, '').trim();
      const section = '제외 조건 (-)';

      if (sub) {
        items.push({
          id: `neg-text-${sub}`,
          section,
          kind: 'chip',
          chip: { key: 'text', value: sub, negative: true },
          icon: '🚫',
          label: `"${sub}" 포함 메시지 제외`,
          syntax: `-${sub}`,
        });
      }

      const negPrefixes: {
        prefix: string;
        icon: string;
        label: string;
        description: string;
      }[] = [
        {
          prefix: '-from:',
          icon: '-👤',
          label: '특정 캐릭터 제외',
          description: '화자가 해당 캐릭터가 아닌 메시지',
        },
        {
          prefix: '-in:',
          icon: '-#',
          label: '특정 채널 제외',
          description: '해당 탭/채널이 아닌 메시지',
        },
        {
          prefix: '-dice:',
          icon: '-🎲',
          label: '특정 주사위 판정 제외',
          description: '판정 결과에 특정 텍스트가 없는 메시지',
        },
        {
          prefix: '-is:',
          icon: '-✨',
          label: '특정 상태 메시지 제외',
          description: '시스템·판정·미연결 등 제외',
        },
      ];

      for (const np of negPrefixes) {
        if (!sub || np.prefix.includes(lowerToken)) {
          items.push({
            id: `neg-prefix-${np.prefix}`,
            section,
            kind: 'prefix',
            prefix: np.prefix,
            icon: np.icon,
            label: np.label,
            syntax: np.prefix,
            description: np.description,
          });
        }
      }
      return items;
    }

    // 6. 기본 루트 메뉴 및 일반 텍스트 타이핑 중 추천
    const rootOptions: {
      prefix: string;
      icon: string;
      label: string;
      description: string;
      keywords: string[];
    }[] = [
      {
        prefix: 'from:',
        icon: '👤',
        label: '캐릭터로 검색',
        description: '특정 캐릭터/화자의 메시지 필터링',
        keywords: ['from', 'character', 'speaker', '캐릭터', '화자'],
      },
      {
        prefix: 'in:',
        icon: '#',
        label: '채널로 검색',
        description: '특정 탭/채널의 메시지 필터링',
        keywords: ['in', 'channel', 'tab', '채널', '탭'],
      },
      {
        prefix: 'dice:',
        icon: '🎲',
        label: '주사위 필터',
        description: '주사위 판정 내부 텍스트 필터링',
        keywords: ['dice', 'roll', '주사위', '판정'],
      },
      {
        prefix: 'is:',
        icon: '✨',
        label: '상태 필터',
        description: 'is:dice, is:system, is:normal, is:unlinked',
        keywords: ['is', 'system', 'normal', 'unlinked', '상태', '시스템', '미연결'],
      },
      {
        prefix: '-',
        icon: '🚫',
        label: '제외 조건',
        description: '-from:제타 등 조건에 해당하지 않는 메시지',
        keywords: ['-', 'not', 'exclude', '제외'],
      },
    ];

    const matchingRoot = rootOptions.filter(
      (opt) =>
        !lowerToken ||
        opt.prefix.startsWith(lowerToken) ||
        opt.keywords.some((k) => k.includes(lowerToken)),
    );

    // 사용자가 일반 단어를 입력 중일 때:
    // 키워드 프리픽스('from', 'in', 'dice', 'is')와 정확히 시작 일치하지 않으면 일반 텍스트 검색을 첫 항목으로 제공
    const isTypingPrefixKeyword = ['from', 'in', 'dice', 'is'].some((k) =>
      k.startsWith(lowerToken),
    );
    if (activeToken && !isTypingPrefixKeyword) {
      items.push({
        id: `text-commit-${activeToken}`,
        section: '텍스트 검색',
        kind: 'text-commit',
        icon: '🔍',
        label: `"${activeToken}" 전체 텍스트 검색`,
        syntax: 'Enter',
      });
    }

    for (const opt of matchingRoot) {
      items.push({
        id: `root-${opt.prefix}`,
        section: '검색 옵션',
        kind: 'prefix',
        prefix: opt.prefix,
        icon: opt.icon,
        label: opt.label,
        syntax: opt.prefix,
        description: opt.description,
      });
    }

    // 입력어가 있을 때 캐릭터/채널/상태 빠른 매칭
    if (lowerToken) {
      for (const s of speakerCandidates) {
        if (fuzzyName(s.name, lowerToken) || s.name.toLowerCase().includes(lowerToken)) {
          items.push({
            id: `quick-from-${s.name}`,
            section: '캐릭터로 검색',
            kind: 'chip',
            chip: { key: 'from', value: s.name, negative: false },
            icon: '👤',
            label: s.name,
            syntax: `from:${s.name}`,
            meta: `${s.count}건`,
          });
        }
      }
      for (const ch of channels) {
        if (!ch.name) continue;
        if (ch.name.toLowerCase().includes(lowerToken)) {
          items.push({
            id: `quick-in-${ch.name}`,
            section: '채널로 검색',
            kind: 'chip',
            chip: { key: 'in', value: ch.name, negative: false },
            icon: '#',
            label: ch.name,
            syntax: `in:${ch.name}`,
            meta: `${ch.count}건`,
          });
        }
      }
      for (const flag of IS_FLAGS) {
        if (flag.value.includes(lowerToken) || flag.label.includes(lowerToken)) {
          items.push({
            id: `quick-is-${flag.value}`,
            section: '상태 필터',
            kind: 'chip',
            chip: { key: 'is', value: flag.value, negative: false },
            icon: flag.icon,
            label: `${flag.label} (${flag.description})`,
            syntax: `is:${flag.value}`,
          });
        }
      }
    }

    // 히스토리 (최근에 검색한 조건들)
    for (const h of history) {
      if (!lowerToken || h.toLowerCase().includes(lowerToken)) {
        items.push({
          id: `history-${h}`,
          section: '히스토리',
          kind: 'history',
          query: h,
          icon: '🕒',
          label: h,
        });
      }
    }

    return items;
  }, [activeToken, speakerCandidates, channels, history]);

  const safeIndex = suggestions.length
    ? Math.min(activeIndex, suggestions.length - 1)
    : 0;

  function applySuggestion(item: SuggestionItem) {
    if (item.kind === 'prefix') {
      const nextText = `${leading}${item.prefix}`;
      updateSearch(chips, nextText, false);
      setActiveIndex(0);
      setDropdownOpen(true);
      inputRef.current?.focus();
      return;
    }

    if (item.kind === 'chip') {
      const nextChips: SearchChip[] = [
        ...chips,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...item.chip,
        },
      ];
      const nextText = leading.trimEnd() ? `${leading.trimEnd()} ` : '';
      updateSearch(nextChips, nextText, true);
      setActiveIndex(0);
      setDropdownOpen(true);
      inputRef.current?.focus();
      return;
    }

    if (item.kind === 'text-commit') {
      const full = buildFullQuery(chips, text);
      if (full) recordHistory(full);
      setDropdownOpen(false);
      return;
    }

    if (item.kind === 'history') {
      const parsed = parseQueryToChipsAndText(item.query);
      setChips(parsed.chips);
      setText(parsed.text);
      setFocusedChipIndex(null);
      onActivate();
      onChangeQuery(item.query);
      recordHistory(item.query);
      setDropdownOpen(false);
      inputRef.current?.focus();
    }
  }

  function removeChipAt(idx: number) {
    const nextChips = chips.filter((_, i) => i !== idx);
    updateSearch(nextChips, text, false);
    inputRef.current?.focus();
  }

  function handleInputChange(rawValue: string) {
    setFocusedChipIndex(null);
    setDropdownOpen(true);
    setActiveIndex(0);

    // 공백이 입력되었을 때 앞선 토큰이 완성된 필터 토큰이면 자동으로 Chip으로 변환
    if (/\s$/.test(rawValue)) {
      const tokens = rawValue.match(/(?:[^\s"]|"[^"]*")+/g) ?? [];
      if (tokens.length > 0) {
        const addedChips: SearchChip[] = [];
        const keptTokens: string[] = [];
        for (const tok of tokens) {
          const parsed = tryParseFilterToken(tok);
          if (parsed) {
            addedChips.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              ...parsed,
            });
          } else {
            keptTokens.push(tok);
          }
        }
        if (addedChips.length > 0) {
          const nextChips = [...chips, ...addedChips];
          const nextText = keptTokens.length ? `${keptTokens.join(' ')} ` : '';
          updateSearch(nextChips, nextText, true);
          return;
        }
      }
    }

    updateSearch(chips, rawValue, false);
  }

  // 섹션별 그룹화 렌더링용
  let lastSection = '';

  return (
    <div className="search-bar-container" ref={containerRef}>
      <div
        className={`search-input-wrap${dropdownOpen ? ' is-open' : ''}`}
        onClick={() => {
          onActivate();
          setDropdownOpen(true);
          inputRef.current?.focus();
        }}
      >
        {chips.map((chip, idx) => {
          const { icon, label } = formatChipDisplay(chip);
          const isFocused = focusedChipIndex === idx;
          return (
            <span
              key={chip.id}
              className={`search-chip key-${chip.key}${chip.negative ? ' is-negative' : ''}${isFocused ? ' is-focused' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setFocusedChipIndex(idx);
                inputRef.current?.focus();
              }}
            >
              <span className="search-chip-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="search-chip-label">{label}</span>
              <button
                type="button"
                className="search-chip-remove"
                aria-label={`${label} 필터 해제`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  removeChipAt(idx);
                }}
              >
                ×
              </button>
            </span>
          );
        })}

        <input
          ref={inputRef}
          role="combobox"
          aria-label="로그 검색"
          aria-expanded={dropdownOpen && suggestions.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={
            dropdownOpen && suggestions[safeIndex]
              ? `${listboxId}-${safeIndex}`
              : undefined
          }
          placeholder={chips.length ? '검색어 또는 필터 추가...' : '검색 필터'}
          value={text}
          onFocus={() => {
            onActivate();
            setDropdownOpen(true);
          }}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;

            // 선택된 칩이 있을 때 Backspace / Delete로 칩 제거
            if (focusedChipIndex !== null) {
              if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                e.stopPropagation();
                removeChipAt(focusedChipIndex);
                return;
              }
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setFocusedChipIndex(Math.max(0, focusedChipIndex - 1));
                return;
              }
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (focusedChipIndex + 1 < chips.length) {
                  setFocusedChipIndex(focusedChipIndex + 1);
                } else {
                  setFocusedChipIndex(null);
                }
                return;
              }
              if (e.key === 'Escape') {
                setFocusedChipIndex(null);
                return;
              }
            }

            const caretAtStart =
              e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0;

            // 커서가 맨 앞일 때 Backspace/Delete 또는 왼쪽 화살표로 마지막 칩 조작/해제
            if (caretAtStart && chips.length > 0) {
              if (e.key === 'Backspace' || (e.key === 'Delete' && !text)) {
                e.preventDefault();
                e.stopPropagation();
                removeChipAt(chips.length - 1);
                return;
              }
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setFocusedChipIndex(chips.length - 1);
                return;
              }
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              e.stopPropagation();
              if (!dropdownOpen) {
                setDropdownOpen(true);
                setActiveIndex(0);
              } else if (suggestions.length > 0) {
                setActiveIndex(
                  (safeIndex + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) %
                    suggestions.length,
                );
              }
              return;
            }

            if (
              (e.key === 'Enter' || e.key === 'Tab') &&
              dropdownOpen &&
              suggestions.length > 0
            ) {
              e.preventDefault();
              e.stopPropagation();
              // 만약 사용자가 완성된 필터 토큰(예: from:제타)을 직접 입력하고 Enter/Tab을 누른 경우
              const directChip = tryParseFilterToken(activeToken);
              const chosen = suggestions[safeIndex];
              if (chosen) {
                applySuggestion(chosen);
              } else if (directChip) {
                applySuggestion({
                  id: 'direct',
                  section: '',
                  kind: 'chip',
                  chip: directChip,
                  icon: '',
                  label: '',
                  syntax: '',
                });
              }
              return;
            }

            if (e.key === 'Escape') {
              if (dropdownOpen) {
                e.preventDefault();
                e.stopPropagation();
                setDropdownOpen(false);
                return;
              }
            }
          }}
        />

        {(chips.length > 0 || text) && (
          <button
            type="button"
            className="search-clear"
            aria-label="검색어 지우기"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setChips([]);
              setText('');
              setFocusedChipIndex(null);
              onChangeQuery('');
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
      </div>

      {dropdownOpen && suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="검색 조건 자동완성"
          className="search-suggest-dropdown"
        >
          {suggestions.map((item, idx) => {
            const showHeader = item.section !== lastSection;
            lastSection = item.section;
            const isSelected = safeIndex === idx;

            return (
              <React.Fragment key={item.id}>
                {showHeader && (
                  <div className="search-suggest-section">{item.section}</div>
                )}
                <div
                  id={`${listboxId}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`search-suggest-item${isSelected ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    applySuggestion(item);
                  }}
                >
                  <span className="search-suggest-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <div className="search-suggest-body">
                    <span className="search-suggest-label">{item.label}</span>
                    {item.kind === 'prefix' && (
                      <span className="search-suggest-desc">{item.description}</span>
                    )}
                  </div>
                  {item.kind === 'history' ? (
                    <button
                      type="button"
                      className="search-history-remove"
                      title="기록에서 삭제"
                      aria-label={`${item.label} 기록 삭제`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeHistoryItem(item.query);
                      }}
                    >
                      ×
                    </button>
                  ) : (
                    <span className="search-suggest-syntax">
                      {item.kind === 'chip' && item.meta ? `${item.meta} · ` : ''}
                      <code>{item.syntax}</code>
                    </span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
          <div className="search-suggest-footer">
            <span>↑↓ 이동 · Enter/Tab 자동완성 · Backspace 칩 해제</span>
          </div>
        </div>
      )}
    </div>
  );
}
