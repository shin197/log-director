import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './core';
import { exportLog, type ExportFormat } from './export';

const formats: { id: ExportFormat; label: string; description: string }[] = [
  { id: 'html', label: 'HTML', description: '초상화·색상이 포함된 웹 문서' },
  { id: 'txt', label: 'TXT', description: '화자·시각·본문 일반 텍스트' },
  { id: 'json', label: 'JSON', description: '완성 로그 데이터 (프로젝트와 별개)' },
  { id: 'md', label: 'Markdown', description: '제목·화자·시스템 인용문' },
];

export function ExportDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('html');
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useMemo(() => exportLog(project, format), [project, format]);

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

  return (
    <dialog ref={dialog} className="export-dialog" onCancel={onClose}>
      <div className="export-heading">
        <div className="export-heading-left">
          <h2>로그 내보내기</h2>
          <span className="count-pill">
            {project.blocks.length.toLocaleString()}개 · {sizeKb} KB
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
          <small className="muted-note">
            검색·선택과 무관하게 전체 편집본을 내보냅니다.
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
          <button type="button" className="primary" onClick={download} disabled={!format}>
            {format.toUpperCase()} 다운로드
          </button>
        </div>
      </footer>
    </dialog>
  );
}
