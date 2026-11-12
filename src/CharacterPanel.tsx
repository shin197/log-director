import { useState, useRef, useEffect } from 'react';
import type { Project, Character } from './core';
import { inheritCharacter, updateCharacter } from './characters';
export function CharacterPanel({
  project: p,
  commit,
}: {
  project: Project;
  commit: (p: Project) => void;
}) {
  const [active, setActive] = useState(''),
    [adding, setAdding] = useState(false),
    [error, setError] = useState('');
  const characters = p.characters ?? [];
  const c = characters.find((c) => c.id === active) ?? characters[0];
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (adding) dialog.current?.showModal();
  }, [adding]);
  function save(next: Character) {
    try {
      commit(updateCharacter(p, next));
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="character-panel">
      <nav>
        <button
          onClick={() => {
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
              setActive(x.id);
              setError('');
            }}
          >
            <Avatar url={x.iconUrl || x.faces[0]?.iconUrl || ''} />
            <span style={{ color: x.color }}>{x.name}</span>
          </button>
        ))}
      </nav>
      <div className="character-detail">
        <p role="alert">{error}</p>
        {c ? (
          <div key={JSON.stringify(c)}>
            <h2>{c.name}</h2>
            <small>ID: {c.id}</small>
            <p>연결된 메시지 {p.blocks.filter((b) => b.characterId === c.id).length}개</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                save({
                  ...c,
                  name: String(data.get('name')).trim(),
                  color: String(data.get('color')),
                  iconUrl: String(data.get('iconUrl')),
                });
              }}
            >
              <label>
                이름
                <input name="name" defaultValue={c.name} required />
              </label>
              <label>
                색상 (#RRGGBB)
                <input
                  name="color"
                  defaultValue={c.color}
                  pattern="#[0-9a-fA-F]{6}"
                  required
                />
              </label>
              <label>
                기본 표정 URL
                <input name="iconUrl" type="url" defaultValue={c.iconUrl} />
              </label>
              <button>캐릭터 저장</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (
                    confirm(
                      '캐릭터를 삭제하고 연결된 메시지를 사용자 지정 화자로 유지할까요?',
                    )
                  )
                    commit({
                      ...p,
                      characters: characters.filter((x) => x.id !== c.id),
                      blocks: p.blocks.map((b) =>
                        b.characterId === c.id ? { ...b, characterId: null } : b,
                      ),
                    });
                }}
              >
                캐릭터 삭제
              </button>
            </form>
            <h2>표정 {c.faces.length}개</h2>
            {c.faces.map((face, i) => (
              <form
                className="expression-row"
                key={i}
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const next = {
                    name: String(data.get('name')),
                    iconUrl: String(data.get('url')),
                  };
                  if (c.faces.some((f, j) => j !== i && f.iconUrl === next.iconUrl)) {
                    setError('이미 등록된 이미지입니다.');
                    return;
                  }
                  const updated = updateCharacter(p, {
                    ...c,
                    iconUrl: c.iconUrl === face.iconUrl ? next.iconUrl : c.iconUrl,
                    faces: c.faces.map((f, j) => (i === j ? next : f)),
                  });
                  commit({
                    ...updated,
                    blocks: updated.blocks.map((b) =>
                      b.characterId === c.id && b.iconUrl === face.iconUrl
                        ? { ...b, iconUrl: next.iconUrl }
                        : b,
                    ),
                  });
                  setError('');
                }}
              >
                <Avatar url={face.iconUrl} />
                <div>
                  <label>
                    표정 이름
                    <input name="name" defaultValue={face.name} />
                  </label>
                  <label>
                    이미지 URL
                    <input name="url" type="url" required defaultValue={face.iconUrl} />
                  </label>
                </div>
                <button>저장</button>
                <button
                  type="button"
                  onClick={() => save({ ...c, iconUrl: face.iconUrl })}
                >
                  기본 표정
                </button>
                <button
                  type="button"
                  onClick={() =>
                    save({
                      ...c,
                      iconUrl: c.iconUrl === face.iconUrl ? '' : c.iconUrl,
                      faces: c.faces.filter((_, j) => j !== i),
                    })
                  }
                >
                  삭제
                </button>
              </form>
            ))}
            <button
              onClick={() =>
                save({ ...c, faces: [...c.faces, { name: '', iconUrl: '' }] })
              }
            >
              ＋ 표정 추가
            </button>
            <p>표정을 삭제해도 기존 메시지의 이미지는 보존됩니다.</p>
          </div>
        ) : (
          <p>캐릭터를 추가하거나 로그를 불러오세요.</p>
        )}
      </div>
      {adding && (
        <dialog ref={dialog} onCancel={() => setAdding(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const name = String(data.get('name')).trim();
              if (!name || characters.some((x) => x.name === name)) {
                setError('비어 있거나 중복된 이름입니다.');
                return;
              }
              const next: Character = {
                id: crypto.randomUUID(),
                name,
                iconUrl: '',
                color: '#888888',
                faces: [],
              };
              const link = data.get('link') === 'on';
              commit({
                ...p,
                characters: [...characters, next],
                blocks: p.blocks.map((b) =>
                  link &&
                  !b.characterId &&
                  b.speaker === name &&
                  b.sourceType !== 'system'
                    ? { ...b, characterId: next.id, color: next.color }
                    : b,
                ),
              });
              setActive(next.id);
              setAdding(false);
              setError('');
            }}
          >
            <h2>캐릭터 추가</h2>
            <label>
              이름
              <input name="name" required autoFocus />
            </label>
            <label>
              <input name="link" type="checkbox" defaultChecked /> 같은 이름의 연결되지
              않은 메시지 연결
            </label>
            <p role="alert">{error}</p>
            <button>추가</button>
            <button type="button" onClick={() => setAdding(false)}>
              취소
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
      width="40"
      height="40"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : null;
}
