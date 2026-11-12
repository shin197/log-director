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
    <section className="project-panel">
      <h2>표시 설정</h2>
      <label>
        <input
          type="checkbox"
          checked={settings.showChannel}
          onChange={(e) => update({ showChannel: e.target.checked })}
        />{' '}
        탭 이름 표시
      </label>
      <label>
        <input
          type="checkbox"
          checked={settings.showTimestamp}
          onChange={(e) => update({ showTimestamp: e.target.checked })}
        />{' '}
        타임스탬프 표시
      </label>
      <fieldset disabled={!settings.showTimestamp}>
        <legend>타임스탬프 옵션</legend>
        <label>
          표시 형식
          <select
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
      </fieldset>
      <p>미리보기: {displayTime('2026. 11. 13. 오후 09:05:30', settings) || '숨김'}</p>
      <p>
        로그 화면과 모든 내보내기에 적용됩니다. 원본 시각은 프로젝트에 보존합니다. 해석할
        수 없는 시각 문자열은 원문으로 표시합니다.
      </p>
    </section>
  );
}
