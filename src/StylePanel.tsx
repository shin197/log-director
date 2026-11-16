import { useMemo, useRef, useState } from 'react';
import type { Project } from './core';
import { collectChannels } from './channels';
import { SearchBar } from './SearchBar';
import { notifyError } from './Toast';
import {
  addFilterToStyleCard,
  type AvatarShape,
  buildMessageStyleObjects,
  collectStyleCardUsages,
  createStyleCard,
  createStyleResolver,
  defaultProjectStyles,
  duplicateStyleCard,
  FONT_FAMILY_PRESETS,
  type FontStyleOption,
  type FontWeightOption,
  type GlobalStyleConfig,
  mergeMessageStyleProps,
  type MessageStyleProps,
  moveStyleCard,
  type PanelBorderStyle,
  removeStyleCardFromProject,
  type StyleCard,
  unlinkStyleUsageFromProject,
} from './styles';

function ColorInput({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange: (nextColor: string) => void;
  title?: string;
}) {
  const validHex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888';
  return (
    <div className="color-input-group" title={title}>
      <input
        type="color"
        aria-label={title ? `${title} 선택` : '색상 선택'}
        value={validHex}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <input
        aria-label={title ? `${title} (#RRGGBB)` : '색상 (#RRGGBB)'}
        placeholder="#RRGGBB"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
    </div>
  );
}

function OptionalColorField({
  label,
  value,
  onChange,
  defaultPickColor = '#6CD4BC',
}: {
  label: string;
  value?: string;
  onChange: (next?: string) => void;
  defaultPickColor?: string;
}) {
  const active = Boolean(value);
  return (
    <div className="style-prop-field">
      <div className="style-prop-label-row">
        <span className="field-label">{label}</span>
        {active ? (
          <button
            type="button"
            className="ghost compact-btn style-unset-btn"
            title="속성 지정 해제 (상위 스타일 유지)"
            onClick={() => onChange(undefined)}
          >
            해제
          </button>
        ) : (
          <button
            type="button"
            className="ghost compact-btn style-unset-btn"
            onClick={() => onChange(defaultPickColor)}
          >
            + 지정
          </button>
        )}
      </div>
      {active ? (
        <ColorInput
          title={label}
          value={value ?? defaultPickColor}
          onChange={(next) => onChange(next || undefined)}
        />
      ) : (
        <div className="style-unset-placeholder">지정 안 함 (기존 유지)</div>
      )}
    </div>
  );
}

function SampleMessagePreview({
  globalStyle,
  styleProps,
  label,
}: {
  globalStyle: GlobalStyleConfig;
  styleProps: MessageStyleProps;
  label?: string;
}) {
  const effectiveProps = mergeMessageStyleProps(
    globalStyle.messageDefaults ?? {},
    styleProps,
  );
  const styled = buildMessageStyleObjects(effectiveProps, globalStyle.dividerColor);
  const spkColor = styled.speakerColor || '#6CD4BC';

  return (
    <div
      className="style-sample-preview"
      style={{
        backgroundColor: globalStyle.pageBgColor,
        color: effectiveProps.textColor || '#EEEEEE',
        fontFamily: effectiveProps.fontFamily || 'system-ui, sans-serif',
      }}
    >
      {label && <div className="style-sample-caption">{label}</div>}
      <div
        className="style-sample-message"
        style={{
          borderBottom: `1px solid ${globalStyle.dividerColor}`,
          ...styled.panelStyle,
          ...(styled.panelStyle.backgroundColor ||
            effectiveProps.panelBorderStyle === 'box' ||
            effectiveProps.panelBorderStyle === 'left-accent'
            ? { padding: '10px 12px' }
            : {}),
        }}
      >
        <div
          className="style-sample-avatar"
          style={{
            borderColor: spkColor,
            ...styled.avatarStyle,
          }}
        >
          제
        </div>
        <div className="style-sample-body">
          <div className="style-sample-header">
            <span className="style-sample-speaker" style={{ color: spkColor }}>
              제타
            </span>
            <span className="style-sample-meta" style={{ color: globalStyle.metaColor }}>
              오후 09:15 · [메인]
            </span>
          </div>
          <div
            className="style-sample-text"
            style={{
              fontSize: effectiveProps.fontSize ? `${effectiveProps.fontSize}px` : '15px',
              ...styled.textStyle,
            }}
          >
            &quot;문을 조심스럽게 열고 안쪽의 기척을 살핍니다.&quot;
          </div>
          <div
            className="style-sample-dice"
            style={{
              color: globalStyle.metaColor,
              ...styled.diceStyle,
            }}
          >
            1D100&lt;=65 듣기 ＞ 23 ＞ 성공
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageStylePropsEditor({
  props,
  onChange,
}: {
  props: MessageStyleProps;
  onChange: (next: MessageStyleProps) => void;
}) {
  const update = (patch: Partial<MessageStyleProps>) => {
    const next: MessageStyleProps = { ...props, ...patch };
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === '') {
        delete (next as Record<string, unknown>)[k];
      }
    }
    onChange(next);
  };

  return (
    <div className="style-props-sections">
      <div className="style-props-group">
        <h4>글씨 · 화자</h4>
        <div className="style-props-grid">
          <label className="style-prop-field">
            <span className="field-label">글씨체 (Font)</span>
            <select
              value={props.fontFamily ?? ''}
              onChange={(e) => update({ fontFamily: e.target.value || undefined })}
            >
              {FONT_FAMILY_PRESETS.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="style-prop-field">
            <span className="field-label">본문 글자 크기 (px)</span>
            <input
              type="number"
              min={10}
              max={36}
              placeholder="지정 안 함 (기본 16)"
              value={props.fontSize ?? ''}
              onChange={(e) =>
                update({
                  fontSize: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>

          <label className="style-prop-field">
            <span className="field-label">글자 굵기</span>
            <select
              value={props.fontWeight ?? ''}
              onChange={(e) =>
                update({
                  fontWeight: (e.target.value as FontWeightOption) || undefined,
                })
              }
            >
              <option value="">지정 안 함</option>
              <option value="normal">보통 (Normal)</option>
              <option value="bold">굵게 (Bold)</option>
            </select>
          </label>

          <label className="style-prop-field">
            <span className="field-label">글자 기울임</span>
            <select
              value={props.fontStyle ?? ''}
              onChange={(e) =>
                update({
                  fontStyle: (e.target.value as FontStyleOption) || undefined,
                })
              }
            >
              <option value="">지정 안 함</option>
              <option value="normal">보통 (Normal)</option>
              <option value="italic">기울임 (Italic)</option>
            </select>
          </label>

          <OptionalColorField
            label="본문 글자색"
            value={props.textColor}
            defaultPickColor="#EEEEEE"
            onChange={(textColor) => update({ textColor })}
          />

          <OptionalColorField
            label="화자 이름색 덮어쓰기"
            value={props.speakerColor}
            defaultPickColor="#6CD4BC"
            onChange={(speakerColor) => update({ speakerColor })}
          />
        </div>
      </div>

      <div className="style-props-group">
        <h4>메시지 패널 · 테두리</h4>
        <div className="style-props-grid">
          <OptionalColorField
            label="패널 배경색"
            value={props.panelBgColor}
            defaultPickColor="#1D2530"
            onChange={(panelBgColor) => update({ panelBgColor })}
          />

          <label className="style-prop-field">
            <span className="field-label">패널 테두리 형태</span>
            <select
              value={props.panelBorderStyle ?? ''}
              onChange={(e) =>
                update({
                  panelBorderStyle: (e.target.value as PanelBorderStyle) || undefined,
                })
              }
            >
              <option value="">지정 안 함</option>
              <option value="bottom">하단 구분선 (기본)</option>
              <option value="box">전체 박스 테두리</option>
              <option value="left-accent">좌측 강조선 (4px)</option>
              <option value="none">테두리 없음</option>
            </select>
          </label>

          <OptionalColorField
            label="패널 테두리색"
            value={props.panelBorderColor}
            defaultPickColor="#46586E"
            onChange={(panelBorderColor) => update({ panelBorderColor })}
          />

          <label className="style-prop-field">
            <span className="field-label">패널 모서리 둥글기 (px)</span>
            <input
              type="number"
              min={0}
              max={28}
              placeholder="지정 안 함"
              value={props.panelRadius ?? ''}
              onChange={(e) =>
                update({
                  panelRadius: e.target.value !== '' ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>
        </div>
      </div>

      <div className="style-props-group">
        <h4>아바타 · 인장 틀</h4>
        <div className="style-props-grid">
          <label className="style-prop-field">
            <span className="field-label">인장 틀 모양</span>
            <select
              value={props.avatarShape ?? ''}
              onChange={(e) =>
                update({
                  avatarShape: (e.target.value as AvatarShape) || undefined,
                })
              }
            >
              <option value="">지정 안 함</option>
              <option value="square">사각형 (Square)</option>
              <option value="rounded">둥근 사각형 (Rounded)</option>
              <option value="circle">원형 (Circle)</option>
              <option value="diamond">마름모 (Diamond)</option>
            </select>
          </label>

          <label className="style-prop-field">
            <span className="field-label">인장 테두리 두께 (px)</span>
            <input
              type="number"
              min={0}
              max={8}
              placeholder="지정 안 함"
              value={props.avatarBorderWidth ?? ''}
              onChange={(e) =>
                update({
                  avatarBorderWidth:
                    e.target.value !== '' ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>

          <OptionalColorField
            label="인장 테두리색"
            value={props.avatarBorderColor}
            defaultPickColor="#6CD4BC"
            onChange={(avatarBorderColor) => update({ avatarBorderColor })}
          />
        </div>
      </div>

      <div className="style-props-group">
        <h4>주사위 판정</h4>
        <div className="style-props-grid">
          <OptionalColorField
            label="판정 배경색"
            value={props.diceBgColor}
            defaultPickColor="#172A28"
            onChange={(diceBgColor) => update({ diceBgColor })}
          />

          <OptionalColorField
            label="판정 글자색"
            value={props.diceTextColor}
            defaultPickColor="#6CD4BC"
            onChange={(diceTextColor) => update({ diceTextColor })}
          />

          <OptionalColorField
            label="판정 테두리색"
            value={props.diceBorderColor}
            defaultPickColor="#48BFA4"
            onChange={(diceBorderColor) => update({ diceBorderColor })}
          />

          <label className="style-prop-field">
            <span className="field-label">판정 글자 굵기</span>
            <select
              value={props.diceFontWeight ?? ''}
              onChange={(e) =>
                update({
                  diceFontWeight: (e.target.value as FontWeightOption) || undefined,
                })
              }
            >
              <option value="">지정 안 함</option>
              <option value="normal">보통 (Normal)</option>
              <option value="bold">굵게 (Bold)</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

function StyleCardFilterAdder({
  project,
  channels,
  onAddFilter,
}: {
  project: Project;
  channels: ReturnType<typeof collectChannels>;
  onAddFilter: (filter: string) => void;
}) {
  const [filterInput, setFilterInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const trimmed = filterInput.trim();
    if (!trimmed) {
      notifyError('추가할 검색 필터 조건을 입력해주세요.');
      return;
    }
    try {
      onAddFilter(trimmed);
      setFilterInput('');
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <div className="style-filter-adder">
      <div className="style-filter-searchbar">
        <SearchBar
          inputRef={inputRef}
          query={filterInput}
          searchActive={false}
          blocks={project.blocks}
          characters={project.characters ?? []}
          channels={channels}
          scenes={project.scenes ?? []}
          onActivate={() => { }}
          onChangeQuery={(nextQuery) => setFilterInput(nextQuery)}
        />
      </div>
      <button type="button" className="primary compact-btn" onClick={handleAdd}>
        + 필터 추가
      </button>
    </div>
  );
}

export function StylePanel({
  project: p,
  commit,
}: {
  project: Project;
  commit: (p: Project) => void;
}) {
  const styles = p.styles ?? defaultProjectStyles();
  const [globalOpen, setGlobalOpen] = useState(true);
  const [openCardIds, setOpenCardIds] = useState<Set<string>>(
    () => new Set(styles.cards.map((c) => c.id)),
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<{ index: number; after: boolean } | null>(
    null,
  );

  const channels = useMemo(() => collectChannels(p.blocks), [p.blocks]);

  const updateStyles = (nextStyles: typeof styles) => {
    commit({ ...p, styles: nextStyles });
  };

  const updateGlobal = (patch: Partial<GlobalStyleConfig>) => {
    updateStyles({
      ...styles,
      global: {
        ...styles.global,
        ...patch,
      },
    });
  };

  const updateCard = (cardId: string, updater: (prev: StyleCard) => StyleCard) => {
    updateStyles({
      ...styles,
      cards: styles.cards.map((c) => (c.id === cardId ? updater(c) : c)),
    });
  };

  const toggleCardOpen = (cardId: string) => {
    setOpenCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const handleAddCard = () => {
    const newCard = createStyleCard(undefined, styles.cards.length + 1);
    setOpenCardIds((prev) => new Set([...prev, newCard.id]));
    updateStyles({
      ...styles,
      cards: [...styles.cards, newCard],
    });
  };

  const handleDuplicateCard = (cardId: string) => {
    const nextStyles = duplicateStyleCard(styles, cardId);
    const added = nextStyles.cards.find((c) => !styles.cards.some((o) => o.id === c.id));
    if (added) {
      setOpenCardIds((prev) => new Set([...prev, added.id]));
    }
    updateStyles(nextStyles);
  };

  const handleDeleteCard = (cardId: string) => {
    commit(removeStyleCardFromProject(p, cardId));
  };

  // 각 카드별 매칭 메시지 수 계산
  const matchCountByCardId = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of styles.cards) {
      const singleResolver = createStyleResolver(
        {
          global: styles.global,
          cards: [{ ...card, props: { fontWeight: 'bold' } }],
        },
        p.characters ?? [],
        p.scenes ?? [],
        p.blocks,
      );
      let count = 0;
      for (const b of p.blocks) {
        if (singleResolver(b).fontWeight === 'bold') count++;
      }
      map.set(card.id, count);
    }
    return map;
  }, [styles, p.characters, p.scenes, p.blocks]);

  return (
    <div className="settings-scroll style-workspace-scroll">
      <div className="style-container">
        <div className="style-top-bar">
          <div>
            <h2>스타일 관리</h2>
            <p className="muted-note">
              전역 스타일은 최상단에 고정되며, 일반 스타일 카드는 드래그해 우선순위를
              조절할 수 있습니다. 여러 스타일이 겹치면 같은 속성끼리만 충돌하며{' '}
              <strong>목록 아래에 있는 스타일이 우선</strong>합니다.
            </p>
          </div>
          <button type="button" className="primary" onClick={handleAddCard}>
            ＋ 스타일 카드 추가
          </button>
        </div>

        {/* 1. 최상단 고정 전역 스타일 아코디언 */}
        <section
          className={`style-card global-style-card ${globalOpen ? 'is-open' : ''}`}
        >
          <div className="style-card-header">
            <button
              type="button"
              className="style-card-toggle"
              aria-expanded={globalOpen}
              onClick={() => setGlobalOpen((v) => !v)}
            >
              <span className="style-card-caret">{globalOpen ? '▾' : '▸'}</span>
              <span className="style-badge global-badge">전역 · 고정</span>
              <strong className="style-card-title">
                전역 스타일 (문서 및 기본 메시지)
              </strong>
            </button>
            <div className="style-card-actions">
              <button
                type="button"
                className="ghost compact-btn"
                title="전역 스타일을 기본값으로 초기화"
                onClick={() => updateGlobal(defaultProjectStyles().global)}
              >
                기본값 복원
              </button>
            </div>
          </div>

          {!globalOpen && (
            <div className="style-card-collapsed-preview">
              <SampleMessagePreview
                globalStyle={styles.global}
                styleProps={{}}
              />
            </div>
          )}

          {globalOpen && (
            <div className="style-card-body">
              <div className="style-props-group">
                <h4>문서 · 페이지 영역 (메시지 외 영역)</h4>
                <div className="style-props-grid">
                  <div className="style-prop-field">
                    <span className="field-label">문서 배경색</span>
                    <ColorInput
                      title="문서 배경색"
                      value={styles.global.pageBgColor}
                      onChange={(pageBgColor) =>
                        updateGlobal({ pageBgColor: pageBgColor || '#121212' })
                      }
                    />
                  </div>

                  <label className="style-prop-field">
                    <span className="field-label">본문 최대 폭 (px)</span>
                    <input
                      type="number"
                      min={480}
                      max={1920}
                      step={20}
                      value={styles.global.containerWidth}
                      onChange={(e) =>
                        updateGlobal({
                          containerWidth: Number(e.target.value) || 960,
                        })
                      }
                    />
                  </label>

                  <div className="style-prop-field">
                    <span className="field-label">로그 제목 색상</span>
                    <ColorInput
                      title="로그 제목 색상"
                      value={styles.global.titleColor}
                      onChange={(titleColor) =>
                        updateGlobal({ titleColor: titleColor || '#EEEEEE' })
                      }
                    />
                  </div>

                  <label className="style-prop-field">
                    <span className="field-label">로그 제목 크기 (px)</span>
                    <input
                      type="number"
                      min={14}
                      max={48}
                      value={styles.global.titleSize}
                      onChange={(e) =>
                        updateGlobal({ titleSize: Number(e.target.value) || 24 })
                      }
                    />
                  </label>

                  <label className="style-prop-field">
                    <span className="field-label">로그 제목 정렬</span>
                    <select
                      value={styles.global.titleAlign}
                      onChange={(e) =>
                        updateGlobal({
                          titleAlign: e.target.value === 'center' ? 'center' : 'left',
                        })
                      }
                    >
                      <option value="left">왼쪽 정렬</option>
                      <option value="center">가운데 정렬</option>
                    </select>
                  </label>

                  <div className="style-prop-field">
                    <span className="field-label">타임스탬프 · 채널 색상</span>
                    <ColorInput
                      title="타임스탬프 · 채널 색상"
                      value={styles.global.metaColor}
                      onChange={(metaColor) =>
                        updateGlobal({ metaColor: metaColor || '#888888' })
                      }
                    />
                  </div>

                  <div className="style-prop-field">
                    <span className="field-label">기본 구분선 색상</span>
                    <ColorInput
                      title="기본 구분선 색상"
                      value={styles.global.dividerColor}
                      onChange={(dividerColor) =>
                        updateGlobal({ dividerColor: dividerColor || '#262626' })
                      }
                    />
                  </div>

                  <div className="style-prop-field">
                    <span className="field-label">시스템 메시지 글자색</span>
                    <ColorInput
                      title="시스템 메시지 글자색"
                      value={styles.global.systemTextColor}
                      onChange={(systemTextColor) =>
                        updateGlobal({ systemTextColor: systemTextColor || '#888888' })
                      }
                    />
                  </div>
                </div>
              </div>

              <MessageStylePropsEditor
                props={styles.global.messageDefaults}
                onChange={(messageDefaults) => updateGlobal({ messageDefaults })}
              />

              <SampleMessagePreview
                globalStyle={styles.global}
                styleProps={{}}
                label="전역 스타일 샘플 메시지 미리보기"
              />
            </div>
          )}
        </section>

        {/* 2. 일반 스타일 카드 아코디언 목록 (드래그 정렬 지원) */}
        <div className="style-card-list" role="list" aria-label="일반 스타일 카드 목록">
          {styles.cards.length === 0 ? (
            <div className="style-empty-state">
              <p>등록된 일반 스타일 카드가 없습니다.</p>
              <small className="muted-note">
                상단의 &apos;＋ 스타일 카드 추가&apos; 버튼을 눌러 검색 필터별 맞춤
                스타일(특정 캐릭터, 채널, 주사위 성공/실패 등)을 만들어보세요.
              </small>
            </div>
          ) : (
            styles.cards.map((card, idx) => {
              const isOpen = openCardIds.has(card.id);
              const usages = collectStyleCardUsages(card, p);
              const matchCount = matchCountByCardId.get(card.id) ?? 0;
              const dropClass =
                dragOver && dragOver.index === idx
                  ? dragOver.after
                    ? 'drop-after'
                    : 'drop-before'
                  : '';

              return (
                <section
                  key={card.id}
                  role="listitem"
                  className={`style-card ${isOpen ? 'is-open' : ''} ${dropClass}`}
                  draggable
                  onDragStart={(e) => {
                    if (
                      (e.target as HTMLElement).closest(
                        'input,textarea,select,button:not(.style-drag-handle)',
                      )
                    ) {
                      e.preventDefault();
                      return;
                    }
                    setDragIndex(idx);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/style-card-index', String(idx));
                  }}
                  onDragOver={(e) => {
                    if (dragIndex === null || dragIndex === idx) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const after = e.clientY >= rect.top + rect.height / 2;
                    setDragOver({ index: idx, after });
                  }}
                  onDragLeave={() => {
                    if (dragOver?.index === idx) setDragOver(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from =
                      dragIndex ??
                      Number(e.dataTransfer.getData('text/style-card-index'));
                    if (Number.isInteger(from) && from >= 0 && from !== idx) {
                      const after = dragOver?.index === idx ? dragOver.after : true;
                      const nextCards = moveStyleCard(styles.cards, from, idx, after);
                      if (nextCards !== styles.cards) {
                        updateStyles({ ...styles, cards: nextCards });
                      }
                    }
                    setDragIndex(null);
                    setDragOver(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOver(null);
                  }}
                >
                  <div className="style-card-header">
                    <span
                      className="style-drag-handle"
                      title="드래그하여 스타일 우선순위 변경 (아래쪽이 우선)"
                      aria-hidden="true"
                    >
                      ⋮⋮
                    </span>
                    <button
                      type="button"
                      className="style-card-toggle"
                      aria-expanded={isOpen}
                      onClick={() => toggleCardOpen(card.id)}
                    >
                      <span className="style-card-caret">{isOpen ? '▾' : '▸'}</span>
                      <span className="style-badge">우선도 #{idx + 1}</span>
                      <strong className="style-card-title">{card.name}</strong>
                      <span className="count-pill">{matchCount}개 일치</span>
                    </button>

                    {/* 헤더 사용처 요약 칩 (X로 즉시 해제 가능) */}
                    <div className="style-header-usages" aria-label="스타일 사용처 목록">
                      {usages.length === 0 ? (
                        <span className="muted-note">연결된 사용처 없음</span>
                      ) : (
                        usages.map((u, uIdx) => (
                          <span
                            key={`${u.kind}-${uIdx}-${u.label}`}
                            className="search-chip style-usage-chip"
                            title={u.kind === 'filter' ? `필터: ${u.filter}` : u.label}
                          >
                            <span className="search-chip-label">{u.label}</span>
                            <button
                              type="button"
                              className="search-chip-remove"
                              aria-label={`${u.label} 사용처 연결 해제`}
                              title="이 사용처에서 스타일 적용 해제"
                              onClick={(e) => {
                                e.stopPropagation();
                                commit(unlinkStyleUsageFromProject(p, card.id, u));
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    <div className="style-card-actions">
                      <button
                        type="button"
                        className="ghost compact-btn"
                        disabled={idx === 0}
                        title="위로 이동 (우선순위 낮춤)"
                        onClick={() =>
                          updateStyles({
                            ...styles,
                            cards: moveStyleCard(styles.cards, idx, idx - 1, false),
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ghost compact-btn"
                        disabled={idx === styles.cards.length - 1}
                        title="아래로 이동 (우선순위 높임)"
                        onClick={() =>
                          updateStyles({
                            ...styles,
                            cards: moveStyleCard(styles.cards, idx, idx + 1, true),
                          })
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="compact-btn"
                        title="이 스타일 카드 복제"
                        onClick={() => handleDuplicateCard(card.id)}
                      >
                        복제
                      </button>
                      <button
                        type="button"
                        className="danger compact-btn"
                        title="이 스타일 삭제 (연결된 모든 필터·캐릭터·메시지에서 해제)"
                        onClick={() => handleDeleteCard(card.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  {!isOpen && (
                    <div className="style-card-collapsed-preview">
                      <SampleMessagePreview
                        globalStyle={styles.global}
                        styleProps={card.props}
                      />
                    </div>
                  )}

                  {isOpen && (
                    <div className="style-card-body">
                      {/* 1) 이름 영역 */}
                      <div className="style-section-row">
                        <label className="stack-field style-name-field">
                          <span>스타일 이름</span>
                          <input
                            aria-label="스타일 이름"
                            placeholder="예: 성공 판정 강조, 귓속말 채널"
                            value={card.name}
                            onChange={(e) =>
                              updateCard(card.id, (prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>

                      {/* 2) 필터 및 사용처 영역 */}
                      <div className="style-props-group">
                        <div className="style-group-header">
                          <h4>사용처 및 적용 필터 (합연산 · OR)</h4>
                          <small className="muted-note">
                            검색창과 동일한 필터 문법을 사용합니다. 여러 필터가 등록되면
                            두 조건의 합집합에 스타일이 적용됩니다.
                          </small>
                        </div>

                        <div className="style-usages-box">
                          {usages.length === 0 ? (
                            <span className="muted-note">
                              아직 지정된 필터(사용처)가 없습니다. 아래에서 검색 필터를
                              추가해주세요.
                            </span>
                          ) : (
                            usages.map((u, uIdx) => (
                              <span
                                key={`${u.kind}-${uIdx}-${u.label}`}
                                className="search-chip style-usage-chip"
                              >
                                <span className="search-chip-label">
                                  {u.label}
                                  {u.kind === 'filter' && u.label !== u.filter
                                    ? ` (${u.filter})`
                                    : ''}
                                </span>
                                <button
                                  type="button"
                                  className="search-chip-remove"
                                  aria-label={`${u.label} 사용처 삭제`}
                                  title="이 사용처 삭제 (적용 해제)"
                                  onClick={() =>
                                    commit(unlinkStyleUsageFromProject(p, card.id, u))
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          )}
                        </div>

                        <StyleCardFilterAdder
                          project={p}
                          channels={channels}
                          onAddFilter={(rawFilter) =>
                            updateCard(card.id, (prev) =>
                              addFilterToStyleCard(prev, rawFilter),
                            )
                          }
                        />
                      </div>

                      {/* 3) 스타일 속성 편집 영역 */}
                      <MessageStylePropsEditor
                        props={card.props}
                        onChange={(nextProps) =>
                          updateCard(card.id, (prev) => ({
                            ...prev,
                            props: nextProps,
                          }))
                        }
                      />

                      {/* 4) 샘플 메시지 1개 미리보기 */}
                      <SampleMessagePreview
                        globalStyle={styles.global}
                        styleProps={card.props}
                        label={`"${card.name}" 샘플 메시지 미리보기 (주사위 판정 포함)`}
                      />
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
