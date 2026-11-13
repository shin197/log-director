import { SYSTEM_CHARACTER_ID } from './systemCharacter';
import { notifyError } from './Toast';
import { useState, useRef, useEffect } from 'react';
import type { Project, Character } from './core';
import { updateCharacter } from './characters';
import { parseClipboardCharacter, imageUrl } from './clipboardCharacter';

type FaceDraft = { name: string; iconUrl: string; originalUrl: string };
type Draft = Omit<Character, 'faces'> & { faces: FaceDraft[] };

function makeDraft(c: Character): Draft {
  const faces = c.faces.map((f) => ({ ...f, originalUrl: f.iconUrl }));
  if (c.iconUrl && !faces.some((f) => f.iconUrl === c.iconUrl))
    faces.unshift({ name: '', iconUrl: c.iconUrl, originalUrl: c.iconUrl });
  return { ...c, faces, iconUrl: c.iconUrl || faces[0]?.iconUrl || '' };
}

export function CharacterPanel({
  project: p,
  commit,
}: {
  project: Project;
  commit: (p: Project) => void;
}) {
  const characters = p.characters ?? [];
  const [active, setActive] = useState(characters[0]?.id ?? '');
  const c = characters.find((x) => x.id === active) ?? characters[0];
  const [draft, setDraft] = useState<Draft | null>(c ? makeDraft(c) : null),
    [dirty, setDirty] = useState(false),
    [adding, setAdding] = useState(false),
    [link, setLink] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setDraft(c ? makeDraft(c) : null);
    setDirty(false);
  }, [c]);

  useEffect(() => {
    if (adding) dialog.current?.showModal();
  }, [adding]);

  function change(next: Draft) {
    setDraft(next);
    setDirty(true);
  }

  function save() {
    if (!draft) return;
    try {
      const faces = draft.faces.map((f) => ({
        name: f.name,
        iconUrl: imageUrl(f.iconUrl),
      }));
      if (faces.some((f) => !f.iconUrl))
        throw Error('빈 표정의 이미지 URL을 입력하거나 해당 표정을 삭제해주세요.');
      if (new Set(faces.map((f) => f.iconUrl)).size !== faces.length)
        throw Error('중복된 표정 URL이 있습니다.');
      const next: Character = {
        id: draft.id,
        name: draft.name.trim(),
        color: draft.color,
        faces,
        iconUrl: faces.some((f) => f.iconUrl === draft.iconUrl)
          ? draft.iconUrl
          : faces[0]?.iconUrl || '',
      };
      const updated = updateCharacter(p, next);
      const mapping = new Map(
        draft.faces
          .filter((f) => f.originalUrl)
          .map((f) => [f.originalUrl, imageUrl(f.iconUrl)]),
      );
      commit({
        ...updated,
        blocks: updated.blocks.map((b) =>
          b.characterId === next.id && mapping.has(b.iconUrl ?? '')
            ? { ...b, iconUrl: mapping.get(b.iconUrl!) }
            : b,
        ),
      });
      setDirty(false);
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
    setAdding(false);
  }

  const linkedCount = draft
    ? p.blocks.filter((b) => b.characterId === draft.id).length
    : 0;

  return (
    <section className="character-workspace">
      <div className="character-panel">
        <aside className="character-sidebar">
          <div className="character-sidebar-head">
            <span>캐릭터 {characters.length}</span>
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
          <nav aria-label="캐릭터 목록">
            {characters.map((x) => {
              const count = p.blocks.filter((b) => b.characterId === x.id).length;
              return (
                <button
                  type="button"
                  key={x.id}
                  aria-pressed={c?.id === x.id}
                  onClick={() => {
                    if (x.id === c?.id) return;
                    if (dirty && !confirm('저장하지 않은 변경을 버리고 이동할까요?'))
                      return;
                    setActive(x.id);
                  }}
                >
                  <span className="char-nav-main">
                    <Avatar
                      url={x.iconUrl || x.faces[0]?.iconUrl || ''}
                      fallback={x.name}
                      color={x.color}
                    />
                    <strong style={{ color: x.color }}>{x.name}</strong>
                  </span>
                  <span className="count-pill">{count}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="character-editor">
          <div className="character-toolbar">
            <div className="character-toolbar-title">
              {draft && (
                <>
                  <span
                    className="color-dot"
                    style={{ background: draft.color || '#888' }}
                  />
                  <strong>{draft.name || '이름 없음'}</strong>
                  <span className="count-pill" title={`ID: ${draft.id}`}>
                    메시지 {linkedCount}
                  </span>
                  {dirty && <span className="dirty-badge">미저장</span>}
                </>
              )}
            </div>
            <div className="character-toolbar-actions">
              <button
                type="button"
                disabled={!c || c.id === SYSTEM_CHARACTER_ID}
                className="danger ghost"
                onClick={() => {
                  if (
                    c &&
                    c.id !== SYSTEM_CHARACTER_ID &&
                    confirm(
                      '캐릭터를 삭제할까요? 연결된 메시지의 이름·이미지는 보존됩니다.',
                    )
                  ) {
                    commit({
                      ...p,
                      characters: characters.filter((x) => x.id !== c.id),
                      blocks: p.blocks.map((b) =>
                        b.characterId === c.id ? { ...b, characterId: null } : b,
                      ),
                    });
                  }
                }}
              >
                삭제
              </button>
              <button
                type="button"
                className="primary"
                disabled={!draft || draft.id === SYSTEM_CHARACTER_ID}
                onClick={save}
              >
                저장
              </button>
            </div>
          </div>

          <div className="character-detail">
            {draft?.id === SYSTEM_CHARACTER_ID ? (
              <div className="system-info-card">
                <h2>시스템 캐릭터</h2>
                <p>
                  고정 시스템 캐릭터입니다. 화자 이름과 이미지 없이 시스템 전용 형식으로
                  출력되며, 이름·색상·표정 편집 및 삭제가 제한됩니다.
                </p>
              </div>
            ) : draft ? (
              <div className="character-detail-inner">
                <div className="char-meta-grid">
                  <div className="field-inline">
                    <span className="field-label">이름</span>
                    <input
                      aria-label="캐릭터 이름"
                      placeholder="캐릭터 이름"
                      value={draft.name}
                      onChange={(e) => change({ ...draft, name: e.target.value })}
                    />
                  </div>
                  <div className="field-inline">
                    <span className="field-label">색상</span>
                    <div className="color-input-group">
                      <input
                        type="color"
                        aria-label="색상 선택"
                        value={
                          /^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : '#888888'
                        }
                        onChange={(e) => change({ ...draft, color: e.target.value })}
                      />
                      <input
                        aria-label="색상 (#RRGGBB)"
                        placeholder="#RRGGBB"
                        value={draft.color}
                        onChange={(e) => change({ ...draft, color: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="faces-heading">
                  <h2>표정 ({draft.faces.length})</h2>
                  <button
                    type="button"
                    className="compact-btn"
                    onClick={() =>
                      change({
                        ...draft,
                        faces: [
                          ...draft.faces,
                          { name: '', iconUrl: '', originalUrl: '' },
                        ],
                      })
                    }
                  >
                    ＋ 표정 추가
                  </button>
                </div>

                <div className="expression-list">
                  {draft.faces.map((f, i) => {
                    const isDefault = draft.iconUrl
                      ? draft.iconUrl === f.iconUrl
                      : i === 0;
                    return (
                      <div
                        className={`expression-row ${isDefault ? 'default-face' : ''}`}
                        key={i}
                      >
                        <Avatar url={f.iconUrl} fallback={f.name || String(i + 1)} />
                        <input
                          className="face-name-input"
                          aria-label="표정 이름"
                          placeholder="표정 이름"
                          value={f.name}
                          onChange={(e) =>
                            change({
                              ...draft,
                              faces: draft.faces.map((x, j) =>
                                i === j ? { ...x, name: e.target.value } : x,
                              ),
                            })
                          }
                        />
                        <input
                          className="face-url-input"
                          aria-label="이미지 URL"
                          placeholder="이미지 URL (https://…)"
                          value={f.iconUrl}
                          onChange={(e) =>
                            change({
                              ...draft,
                              iconUrl: isDefault ? e.target.value : draft.iconUrl,
                              faces: draft.faces.map((x, j) =>
                                i === j ? { ...x, iconUrl: e.target.value } : x,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          className="compact-btn"
                          disabled={!f.iconUrl}
                          aria-pressed={isDefault}
                          title="기본 표정으로 지정"
                          onClick={() => change({ ...draft, iconUrl: f.iconUrl })}
                        >
                          {isDefault ? '★ 기본' : '기본 지정'}
                        </button>
                        <button
                          type="button"
                          className="compact-btn danger ghost"
                          title="표정 삭제 (기존 메시지 이미지는 유지)"
                          onClick={() => {
                            const faces = draft.faces.filter((_, j) => j !== i);
                            change({
                              ...draft,
                              faces,
                              iconUrl: isDefault
                                ? faces[0]?.iconUrl || ''
                                : draft.iconUrl,
                            });
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    );
                  })}
                  {!draft.faces.length && (
                    <div className="empty-inline">
                      등록된 표정이 없습니다. ‘＋ 표정 추가’로 추가하세요.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty">
                <p>캐릭터를 추가하거나 로그를 불러오세요.</p>
              </div>
            )}
          </div>
        </section>
      </div>

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
              코코포리아 캐릭터 JSON을 이 창에 붙여넣으면(Ctrl+V) 즉시 등록됩니다.
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
    </section>
  );
}

function Avatar({
  url,
  fallback,
  color,
}: {
  url: string;
  fallback?: string;
  color?: string;
}) {
  return /^https?:\/\//.test(url) ? (
    <img
      className="char-avatar-img"
      src={url}
      alt=""
      width="44"
      height="44"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="char-avatar-fallback" style={{ borderColor: color || undefined }}>
      {(fallback || '?').slice(0, 1)}
    </span>
  );
}
