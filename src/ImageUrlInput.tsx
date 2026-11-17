import type { RefObject } from 'react';

/**
 * 사용자 지정 화자의 아바타 이미지 URL 입력 및 로컬 파일(base64) 업로드 공용 컴포넌트.
 */
export function ImageUrlInput({
  inputRef,
  className = '',
  value,
  disabled = false,
  placeholder = '이미지 URL (https://…) 또는 파일 업로드',
  onChange,
  onClose,
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (nextValue: string) => void;
  onClose?: () => void;
}) {
  return (
    <div className={`image-url-input-row ${className}`.trim()}>
      <input
        ref={inputRef}
        className="image-url-input"
        type="url"
        aria-label="아바타 이미지 URL"
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onClose) {
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <label
        className={`image-url-upload-btn${disabled ? ' is-disabled' : ''}`}
        title="이미지 파일을 base64로 업로드"
        aria-label="이미지 파일을 base64로 업로드"
      >
        <svg
          width="15"
          height="15"
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
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon"
          hidden
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                onChange(reader.result);
              }
            };
            reader.readAsDataURL(file);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
