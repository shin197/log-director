import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './core';
import { exportLog, type ExportFormat } from './export';
const formats: { id: ExportFormat; description: string }[] = [
  { id: 'html', description: '초상화와 색상이 있는 독립 HTML 로그' },
  { id: 'txt', description: '화자·시간·본문이 담긴 일반 텍스트' },
  { id: 'json', description: '메시지 데이터 JSON · 프로젝트 파일과 별개' },
  { id: 'md', description: '제목·화자·시스템 인용문이 있는 마크다운' },
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
  return (
    <dialog ref={dialog} className="export-dialog" onCancel={onClose}>
      <div className="export-heading">
        <h2>로그 내보내기</h2>
        <button aria-label="내보내기 닫기" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="export-body">
        <section className="export-options">
          <h3>내보내기 형식</h3>
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
                <strong>{option.id.toUpperCase()} 파일</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
          <p>
            전체 편집본 {project.blocks.length.toLocaleString()}개 메시지
            <br />
            예상 크기 {(new Blob([content]).size / 1024).toFixed(1)} KB
          </p>
          <small>
            검색·선택 상태와 관계없이 저장된 편집본 전체를 내보냅니다. HTML 초상화는 원본
            이미지 URL을 사용합니다.
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
        <span>{format.toUpperCase()} 미리보기</span>
        <button onClick={download} disabled={!format}>
          {format.toUpperCase()} 파일 내보내기
        </button>
      </footer>
    </dialog>
  );
}
