import { Composer } from './Composer';
import { mergeConsecutive, PAGE_SIZE } from './logOperations';
import { ToastHost, notifyError, AppErrorBoundary } from './Toast';
import { CharacterPanel, SettingsPanel } from './ProjectPanels';
import { ExportDialog } from './ExportDialog';
import { selectMessage, type SelectionAnchor, type SelectionKeys } from './selection';
import { MessageBlock } from './MessageBlock';
import { compileQuery, reorder } from './query';
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { blank, parse, replaceBlocks, type Project, type Block } from './core';
import './style.css';
import './workspace-layout.css';
function App() {
  const [tab, setTab] = useState('로그');
  const [exportOpen, setExportOpen] = useState(false);
  const [p, setP] = useState<Project>(blank);
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [selected, setSelectedRaw] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [find, setFind] = useState('');
  const [to, setTo] = useState('');
  const [notice, setNotice] = useState('로그를 열거나 새 블록을 추가하세요.');
  const [page, setPage] = useState(0);
  const [original, setOriginal] = useState(false);
  const selectionAnchor = useRef<SelectionAnchor>(null);
  const setSelected = (value: Set<string>) => {
    selectionAnchor.current = null;
    setSelectedRaw(value);
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const commit = (next: Project) => {
    setPast((x) => [...x, p].slice(-100));
    setFuture([]);
    setP(next);
  };
  const edit = (id: string, patch: Partial<Block>) =>
    commit({ ...p, blocks: p.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  let queryError = '';
  let predicate: (b: Block) => boolean = () => false;
  try {
    predicate = compileQuery(query);
  } catch (error) {
    queryError = String(error);
  }
  useEffect(() => {
    if (queryError) notifyError(queryError);
  }, [queryError]);
  const visible = p.blocks.filter(predicate);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE)),
    current = Math.min(page, pages - 1);
  const pendingFocus = useRef<{ id: string; direction: number } | null>(null);
  function addMessage(b: Block) {
    const last = p.blocks.findLastIndex((x) => selected.has(x.id));
    const index = last < 0 ? p.blocks.length : last + 1;
    const blocks = [...p.blocks];
    blocks.splice(index, 0, b);
    commit({ ...p, blocks });
    setSelected(new Set([b.id]));
    setQuery('');
    setPage(Math.floor(index / PAGE_SIZE));
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (tab !== '로그' || document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') {
        setSelected(new Set());
        setEditingId(null);
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,button,[contenteditable=true]',
        ) ||
        editingId
      )
        return;
      if (!['ArrowUp', 'ArrowDown'].includes(e.key) || !visible.length) return;
      e.preventDefault();
      const direction = e.key === 'ArrowDown' ? 1 : -1;
      const anchor = selectionAnchor.current?.id ?? [...selected].at(-1);
      const old = visible.findIndex((b) => b.id === anchor);
      const index = Math.max(
        0,
        Math.min(visible.length - 1, old < 0 ? 0 : old + direction),
      );
      const id = visible[index].id;
      pendingFocus.current = { id, direction };
      setSelected(new Set([id]));
      setPage(Math.floor(index / PAGE_SIZE));
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [tab, visible, selected, editingId]);
  useEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('.log-scroll [data-message-id]'),
    );
    const index = nodes.findIndex((n) => n.dataset.messageId === request.id);
    const node = nodes[index];
    const scroller = document.querySelector<HTMLElement>('.log-scroll');
    if (!node || !scroller) return;
    pendingFocus.current = null;
    node.focus({ preventScroll: true });
    const rect = node.getBoundingClientRect(),
      bounds = scroller.getBoundingClientRect();
    const neighbors = [
      nodes[index + request.direction],
      nodes[index + 2 * request.direction],
    ].filter(Boolean);
    const margin = Math.min(
      300,
      neighbors.reduce((sum, n) => sum + n.getBoundingClientRect().height, 0),
      Math.max(0, scroller.clientHeight - rect.height),
    );
    if (request.direction > 0 && rect.bottom + margin > bounds.bottom)
      scroller.scrollTop += rect.bottom + margin - bounds.bottom;
    else if (request.direction < 0 && rect.top - margin < bounds.top)
      scroller.scrollTop += rect.top - margin - bounds.top;
  }, [selected, current]);
  function save(value: string, name: string) {
    const u = URL.createObjectURL(
      new Blob([value], { type: 'application/json;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function move(id: string, delta: number) {
    const bs = [...p.blocks],
      i = bs.findIndex((b) => b.id === id),
      j = i + delta;
    if (j < 0 || j >= bs.length) return;
    [bs[i], bs[j]] = [bs[j], bs[i]];
    commit({ ...p, blocks: bs });
  }
  return (
    <>
      <header>
        <div>
          <b>LOG DIRECTOR</b>
        </div>
        <label className="button">
          열기
          <input
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const next = parse(await f.text(), f.name);
                if (
                  p.blocks.length &&
                  !confirm(
                    '현재 작업을 교체합니다. 저장하지 않은 편집은 사라집니다. 계속할까요?',
                  )
                )
                  return;
                setP(next);
                setPast([]);
                setFuture([]);
                setSelected(new Set());
                setQuery('');
                setPage(0);
                setNotice(`${next.blocks.length}개 블록을 불러왔습니다.`);
              } catch (err) {
                notifyError(err);
              } finally {
                e.target.value = '';
              }
            }}
          />
        </label>
        <button
          onClick={() => save(JSON.stringify(p, null, 2), p.title + '.project.json')}
        >
          프로젝트 저장
        </button>
        <button onClick={() => setExportOpen(true)}>내보내기</button>
      </header>
      <nav className="top-tabs">
        {['로그', '캐릭터', '설정'].map((name) => (
          <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </nav>
      {exportOpen && <ExportDialog project={p} onClose={() => setExportOpen(false)} />}
      {tab === '캐릭터' && <CharacterPanel project={p} commit={commit} />}
      {tab === '설정' && (
        <div className="settings-scroll">
          <SettingsPanel project={p} commit={commit} />
          <section className="project-panel">
            {' '}
            <h2>작업 공간</h2>
            <input
              aria-label="프로젝트 제목"
              value={p.title}
              onChange={(e) => commit({ ...p, title: e.target.value })}
            />
            <p>
              {p.blocks.length.toLocaleString()}개 블록 · {selected.size}개 선택
            </p>
            <button
              disabled={!selected.size}
              onClick={() => {
                commit({ ...p, blocks: p.blocks.filter((b) => !selected.has(b.id)) });
                setSelected(new Set());
              }}
            >
              선택 블록 제거
            </button>
            <div className="row">
              <button
                disabled={!past.length}
                onClick={() => {
                  setFuture([p, ...future]);
                  setP(past[past.length - 1]);
                  setPast(past.slice(0, -1));
                  setSelected(new Set());
                }}
              >
                ↶ 취소
              </button>
              <button
                disabled={!future.length}
                onClick={() => {
                  setPast([...past, p]);
                  setP(future[0]);
                  setFuture(future.slice(1));
                  setSelected(new Set());
                }}
              >
                ↷ 다시
              </button>
            </div>
            <h2>원본 보관함</h2>
            <p>{p.original?.name ?? '새로 작성한 로그'}</p>
            <button disabled={!p.original} onClick={() => setOriginal(!original)}>
              원본 보기 / 닫기
            </button>
            <button
              disabled={!p.original}
              onClick={() => p.original && save(p.original.raw, p.original.name)}
            >
              보관된 원문 내려받기
            </button>
            <small>
              원본 문자열과 모든 원본 필드는 프로젝트 안에 별도로 보존됩니다. 제거는
              편집본에만 적용됩니다.
            </small>
            {original && <pre className="original">{p.original?.raw}</pre>}
          </section>
        </div>
      )}
      <div className="workspace" style={{ display: tab === '로그' ? undefined : 'none' }}>
        <aside className="log-sidebar">
          <div className="log-sidebar-tools">
            <h2>일괄 치환</h2>
            <p>선택한 블록의 본문에 적용합니다.</p>
            <input
              aria-label="찾을 문자열"
              placeholder="찾을 문자열"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
            <input
              aria-label="바꿀 문자열"
              placeholder="바꿀 문자열"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <button
              disabled={!find || !selected.size}
              onClick={() => {
                const count = p.blocks.filter(
                  (b) => selected.has(b.id) && b.text.includes(find),
                ).length;
                if (
                  count &&
                  confirm(
                    `${count}개 블록의 본문에서 “${find}” → “${to}”로 모두 치환할까요?`,
                  )
                ) {
                  commit(replaceBlocks(p, selected, find, to));
                  setNotice(
                    `${count}개 블록 치환 완료. 한 번에 실행 취소할 수 있습니다.`,
                  );
                }
              }}
            >
              치환 검토 및 적용
            </button>
            <button
              onClick={() => {
                const blocks = mergeConsecutive(p.blocks);
                commit({ ...p, blocks });
                setSelected(new Set());
                setEditingId(null);
                setNotice(`${p.blocks.length - blocks.length}개 블록을 병합했습니다.`);
              }}
            >
              연속 메시지 병합
            </button>
          </div>
          <Composer characters={p.characters ?? []} send={addMessage} />
        </aside>
        <main className="log-editor">
          <div className="toolbar">
            <input
              aria-label="로그 검색"
              placeholder="화자, 본문, 판정 검색…"
              value={query}
              onChange={(e) => {
                selectionAnchor.current = null;
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <button onClick={() => setSelected(new Set(visible.map((b) => b.id)))}>
              검색 결과 전체 선택
            </button>
            <button onClick={() => setSelected(new Set())}>선택 해제</button>
          </div>
          <div className="log-scroll">
            <p className="query-help">
              speaker:제타 text:"급한 일" · 화자:GM · -내용:잡담 · channel:메인
              <br />
              공백으로 조건을 연결하면 모두 만족하는 메시지를 찾습니다. 클릭: 단일 선택 ·
              Ctrl+클릭: 추가/해제 · Shift+클릭: 직전 동작으로 구간 선택/해제 · 더블클릭:
              편집 · 메시지를 끌어 순서 변경
            </p>

            <p role="status" className="notice">
              {notice}
            </p>

            <div className="row">
              <span>검색 결과 {visible.length}개</span>
              <button disabled={!current} onClick={() => setPage(current - 1)}>
                이전
              </button>
              <span>
                {current + 1} / {pages}
              </span>
              <button
                disabled={current + 1 >= pages}
                onClick={() => setPage(current + 1)}
              >
                다음
              </button>
            </div>
            {!visible.length && (
              <div className="empty">
                <h1>로그가 비어있습니다.</h1>
                <p>JSON을 열거나 왼쪽 채팅창에서 메시지를 입력하세요.</p>
              </div>
            )}
            {visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((b) => (
              <MessageBlock
                key={b.id}
                block={b}
                characters={p.characters}
                display={p.display}
                editing={editingId === b.id}
                setEditing={(value) => setEditingId(value ? b.id : null)}
                selected={selected.has(b.id)}
                toggle={(keys: SelectionKeys) => {
                  const next = selectMessage(
                    selected,
                    selectionAnchor.current,
                    visible.map((item) => item.id),
                    b.id,
                    keys,
                  );
                  selectionAnchor.current = next.anchor;
                  setSelectedRaw(next.selected);
                }}
                save={(next) => edit(b.id, next)}
                remove={() => {
                  commit({ ...p, blocks: p.blocks.filter((x) => x.id !== b.id) });
                  setSelected(new Set([...selected].filter((id) => id !== b.id)));
                }}
                drop={(id, after) => {
                  const blocks = reorder(p.blocks, id, b.id, after);
                  if (blocks !== p.blocks) commit({ ...p, blocks });
                }}
              />
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <>
    <ToastHost />
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </>,
);
