import {
  navigateMessages,
  moveSelectedMessages,
  type NavigationKey,
} from './keyboardNavigation';
import { Composer, type EyedropPayload } from './Composer';
import { mergeConsecutive, PAGE_SIZE } from './logOperations';
import { ToastHost, notifyError, AppErrorBoundary } from './Toast';
import { CharacterPanel, SettingsPanel } from './ProjectPanels';
import { ExportDialog } from './ExportDialog';
import { selectMessage, type SelectionAnchor, type SelectionKeys } from './selection';
import { MessageBlock } from './MessageBlock';
import { compileQuery, moveBlocks, sanitizeLiveQuery } from './query';
import { collectChannels } from './channels';
import { SYSTEM_CHARACTER_ID } from './systemCharacter';
import { SearchBar } from './SearchBar';
import { RestoreDialog } from './RestoreDialog';
import { HelpSheet, type HelpContext } from './HelpSheet';
import {
  isMeaningfulProject,
  loadAutosave,
  saveAutosave,
  type AutosavePayload,
} from './storage';
import {
  applyBulkEditToProject,
  applyBulkPatch,
  createBulkEditState,
  getBulkFaceCharacter,
  pickRepresentativeId,
  type BulkEditState,
} from './bulkEdit';
import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  const [searchActive, setSearchActive] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [find, setFind] = useState('');
  const [to, setTo] = useState('');
  const [notice, setNotice] = useState(
    '로그를 열거나 하단 입력창에서 메시지를 추가하세요.',
  );
  const [page, setPage] = useState(0);
  const [original, setOriginal] = useState(false);
  const cursorId = useRef<string | null>(null);
  const selectionAnchor = useRef<SelectionAnchor>(null);

  const setSelected = (value: Set<string>) => {
    selectionAnchor.current = null;
    cursorId.current = [...value].at(-1) ?? null;
    setSelectedRaw(value);
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkEdit, setBulkEdit] = useState<BulkEditState | null>(null);
  const [bulkReplaceOpen, setBulkReplaceOpen] = useState(false);
  const [cutIds, setCutIds] = useState<Set<string> | null>(null);
  const [pasteTarget, setPasteTarget] = useState<{ id: string; after: boolean } | null>(
    null,
  );
  const [eyedrop, setEyedrop] = useState<EyedropPayload | null>(null);
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [pendingRestore, setPendingRestore] = useState<AutosavePayload | null>(() => {
    return loadAutosave();
  });

  // 프로젝트 변경 시 디바운스 자동 보관
  useEffect(() => {
    if (!isMeaningfulProject(p)) return;
    const timer = setTimeout(() => {
      saveAutosave(p);
    }, 800);
    return () => clearTimeout(timer);
  }, [p]);

  function handleConfirmRestore() {
    if (!pendingRestore) return;
    setP(pendingRestore.project);
    setPast([]);
    setFuture([]);
    resetInteraction();
    setQuery('');
    setSearchActive(false);
    setPage(0);
    setNotice('이전 작업을 복원했습니다.');
    setPendingRestore(null);
  }

  function handleCancelRestore() {
    setPendingRestore(null);
  }

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
    predicate = compileQuery(
      searchActive ? sanitizeLiveQuery(query) : '',
      p.characters ?? [],
    );
  } catch (error) {
    queryError = String(error);
  }
  useEffect(() => {
    if (queryError) notifyError(queryError);
  }, [queryError]);

  const visible = p.blocks.filter(predicate);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE)),
    current = Math.min(page, pages - 1);
  const pendingFocus = useRef<{ id: string; direction: number; center?: boolean } | null>(
    null,
  );

  function disableSearch() {
    setQuery('');
    setSearchActive(false);
    selectionAnchor.current = null;
    setPage(0);
    searchInput.current?.blur();
  }

  function toggleSearch() {
    if (searchActive) {
      setSearchActive(false);
      selectionAnchor.current = null;
      setPage(0);
      searchInput.current?.blur();
    } else {
      setSearchActive(true);
      searchInput.current?.focus();
      searchInput.current?.select();
    }
  }

  function jumpToMessage(id: string) {
    const index = p.blocks.findIndex((b) => b.id === id);
    if (index < 0) return;
    disableSearch();
    setEditingId(null);
    setBulkEdit(null);
    setSelected(new Set([id]));
    if (cutIds) setPasteTarget({ id, after: true });
    pendingFocus.current = { id, direction: 1, center: true };
    setPage(Math.floor(index / PAGE_SIZE));
  }

  function resetInteraction() {
    setSelected(new Set());
    setEditingId(null);
    setBulkEdit(null);
    setBulkReplaceOpen(false);
    setCutIds(null);
    setPasteTarget(null);
    pendingFocus.current = null;
  }

  function eyedropBlock(b: Block) {
    const isSystem = b.sourceType === 'system' || b.characterId === SYSTEM_CHARACTER_ID;
    const linked = b.characterId
      ? (p.characters ?? []).find((c) => c.id === b.characterId)
      : undefined;
    const speaker = isSystem ? '시스템' : (linked?.name ?? b.speaker ?? '');
    const characterId = isSystem ? SYSTEM_CHARACTER_ID : (b.characterId ?? null);
    const iconUrl = isSystem ? '' : (b.iconUrl ?? '');
    const channel = b.channel ?? '';
    const color = isSystem ? '' : (linked?.color ?? b.color ?? '');
    setEyedrop({
      speaker,
      characterId,
      iconUrl,
      channel,
      color,
      key: Date.now() + Math.random(),
    });
    setNotice(`‘${speaker || '캐릭터 없음'}’ 캐릭터 정보를 입력창에 가져왔습니다.`);
  }

  function startCutMode() {
    if (!selected.size || editingId || bulkEdit || cutIds) return;
    const ids = new Set(selected);
    setCutIds(ids);
    setReplaceOpen(false);
    const anchorId = cursorId.current ?? [...selected].at(-1) ?? null;
    setPasteTarget(anchorId ? { id: anchorId, after: true } : null);
    setNotice(
      `${ids.size}개 블록을 오려두었습니다. 이동할 위치에서 Ctrl+V 또는 ‘이 곳에 붙여넣기’를 누르세요.`,
    );
  }

  function cancelCutMode() {
    setCutIds(null);
    setPasteTarget(null);
    setNotice('오려붙이기를 취소했습니다.');
  }

  function executePaste(targetId?: string, after?: boolean) {
    if (!cutIds || !cutIds.size) return;
    const resolvedId =
      targetId ?? pasteTarget?.id ?? cursorId.current ?? [...selected].at(-1);
    const resolvedAfter = after ?? pasteTarget?.after ?? true;
    if (!resolvedId) return;
    const count = cutIds.size;
    const blocks = moveBlocks(p.blocks, cutIds, resolvedId, resolvedAfter);
    if (blocks !== p.blocks) commit({ ...p, blocks });
    setSelected(new Set(cutIds));
    setCutIds(null);
    setPasteTarget(null);
    setNotice(`${count}개 블록을 붙여넣었습니다.`);
  }

  function undo() {
    if (!past.length) return;
    setFuture([p, ...future]);
    setP(past[past.length - 1]);
    setPast(past.slice(0, -1));
    resetInteraction();
  }

  function redo() {
    if (!future.length) return;
    setPast([...past, p].slice(-100));
    setP(future[0]);
    setFuture(future.slice(1));
    resetInteraction();
  }

  function deleteSelected() {
    const ids = bulkEdit ? bulkEdit.selectedIds : selected;
    if (!ids.size) return;
    const count = ids.size;
    commit({ ...p, blocks: p.blocks.filter((b) => !ids.has(b.id)) });
    resetInteraction();
    setNotice(`${count}개 블록을 삭제했습니다.`);
  }

  function startBulkEdit() {
    if (selected.size < 2) return;
    const repId = pickRepresentativeId(p.blocks, visible, selected, cursorId.current);
    if (!repId) return;
    const repBlock = p.blocks.find((b) => b.id === repId);
    if (!repBlock) return;
    setEditingId(null);
    setBulkReplaceOpen(false);
    setBulkEdit(createBulkEditState(repId, selected, repBlock));
    const visibleIdx = visible.findIndex((b) => b.id === repId);
    if (visibleIdx >= 0) setPage(Math.floor(visibleIdx / PAGE_SIZE));
    pendingFocus.current = { id: repId, direction: 1 };
  }

  function saveBulkEdit() {
    if (!bulkEdit) return;
    const count = bulkEdit.selectedIds.size;
    commit(applyBulkEditToProject(p, bulkEdit));
    setBulkEdit(null);
    setBulkReplaceOpen(false);
    setNotice(`${count}개 블록을 일괄 편집했습니다.`);
  }

  function addMessage(b: Block) {
    const last = p.blocks.findLastIndex((x) => selected.has(x.id));
    const index = last < 0 ? p.blocks.length : last + 1;
    const blocks = [...p.blocks];
    blocks.splice(index, 0, b);
    commit({ ...p, blocks });
    setSelected(new Set([b.id]));
    setBulkEdit(null);
    setQuery('');
    setSearchActive(false);
    setPage(Math.floor(index / PAGE_SIZE));
  }

  useEffect(() => {
    const onHelpKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || e.isComposing) return;
      if (e.key === 'Escape' && helpOpen) {
        e.preventDefault();
        setHelpOpen(false);
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable=true]')) return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onHelpKey);
    return () => window.removeEventListener('keydown', onHelpKey);
  }, [helpOpen]);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (tab !== '로그' || document.querySelector('dialog[open]')) return;
      if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (!e.repeat) toggleSearch();
        return;
      }
      if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'h') {
        if (cutIds) return;
        e.preventDefault();
        if (!e.repeat) {
          if (bulkEdit) setBulkReplaceOpen((v) => !v);
          else setReplaceOpen((v) => !v);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (cutIds) {
          cancelCutMode();
          return;
        }
        if (bulkEdit) {
          setBulkEdit(null);
          setBulkReplaceOpen(false);
          return;
        }
        setSelected(new Set());
        setEditingId(null);
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target.closest('input,textarea,select,[contenteditable=true]') ||
        editingId ||
        bulkEdit ||
        e.isComposing
      )
        return;
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && !cutIds) {
        e.preventDefault();
        setComposerFocusRequest((n) => n + 1);
        return;
      }
      if (e.ctrlKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (cutIds) {
          if (key === 'v') {
            e.preventDefault();
            executePaste();
            return;
          }
          if (key === 'a') {
            e.preventDefault();
            setQuery('');
            setSearchActive(false);
            setSelected(new Set(p.blocks.map((b) => b.id)));
          }
          return;
        }
        if (key === 'c' && !e.shiftKey && !window.getSelection()?.toString()) {
          const targetId = cursorId.current ?? [...selected][0];
          const targetBlock = targetId
            ? p.blocks.find((b) => b.id === targetId)
            : undefined;
          if (targetBlock) {
            e.preventDefault();
            eyedropBlock(targetBlock);
            return;
          }
        }
        if (key === 'x' && selected.size) {
          e.preventDefault();
          startCutMode();
          return;
        }
        if (e.shiftKey && e.key === 'Enter' && selected.size >= 2) {
          e.preventDefault();
          startBulkEdit();
          return;
        }
        if (key === 'z' || key === 'y') {
          e.preventDefault();
          if (key === 'y' || e.shiftKey) redo();
          else undo();
          return;
        }
        if (key === 'a') {
          e.preventDefault();
          setQuery('');
          setSearchActive(false);
          setSelected(new Set(p.blocks.map((b) => b.id)));
          return;
        }
      }
      if (target.closest('button')) return;
      if (e.key === 'Delete') {
        if (cutIds) return;
        if (selected.size) e.preventDefault();
        deleteSelected();
        return;
      }
      const arrow = e.key === 'ArrowUp' || e.key === 'ArrowDown';
      if (e.altKey && arrow) {
        if (cutIds) return;
        const id = cursorId.current ?? [...selected].at(-1);
        if (!id || !selected.has(id)) return;
        e.preventDefault();
        const direction = e.key === 'ArrowDown' ? 1 : -1;
        const blocks = moveSelectedMessages(p.blocks, selected, direction);
        if (blocks === p.blocks) return;
        commit({ ...p, blocks });
        pendingFocus.current = { id, direction };
        const index = blocks.filter(predicate).findIndex((b) => b.id === id);
        if (index >= 0) setPage(Math.floor(index / PAGE_SIZE));
        return;
      }
      if (
        e.altKey ||
        !['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)
      )
        return;
      const wholeLog = e.key === 'Home' || e.key === 'End';
      const order = (wholeLog ? p.blocks : visible).map((b) => b.id);
      const next = navigateMessages(
        order,
        cursorId.current,
        selected,
        e.key as NavigationKey,
        e.ctrlKey && arrow,
      );
      if (!next) return;
      e.preventDefault();
      if (wholeLog) {
        setQuery('');
        setSearchActive(false);
      }
      cursorId.current = next.id;
      selectionAnchor.current = { id: next.id, selected: true };
      pendingFocus.current = { id: next.id, direction: next.direction };
      setSelectedRaw(next.selected);
      if (cutIds) {
        const beforeFirst = e.key === 'Home' || (e.key === 'ArrowUp' && next.index === 0);
        setPasteTarget({ id: next.id, after: !beforeFirst });
      }
      setPage(Math.floor(next.index / PAGE_SIZE));
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [
    tab,
    visible,
    selected,
    editingId,
    bulkEdit,
    cutIds,
    pasteTarget,
    past,
    future,
    searchActive,
  ]);

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
    // Allow the first and last messages to reach the center as well.
    if (request.center) {
      const room = Math.max(
        0,
        (scroller.clientHeight - node.getBoundingClientRect().height) / 2,
      );
      scroller.style.paddingTop = `${room}px`;
      scroller.style.paddingBottom = `${room}px`;
    } else {
      scroller.style.paddingTop = '';
      scroller.style.paddingBottom = '';
    }
    node.focus({ preventScroll: true });
    const rect = node.getBoundingClientRect(),
      bounds = scroller.getBoundingClientRect();
    if (request.center) {
      scroller.scrollTop +=
        rect.top - bounds.top - (scroller.clientHeight - rect.height) / 2;
      return;
    }
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
  }, [selected, current, p.blocks, searchActive, query, bulkEdit]);

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

  const channels = useMemo(() => collectChannels(p.blocks), [p.blocks]);

  const bulkTargetBlocks = bulkEdit
    ? p.blocks.filter((b) => bulkEdit.selectedIds.has(b.id))
    : [];
  const bulkFaceCharacter = bulkEdit
    ? getBulkFaceCharacter(p.blocks, bulkEdit, p.characters ?? [])
    : undefined;
  const bulkMixedSpeakers = bulkEdit
    ? new Set(
        bulkTargetBlocks.map((b) =>
          b.sourceType === 'system'
            ? 'system'
            : `${b.characterId ?? ''}:${b.speaker ?? ''}`,
        ),
      ).size > 1
    : false;
  const bulkMixedChannels = bulkEdit
    ? new Set(bulkTargetBlocks.map((b) => b.channel ?? '')).size > 1
    : false;
  const bulkHasAnyDice = bulkEdit ? bulkTargetBlocks.some((b) => !!b.diceResult) : false;
  const bulkRepOriginalText = bulkEdit
    ? (p.blocks.find((b) => b.id === bulkEdit.repId)?.text ?? '')
    : '';
  const bulkReplaceMatchCount =
    bulkEdit && bulkEdit.replaceFind
      ? bulkTargetBlocks.filter((b) => b.text.includes(bulkEdit.replaceFind)).length
      : 0;

  const helpContext: HelpContext =
    tab === '캐릭터'
      ? 'characters'
      : tab === '설정'
        ? 'settings'
        : cutIds
          ? 'log-cut'
          : bulkEdit
            ? 'log-bulk'
            : editingId
              ? 'log-editing'
              : 'log';

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <span className="brand-mark">LOG DIRECTOR</span>
          <nav className="top-tabs" aria-label="작업 화면 전환">
            {['로그', '캐릭터', '설정'].map((name) => (
              <button
                type="button"
                key={name}
                disabled={!!cutIds && name !== '로그'}
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              className="top-tab-help"
              aria-label="단축키 및 컨텍스트 도움말 (?)"
              aria-expanded={helpOpen}
              aria-pressed={helpOpen}
              title="단축키 및 컨텍스트 도움말 (?)"
              onClick={() => setHelpOpen((v) => !v)}
            >
              도움말
            </button>
          </nav>
          <input
            className="header-title-input"
            aria-label="프로젝트 제목"
            title="프로젝트 제목 편집"
            placeholder="제목 없는 로그"
            disabled={!!cutIds}
            value={p.title}
            onChange={(e) => commit({ ...p, title: e.target.value })}
          />
        </div>
        <div className="header-actions">
          <label
            className="button compact-btn"
            title="JSON, HTML, Markdown, TXT 로그 또는 프로젝트 JSON 열기"
          >
            열기
            <input
              type="file"
              accept=".json,.html,.htm,.md,.markdown,.txt"
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
                  resetInteraction();
                  setQuery('');
                  setSearchActive(false);
                  setPage(0);
                  setNotice(
                    `${next.blocks.length.toLocaleString()}개 블록을 불러왔습니다.`,
                  );
                } catch (err) {
                  notifyError(err);
                } finally {
                  e.target.value = '';
                }
              }}
            />
          </label>
          <button
            type="button"
            className="compact-btn"
            title="프로젝트 저장 (.project.json)"
            onClick={() => save(JSON.stringify(p, null, 2), p.title + '.project.json')}
          >
            저장
          </button>
          <button
            type="button"
            className="primary compact-btn"
            onClick={() => setExportOpen(true)}
          >
            내보내기
          </button>
        </div>
      </header>

      {pendingRestore && (
        <RestoreDialog
          autosave={pendingRestore}
          onConfirm={handleConfirmRestore}
          onCancel={handleCancelRestore}
        />
      )}
      {exportOpen && <ExportDialog project={p} onClose={() => setExportOpen(false)} />}
      {helpOpen && <HelpSheet context={helpContext} onClose={() => setHelpOpen(false)} />}
      {tab === '캐릭터' && <CharacterPanel project={p} commit={commit} />}
      {tab === '설정' && (
        <div className="settings-scroll">
          <div className="settings-container">
            <SettingsPanel project={p} commit={commit} />
            <section className="settings-card">
              <h2>작업 공간 및 원본 보관함</h2>
              <div className="settings-row">
                <label className="stack-field">
                  <span>프로젝트 제목</span>
                  <input
                    aria-label="설정 프로젝트 제목"
                    value={p.title}
                    onChange={(e) => commit({ ...p, title: e.target.value })}
                  />
                </label>
                <div className="stats-pills">
                  <span className="count-pill">
                    블록 {p.blocks.length.toLocaleString()}
                  </span>
                  <span className="count-pill">캐릭터 {(p.characters ?? []).length}</span>
                  <span className="count-pill">선택 {selected.size}</span>
                </div>
              </div>
              <div className="original-box">
                <div className="original-box-head">
                  <div>
                    <strong>보관된 원본</strong>
                    <span className="muted-note">
                      {p.original?.name ?? '원본 파일 없음 (새로 작성)'}
                    </span>
                  </div>
                  <div className="original-box-actions">
                    <button
                      type="button"
                      className="compact-btn"
                      disabled={!p.original}
                      onClick={() => setOriginal(!original)}
                    >
                      {original ? '원본 닫기' : '원본 보기'}
                    </button>
                    <button
                      type="button"
                      className="compact-btn"
                      disabled={!p.original}
                      onClick={() => p.original && save(p.original.raw, p.original.name)}
                    >
                      원문 내려받기
                    </button>
                  </div>
                </div>
                <small className="muted-note">
                  원본 문자열과 모든 원본 필드는 프로젝트 안에 별도 보존되며 편집 시
                  훼손되지 않습니다.
                </small>
                {original && <pre className="original">{p.original?.raw}</pre>}
              </div>
            </section>
          </div>
        </div>
      )}

      <div className="workspace" style={{ display: tab === '로그' ? undefined : 'none' }}>
        <main className="log-editor">
          <div className="toolbar">
            <div className="toolbar-search">
              <SearchBar
                inputRef={searchInput}
                query={query}
                searchActive={searchActive}
                blocks={p.blocks}
                characters={p.characters ?? []}
                channels={channels}
                onActivate={() => setSearchActive(true)}
                onChangeQuery={(nextQuery) => {
                  selectionAnchor.current = null;
                  setSearchActive(true);
                  setQuery(nextQuery);
                  setPage(0);
                }}
              />
              <button
                type="button"
                className="compact-btn filter-toggle-btn"
                aria-pressed={searchActive}
                onClick={toggleSearch}
                title="검색 필터 켜기/끄기 (Ctrl+F)"
              >
                {searchActive ? '필터 ON' : '필터 OFF'}
              </button>
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-actions">
              <button
                type="button"
                className="compact-btn"
                disabled={!past.length || !!bulkEdit || !!cutIds}
                onClick={undo}
                title="되돌리기 (Ctrl+Z)"
              >
                ↶
              </button>
              <button
                type="button"
                className="compact-btn"
                disabled={!future.length || !!bulkEdit || !!cutIds}
                onClick={redo}
                title="다시 하기 (Ctrl+Y / Ctrl+Shift+Z)"
              >
                ↷
              </button>
              <button
                type="button"
                className="compact-btn"
                disabled={!visible.length || !!bulkEdit}
                onClick={() => setSelected(new Set(visible.map((b) => b.id)))}
                title="현재 목록 전체 선택"
              >
                전체 선택
              </button>
              <button
                type="button"
                className="compact-btn"
                disabled={!selected.size || !!bulkEdit}
                onClick={() => setSelected(new Set())}
              >
                해제
              </button>
              <button
                type="button"
                className="compact-btn"
                disabled={(!selected.size && !cutIds) || !!bulkEdit || !!editingId}
                aria-pressed={!!cutIds}
                onClick={() => (cutIds ? cancelCutMode() : startCutMode())}
                title={
                  cutIds ? '오려붙이기 취소 (Esc)' : '선택한 메시지 오려붙이기 (Ctrl+X)'
                }
              >
                {cutIds ? '오리기 취소' : '오려붙이기'}
              </button>
              <button
                type="button"
                className="compact-btn"
                disabled={selected.size < 2 || !!bulkEdit || !!cutIds}
                aria-pressed={!!bulkEdit}
                onClick={startBulkEdit}
                title="선택한 여러 메시지 일괄 편집 (Ctrl+Shift+Enter)"
              >
                일괄 편집
              </button>
              <button
                type="button"
                className="compact-btn"
                disabled={selected.size < 2 || !!bulkEdit || !!cutIds}
                title="선택한 메시지 중 캐릭터·채널·유형이 같은 연속 메시지 병합"
                onClick={() => {
                  const blocks = mergeConsecutive(p.blocks, selected);
                  const mergedCount = p.blocks.length - blocks.length;
                  if (!mergedCount) {
                    setNotice('선택한 메시지 중 병합할 연속 메시지가 없습니다.');
                    return;
                  }
                  commit({ ...p, blocks });
                  setSelected(new Set());
                  setEditingId(null);
                  setNotice(`${mergedCount}개 블록을 병합했습니다.`);
                }}
              >
                연속 병합
              </button>
              <button
                type="button"
                className="compact-btn"
                disabled={!!cutIds}
                aria-pressed={bulkEdit ? bulkReplaceOpen : replaceOpen}
                onClick={() =>
                  bulkEdit ? setBulkReplaceOpen((v) => !v) : setReplaceOpen((v) => !v)
                }
                title="일괄 치환 열기/닫기 (Ctrl+H)"
              >
                일괄 치환
              </button>
              <button
                type="button"
                className="compact-btn danger"
                disabled={(!selected.size && !bulkEdit) || !!cutIds}
                onClick={deleteSelected}
                title="선택 블록 삭제 (Delete)"
              >
                {bulkEdit
                  ? `삭제 (${bulkEdit.selectedIds.size})`
                  : selected.size
                    ? `삭제 (${selected.size})`
                    : '삭제'}
              </button>
            </div>

            <div className="toolbar-pagination">
              <span className="count-pill" title="현재 표시 중인 블록 수">
                {visible.length.toLocaleString()}건
              </span>
              <button
                type="button"
                className="compact-btn icon-btn"
                aria-label="이전 페이지"
                disabled={!current}
                onClick={() => setPage(current - 1)}
              >
                ◀
              </button>
              <span className="page-indicator">
                {current + 1} / {pages}
              </span>
              <button
                type="button"
                className="compact-btn icon-btn"
                aria-label="다음 페이지"
                disabled={current + 1 >= pages}
                onClick={() => setPage(current + 1)}
              >
                ▶
              </button>
            </div>
          </div>

          {replaceOpen && (
            <div className="replace-bar">
              <span className="count-pill">선택 {selected.size}개 대상</span>
              <input
                aria-label="찾을 문자열"
                placeholder="찾을 문자열"
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
              <span className="replace-arrow">→</span>
              <input
                aria-label="바꿀 문자열"
                placeholder="바꿀 문자열"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              <button
                type="button"
                className="primary compact-btn"
                disabled={!find || !selected.size}
                onClick={() => {
                  const count = p.blocks.filter(
                    (b) => selected.has(b.id) && b.text.includes(find),
                  ).length;
                  if (!count) {
                    setNotice('선택된 블록에서 일치하는 문자열을 찾지 못했습니다.');
                    return;
                  }
                  if (
                    confirm(
                      `${count}개 블록의 본문에서 “${find}” → “${to}”로 모두 치환할까요?`,
                    )
                  ) {
                    commit(replaceBlocks(p, selected, find, to));
                    setNotice(
                      `${count}개 블록 치환 완료. Ctrl+Z로 한 번에 취소할 수 있습니다.`,
                    );
                  }
                }}
              >
                치환 적용
              </button>
              <button
                type="button"
                className="ghost icon-btn"
                aria-label="치환 바 닫기"
                onClick={() => setReplaceOpen(false)}
              >
                ×
              </button>
            </div>
          )}

          <div className="log-scroll">
            <div className="log-list">
              {!visible.length && (
                <div className="empty">
                  <h2>
                    {p.blocks.length
                      ? '검색 조건과 일치하는 메시지가 없습니다.'
                      : '로그가 비어있습니다.'}
                  </h2>
                  <p>
                    {p.blocks.length
                      ? '검색어를 수정하거나 필터를 꺼보세요.'
                      : '상단에서 JSON 파일을 열거나 아래 입력창에서 메시지를 작성하세요.'}
                  </p>
                </div>
              )}
              {visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((b) => {
                const isBulkTarget = !!bulkEdit?.selectedIds.has(b.id);
                const isBulkRep = bulkEdit?.repId === b.id;
                const displayBlock =
                  isBulkTarget && bulkEdit ? applyBulkPatch(b, bulkEdit) : b;

                return (
                  <MessageBlock
                    key={b.id}
                    block={displayBlock}
                    characters={p.characters}
                    channels={channels}
                    display={p.display}
                    editing={!bulkEdit && !cutIds && editingId === b.id}
                    setEditing={(value) => {
                      if (bulkEdit || cutIds) return;
                      setEditingId(value ? b.id : null);
                    }}
                    selected={isBulkTarget || (!bulkEdit && selected.has(b.id))}
                    cut={!!cutIds?.has(b.id)}
                    cutMode={!!cutIds}
                    pasteIndicator={
                      cutIds && pasteTarget?.id === b.id
                        ? pasteTarget.after
                          ? 'after'
                          : 'before'
                        : undefined
                    }
                    onPasteHover={
                      cutIds
                        ? (after) =>
                            setPasteTarget((prev) =>
                              prev?.id === b.id && prev.after === after
                                ? prev
                                : { id: b.id, after },
                            )
                        : undefined
                    }
                    onPasteHere={
                      cutIds ? (after) => executePaste(b.id, after) : undefined
                    }
                    bulkTarget={isBulkTarget && !isBulkRep}
                    bulkDisabled={!!bulkEdit && !isBulkRep}
                    bulkContext={
                      isBulkRep && bulkEdit
                        ? {
                            count: bulkEdit.selectedIds.size,
                            state: bulkEdit,
                            originalRepText: bulkRepOriginalText,
                            faceCharacter: bulkFaceCharacter,
                            mixedSpeakers: bulkMixedSpeakers,
                            mixedChannels: bulkMixedChannels,
                            hasAnyDice: bulkHasAnyDice,
                            replaceOpen: bulkReplaceOpen,
                            replaceMatchCount: bulkReplaceMatchCount,
                            onToggleReplace: () => setBulkReplaceOpen((v) => !v),
                            onCloseReplace: () => setBulkReplaceOpen(false),
                            onChangeState: (updater) =>
                              setBulkEdit((prev) => (prev ? updater(prev) : null)),
                            onSave: saveBulkEdit,
                            onCancel: () => {
                              setBulkEdit(null);
                              setBulkReplaceOpen(false);
                            },
                            onDelete: deleteSelected,
                          }
                        : undefined
                    }
                    onJump={
                      !bulkEdit && searchActive && query.trim() && selected.has(b.id)
                        ? () => jumpToMessage(b.id)
                        : undefined
                    }
                    onEyedrop={() => eyedropBlock(b)}
                    toggle={(keys: SelectionKeys) => {
                      if (bulkEdit) return;
                      const next = selectMessage(
                        selected,
                        selectionAnchor.current,
                        visible.map((item) => item.id),
                        b.id,
                        keys,
                      );
                      cursorId.current = b.id;
                      selectionAnchor.current = next.anchor;
                      setSelectedRaw(next.selected);
                      if (cutIds) setPasteTarget({ id: b.id, after: true });
                    }}
                    save={(next) => edit(b.id, next)}
                    remove={() => {
                      commit({ ...p, blocks: p.blocks.filter((x) => x.id !== b.id) });
                      setSelected(new Set([...selected].filter((id) => id !== b.id)));
                    }}
                    drop={(id, after) => {
                      if (bulkEdit || cutIds) return;
                      const movingIds =
                        selected.has(id) && selected.size > 1 ? selected : new Set([id]);
                      const blocks = moveBlocks(p.blocks, movingIds, b.id, after);
                      if (blocks !== p.blocks) commit({ ...p, blocks });
                    }}
                  />
                );
              })}
            </div>
          </div>

          <Composer
            characters={p.characters ?? []}
            channels={channels}
            send={addMessage}
            disabled={!!cutIds || !!bulkEdit}
            eyedrop={eyedrop}
            focusRequest={composerFocusRequest}
          />

          <div className="status-bar">
            <span role="status" className="status-notice">
              {notice}
            </span>
            <span className="status-meta">
              전체 {p.blocks.length.toLocaleString()} · 선택{' '}
              {selected.size.toLocaleString()}
            </span>
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
