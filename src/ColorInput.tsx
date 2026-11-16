import {
  formatColorCodeForInput,
  getContrastTextColor,
  normalizeColorCodeInput,
  resolvePickerColor,
  toStoredColorValue,
} from './color';

export function ColorInput({
  value,
  onChange,
  className = '',
  title,
}: {
  value: string;
  onChange: (nextColor: string) => void;
  className?: string;
  title?: string;
}) {
  const pickerValue = resolvePickerColor(value);
  const hashColor = getContrastTextColor(pickerValue);
  const codeValue = formatColorCodeForInput(value);

  return (
    <div
      className={className ? `color-input-group ${className}` : 'color-input-group'}
      title={title}
    >
      <label
        className="color-input-swatch"
        style={{ backgroundColor: pickerValue, color: hashColor }}
        title="색상 선택"
      >
        <span className="color-input-hash" aria-hidden="true">
          #
        </span>
        <input
          type="color"
          aria-label="색상 선택"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      </label>
      <input
        className="color-input-code"
        aria-label="색상 (RRGGBB)"
        placeholder="RRGGBB"
        spellCheck={false}
        autoComplete="off"
        value={codeValue}
        onChange={(e) => {
          const nextCode = normalizeColorCodeInput(e.target.value);
          if (e.target.value !== nextCode) {
            e.target.value = nextCode;
          }
          onChange(toStoredColorValue(nextCode));
        }}
      />
    </div>
  );
}
