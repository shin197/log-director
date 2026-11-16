import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block, Project } from './core';
import { collectChannels } from './channels';
import { ColorInput } from './ColorInput';
import { isSafeImageUrl } from './importFormats';
import { resolveImageUrl } from './imagePool';
import { useImagePool } from './ImagePoolContext';
import { SearchBar } from './SearchBar';
import { notifyError } from './Toast';
import {
  addFilterToStyleCard,
  type AvatarShape,
  buildMessageStyleObjects,
  collectStyleCardUsages,
  createStyleCard,
  createStyleResolver,
  defaultGlobalStyle,
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
  resolveSystemBaseStyle,
  type StyleCard,
  type StyleUsageItem,
  unlinkStyleUsageFromProject,
} from './styles';

const GLOBAL_EDIT_ID = '__global__';

function OptionalColorField({
  label,
  value,
  onChange,
  defaultPickColor = '#6CD4BC',
  placeholderText = '지정 안 함 (기존 유지)',
}: {
  label: string;
  value?: string;
  onChange: (next?: string) => void;
  defaultPickColor?: string;
  placeholderText?: string;
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
        <div className="style-unset-placeholder">{placeholderText}</div>
      )}
    </div>
  );
}

function SampleAvatar({
  iconUrl,
  speaker,
  avatarStyle,
  borderColor,
}: {
  iconUrl?: string;
  speaker: string;
  avatarStyle: Record<string, string | number | undefined>;
  borderColor: string;
}) {
  const images = useImagePool();
  const resolvedUrl = iconUrl ? resolveImageUrl(iconUrl, images) : '';
  if (resolvedUrl && isSafeImageUrl(resolvedUrl)) {
    return (
      <img
        className="style-sample-avatar-img"
        src={resolvedUrl}
        alt=""
        referrerPolicy="no-referrer"
        style={avatarStyle}
      />
    );
  }
  return (
    <div
      className="style-sample-avatar"
      style={{
        borderColor,
        ...avatarStyle,
      }}
    >
      {(speaker || '?').slice(0, 1)}
    </div>
  );
}

function SampleMessagePreview({
  globalStyle,
  styleProps,
  sampleBlock,
  caption,
}: {
  globalStyle: GlobalStyleConfig;
  styleProps: MessageStyleProps;
  sampleBlock?: Block;
  caption?: string;
}) {
  const isSampleSystem = sampleBlock?.sourceType === 'system';
  const baseProps = isSampleSystem
    ? resolveSystemBaseStyle(globalStyle)
    : (globalStyle.messageDefaults ?? {});
  const effectiveProps = mergeMessageStyleProps(baseProps, styleProps);
  const styled = buildMessageStyleObjects(effectiveProps, globalStyle.dividerColor);
  const spkColor = styled.speakerColor || sampleBlock?.color || '#6CD4BC';
  const speakerName = sampleBlock?.speaker || '제타';
  const messageText =
    sampleBlock?.text || '"문을 조심스럽게 열고 안쪽의 기척을 살핍니다."';
  const hasDiceEdit = Boolean(
    effectiveProps.diceBgColor ||
    effectiveProps.diceTextColor ||
    effectiveProps.diceBorderColor ||
    effectiveProps.diceFontWeight,
  );
  const diceText =
    sampleBlock?.diceResult ||
    (!sampleBlock || hasDiceEdit ? '1D100<=65 듣기 ＞ 23 ＞ 성공' : '');
  const channelName = sampleBlock?.channel || '메인';
  const metaParts = [sampleBlock?.timestamp || '오후 09:15', `[${channelName}]`].filter(
    Boolean,
  );
  const systemIndent = globalStyle.messageDefaults?.avatarHidden ? 0 : 52;

  return (
    <div
      className="style-sample-preview"
      style={{
        backgroundColor: globalStyle.pageBgColor,
        color: effectiveProps.textColor || (isSampleSystem ? globalStyle.systemTextColor : '#EEEEEE'),
        fontFamily:
          effectiveProps.fontFamily ||
          globalStyle.messageDefaults?.fontFamily ||
          'system-ui, sans-serif',
      }}
    >
      {caption && <div className="style-sample-caption">{caption}</div>}
      <div
        className={`style-sample-message ${isSampleSystem ? 'is-system' : ''} ${styled.avatarHidden ? 'no-avatar' : ''}`.trim()}
        style={{
          borderBottom: `1px solid ${globalStyle.dividerColor}`,
          ...(isSampleSystem ? { paddingLeft: `${systemIndent}px` } : {}),
          ...styled.panelStyle,
          ...(styled.panelStyle.backgroundColor ||
          effectiveProps.panelBorderStyle === 'box' ||
          effectiveProps.panelBorderStyle === 'left-accent'
            ? { padding: '12px 14px' }
            : {}),
        }}
      >
        {!isSampleSystem && !styled.avatarHidden && (
          <SampleAvatar
            iconUrl={sampleBlock?.iconUrl}
            speaker={speakerName}
            avatarStyle={styled.avatarStyle}
            borderColor={spkColor}
          />
        )}
        <div className="style-sample-body">
          <div className="style-sample-header">
            {!isSampleSystem && (
              <span className="style-sample-speaker" style={{ color: spkColor }}>
                {speakerName}
              </span>
            )}
            <span className="style-sample-meta" style={{ color: globalStyle.metaColor }}>
              {isSampleSystem ? `[${channelName}]` : metaParts.join(' · ')}
            </span>
          </div>
          <div
            className="style-sample-text"
            style={{
              fontSize: effectiveProps.fontSize ? `${effectiveProps.fontSize}px` : '16px',
              ...styled.textStyle,
            }}
          >
            {messageText}
          </div>
          {diceText && (
            <div
              className="style-sample-dice"
              style={{
                fontSize: effectiveProps.fontSize ? `${effectiveProps.fontSize}px` : '16px',
                ...styled.diceStyle,
              }}
            >
              {diceText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GlobalStylePreview({
  globalStyle,
  projectTitle,
}: {
  globalStyle: GlobalStyleConfig;
  projectTitle: string;
}) {
  const normalStyled = buildMessageStyleObjects(
    globalStyle.messageDefaults ?? {},
    globalStyle.dividerColor,
  );
  const sysEffective = resolveSystemBaseStyle(globalStyle);
  const sysStyled = buildMessageStyleObjects(sysEffective, globalStyle.dividerColor);
  const systemIndent = normalStyled.avatarHidden ? 0 : 52;

  return (
    <div
      className="style-sample-preview style-global-preview"
      style={{
        backgroundColor: globalStyle.pageBgColor,
        color: globalStyle.messageDefaults.textColor || '#EEEEEE',
        fontFamily: globalStyle.messageDefaults.fontFamily || 'system-ui, sans-serif',
      }}
    >
      <div className="style-sample-caption">
        문서 · 일반 메시지 · 시스템 메시지 미리보기 (최대 폭 {globalStyle.containerWidth}px)
      </div>
      <div
        className="style-sample-title"
        style={{
          color: globalStyle.titleColor,
          fontSize: `${globalStyle.titleSize}px`,
          textAlign: globalStyle.titleAlign,
        }}
      >
        {projectTitle || '로그 제목 미리보기'}
      </div>

      {/* 일반 메시지 샘플 */}
      <div
        className={`style-sample-message ${normalStyled.avatarHidden ? 'no-avatar' : ''}`.trim()}
        style={{
          borderBottom: `1px solid ${globalStyle.dividerColor}`,
          ...normalStyled.panelStyle,
          ...(normalStyled.panelStyle.backgroundColor ||
          globalStyle.messageDefaults.panelBorderStyle === 'box' ||
          globalStyle.messageDefaults.panelBorderStyle === 'left-accent'
            ? { padding: '12px 14px' }
            : {}),
        }}
      >
        {!normalStyled.avatarHidden && (
          <SampleAvatar
            speaker="제타"
            avatarStyle={normalStyled.avatarStyle}
            borderColor={normalStyled.speakerColor || '#6CD4BC'}
          />
        )}
        <div className="style-sample-body">
          <div className="style-sample-header">
            <span
              className="style-sample-speaker"
              style={{ color: normalStyled.speakerColor || '#6CD4BC' }}
            >
              제타
            </span>
            <span className="style-sample-meta" style={{ color: globalStyle.metaColor }}>
              오후 09:15 [메인]
            </span>
          </div>
          <div
            className="style-sample-text"
            style={{
              fontSize: globalStyle.messageDefaults.fontSize
                ? `${globalStyle.messageDefaults.fontSize}px`
                : '16px',
              ...normalStyled.textStyle,
            }}
          >
            &quot;문을 조심스럽게 열고 안쪽의 기척을 살핍니다.&quot;
          </div>
          <div
            className="style-sample-dice"
            style={{
              fontSize: globalStyle.messageDefaults.fontSize
                ? `${globalStyle.messageDefaults.fontSize}px`
                : '16px',
              ...normalStyled.diceStyle,
            }}
          >
            1D100&lt;=65 듣기 ＞ 23 ＞ 성공
          </div>
        </div>
      </div>

      {/* 시스템 메시지 샘플 */}
      <div
        className="style-sample-message is-system"
        style={{
          paddingLeft: `${systemIndent}px`,
          borderBottom: `1px solid ${globalStyle.dividerColor}`,
          color: sysEffective.textColor || globalStyle.systemTextColor,
          ...sysStyled.panelStyle,
          ...(sysStyled.panelStyle.backgroundColor ||
          sysEffective.panelBorderStyle === 'box' ||
          sysEffective.panelBorderStyle === 'left-accent'
            ? { padding: '12px 14px' }
            : {}),
        }}
      >
        <div className="style-sample-body">
          <div className="style-sample-header">
            <span className="style-sample-meta" style={{ color: globalStyle.metaColor }}>
              [메인]
            </span>
          </div>
          <div
            className="style-sample-text"
            style={{
              fontSize: sysEffective.fontSize ? `${sysEffective.fontSize}px` : '16px',
              ...sysStyled.textStyle,
            }}
          >
            전투 라운드가 시작되었습니다.
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageStylePropsEditor({
  props,
  onChange,
  variant = 'normal',
}: {
  props: MessageStyleProps;
  onChange: (next: MessageStyleProps) => void;
  variant?: 'normal' | 'system';
}) {
  const isSystem = variant === 'system';
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
        <h4>{isSystem ? '시스템 글씨 서식' : '글씨 · 화자'}</h4>
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
            label={isSystem ? '시스템 글자색' : '본문 글자색'}
            value={props.textColor}
            defaultPickColor={isSystem ? '#888888' : '#EEEEEE'}
            placeholderText={isSystem ? '지정 안 함 (기본 #888888)' : '지정 안 함 (기존 유지)'}
            onChange={(textColor) => update({ textColor })}
          />

          {!isSystem && (
            <OptionalColorField
              label="화자 이름색 덮어쓰기"
              value={props.speakerColor}
              defaultPickColor="#6CD4BC"
              onChange={(speakerColor) => update({ speakerColor })}
            />
          )}
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

      {!isSystem && (
        <div className="style-props-group">
          <div className="style-group-header">
            <h4>아바타 · 인장 틀</h4>
            <div className="style-avatar-visibility" role="group" aria-label="아바타 표시 여부">
              <button
                type="button"
                className={`compact-btn ${props.avatarHidden === undefined ? 'is-active' : 'ghost'}`}
                title="상위 스타일 설정 유지"
                onClick={() => update({ avatarHidden: undefined })}
              >
                유지
              </button>
              <button
                type="button"
                className={`compact-btn ${props.avatarHidden === false ? 'is-active' : 'ghost'}`}
                title="아바타를 항상 표시"
                onClick={() => update({ avatarHidden: false })}
              >
                표시
              </button>
              <button
                type="button"
                className={`compact-btn ${props.avatarHidden === true ? 'is-off-active' : 'ghost'}`}
                aria-pressed={props.avatarHidden === true}
                title="아바타를 표시하지 않음"
                onClick={() =>
                  update({ avatarHidden: props.avatarHidden === true ? undefined : true })
                }
              >
                사용 안함
              </button>
            </div>
          </div>

          <div
            className={`style-props-grid ${props.avatarHidden ? 'is-disabled-group' : ''}`}
          >
            <label className="style-prop-field">
              <span className="field-label">인장 틀 모양</span>
              <select
                disabled={Boolean(props.avatarHidden)}
                value={props.avatarShape ?? ''}
                onChange={(e) =>
                  update({
                    avatarShape: (e.target.value as AvatarShape) || undefined,
                  })
                }
              >
                <option value="">지정 안 함 (사각형)</option>
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
                disabled={Boolean(props.avatarHidden)}
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
      )}

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
          onActivate={() => {}}
          onChangeQuery={(nextQuery) => setFilterInput(nextQuery)}
        />
      </div>
      <button type="button" className="primary compact-btn" onClick={handleAdd}>
        ＋ 필터 추가
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalDraft, setGlobalDraft] = useState<GlobalStyleConfig | null>(null);
  const [cardDraft, setCardDraft] = useState<StyleCard | null>(null);
  const [pendingUnlinkUsages, setPendingUnlinkUsages] = useState<StyleUsageItem[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<{ index: number; after: boolean } | null>(
    null,
  );
  const nameInputRef = useRef<HTMLInputElement>(null);

  const channels = useMemo(() => collectChannels(p.blocks), [p.blocks]);

  function cancelEdit() {
    setEditingId(null);
    setGlobalDraft(null);
    setCardDraft(null);
    setPendingUnlinkUsages([]);
    setEditingName(false);
    setDirty(false);
  }

  // 실행 취소/불러오기 등으로 편집 대상 카드가 사라지면 닫기
  useEffect(() => {
    if (
      editingId &&
      editingId !== GLOBAL_EDIT_ID &&
      !styles.cards.some((c) => c.id === editingId)
    ) {
      cancelEdit();
    }
  }, [editingId, styles.cards]);

  // 편집 중 Esc 키로 편집 취소
  useEffect(() => {
    if (!editingId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      cancelEdit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingId]);

  const startEditGlobal = () => {
    if (editingId === GLOBAL_EDIT_ID) {
      if (dirty && !confirm('저장하지 않은 스타일 변경을 버리고 닫을까요?')) return;
      cancelEdit();
      return;
    }
    if (dirty && !confirm('저장하지 않은 스타일 변경을 버리고 이동할까요?')) return;
    setEditingId(GLOBAL_EDIT_ID);
    setGlobalDraft(structuredClone(styles.global));
    setCardDraft(null);
    setPendingUnlinkUsages([]);
    setEditingName(false);
    setDirty(false);
  };

  const startEditCard = (card: StyleCard) => {
    if (editingId === card.id) {
      if (dirty && !confirm('저장하지 않은 스타일 변경을 버리고 닫을까요?')) return;
      cancelEdit();
      return;
    }
    if (dirty && !confirm('저장하지 않은 스타일 변경을 버리고 이동할까요?')) return;
    setEditingId(card.id);
    setGlobalDraft(null);
    setCardDraft(structuredClone(card));
    setPendingUnlinkUsages([]);
    setEditingName(false);
    setDirty(false);
  };

  const changeGlobalDraft = (patch: Partial<GlobalStyleConfig>) => {
    setGlobalDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const changeCardDraft = (updater: (prev: StyleCard) => StyleCard) => {
    setCardDraft((prev) => (prev ? updater(prev) : prev));
    setDirty(true);
  };

  const saveGlobalDraft = () => {
    if (!globalDraft) return;
    const synced: GlobalStyleConfig = {
      ...globalDraft,
      systemTextColor: globalDraft.systemDefaults.textColor ?? '#888888',
    };
    commit({
      ...p,
      styles: {
        ...styles,
        global: synced,
      },
    });
    cancelEdit();
  };

  const saveCardDraft = () => {
    if (!cardDraft) return;
    const trimmedName = cardDraft.name.trim() || '이름 없는 스타일';
    const nextCard: StyleCard = { ...cardDraft, name: trimmedName };
    let nextProject: Project = {
      ...p,
      styles: {
        ...styles,
        cards: styles.cards.map((c) => (c.id === nextCard.id ? nextCard : c)),
      },
    };
    for (const usage of pendingUnlinkUsages) {
      nextProject = unlinkStyleUsageFromProject(nextProject, nextCard.id, usage);
    }
    commit(nextProject);
    cancelEdit();
  };

  const handleAddCard = () => {
    if (dirty && !confirm('저장하지 않은 스타일 변경을 버리고 새 카드를 추가할까요?')) {
      return;
    }
    const newCard = createStyleCard(undefined, styles.cards.length + 1);
    commit({
      ...p,
      styles: {
        ...styles,
        cards: [...styles.cards, newCard],
      },
    });
    setEditingId(newCard.id);
    setGlobalDraft(null);
    setCardDraft(structuredClone(newCard));
    setPendingUnlinkUsages([]);
    setEditingName(false);
    setDirty(false);
  };

  const handleDuplicateCard = (cardId: string) => {
    if (dirty && !confirm('저장하지 않은 스타일 변경을 버리고 복제할까요?')) return;
    const nextStyles = duplicateStyleCard(styles, cardId);
    const added = nextStyles.cards.find((c) => !styles.cards.some((o) => o.id === c.id));
    commit({ ...p, styles: nextStyles });
    if (added) {
      setEditingId(added.id);
      setGlobalDraft(null);
      setCardDraft(structuredClone(added));
      setPendingUnlinkUsages([]);
      setEditingName(false);
      setDirty(false);
    }
  };

  const handleDeleteCard = (cardId: string, cardName: string) => {
    if (!confirm(`'${cardName || '이름 없는 스타일'}' 스타일을 삭제할까요? 연결된 필터·캐릭터·메시지에서 모두 해제됩니다.`)) {
      return;
    }
    commit(removeStyleCardFromProject(p, cardId));
    cancelEdit();
  };

  // 저장된 카드별 매칭 메시지 수
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

  // 편집 중인 카드 초안의 매칭 정보 (일치 수 및 첫 샘플 메시지)
  const draftMatchInfo = useMemo(() => {
    if (!cardDraft) return { count: 0, sampleBlock: undefined as Block | undefined };
    const effectiveProject: Project = pendingUnlinkUsages.reduce(
      (acc, u) => (u.kind === 'filter' ? acc : unlinkStyleUsageFromProject(acc, cardDraft.id, u)),
      p,
    );
    const singleResolver = createStyleResolver(
      {
        global: styles.global,
        cards: [{ ...cardDraft, props: { fontWeight: 'bold' } }],
      },
      effectiveProject.characters ?? [],
      effectiveProject.scenes ?? [],
      effectiveProject.blocks,
    );
    let count = 0;
    let firstMatch: Block | undefined;
    for (const b of effectiveProject.blocks) {
      if (singleResolver(b).fontWeight === 'bold') {
        count++;
        if (!firstMatch) firstMatch = b;
      }
    }
    return { count, sampleBlock: firstMatch };
  }, [cardDraft, pendingUnlinkUsages, p, styles.global]);

  const isGlobalOpen = editingId === GLOBAL_EDIT_ID && globalDraft !== null;

  return (
    <div className="settings-scroll style-workspace-scroll">
      <div className="style-container">
        <div className="style-top-bar">
          <div>
            <h2>스타일 관리</h2>
            <p className="muted-note">
              전역 스타일은 최상단에 고정되며, 일반 스타일 카드는 드래그해 우선순위를
              조절할 수 있습니다. 편집한 내용은 <strong>저장</strong>을 누르기 전까지 해당
              카드의 미리보기에만 반영됩니다.
            </p>
          </div>
          <button type="button" className="primary" onClick={handleAddCard}>
            ＋ 스타일 카드 추가
          </button>
        </div>

        {/* 1. 최상단 고정 전역 스타일 아코디언 */}
        <section
          className={`style-card global-style-card ${isGlobalOpen ? 'is-open' : ''}`}
        >
          <div
            className="style-card-header"
            onDoubleClick={() => startEditGlobal()}
          >
            <button
              type="button"
              className="style-card-toggle"
              aria-expanded={isGlobalOpen}
              onClick={() => startEditGlobal()}
            >
              <span className="style-card-caret">{isGlobalOpen ? '▾' : '▸'}</span>
              <span className="style-badge global-badge">전역 · 고정</span>
              <strong className="style-card-title">
                전역 스타일 (문서 · 메시지 · 시스템)
              </strong>
            </button>
            <div className="style-card-actions">
              {isGlobalOpen && dirty && <span className="dirty-badge">미저장</span>}
            </div>
          </div>

          {isGlobalOpen && globalDraft && (
            <div className="style-card-body">
              {/* 미리보기 */}
              <GlobalStylePreview
                globalStyle={globalDraft}
                projectTitle={p.title}
              />

              {/* 1) 문서 페이지 영역 스타일 */}
              <div className="style-props-group">
                <h4>문서 페이지 영역 스타일</h4>
                <div className="style-props-grid">
                  <div className="style-prop-field">
                    <span className="field-label">문서 배경색</span>
                    <ColorInput
                      title="문서 배경색"
                      value={globalDraft.pageBgColor}
                      onChange={(pageBgColor) =>
                        changeGlobalDraft({ pageBgColor: pageBgColor || '#121212' })
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
                      value={globalDraft.containerWidth}
                      onChange={(e) =>
                        changeGlobalDraft({
                          containerWidth: Number(e.target.value) || 960,
                        })
                      }
                    />
                  </label>

                  <div className="style-prop-field">
                    <span className="field-label">로그 제목 색상</span>
                    <ColorInput
                      title="로그 제목 색상"
                      value={globalDraft.titleColor}
                      onChange={(titleColor) =>
                        changeGlobalDraft({ titleColor: titleColor || '#EEEEEE' })
                      }
                    />
                  </div>

                  <label className="style-prop-field">
                    <span className="field-label">로그 제목 크기 (px)</span>
                    <input
                      type="number"
                      min={14}
                      max={48}
                      value={globalDraft.titleSize}
                      onChange={(e) =>
                        changeGlobalDraft({ titleSize: Number(e.target.value) || 24 })
                      }
                    />
                  </label>

                  <label className="style-prop-field">
                    <span className="field-label">로그 제목 정렬</span>
                    <select
                      value={globalDraft.titleAlign}
                      onChange={(e) =>
                        changeGlobalDraft({
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
                      value={globalDraft.metaColor}
                      onChange={(metaColor) =>
                        changeGlobalDraft({ metaColor: metaColor || '#888888' })
                      }
                    />
                  </div>

                  <div className="style-prop-field">
                    <span className="field-label">기본 구분선 색상</span>
                    <ColorInput
                      title="기본 구분선 색상"
                      value={globalDraft.dividerColor}
                      onChange={(dividerColor) =>
                        changeGlobalDraft({ dividerColor: dividerColor || '#262626' })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* 2) 전역 메시지 스타일 */}
              <div className="style-global-subsection">
                <h3 className="style-subsection-title">전역 메시지 스타일</h3>
                <MessageStylePropsEditor
                  props={globalDraft.messageDefaults}
                  onChange={(messageDefaults) => changeGlobalDraft({ messageDefaults })}
                />
              </div>

              {/* 3) 시스템 메시지 스타일 */}
              <div className="style-global-subsection">
                <h3 className="style-subsection-title">시스템 메시지 스타일</h3>
                <MessageStylePropsEditor
                  variant="system"
                  props={globalDraft.systemDefaults}
                  onChange={(systemDefaults) =>
                    changeGlobalDraft({
                      systemDefaults,
                      systemTextColor: systemDefaults.textColor ?? '#888888',
                    })
                  }
                />
              </div>

              {/* 하단 Sticky 액션 바 */}
              <div className="style-detail-actions">
                <button
                  type="button"
                  className="ghost compact-btn"
                  title="전역 스타일 초안을 코코포리아 기본값으로 초기화"
                  onClick={() => {
                    setGlobalDraft(defaultGlobalStyle());
                    setDirty(true);
                  }}
                >
                  기본값 복원
                </button>
                <button
                  type="button"
                  className="ghost compact-btn"
                  title="편집 취소 (Esc)"
                  onClick={cancelEdit}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="primary compact-btn"
                  onClick={saveGlobalDraft}
                >
                  저장
                </button>
              </div>
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
              const isOpen = editingId === card.id && cardDraft !== null;
              const activeCard = isOpen && cardDraft ? cardDraft : card;
              const rawUsages = collectStyleCardUsages(activeCard, p);
              const usages = isOpen
                ? rawUsages.filter(
                    (u) =>
                      !pendingUnlinkUsages.some(
                        (removed) =>
                          removed.kind === u.kind &&
                          ((u.kind === 'character' &&
                            removed.kind === 'character' &&
                            removed.characterId === u.characterId) ||
                            (u.kind === 'message' &&
                              removed.kind === 'message' &&
                              removed.messageId === u.messageId)),
                      ),
                  )
                : rawUsages;
              const matchCount = isOpen
                ? draftMatchInfo.count
                : (matchCountByCardId.get(card.id) ?? 0);
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
                  draggable={!isOpen}
                  onDragStart={(e) => {
                    if (
                      isOpen ||
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
                        commit({ ...p, styles: { ...styles, cards: nextCards } });
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
                  {/* 상단 바: 이름, 우선도 배지, 사용처 칩, 이동/복제 */}
                  <div
                    className="style-card-header"
                    onDoubleClick={() => startEditCard(card)}
                  >
                    {!isOpen && (
                      <span
                        className="style-drag-handle"
                        title="드래그하여 스타일 우선순위 변경 (아래쪽이 우선)"
                        aria-hidden="true"
                      >
                        ⋮⋮
                      </span>
                    )}
                    <button
                      type="button"
                      className="style-card-toggle"
                      aria-expanded={isOpen}
                      onClick={() => startEditCard(card)}
                    >
                      <span className="style-card-caret">{isOpen ? '▾' : '▸'}</span>
                      <span className="style-badge">우선도 #{idx + 1}</span>
                    </button>

                    {isOpen && cardDraft ? (
                      editingName ? (
                        <input
                          ref={nameInputRef}
                          className="char-inline-name-input style-inline-name-input"
                          aria-label="스타일 이름"
                          placeholder="스타일 이름"
                          value={cardDraft.name}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            changeCardDraft((prev) => ({ ...prev, name: e.target.value }))
                          }
                          onBlur={() => setEditingName(false)}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditingName(false);
                            }
                          }}
                        />
                      ) : (
                        <strong
                          className="char-editable-name style-card-title"
                          title="클릭하여 이름 편집"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingName(true);
                            requestAnimationFrame(() => {
                              nameInputRef.current?.focus();
                              nameInputRef.current?.select();
                            });
                          }}
                          onDoubleClick={(e) => e.stopPropagation()}
                        >
                          {cardDraft.name || '이름 없음'}
                        </strong>
                      )
                    ) : (
                      <strong
                        className="style-card-title style-card-title-clickable"
                        onClick={() => startEditCard(card)}
                      >
                        {card.name}
                      </strong>
                    )}

                    <span className="count-pill">{matchCount}개 일치</span>

                    {/* 헤더 사용처 요약 칩 (접혀있을 때는 읽기 전용, 펼쳐 편집 중일 때만 X 해제 가능) */}
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
                            {isOpen && (
                              <button
                                type="button"
                                className="search-chip-remove"
                                aria-label={`${u.label} 사용처 연결 해제`}
                                title="이 사용처에서 스타일 적용 해제"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (u.kind === 'filter') {
                                    changeCardDraft((prev) => ({
                                      ...prev,
                                      filters: prev.filters.filter(
                                        (f) => f !== u.filter,
                                      ),
                                    }));
                                  } else {
                                    setPendingUnlinkUsages((prev) => [...prev, u]);
                                    setDirty(true);
                                  }
                                }}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))
                      )}
                    </div>

                    <div className="style-card-actions">
                      {isOpen && dirty && <span className="dirty-badge">미저장</span>}
                      {!isOpen && (
                        <>
                          <button
                            type="button"
                            className="ghost compact-btn"
                            disabled={idx === 0}
                            title="위로 이동 (우선순위 낮춤)"
                            onClick={() =>
                              commit({
                                ...p,
                                styles: {
                                  ...styles,
                                  cards: moveStyleCard(
                                    styles.cards,
                                    idx,
                                    idx - 1,
                                    false,
                                  ),
                                },
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
                              commit({
                                ...p,
                                styles: {
                                  ...styles,
                                  cards: moveStyleCard(
                                    styles.cards,
                                    idx,
                                    idx + 1,
                                    true,
                                  ),
                                },
                              })
                            }
                          >
                            ↓
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="compact-btn"
                        title="이 스타일 카드 복제"
                        onClick={() => handleDuplicateCard(card.id)}
                      >
                        복제
                      </button>
                    </div>
                  </div>

                  {isOpen && cardDraft && (
                    <div className="style-card-body">
                      {/* 1) 미리보기 (상단 바 바로 아래) */}
                      <SampleMessagePreview
                        globalStyle={styles.global}
                        styleProps={cardDraft.props}
                        sampleBlock={draftMatchInfo.sampleBlock}
                        caption={
                          draftMatchInfo.sampleBlock
                            ? '미리보기 (일치하는 첫 번째 메시지 · 저장 전)'
                            : '샘플 메시지 미리보기 (저장 전)'
                        }
                      />

                      {/* 2) 적용 필터 (합연산 · OR) */}
                      <div className="style-props-group">
                        <div className="style-group-header">
                          <h4>적용 필터 · 사용처 (합연산 · OR)</h4>
                          <small className="muted-note">
                            검색창과 동일한 필터 문법을 사용하며, 여러 필터의 합집합에
                            적용됩니다.
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
                                  onClick={() => {
                                    if (u.kind === 'filter') {
                                      changeCardDraft((prev) => ({
                                        ...prev,
                                        filters: prev.filters.filter(
                                          (f) => f !== u.filter,
                                        ),
                                      }));
                                    } else {
                                      setPendingUnlinkUsages((prev) => [...prev, u]);
                                      setDirty(true);
                                    }
                                  }}
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
                            changeCardDraft((prev) =>
                              addFilterToStyleCard(prev, rawFilter),
                            )
                          }
                        />
                      </div>

                      {/* 3) 글씨, 메시지, 아바타(사용 안함 포함), 주사위 판정 */}
                      <MessageStylePropsEditor
                        props={cardDraft.props}
                        onChange={(nextProps) =>
                          changeCardDraft((prev) => ({
                            ...prev,
                            props: nextProps,
                          }))
                        }
                      />

                      {/* 4) 하단 Sticky 액션 바 ([삭제] [취소] [저장]) */}
                      <div className="style-detail-actions">
                        <button
                          type="button"
                          className="danger ghost compact-btn"
                          title="이 스타일 삭제 (연결된 모든 필터·캐릭터·메시지에서 해제)"
                          onClick={() => handleDeleteCard(card.id, cardDraft.name)}
                        >
                          삭제
                        </button>
                        <button
                          type="button"
                          className="ghost compact-btn"
                          title="편집 취소 (Esc)"
                          onClick={cancelEdit}
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          className="primary compact-btn"
                          onClick={saveCardDraft}
                        >
                          저장
                        </button>
                      </div>
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
