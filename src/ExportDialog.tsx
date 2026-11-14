import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block, Project } from './core';
import { exportLog, type ExportFormat } from './export';
import { collectChannels } from './channels';
import { compileQuery, sanitizeLiveQuery } from './query';
import { SearchBar } from './SearchBar';

const formats: {
  id: ExportFormat;
  label: string;
  description: string;
  btnClass: string;
}[] = [
  {
    id: 'html',
    label: 'HTML',
    description: '초상화·색상이 포함된 웹 문서',
    btnClass: 'mb-led-btn-primary',
  },
  {
    id: 'txt',
    label: 'TXT',
    description: '화자·시각·본문 일반 텍스트',
    btnClass: 'mb-led-btn-txt',
  },
  {
    id: 'json',
    label: 'JSON',
    description: '완성 로그 데이터 (프로젝트와 별개)',
    btnClass: 'mb-led-btn-json',
  },
  {
    id: 'md',
    label: 'Markdown',
    description: '제목·화자·시스템 인용문',
    btnClass: 'mb-led-btn-md',
  },
];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error());
    reader.onerror = () => reject(reader.error ?? new Error());
    reader.readAsDataURL(blob);
  });
}

export function ExportDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('html');
  const [query, setQuery] = useState('');
  const [showSystemChannel, setShowSystemChannel] = useState(true);
  const [encodeBase64, setEncodeBase64] = useState(false);
  const [urlToBase64, setUrlToBase64] = useState<Record<string, string>>({});
  const [encoding, setEncoding] = useState(false);

  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const channels = useMemo(() => collectChannels(project.blocks), [project.blocks]);

  const filteredBlocks = useMemo(() => {
    if (!query.trim()) return project.blocks;
    try {
      const predicate = compileQuery(sanitizeLiveQuery(query), project.characters ?? []);
      return project.blocks.filter(predicate);
    } catch {
      return project.blocks;
    }
  }, [project.blocks, project.characters, query]);

  useEffect(() => {
    if (!encodeBase64) {
      setEncoding(false);
      return;
    }
    const urls = [
      ...new Set(
        project.blocks
          .map((b: Block) => b.iconUrl?.trim() ?? '')
          .filter((u) => /^https?:\/\//i.test(u) && !(u in urlToBase64)),
      ),
    ];
    if (!urls.length) {
      setEncoding(false);
      return;
    }

    let cancelled = false;
    setEncoding(true);
    Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const blob = await res.blob();
          const dataUrl = await blobToDataUrl(blob);
          return [url, dataUrl] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      if (Object.keys(next).length > 0) {
        setUrlToBase64((prev) => ({ ...prev, ...next }));
      }
      setEncoding(false);
    });

    return () => {
      cancelled = true;
    };
  }, [encodeBase64, project.blocks, urlToBase64]);

  const content = useMemo(
    () =>
      exportLog(project, format, {
        query,
        showSystemChannel,
        encodeBase64,
        urlToBase64,
      }),
    [project, format, query, showSystemChannel, encodeBase64, urlToBase64],
  );

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  function download() {
    const mime = {
      html: 'text/html',
      txt: 'text/plain',
      json: 'application/json',
      md: 'text/markdown',
    }[format];
    const url = URL.createObjectURL(
      new Blob([content], { type: mime + ';charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = (project.title.replace(/[<>:"/\\|?*]/g, '_') || 'log') + '.' + format;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const sizeKb = (new Blob([content]).size / 1024).toFixed(1);
  const activeFormat = formats.find((f) => f.id === format) ?? formats[0];

  return (
    <dialog ref={dialog} className="export-dialog" onCancel={onClose}>
      <div className="export-heading">
        <div className="export-heading-left">
          <h2>로그 내보내기</h2>
          <span className="count-pill">
            {query.trim()
              ? `${filteredBlocks.length.toLocaleString()} / ${project.blocks.length.toLocaleString()}개`
              : `${project.blocks.length.toLocaleString()}개`}{' '}
            · {sizeKb} KB
          </span>
        </div>
        <button
          type="button"
          className="ghost icon-btn"
          aria-label="내보내기 닫기"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="export-filter-bar">
        <SearchBar
          inputRef={searchInput}
          query={query}
          searchActive={Boolean(query.trim())}
          blocks={project.blocks}
          characters={project.characters ?? []}
          channels={channels}
          onActivate={() => {}}
          onChangeQuery={setQuery}
        />
      </div>
      <div className="export-body">
        <section className="export-options">
          {formats.map((option) => (
            <label
              key={option.id}
              className={format === option.id ? 'format-option active' : 'format-option'}
            >
              <input
                type="radio"
                name="export-format"
                checked={format === option.id}
                onChange={() => setFormat(option.id)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
          <div className="export-extra-options">
            <label className="check-field">
              <input
                type="checkbox"
                checked={showSystemChannel}
                onChange={(e) => setShowSystemChannel(e.target.checked)}
              />
              <span>시스템 메시지 채널 표시</span>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={encodeBase64}
                onChange={(e) => setEncodeBase64(e.target.checked)}
              />
              <span>URL 이미지를 모두 Base64로 인코딩</span>
            </label>
            {encoding && (
              <small className="muted-note">
                외부 이미지를 Base64로 인코딩하는 중...
              </small>
            )}
          </div>
          <small className="muted-note">
            필터 조건이 있으면 필터링된 메시지만 추출됩니다.
          </small>
        </section>
        <section className="export-preview" aria-label="내보내기 미리보기">
          {format === 'html' ? (
            <iframe title="HTML 로그 미리보기" sandbox="" srcDoc={content} />
          ) : (
            <pre>{content}</pre>
          )}
        </section>
      </div>
      <footer className="export-footer">
        <span className="muted-note">{format.toUpperCase()} 미리보기</span>
        <div className="export-footer-actions">
          <button type="button" className="ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className={activeFormat.btnClass}
            onClick={download}
            disabled={!format || encoding}
          >
            {format.toUpperCase()} 다운로드
          </button>
        </div>
      </footer>
    </dialog>
  );
}
