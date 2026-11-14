import { FacePicker } from './FacePicker';
import { SpeakerPicker } from './SpeakerPicker';
import { ChannelPicker } from './ChannelPicker';
import type { ChannelSummary } from './channels';
import { defaultDisplay, displayTime, type DisplaySettings } from './presentation';
import type { SelectionKeys } from './selection';
import { useState, useEffect } from 'react';
import type { Block, Character } from './core';
import { applyBulkReplacedText, type BulkEditState } from './bulkEdit';
import { BulkTextEditor } from './BulkTextEditor';
import { handleWrapKeyDown } from './textEdit';
import { isSafeImageUrl } from './importFormats';

export type BulkEditContext = {
  count: number;
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
  toggle,
  save,
  remove,
  drop,
  onJump,
  onEyedrop,
}: {
  block: Block;
  onJump?: () => void;
  onEyedrop?: () => void;
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
  const [dice, setDice] = useState(!!b.diceResult);
  const [over, setOver] = useState('');

  const isBulk = !!bulkContext;
  const isEditing = editing || isBulk;

  useEffect(() => {
    if (editing && !isBulk) {
      setDraft(b);
      setDice(!!b.diceResult);
      setOptions(false);
    }
  }, [editing, isBulk, b]);

  useEffect(() => {
    if (isBulk) {
      setOptions(false);
    }
  }, [isBulk]);

  const finish = () => {
    if (bulkContext) {
      bulkContext.onSave();
      return;
    }
    save({ ...draft, diceResult: dice ? draft.diceResult : '' });
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

  return (
    <article
      data-message-id={b.id}
      className={`log-message ${isSystem ? 'system' : ''} ${selected ? 'selected' : ''} ${cut ? 'is-cut' : ''} ${isEditing ? 'editing' : ''} ${isBulk ? 'bulk-rep' : ''} ${bulkTarget ? 'bulk-target' : ''} ${onJump ? 'has-jump' : ''} ${dropClass}`}
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
      {!isSystem && (
        <div className="avatar">
          {isEditing && faceCharacter ? (
            <FacePicker
              character={faceCharacter}
              value={activeBlock.iconUrl ?? ''}
              onChange={(iconUrl) => {
                if (bulkContext) {
                  bulkContext.onChangeState((prev) => ({ ...prev, iconUrl }));
                } else {
                  setDraft({ ...draft, iconUrl });
                }
              }}
              imageButton
            />
          ) : activeBlock.iconUrl && isSafeImageUrl(activeBlock.iconUrl) ? (
            <img
              draggable={false}
              src={activeBlock.iconUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              className="avatar-placeholder"
              style={{ borderColor: activeBlock.color || undefined }}
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
                  onPickCharacter={(character) =>
                    bulkContext.onChangeState((prev) => ({
                      ...prev,
                      speakerAction: { type: 'character', character },
                      color: undefined,
                      iconUrl: undefined,
                    }))
                  }
                  onUnlink={() =>
                    bulkContext.onChangeState((prev) => ({
                      ...prev,
                      speakerAction: { type: 'unlink' },
                      iconUrl: undefined,
                    }))
                  }
                  onCustomSpeaker={(speaker) =>
                    bulkContext.onChangeState((prev) => ({
                      ...prev,
                      speakerAction: { type: 'custom', speaker },
                      iconUrl: undefined,
                    }))
                  }
                />
              ) : (
                <SpeakerPicker
                  draft={draft}
                  characters={characters}
                  onChange={setDraft}
                />
              )}

              {isCustomSpeaker && (
                <div className="color-input-group editor-color-group" title="화자 색상">
                  <input
                    type="color"
                    aria-label="색상 선택"
                    value={
                      /^#[0-9a-fA-F]{6}$/.test(customColorValue)
                        ? customColorValue
                        : '#888888'
                    }
                    onChange={(e) => setCustomColor(e.target.value)}
                  />
                  <input
                    aria-label="색상 (#RRGGBB)"
                    placeholder="#RRGGBB"
                    value={customColorValue}
                    onChange={(e) => setCustomColor(e.target.value)}
                  />
                </div>
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

              {bulkContext ? (
                <>
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

              {!isSystem && (
                <button
                  type="button"
                  className="compact-btn"
                  disabled={!canEditFace}
                  aria-label="표정 URL 직접 입력"
                  aria-expanded={options}
                  title={
                    canEditFace
                      ? '표정 이미지 URL'
                      : '선택된 메시지의 캐릭터가 모두 같을 때 표정을 일괄 변경할 수 있습니다'
                  }
                  onClick={() => setOptions(!options)}
                >
                  URL
                </button>
              )}
            </div>

            {options && canEditFace && !isSystem && (
              <input
                className="editor-url-input"
                type="url"
                aria-label="표정 이미지 URL"
                placeholder="표정 이미지 URL (https://…)"
                value={
                  isBulk
                    ? (bulkContext.state.iconUrl ?? activeBlock.iconUrl ?? '')
                    : (draft.iconUrl ?? '')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (bulkContext) {
                    bulkContext.onChangeState((prev) => ({ ...prev, iconUrl: val }));
                  } else {
                    setDraft({ ...draft, iconUrl: val });
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
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    finish();
                  }
                }}
              />
            )}

            <div className="editor-actions">
              <span className="editor-hint">
                {bulkContext
                  ? `Ctrl+Enter 저장 · Esc 취소 · Ctrl+H 치환 · 일괄 편집 (${bulkContext.count}개)`
                  : 'Ctrl+Enter 저장 · Esc 취소'}
              </span>
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
                <strong style={{ color: b.color || 'var(--text-primary)' }}>
                  {b.speaker}
                </strong>
              )}
              {isSystem && <span className="system-tag">SYSTEM</span>}
              {display.showChannel && b.channel && (
                <span className="channel-tag">{b.channel}</span>
              )}
              {timeText && <time>{timeText}</time>}
            </div>
            <div className="message-text">
              {b.text ||
                (!b.diceResult ? (
                  <span className="empty-placeholder">빈 메시지 · 더블클릭하여 작성</span>
                ) : (
                  ''
                ))}
            </div>
            {b.diceResult && <div className="roll-result">{b.diceResult}</div>}
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
              위치 이동 ↗
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
        </div>
      )}
    </article>
  );
}
