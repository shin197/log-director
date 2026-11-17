import { FacePicker } from './FacePicker';
import { SpeakerPicker } from './SpeakerPicker';
import { ChannelPicker } from './ChannelPicker';
import type { ChannelSummary } from './channels';
import { defaultDisplay, displayTime, type DisplaySettings } from './presentation';
import type { SelectionKeys } from './selection';
import { useState, useEffect, useRef } from 'react';
import type { Block, Character, Scene } from './core';
import {
  applyBulkReplacedText,
  getBulkStyleCheckboxState,
  toggleBulkStyleOp,
  type BulkEditState,
} from './bulkEdit';
import { BulkTextEditor } from './BulkTextEditor';
import { handleWrapKeyDown } from './textEdit';
import { isSafeImageUrl } from './importFormats';
import { resolveImageUrl } from './imagePool';
import { useImagePool } from './ImagePoolContext';
import { BookmarkRibbon } from './BookmarkRibbon';
import {
  buildMessageStyleObjects,
  type MessageStyleProps,
  type StyleCard,
} from './styles';
import { ColorInput } from './ColorInput';

export type BulkEditContext = {
  count: number;
  targetBlocks: Block[];
  state: BulkEditState;
  originalRepText: string;
  faceCharacter?: Character;
  mixedSpeakers: boolean;
  mixedChannels: boolean;
  hasAnyDice: boolean;
  replaceOpen: boolean;
  replaceMatchCount: number;
  onToggleReplace: () => void;
  onCloseReplace: () => void;
  onChangeState: (updater: (prev: BulkEditState) => BulkEditState) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
};

export function MessageBlock({
  block: b,
  characters = [],
  channels = [],
  display = defaultDisplay,
  editing,
  setEditing,
  selected,
  cut = false,
  cutMode = false,
  pasteIndicator,
  onPasteHover,
  onPasteHere,
  bulkTarget = false,
  bulkDisabled = false,
  bulkContext,
  searchMatch = false,
  styleProps,
  styleCards = [],
  dividerColor,
  toggle,
  save,
  remove,
  drop,
  onJump,
  onEyedrop,
  scene,
  onBookmark,
  itemRef,
  lineNumber,
}: {
  block: Block;
  searchMatch?: boolean;
  styleProps?: MessageStyleProps;
  styleCards?: StyleCard[];
  dividerColor?: string;
  onJump?: () => void;
  onEyedrop?: () => void;
  scene?: Scene;
  onBookmark?: () => void;
  itemRef?: (node: HTMLElement | null) => void;
  lineNumber?: number;
  characters?: Character[];
  channels?: ChannelSummary[];
  display?: DisplaySettings;
  editing: boolean;
  setEditing: (v: boolean) => void;
  selected: boolean;
  cut?: boolean;
  cutMode?: boolean;
  pasteIndicator?: 'before' | 'after';
  onPasteHover?: (after: boolean) => void;
  onPasteHere?: (after: boolean) => void;
  bulkTarget?: boolean;
  bulkDisabled?: boolean;
  bulkContext?: BulkEditContext;
  toggle: (keys: SelectionKeys) => void;
  save: (b: Block) => void;
  remove: () => void;
  drop: (id: string, after: boolean) => void;
}) {
  const [draft, setDraft] = useState(b);
  const [options, setOptions] = useState(false);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [dice, setDice] = useState(!!b.diceResult);
  const [over, setOver] = useState('');
  const stylePopoverRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const images = useImagePool();

  const isBulk = !!bulkContext;
  const isEditing = editing || isBulk;

  useEffect(() => {
    if (editing && !isBulk) {
      setDraft(b);
      setDice(!!b.diceResult);
      setOptions(false);
      setStyleMenuOpen(false);
    }
  }, [editing, isBulk, b]);

  useEffect(() => {
    if (isBulk) {
      setOptions(false);
      setStyleMenuOpen(false);
    }
  }, [isBulk]);

  useEffect(() => {
    if (!styleMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (!stylePopoverRef.current?.contains(e.target as Node)) {
        setStyleMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [styleMenuOpen]);

  const finish = () => {
    if (bulkContext) {
      bulkContext.onSave();
      return;
    }
    const cleanStyleIds = (draft.styleIds ?? []).filter(Boolean);
    const nextBlock: Block = {
      ...draft,
      diceResult: dice ? draft.diceResult : '',
    };
    if (cleanStyleIds.length > 0) nextBlock.styleIds = cleanStyleIds;
    else delete nextBlock.styleIds;
    save(nextBlock);
    setEditing(false);
  };

  const cancel = () => {
    if (bulkContext) {
      bulkContext.onCancel();
      return;
    }
    setEditing(false);
  };

  const removeAction = () => {
    if (bulkContext) {
      bulkContext.onDelete();
      return;
    }
    remove();
  };

  const activeBlock = isBulk ? b : editing ? draft : b;
  const isSystem = activeBlock.sourceType === 'system';
  const timeText = displayTime(b.timestamp, display);

  const bulkDiceOpen =
    bulkContext &&
    (bulkContext.state.diceMode === 'set' ||
      (bulkContext.state.diceMode === 'unchanged' && !!b.diceResult));
  const showDiceEditor = isBulk ? !!bulkDiceOpen : dice;

  const faceCharacter = isBulk
    ? bulkContext.faceCharacter
    : characters.find((c) => c.id === activeBlock.characterId);
  const canEditFace = isBulk ? !!bulkContext.faceCharacter : !isSystem;
  const isCustomSpeaker = isBulk
    ? bulkContext.state.speakerAction
      ? bulkContext.state.speakerAction.type === 'unlink' ||
      bulkContext.state.speakerAction.type === 'custom'
      : !bulkContext.mixedSpeakers && !isSystem && !b.characterId
    : !isSystem && !draft.characterId;
  const customColorValue = isBulk
    ? (bulkContext.state.color ??
      (bulkContext.state.speakerAction ? '' : (b.color ?? '')))
    : (draft.color ?? '');
  const setCustomColor = (val: string) => {
    if (bulkContext) {
      bulkContext.onChangeState((prev) => ({ ...prev, color: val }));
    } else {
      setDraft({ ...draft, color: val });
    }
  };

  const diceValue = isBulk ? bulkContext.state.diceResult : draft.diceResult;
  const setDiceValue = (nextDice: string) => {
    if (bulkContext) {
      bulkContext.onChangeState((prev) => ({
        ...prev,
        diceMode: 'set',
        diceResult: nextDice,
      }));
    } else {
      setDraft({ ...draft, diceResult: nextDice });
    }
  };

  const dropClass = pasteIndicator ? `drop-${pasteIndicator}` : over;
  const resolvedVisualStyle =
    !isEditing && styleProps
      ? buildMessageStyleObjects(
        styleProps,
        dividerColor,
        isSystem ? undefined : b.color || '#888888',
      )
      : null;
  const hideAvatar = Boolean(resolvedVisualStyle?.avatarHidden);
  const rawPanelStyle = resolvedVisualStyle
    ? (() => {
      const s = { ...resolvedVisualStyle.panelStyle };
      if (
        !s.padding &&
        (s.backgroundColor ||
          styleProps?.panelBorderStyle === 'box' ||
          styleProps?.panelBorderStyle === 'left-accent')
      ) {
        s.padding = '12px 14px';
        s.margin = '4px 0';
      }
      return s;
    })()
    : undefined;
  const articlePanelStyle = rawPanelStyle
    ? selected || bulkTarget || cut
      ? { ...rawPanelStyle, backgroundColor: undefined }
      : rawPanelStyle
    : undefined;

  return (
    <article
      ref={itemRef}
      data-message-id={b.id}
      className={`log-message ${isSystem ? 'system' : ''} ${hideAvatar ? 'no-avatar' : ''} ${selected ? 'selected' : ''} ${scene ? 'has-scene' : ''} ${cut ? 'is-cut' : ''} ${isEditing ? 'editing' : ''} ${isBulk ? 'bulk-rep' : ''} ${bulkTarget ? 'bulk-target' : ''} ${onJump ? 'has-jump' : ''} ${searchMatch ? 'search-match' : ''} ${dropClass}`}
      style={articlePanelStyle}
      draggable={!isEditing && !bulkDisabled && !cutMode}
      onDragStart={(e) => {
        if (bulkDisabled || cutMode) return;
        e.dataTransfer.setData('text/log-block', b.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (bulkDisabled || cutMode) return;
        e.preventDefault();
        setOver(
          e.clientY <
            e.currentTarget.getBoundingClientRect().top + e.currentTarget.clientHeight / 2
            ? 'drop-before'
            : 'drop-after',
        );
      }}
      onDragLeave={() => setOver('')}
      onDrop={(e) => {
        if (bulkDisabled || cutMode) return;
        e.preventDefault();
        drop(e.dataTransfer.getData('text/log-block'), over === 'drop-after');
        setOver('');
      }}
      onDragEnd={() => setOver('')}
      onMouseMove={(e) => {
        if (!cutMode || !onPasteHover) return;
        if ((e.target as HTMLElement).closest('.paste-indicator')) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onPasteHover(e.clientY >= rect.top + rect.height / 2);
      }}
      onClick={(e) => {
        if (
          isEditing ||
          bulkDisabled ||
          (e.target as HTMLElement).closest('button,input,textarea')
        )
          return;
        if (e.altKey && onEyedrop) {
          e.preventDefault();
          e.stopPropagation();
          onEyedrop();
          return;
        }
        if (e.detail === 1) toggle({ ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (isBulk) {
          finish();
          return;
        }
        if (bulkDisabled || cutMode) return;
        editing ? finish() : setEditing(true);
      }}
      tabIndex={0}
      aria-label={`${b.speaker || '시스템'} 메시지`}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (bulkDisabled) return;
        if (e.key === ' ') {
          e.preventDefault();
          toggle({ ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
        }
        if (!cutMode && e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          editing ? finish() : setEditing(true);
        }
      }}
    >
      {pasteIndicator && onPasteHere && (
        <div
          className={`paste-indicator ${pasteIndicator}`}
          onClick={(e) => {
            e.stopPropagation();
            onPasteHere(pasteIndicator === 'after');
          }}
        >
          <button
            type="button"
            className="paste-here-btn primary compact-btn"
            onClick={(e) => {
              e.stopPropagation();
              onPasteHere(pasteIndicator === 'after');
            }}
          >
            이 곳에 붙여넣기
          </button>
        </div>
      )}
      {!isSystem && !hideAvatar && (
        <div
          className={`avatar ${resolvedVisualStyle?.avatarShape === 'diamond' ? 'is-diamond' : ''}`}
          style={
            resolvedVisualStyle?.avatarStyle.width
              ? {
                width: resolvedVisualStyle.avatarStyle.width,
                height: resolvedVisualStyle.avatarStyle.height,
              }
              : undefined
          }
        >
          {isEditing && canEditFace ? (
            <FacePicker
              character={faceCharacter}
              value={activeBlock.iconUrl ?? ''}
              onChange={(iconUrl) => {
                setOptions(false);
                if (bulkContext) {
                  bulkContext.onChangeState((prev) => ({ ...prev, iconUrl }));
                } else {
                  setDraft({ ...draft, iconUrl });
                }
              }}
              onRequestCustomUrl={() => {
                setOptions(true);
                requestAnimationFrame(() => {
                  urlInputRef.current?.focus();
                  urlInputRef.current?.select();
                });
              }}
              imageButton
              fallbackText={(activeBlock.speaker || '?').slice(0, 1)}
            />
          ) : resolvedVisualStyle?.avatarShape === 'diamond' ? (
            <div
              className="avatar-frame is-diamond"
              style={resolvedVisualStyle.avatarFrameStyle}
            >
              {activeBlock.iconUrl &&
              isSafeImageUrl(resolveImageUrl(activeBlock.iconUrl, images)) ? (
                <img
                  draggable={false}
                  src={resolveImageUrl(activeBlock.iconUrl, images)}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  style={resolvedVisualStyle.avatarInnerStyle}
                />
              ) : (
                <span
                  className="avatar-placeholder-text"
                  style={{
                    color: activeBlock.color || undefined,
                    ...resolvedVisualStyle.avatarInnerStyle,
                  }}
                >
                  {(activeBlock.speaker || '?').slice(0, 1)}
                </span>
              )}
            </div>
          ) : activeBlock.iconUrl &&
            isSafeImageUrl(resolveImageUrl(activeBlock.iconUrl, images)) ? (
            <img
              draggable={false}
              src={resolveImageUrl(activeBlock.iconUrl, images)}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              style={resolvedVisualStyle?.avatarStyle}
            />
          ) : (
            <span
              className="avatar-placeholder"
              style={{
                borderColor: activeBlock.color || undefined,
                ...resolvedVisualStyle?.avatarStyle,
              }}
            >
              {(activeBlock.speaker || '?').slice(0, 1)}
            </span>
          )}
        </div>
      )}
      <div className="message-content">
        {isEditing ? (
          <div className="block-editor">
            <div className="editor-meta-row">
              {bulkContext ? (
                <SpeakerPicker
                  draft={activeBlock}
                  characters={characters}
                  mixed={bulkContext.mixedSpeakers && !bulkContext.state.speakerAction}
                  onPickCharacter={(character) => {
                    setOptions(false);
                    bulkContext.onChangeState((prev) => ({
                      ...prev,
                      speakerAction: { type: 'character', character },
                      color: undefined,
                      iconUrl: undefined,
                    }));
                  }}
                  onUnlink={() => {
                    setOptions(false);
                    bulkContext.onChangeState((prev) => ({
                      ...prev,
                      speakerAction: { type: 'unlink' },
                      iconUrl: undefined,
                    }));
                  }}
                  onCustomSpeaker={(speaker) => {
                    setOptions(false);
                    bulkContext.onChangeState((prev) => ({
                      ...prev,
                      speakerAction: { type: 'custom', speaker },
                      iconUrl: undefined,
                    }));
                  }}
                />
              ) : (
                <SpeakerPicker
                  draft={draft}
                  characters={characters}
                  onChange={(nextDraft) => {
                    if (
                      nextDraft.characterId !== draft.characterId ||
                      nextDraft.sourceType !== draft.sourceType
                    ) {
                      setOptions(false);
                    }
                    setDraft(nextDraft);
                  }}
                />
              )}

              {isCustomSpeaker && (
                <ColorInput
                  className="editor-color-group"
                  title="화자 색상"
                  value={customColorValue}
                  onChange={setCustomColor}
                />
              )}

              <ChannelPicker
                value={
                  isBulk
                    ? (bulkContext.state.channel ?? b.channel ?? '')
                    : (draft.channel ?? '')
                }
                channels={channels}
                mixed={
                  isBulk &&
                  bulkContext.mixedChannels &&
                  bulkContext.state.channel === undefined
                }
                onChange={(val) => {
                  if (bulkContext) {
                    bulkContext.onChangeState((prev) => ({ ...prev, channel: val }));
                  } else {
                    setDraft({ ...draft, channel: val });
                  }
                }}
              />
              <input
                className="meta-time"
                aria-label="타임스탬프"
                placeholder={isBulk ? '타임스탬프 (일괄)' : '타임스탬프'}
                value={
                  isBulk
                    ? (bulkContext.state.timestamp ?? b.timestamp ?? '')
                    : (draft.timestamp ?? '')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (bulkContext) {
                    bulkContext.onChangeState((prev) => ({ ...prev, timestamp: val }));
                  } else {
                    setDraft({ ...draft, timestamp: val });
                  }
                }}
              />
            </div>

            {options && canEditFace && !isSystem && (
              <input
                ref={urlInputRef}
                className="editor-url-input"
                type="url"
                aria-label="표정 이미지 URL"
                placeholder="표정 이미지 URL (https://…)"
                value={resolveImageUrl(
                  isBulk
                    ? (bulkContext.state.iconUrl ?? activeBlock.iconUrl ?? '')
                    : (draft.iconUrl ?? ''),
                  images,
                )}
                onChange={(e) => {
                  const val = e.target.value;
                  if (bulkContext) {
                    bulkContext.onChangeState((prev) => ({ ...prev, iconUrl: val }));
                  } else {
                    setDraft({ ...draft, iconUrl: val });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setOptions(false);
                  }
                }}
              />
            )}

            {bulkContext ? (
              <BulkTextEditor
                previewText={applyBulkReplacedText(
                  bulkContext.originalRepText,
                  bulkContext.state.replaceFind,
                  bulkContext.state.replaceTo,
                )}
                prefix={bulkContext.state.textPrefix}
                suffix={bulkContext.state.textSuffix}
                onChangePrefix={(textPrefix) =>
                  bulkContext.onChangeState((prev) => ({ ...prev, textPrefix }))
                }
                onChangeSuffix={(textSuffix) =>
                  bulkContext.onChangeState((prev) => ({ ...prev, textSuffix }))
                }
                onSave={finish}
                replaceOpen={bulkContext.replaceOpen}
                replaceFind={bulkContext.state.replaceFind}
                replaceTo={bulkContext.state.replaceTo}
                replaceMatchCount={bulkContext.replaceMatchCount}
                onToggleReplace={bulkContext.onToggleReplace}
                onCloseReplace={bulkContext.onCloseReplace}
                onChangeReplaceFind={(replaceFind) =>
                  bulkContext.onChangeState((prev) => ({ ...prev, replaceFind }))
                }
                onChangeReplaceTo={(replaceTo) =>
                  bulkContext.onChangeState((prev) => ({ ...prev, replaceTo }))
                }
                onClearReplace={() =>
                  bulkContext.onChangeState((prev) => ({
                    ...prev,
                    replaceFind: '',
                    replaceTo: '',
                  }))
                }
              />
            ) : (
              <textarea
                autoFocus
                aria-label="메시지 본문"
                placeholder="메시지 본문…"
                rows={Math.max(1, Math.min(18, draft.text.split('\n').length))}
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                onKeyDown={(e) => {
                  if (
                    handleWrapKeyDown(e, draft.text, (text) =>
                      setDraft({ ...draft, text }),
                    )
                  )
                    return;
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    finish();
                  }
                }}
              />
            )}

            {showDiceEditor && (
              <textarea
                className="dice-textarea"
                aria-label="주사위 판정"
                placeholder={
                  isBulk ? '모든 선택 메시지에 적용할 주사위 판정…' : '주사위 판정 결과…'
                }
                rows={Math.max(1, Math.min(6, (diceValue || '').split('\n').length))}
                value={diceValue}
                onChange={(e) => setDiceValue(e.target.value)}
                onKeyDown={(e) => {
                  if (handleWrapKeyDown(e, diceValue, setDiceValue)) return;
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    finish();
                  }
                }}
              />
            )}

            <div className="editor-actions">
              <div className="editor-tools">
                {bulkContext && (
                  <button
                    type="button"
                    className="compact-btn"
                    aria-pressed={
                      bulkContext.replaceOpen || !!bulkContext.state.replaceFind
                    }
                    title="기존 대사 내부 일괄 치환 (Ctrl+H)"
                    onClick={bulkContext.onToggleReplace}
                  >
                    치환
                  </button>
                )}
                {bulkContext ? (
                  <>
                    <button
                      type="button"
                      className="compact-btn"
                      aria-pressed={showDiceEditor}
                      title={
                        showDiceEditor
                          ? '선택 메시지에서 주사위 판정 모두 제거'
                          : '선택 메시지에 주사위 판정 일괄 설정'
                      }
                      onClick={() => {
                        if (showDiceEditor) {
                          bulkContext.onChangeState((prev) => ({
                            ...prev,
                            diceMode: 'remove',
                            diceResult: '',
                          }));
                        } else {
                          bulkContext.onChangeState((prev) => ({
                            ...prev,
                            diceMode: 'set',
                          }));
                        }
                      }}
                    >
                      판정
                    </button>
                    {!showDiceEditor &&
                      bulkContext.hasAnyDice &&
                      bulkContext.state.diceMode !== 'remove' && (
                        <button
                          type="button"
                          className="compact-btn danger ghost"
                          title="선택된 다른 메시지에 있는 주사위 판정을 모두 제거"
                          onClick={() =>
                            bulkContext.onChangeState((prev) => ({
                              ...prev,
                              diceMode: 'remove',
                              diceResult: '',
                            }))
                          }
                        >
                          판정 제거
                        </button>
                      )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="compact-btn"
                    aria-pressed={dice}
                    title={dice ? '주사위 판정 제거' : '주사위 판정 추가'}
                    onClick={() => setDice(!dice)}
                  >
                    판정
                  </button>
                )}

                <div className="style-picker-popover-wrap" ref={stylePopoverRef}>
                  <button
                    type="button"
                    className={`compact-btn${isBulk
                        ? styleCards.some(
                          (c) =>
                            getBulkStyleCheckboxState(
                              c.id,
                              bulkContext.targetBlocks,
                              bulkContext.state.styleOps,
                            ) !== 'unchecked',
                        )
                          ? ' is-has-styles'
                          : ''
                        : (draft.styleIds?.length ?? 0) > 0
                          ? ' is-has-styles'
                          : ''
                      }`}
                    aria-expanded={styleMenuOpen}
                    aria-haspopup="dialog"
                    title="개별 메시지에 스타일 카드 적용"
                    onClick={() => setStyleMenuOpen((v) => !v)}
                  >
                    스타일
                    {(() => {
                      if (isBulk) {
                        const activeCount = styleCards.filter(
                          (c) =>
                            getBulkStyleCheckboxState(
                              c.id,
                              bulkContext.targetBlocks,
                              bulkContext.state.styleOps,
                            ) === 'checked',
                        ).length;
                        return activeCount > 0 ? ` (${activeCount})` : '';
                      }
                      const singleCount = (draft.styleIds ?? []).filter((id) =>
                        styleCards.some((c) => c.id === id),
                      ).length;
                      return singleCount > 0 ? ` (${singleCount})` : '';
                    })()}
                  </button>
                  {styleMenuOpen && (
                    <div
                      className="style-picker-popover"
                      role="dialog"
                      aria-label="스타일 카드 선택"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setStyleMenuOpen(false);
                        }
                      }}
                    >
                      <div className="style-picker-header">
                        {isBulk
                          ? `${bulkContext.count}개 메시지에 스타일 적용`
                          : '개별 스타일 적용'}
                      </div>
                      {styleCards.length === 0 ? (
                        <p className="style-picker-empty">
                          등록된 스타일 카드가 없습니다. 상단 &apos;스타일&apos; 탭에서 먼저
                          만들어주세요.
                        </p>
                      ) : (
                        <div className="style-picker-list">
                          {styleCards.map((card) => {
                            const triState = isBulk
                              ? getBulkStyleCheckboxState(
                                card.id,
                                bulkContext.targetBlocks,
                                bulkContext.state.styleOps,
                              )
                              : draft.styleIds?.includes(card.id)
                                ? 'checked'
                                : 'unchecked';
                            const op = isBulk
                              ? bulkContext.state.styleOps?.[card.id]
                              : undefined;
                            return (
                              <label key={card.id} className="style-picker-item">
                                <input
                                  type="checkbox"
                                  checked={triState === 'checked'}
                                  ref={(el) => {
                                    if (el) el.indeterminate = triState === 'mixed';
                                  }}
                                  onChange={() => {
                                    if (bulkContext) {
                                      bulkContext.onChangeState((prev) => ({
                                        ...prev,
                                        styleOps: toggleBulkStyleOp(
                                          card.id,
                                          bulkContext.targetBlocks,
                                          prev.styleOps,
                                        ),
                                      }));
                                    } else {
                                      setDraft((prev) => {
                                        const cur = prev.styleIds ?? [];
                                        const nextIds = cur.includes(card.id)
                                          ? cur.filter((id) => id !== card.id)
                                          : [...cur, card.id];
                                        const copy = { ...prev };
                                        if (nextIds.length > 0) copy.styleIds = nextIds;
                                        else delete copy.styleIds;
                                        return copy;
                                      });
                                    }
                                  }}
                                />
                                <span className="style-picker-name">
                                  {card.name || '이름 없는 스타일'}
                                </span>
                                {isBulk && triState === 'mixed' && (
                                  <span className="style-picker-meta">일부</span>
                                )}
                                {isBulk && op === 'add' && (
                                  <span className="style-picker-meta is-add">전체 적용</span>
                                )}
                                {isBulk && op === 'remove' && (
                                  <span className="style-picker-meta is-remove">
                                    전체 해제
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button type="button" className="danger ghost" onClick={removeAction}>
                {bulkContext ? `일괄 삭제 (${bulkContext.count})` : '삭제'}
              </button>
              <button type="button" className="ghost" onClick={cancel}>
                취소
              </button>
              <button type="button" className="primary" onClick={finish}>
                {bulkContext ? '일괄 저장' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <div className="message-read">
            <div className="message-header">
              {!isSystem && (
                <strong
                  style={{
                    color:
                      resolvedVisualStyle?.speakerColor ||
                      b.color ||
                      (resolvedVisualStyle ? '#888888' : 'var(--text-primary)'),
                    fontSize: resolvedVisualStyle?.speakerFontSize
                      ? `${resolvedVisualStyle.speakerFontSize}px`
                      : undefined,
                  }}
                >
                  {b.speaker}
                </strong>
              )}
              {isSystem && <span className="system-tag">SYSTEM</span>}
              {display.showChannel && b.channel && (
                <span className="channel-tag">{b.channel}</span>
              )}
              {timeText && <time>{timeText}</time>}
            </div>
            <div className="message-text" style={resolvedVisualStyle?.textStyle}>
              {b.text ||
                (!b.diceResult ? (
                  <span className="empty-placeholder">빈 메시지 · 더블클릭하여 작성</span>
                ) : (
                  ''
                ))}
            </div>
            {b.diceResult && (
              <div className="roll-result" style={resolvedVisualStyle?.diceStyle}>
                {b.diceResult}
              </div>
            )}
          </div>
        )}
      </div>
      {!isEditing && !bulkDisabled && (
        <div className="message-hover-actions">
          {onJump && (
            <button
              type="button"
              className="message-jump"
              title="필터를 해제하고 전체 로그의 이 메시지로 이동"
              aria-label="전체 로그에서 이 메시지로 이동"
              onClick={(e) => {
                e.stopPropagation();
                onJump();
              }}
            >
              이동↗
            </button>
          )}
          {!cutMode && (
            <button
              type="button"
              className="message-edit-trigger"
              title="메시지 편집 (더블클릭)"
              aria-label="메시지 편집"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              편집
            </button>
          )}
          {!cutMode && onBookmark && (
            <button
              type="button"
              className={`message-bookmark-trigger ${scene ? 'is-bookmarked' : ''}`}
              title={
                scene
                  ? `장면 북마크 편집 (${scene.name || '장면'})`
                  : '이 메시지에 장면(북마크) 등록'
              }
              aria-label={scene ? '장면 북마크 편집' : '장면 북마크 등록'}
              aria-pressed={!!scene}
              onClick={(e) => {
                e.stopPropagation();
                onBookmark();
              }}
            >
              {scene ? (
                <BookmarkRibbon className="message-bookmark-ribbon">★</BookmarkRibbon>
              ) : (
                '★'
              )}
            </button>
          )}
        </div>
      )}
      {lineNumber !== undefined && !isEditing && !bulkDisabled && (
        <span
          className="message-index-badge"
          aria-hidden="true"
          title={`메시지 #${lineNumber}`}
        >
          #{lineNumber}
        </span>
      )}
    </article>
  );
}
