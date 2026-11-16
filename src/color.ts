const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * 컬러코드 입력(#RRGGBB 또는 RRGGBB, 직접 입력/클립보드 붙여넣기 포함)에서
 * '#'과 공백을 제거하고 최대 6자리 대문자(Uppercase) 문자열로 정규화합니다.
 */
export function normalizeColorCodeInput(raw: string): string {
  return raw.replace(/[#\s]/g, '').slice(0, 6).toUpperCase();
}

/**
 * 저장된 색상 값('#RRGGBB' 등)에서 '#'을 제거한 대문자 표시용 코드를 반환합니다.
 */
export function formatColorCodeForInput(value: string): string {
  return value.replace(/#/g, '').toUpperCase();
}

/**
 * 입력된 코드 문자열을 저장용 대문자 색상 값('#RRGGBB' 또는 빈 문자열)으로 변환합니다.
 */
export function toStoredColorValue(rawCodeInput: string): string {
  const code = normalizeColorCodeInput(rawCodeInput);
  return code ? `#${code}` : '';
}

/**
 * 유효한 '#RRGGBB' 문자열이면 대문자로 반환하고, 아니면 기본 색상('#888888')을 반환합니다.
 */
export function resolvePickerColor(value: string, fallback = '#888888'): string {
  return HEX6_RE.test(value) ? value.toUpperCase() : fallback;
}

/**
 * 배경색('#RRGGBB')의 상대 휘도를 계산해 대비가 높은 '#' 글자색('#000000' 또는 '#ffffff')을 반환합니다.
 */
export function getContrastTextColor(hex: string): '#000000' | '#ffffff' {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#ffffff';
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.179 ? '#000000' : '#ffffff';
}
