import type { Project } from './core';
import { defaultDisplay, displayTime } from './presentation';

export { CharacterPanel } from './CharacterPanel';

export function SettingsPanel({
  project: p,
  commit,
}: {
  project: Project;
  commit: (p: Project) => void;
}) {
  const settings = { ...defaultDisplay, ...p.display };
  const update = (patch: Partial<typeof settings>) =>
    commit({ ...p, display: { ...settings, ...patch } });

  return (
    <section className="settings-card">
      <h2>표시 및 출력 설정</h2>
      <div className="settings-options">
        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.showChannel}
            onChange={(e) => update({ showChannel: e.target.checked })}
          />
          <span>채널(탭) 이름 표시</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.showTimestamp}
            onChange={(e) => update({ showTimestamp: e.target.checked })}
          />
          <span>타임스탬프 표시</span>
        </label>
      </div>

      <div className="settings-row">
        <label className="stack-field">
          <span>타임스탬프 형식</span>
          <select
            disabled={!settings.showTimestamp}
            value={settings.timestampFormat}
            onChange={(e) => update({ timestampFormat: e.target.value })}
          >
            <option value="original">원본 표기</option>
            <option value="YYYY-MM-DD HH:mm:ss">년-월-일 시:분:초</option>
            <option value="YYYY-MM-DD">날짜만 (시·분 숨김)</option>
            <option value="HH:mm">시:분만</option>
            <option value="HH:mm:ss YYYY-MM-DD">시간 → 날짜</option>
            <option value="DD/MM/YYYY HH:mm">일/월/년 시:분</option>
          </select>
        </label>
        <div className="time-preview">
          <span className="field-label">미리보기</span>
          <code>{displayTime('2026. 11. 13. 오후 09:05:30', settings) || '숨김'}</code>
        </div>
      </div>

      <small className="muted-note">
        편집 화면과 모든 내보내기 형식에 적용되며, 원본 시각 데이터는 보존됩니다.
      </small>
    </section>
  );
}
