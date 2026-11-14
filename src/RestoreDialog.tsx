import { useEffect, useRef } from 'react';
import { formatRelativeTime, type AutosavePayload } from './storage';

export function RestoreDialog({
  autosave,
  onConfirm,
  onCancel,
}: {
  autosave: AutosavePayload;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timeAgo = formatRelativeTime(autosave.savedAt);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="restore-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className="restore-dialog-body">
        <p className="restore-dialog-title">
          이전 작업이 남아있어요 ({timeAgo} 자동저장).
        </p>
        <p className="restore-dialog-desc">복원할까요?</p>
      </div>
      <div className="restore-dialog-actions">
        <button
          type="button"
          className="compact-btn restore-cancel-btn"
          onClick={onCancel}
        >
          취소
        </button>
        <button
          type="button"
          className="primary compact-btn restore-confirm-btn"
          autoFocus
          onClick={onConfirm}
        >
          확인
        </button>
      </div>
    </dialog>
  );
}
