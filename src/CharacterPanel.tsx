import { SYSTEM_CHARACTER_ID } from './systemCharacter';
import { notifyError } from './Toast';
import { useState, useRef, useEffect } from 'react';
import type { Project, Character } from './core';
import { moveCharacter, updateCharacter } from './characters';
import { parseClipboardCharacter, imageUrl } from './clipboardCharacter';
import { isSafeImageUrl } from './importFormats';
import { type ImagePool, internImageUrl, resolveImageUrl } from './imagePool';
import { CharacterAvatar } from './CharacterCard';
import { ColorInput } from './ColorInput';

type FaceDraft = { name: string; iconUrl: string; originalUrl: string };
type Draft = Omit<Character, 'faces'> & { faces: FaceDraft[] };

function makeDraft(c: Character): Draft {
  const faces = c.faces.map((f) => ({ ...f, originalUrl: f.iconUrl }));
  if (c.iconUrl && !faces.some((f) => f.iconUrl === c.iconUrl))
    faces.unshift({ name: '', iconUrl: c.iconUrl, originalUrl: c.iconUrl });
  return { ...c, faces, iconUrl: c.iconUrl || faces[0]?.iconUrl || '' };
}

export function CharacterPanel({
  open = true,
  onToggleOpen,
  project: p,
  commit,
  onSelectForComposer,
}: {
  open?: boolean;
  onToggleOpen?: () => void;
  project: Project;
  commit: (p: Project) => void;
  onSelectForComposer?: (char: Character) => void;
}) {
  const characters = p.characters ?? [];
  const [active, setActive] = useState(characters[0]?.id ?? '');
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const editingChar = characters.find((x) => x.id === editingCharId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState(true);
  const [editingFaceIndex, setEditingFaceIndex] = useState<number | null>(null);
  const [faceImageDraft, setFaceImageDraft] = useState('');
  const [dragFaceIndex, setDragFaceIndex] = useState<number | null>(null);
  const [dragOverFace, setDragOverFace] = useState<{
    index: number;
    after: boolean;
  } | null>(null);
  const [dragCharIndex, setDragCharIndex] = useState<number | null>(null);
  const [dragOverChar, setDragOverChar] = useState<{
    index: number;
    after: boolean;
  } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const faceDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!editingChar) {
      setDraft(null);
      setDirty(false);
      setEditingFaceIndex(null);
      setEditingName(false);
      return;
    }
    setDraft(makeDraft(editingChar));
    setDirty(false);
    setEditingFaceIndex(null);
    setEditingName(false);
  }, [editingChar]);

  useEffect(() => {
    if (adding) dialog.current?.showModal();
  }, [adding]);

  useEffect(() => {
    if (editingFaceIndex !== null) faceDialogRef.current?.showModal();
  }, [editingFaceIndex]);

  function change(next: Draft) {
    setDraft(next);
    setDirty(true);
  }

  function cancelEdit() {
    setEditingCharId(null);
    setEditingName(false);
    setEditingFaceIndex(null);
    setDirty(false);
  }

  useEffect(() => {
    if (!editingCharId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      cancelEdit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingCharId]);

  function startEditCharacter(target: Character) {
    if (editingCharId === target.id) {
      if (dirty && !confirm('저장하지 않은 변경을 버리고 편집을 닫을까요?')) return;
      setEditingCharId(null);
      setEditingName(false);
      return;
    }
    if (dirty && !confirm('저장하지 않은 변경을 버리고 이동할까요?')) return;
    setActive(target.id);
    setEditingCharId(target.id);
    setDraft(makeDraft(target));
    setDirty(false);
    setEditingFaceIndex(null);
    setEditingName(false);
  }

  function save() {
    if (!draft) return;
    try {
      const pool: ImagePool = { ...(p.images ?? {}) };
      const validateAndIntern = (rawUrl: string): string => {
        const resolved = resolveImageUrl(rawUrl, p.images);
        const validated = imageUrl(resolved);
        return internImageUrl(validated, pool);
      };
      const faces = draft.faces.map((f) => ({
        name: f.name,
        iconUrl: validateAndIntern(f.iconUrl),
      }));
      if (faces.some((f) => !f.iconUrl))
        throw Error('빈 표정의 이미지 URL을 입력하거나 해당 표정을 삭제해주세요.');
      if (new Set(faces.map((f) => f.iconUrl)).size !== faces.length)
        throw Error('중복된 표정 URL이 있습니다.');
      const internedDefault = validateAndIntern(draft.iconUrl);
      const next: Character = {
        id: draft.id,
        name: draft.name.trim(),
        color: draft.color,
        faces,
        iconUrl: faces.some((f) => f.iconUrl === internedDefault)
          ? internedDefault
          : faces[0]?.iconUrl || '',
      };
      const updated = updateCharacter(p, next);
      const mapping = new Map(
        draft.faces
          .filter((f) => f.originalUrl)
          .map((f, idx) => [f.originalUrl, faces[idx].iconUrl]),
      );
      commit({
        ...updated,
        images: Object.keys(pool).length > 0 ? pool : undefined,
        blocks: updated.blocks.map((b) =>
          b.characterId === next.id && mapping.has(b.iconUrl ?? '')
            ? { ...b, iconUrl: mapping.get(b.iconUrl!) }
            : b,
        ),
      });
      setDirty(false);
      setEditingName(false);
      setEditingCharId(null);
    } catch (e) {
      notifyError(e);
    }
  }

  function add(next: Character) {
    if (characters.some((x) => x.name === next.name))
      throw Error('같은 이름의 캐릭터가 이미 있습니다.');
    commit({
      ...p,
      characters: [...characters, next],
      blocks: p.blocks.map((b) =>
        link && !b.characterId && b.speaker === next.name && b.sourceType !== 'system'
          ? { ...b, characterId: next.id, color: next.color }
          : b,
      ),
    });
    setActive(next.id);
    setEditingCharId(next.id);
    setAdding(false);
  }

  if (!open) {
    return (
      <aside
        className="character-sidebar is-collapsed"
        aria-label="캐릭터 사이드바 (접힘)"
      >
        <button
          type="button"
          className="character-sidebar-expand-btn"
          title="캐릭터 바 열기"
          aria-label="캐릭터 바 열기"
          onClick={onToggleOpen}
        >
          <span className="character-collapse-icon">👤</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="character-sidebar" aria-label="캐릭터 관리 바">
      <div className="character-sidebar-head">
        <div className="character-sidebar-title">
          {onToggleOpen && (
            <button
              type="button"
              className="ghost icon-btn character-collapse-btn"
              title="캐릭터 바 접기"
              aria-label="캐릭터 바 접기"
              onClick={onToggleOpen}
            >
              ◂
            </button>
          )}
          <span>👤 캐릭터 {characters.length}명</span>
        </div>
        <button
          type="button"
          className="primary compact-btn"
          onClick={() => {
            if (dirty && !confirm('저장하지 않은 변경을 버리고 추가할까요?')) return;
            setAdding(true);
          }}
        >
          ＋ 추가
        </button>
      </div>

      <nav className="character-sidebar-list" aria-label="캐릭터 목록">
        <div className="character-sidebar-list-inner">
          {characters.map((x, i) => {
            const count = p.blocks.filter((b) => b.characterId === x.id).length;
            const isEditing = editingCharId === x.id;
            const isSelected = active === x.id;
            const activeDraft = isEditing && draft?.id === x.id ? draft : null;
            const displayIcon =
              (activeDraft
                ? activeDraft.iconUrl || activeDraft.faces[0]?.iconUrl
                : x.iconUrl || x.faces[0]?.iconUrl) || '';
            const displayName = activeDraft ? activeDraft.name : x.name;
            const displayColor = activeDraft ? activeDraft.color : x.color;
            const dropClass =
              dragOverChar?.index === i
                ? dragOverChar.after
                  ? 'drop-after'
                  : 'drop-before'
                : '';

            return (
              <div
                key={x.id}
                className={`char-sidebar-item ${isEditing ? 'is-editing' : ''} ${isSelected ? 'is-selected' : ''} ${dropClass}`.trim()}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className="char-sidebar-card"
                  aria-pressed={isSelected}
                  aria-expanded={isEditing}
                  title={
                    isEditing
                      ? undefined
                      : '더블클릭하여 편집, Alt+클릭하여 입력창에 적용'
                  }
                  draggable={!isEditing}
                  onDragStart={(e) => {
                    if (isEditing) {
                      e.preventDefault();
                      return;
                    }
                    setDragCharIndex(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', x.id);
                  }}
                  onDragOver={(e) => {
                    if (dragCharIndex === null || dragCharIndex === i) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const after = e.clientY >= rect.top + rect.height / 2;
                    setDragOverChar({ index: i, after });
                  }}
                  onDragLeave={() => {
                    if (dragOverChar?.index === i) setDragOverChar(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragCharIndex !== null && dragCharIndex !== i) {
                      const nextCharacters = moveCharacter(
                        characters,
                        dragCharIndex,
                        i,
                        !!dragOverChar?.after,
                      );
                      if (nextCharacters !== characters) {
                        commit({ ...p, characters: nextCharacters });
                      }
                    }
                    setDragCharIndex(null);
                    setDragOverChar(null);
                  }}
                  onDragEnd={() => {
                    setDragCharIndex(null);
                    setDragOverChar(null);
                  }}
                  onClick={(e) => {
                    if (e.altKey && onSelectForComposer) {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectForComposer(x);
                      return;
                    }
                    setActive(x.id);
                  }}
                  onDoubleClick={() => {
                    startEditCharacter(x);
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      startEditCharacter(x);
                    }
                  }}
                >
                  <span className="char-nav-main">
                    <CharacterAvatar
                      url={displayIcon}
                      fallback={displayName}
                      color={displayColor}
                    />
                    {isEditing && activeDraft && x.id !== SYSTEM_CHARACTER_ID ? (
                      editingName ? (
                        <input
                          ref={nameInputRef}
                          className="char-inline-name-input"
                          aria-label="캐릭터 이름"
                          placeholder="캐릭터 이름"
                          value={activeDraft.name}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            change({ ...activeDraft, name: e.target.value })
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
                          className="char-editable-name"
                          style={{ color: displayColor || undefined }}
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
                          {activeDraft.name || '이름 없음'}
                        </strong>
                      )
                    ) : (
                      <strong style={{ color: displayColor || undefined }}>
                        {displayName}
                      </strong>
                    )}
                  </span>

                  {!isEditing && <span className="count-pill">{count}건</span>}
                </div>

                {isEditing && (
                  <div className="char-sidebar-detail">
                    {x.id === SYSTEM_CHARACTER_ID ? (
                      <>
                        <p className="muted-note char-system-note">
                          고정 시스템 캐릭터입니다. 캐릭터 이름과 이미지 없이 시스템 전용
                          형식으로 출력되며, 이름·색상·표정 편집 및 삭제가 제한됩니다.
                        </p>
                        <div
                          className="char-detail-actions"
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="ghost compact-btn"
                            title="닫기 (Esc)"
                            onClick={cancelEdit}
                          >
                            닫기
                          </button>
                        </div>
                      </>
                    ) : activeDraft ? (
                      <>
                        <div className="char-detail-meta-row">
                          <div className="field-inline">
                            <span className="field-label">색상</span>
                            <ColorInput
                              title="캐릭터 색상"
                              value={activeDraft.color}
                              onChange={(nextColor) =>
                                change({ ...activeDraft, color: nextColor })
                              }
                            />
                          </div>
                          <div className="char-detail-badges">
                            {/* <span className="count-pill" title={`ID: ${activeDraft.id}`}>
                              메시지 {count}
                            </span> */}
                            {dirty && <span className="dirty-badge">미저장</span>}
                          </div>
                        </div>

                        <div className="faces-heading">
                          <h2>표정 ({activeDraft.faces.length})</h2>
                          <div className="faces-heading-actions">
                            <button
                              type="button"
                              className="compact-btn"
                              onClick={() =>
                                change({
                                  ...activeDraft,
                                  faces: [
                                    ...activeDraft.faces,
                                    { name: '', iconUrl: '', originalUrl: '' },
                                  ],
                                })
                              }
                            >
                              ＋ 추가
                            </button>
                          </div>
                        </div>

                        <div className="expression-list">
                          {activeDraft.faces.map((f, faceIdx) => {
                            const isDefault = activeDraft.iconUrl
                              ? activeDraft.iconUrl === f.iconUrl
                              : faceIdx === 0;
                            const faceDropClass =
                              dragOverFace?.index === faceIdx
                                ? dragOverFace.after
                                  ? 'drop-after'
                                  : 'drop-before'
                                : '';
                            return (
                              <div
                                className={`expression-row ${isDefault ? 'default-face' : ''} ${faceDropClass}`.trim()}
                                key={faceIdx}
                                draggable
                                onDragStart={(e) => {
                                  if ((e.target as HTMLElement).closest('input,button')) {
                                    e.preventDefault();
                                    return;
                                  }
                                  setDragFaceIndex(faceIdx);
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', String(faceIdx));
                                }}
                                onDragOver={(e) => {
                                  if (dragFaceIndex === null || dragFaceIndex === faceIdx)
                                    return;
                                  e.preventDefault();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const after = e.clientY >= rect.top + rect.height / 2;
                                  setDragOverFace({ index: faceIdx, after });
                                }}
                                onDragLeave={() => {
                                  if (dragOverFace?.index === faceIdx)
                                    setDragOverFace(null);
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (
                                    dragFaceIndex === null ||
                                    dragFaceIndex === faceIdx
                                  ) {
                                    setDragFaceIndex(null);
                                    setDragOverFace(null);
                                    return;
                                  }
                                  const nextFaces = [...activeDraft.faces];
                                  const [moved] = nextFaces.splice(dragFaceIndex, 1);
                                  let insertAt = dragOverFace?.after
                                    ? faceIdx + 1
                                    : faceIdx;
                                  if (dragFaceIndex < insertAt) insertAt -= 1;
                                  nextFaces.splice(insertAt, 0, moved);
                                  change({ ...activeDraft, faces: nextFaces });
                                  setDragFaceIndex(null);
                                  setDragOverFace(null);
                                }}
                                onDragEnd={() => {
                                  setDragFaceIndex(null);
                                  setDragOverFace(null);
                                }}
                              >
                                <button
                                  type="button"
                                  className="face-image-btn"
                                  title="표정 이미지 업로드 또는 URL/base64 입력"
                                  aria-label={`${f.name || `표정 ${faceIdx + 1}`} 이미지 설정`}
                                  onClick={() => {
                                    setFaceImageDraft(
                                      resolveImageUrl(f.iconUrl, p.images),
                                    );
                                    setEditingFaceIndex(faceIdx);
                                  }}
                                >
                                  {isSafeImageUrl(
                                    resolveImageUrl(f.iconUrl, p.images),
                                  ) ? (
                                    <img
                                      className="char-avatar-img"
                                      src={resolveImageUrl(f.iconUrl, p.images)}
                                      alt=""
                                      width="36"
                                      height="36"
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="face-upload-placeholder">
                                      <UploadIcon />
                                    </span>
                                  )}
                                </button>
                                <input
                                  className="face-name-input"
                                  aria-label="표정 이름"
                                  placeholder="표정 이름"
                                  value={f.name}
                                  onChange={(e) =>
                                    change({
                                      ...activeDraft,
                                      faces: activeDraft.faces.map((item, j) =>
                                        faceIdx === j
                                          ? { ...item, name: e.target.value }
                                          : item,
                                      ),
                                    })
                                  }
                                />
                                <div className="expression-row-actions">
                                  <button
                                    type="button"
                                    className="compact-btn"
                                    disabled={!f.iconUrl}
                                    aria-pressed={isDefault}
                                    title="기본 표정으로 지정"
                                    onClick={() =>
                                      change({ ...activeDraft, iconUrl: f.iconUrl })
                                    }
                                  >
                                    {isDefault ? '기본' : '★'}
                                  </button>
                                  <button
                                    type="button"
                                    className="compact-btn danger ghost"
                                    title="표정 삭제 (기존 메시지 이미지는 유지)"
                                    onClick={() => {
                                      const faces = activeDraft.faces.filter(
                                        (_, j) => j !== faceIdx,
                                      );
                                      change({
                                        ...activeDraft,
                                        faces,
                                        iconUrl: isDefault
                                          ? faces[0]?.iconUrl || ''
                                          : activeDraft.iconUrl,
                                      });
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {!activeDraft.faces.length && (
                            <div className="empty-inline">
                              등록된 표정이 없습니다. ‘＋ 표정 추가’로 추가하세요.
                            </div>
                          )}
                        </div>

                        <div
                          className="char-detail-actions"
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="danger ghost compact-btn"
                            title="캐릭터 삭제"
                            onClick={() => {
                              if (
                                confirm(
                                  '캐릭터를 삭제할까요? 연결된 메시지의 이름·이미지는 보존됩니다.',
                                )
                              ) {
                                commit({
                                  ...p,
                                  characters: characters.filter(
                                    (item) => item.id !== x.id,
                                  ),
                                  blocks: p.blocks.map((b) =>
                                    b.characterId === x.id
                                      ? { ...b, characterId: null }
                                      : b,
                                  ),
                                });
                                setEditingCharId(null);
                              }
                            }}
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
                            onClick={save}
                          >
                            저장
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {adding && (
        <dialog
          ref={dialog}
          className="modal-dialog character-add-dialog"
          onCancel={() => setAdding(false)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text/plain');
            if (!text.trim().startsWith('{')) return;
            e.preventDefault();
            try {
              add(parseClipboardCharacter(text));
            } catch (err) {
              notifyError(err);
            }
          }}
        >
          <div className="modal-header">
            <h2>캐릭터 추가</h2>
            <button
              type="button"
              className="ghost icon-btn"
              aria-label="닫기"
              onClick={() => setAdding(false)}
            >
              ×
            </button>
          </div>
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
              try {
                if (!name) throw Error('이름을 입력해주세요.');
                add({
                  id: crypto.randomUUID(),
                  name,
                  color: '#888888',
                  iconUrl: '',
                  faces: [],
                });
              } catch (err) {
                notifyError(err);
              }
            }}
          >
            <div className="paste-hint">
              코코포리아 캐릭터 JSON을 이 창에 붙여넣으면 즉시 등록됩니다.
            </div>
            <label className="stack-field">
              <span>이름</span>
              <input name="name" placeholder="새 캐릭터 이름" autoFocus />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={link}
                onChange={(e) => setLink(e.target.checked)}
              />
              <span>같은 이름의 미연결 메시지 자동 연결</span>
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setAdding(false)}>
                취소
              </button>
              <button type="submit" className="primary">
                추가
              </button>
            </div>
          </form>
        </dialog>
      )}

      {editingFaceIndex !== null && draft && (
        <dialog
          ref={faceDialogRef}
          className="modal-dialog face-image-dialog"
          onCancel={() => setEditingFaceIndex(null)}
        >
          <div className="modal-header">
            <h2>표정 이미지 설정</h2>
            <button
              type="button"
              className="ghost icon-btn"
              aria-label="닫기"
              onClick={() => setEditingFaceIndex(null)}
            >
              ×
            </button>
          </div>
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const validated = imageUrl(faceImageDraft);
                if (!validated)
                  throw Error('이미지를 업로드하거나 URL/base64를 입력해주세요.');
                const target = draft.faces[editingFaceIndex];
                const wasDefault = draft.iconUrl
                  ? draft.iconUrl === target?.iconUrl
                  : editingFaceIndex === 0;
                change({
                  ...draft,
                  iconUrl: wasDefault ? validated : draft.iconUrl,
                  faces: draft.faces.map((x, j) =>
                    j === editingFaceIndex ? { ...x, iconUrl: validated } : x,
                  ),
                });
                setEditingFaceIndex(null);
              } catch (err) {
                notifyError(err);
              }
            }}
          >
            <div className="face-image-preview-row">
              <div className="face-image-preview-box">
                {isSafeImageUrl(faceImageDraft) ? (
                  <img src={faceImageDraft.trim()} alt="표정 미리보기" />
                ) : (
                  <UploadIcon />
                )}
              </div>
              <div className="face-upload-controls">
                <label className="button compact-btn">
                  사진 파일 업로드
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          const uploaded = reader.result;
                          const target = draft.faces[editingFaceIndex];
                          const wasDefault = draft.iconUrl
                            ? draft.iconUrl === target?.iconUrl
                            : editingFaceIndex === 0;
                          change({
                            ...draft,
                            iconUrl: wasDefault ? uploaded : draft.iconUrl,
                            faces: draft.faces.map((x, j) =>
                              j === editingFaceIndex
                                ? {
                                  ...x,
                                  name:
                                    x.name || file.name.replace(/\.[^/.]+$/, '').trim(),
                                  iconUrl: uploaded,
                                }
                                : x,
                            ),
                          });
                          setEditingFaceIndex(null);
                        }
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <small className="muted-note">
                  업로드한 사진은 base64 이미지로 저장됩니다.
                </small>
              </div>
            </div>
            <label className="stack-field">
              <span>이미지 URL 또는 base64</span>
              <textarea
                rows={3}
                placeholder="https://... 또는 data:image/png;base64,..."
                value={faceImageDraft}
                onChange={(e) => setFaceImageDraft(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setEditingFaceIndex(null)}
              >
                취소
              </button>
              <button type="submit" className="primary">
                적용
              </button>
            </div>
          </form>
        </dialog>
      )}
    </aside>
  );
}

function UploadIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
