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
    [error, setError] = useState(''),
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
      setError('저장했습니다.');
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
    setError('캐릭터를 추가했습니다.');
  }
  return (
    <section className="character-workspace">
      <div className="character-panel">
        <nav>
          <button
            onClick={() => {
              if (dirty && !confirm('저장하지 않은 변경을 버리고 추가할까요?')) return;
              setError('');
              setAdding(true);
            }}
          >
            ＋ 캐릭터 추가
          </button>
          {characters.map((x) => (
            <button
              key={x.id}
              aria-pressed={c?.id === x.id}
              onClick={() => {
                if (x.id === c?.id) return;
                if (dirty && !confirm('저장하지 않은 변경을 버리고 이동할까요?')) return;
                setActive(x.id);
                setError('');
              }}
            >
              <Avatar url={x.iconUrl || x.faces[0]?.iconUrl || ''} />
              <strong style={{ color: x.color }}>{x.name}</strong>
            </button>
          ))}
        </nav>
        <section className="character-editor">
          <div className="character-toolbar">
            <strong>{draft?.name || ""}{dirty ? ' · 저장하지 않은 변경' : ''}</strong>
            <div>
              <button disabled={!draft} onClick={save}>
                캐릭터 저장
              </button>
              <button
                disabled={!c}
                className="danger"
                onClick={() => {
                  if (
                    c &&
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
                    setError('');
                  }
                }}
              >
                캐릭터 삭제
              </button>
            </div>
          </div>
          <div className="character-detail">
            {draft ? (
              <>
                {/* <h2>{draft.name || ''}</h2> */}
                <small>ID: {draft.id}</small>
                <p>
                  연결된 메시지{' '}
                  {p.blocks.filter((b) => b.characterId === draft.id).length}개
                </p>
                <label>
                  이름
                  <input
                    value={draft.name}
                    onChange={(e) => change({ ...draft, name: e.target.value })}
                  />
                </label>
                <label>
                  색상 (#RRGGBB)
                  <input
                    value={draft.color}
                    onChange={(e) => change({ ...draft, color: e.target.value })}
                  />
                </label>
                <div className="faces-heading">
                  <h2>표정 {draft.faces.length}개</h2>
                  <button
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
                <p>기본 표정을 선택하세요. 지정하지 않으면 첫 번째 표정을 사용합니다.</p>
                {draft.faces.map((f, i) => {
                  const isDefault = draft.iconUrl ? draft.iconUrl === f.iconUrl : i === 0;
                  return (
                    <div
                      className={`expression-row ${isDefault ? 'default-face' : ''}`}
                      key={i}
                    >
                      <Avatar url={f.iconUrl} />
                      <div>
                        <label>
                          표정 이름
                          <input
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
                        </label>
                        <label>
                          이미지 URL
                          <input
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
                        </label>
                      </div>
                      <button
                        disabled={!f.iconUrl}
                        aria-pressed={isDefault}
                        onClick={() => change({ ...draft, iconUrl: f.iconUrl })}
                      >
                        {isDefault ? '✓ 기본 표정' : '기본으로 지정'}
                      </button>
                      <button
                        onClick={() => {
                          const faces = draft.faces.filter((_, j) => j !== i);
                          change({
                            ...draft,
                            faces,
                            iconUrl: isDefault ? faces[0]?.iconUrl || '' : draft.iconUrl,
                          });
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
                <p>표정 삭제는 목록에만 적용되며 기존 메시지의 이미지는 보존됩니다.</p>
              </>
            ) : (
              <p>캐릭터를 추가하거나 로그를 불러오세요.</p>
            )}
          </div>
        </section>
      </div>
      {adding && (
        <dialog
          ref={dialog}
          className="character-add-dialog"
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
          <form
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
            <h2>캐릭터 추가</h2>
            <p>코코포리아에서 복사한 캐릭터 JSON을 붙여넣으면 바로 추가됩니다.</p>
            <label>
              이름
              <input name="name" autoFocus />
            </label>
            <label>
              <input
                type="checkbox"
                checked={link}
                onChange={(e) => setLink(e.target.checked)}
              />{' '}
              같은 이름의 연결되지 않은 메시지 연결
            </label>

            <button>추가</button>
            <button type="button" onClick={() => setAdding(false)}>
              닫기
            </button>
          </form>
        </dialog>
      )}
    </section>
  );
}
function Avatar({ url }: { url: string }) {
  return /^https?:\/\//.test(url) ? (
    <img
      src={url}
      alt=""
      width="48"
      height="48"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : null;
}
