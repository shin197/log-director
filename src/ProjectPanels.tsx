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
        <label className="check-field">
          <input
            type="checkbox"
            checked={Boolean(settings.applyStylesInEditor)}
            onChange={(e) => update({ applyStylesInEditor: e.target.checked })}
          />
          <span>로그 편집 화면에 스타일 적용</span>
        </label>
      </div>

      {settings.showTimestamp &&
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
        </div>}

      <small className="muted-note">
        편집 화면과 모든 내보내기 형식에 적용되며, 원본 시각 데이터는 보존됩니다.
      </small>

      <div style={{ margin: '20px 0 12px', borderTop: '1px solid var(--border-subtle, #333)' }} />

      <h2 style={{ marginTop: 0 }}>타임라인 스크롤 및 성능</h2>
      <div className="settings-options">
        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.virtualScroll ?? true}
            onChange={(e) => update({ virtualScroll: e.target.checked })}
          />
          <span>가상 스크롤 활성화 (1,000건 페이지 구분 없이 전체 연속 스크롤)</span>
        </label>
      </div>

      {(settings.virtualScroll ?? true) && (
        <div className="settings-row">
          <label className="stack-field">
            <span>스크롤 버퍼 크기 (위/아래 여유 메시지 수)</span>
            <select
              value={settings.virtualBuffer ?? 25}
              onChange={(e) => update({ virtualBuffer: Number(e.target.value) })}
            >
              <option value="15">15개 (절약 모드 · 저사양 기기)</option>
              <option value="25">25개 (권장 · 균형)</option>
              <option value="50">50개 (여유 · 빠른 스크롤)</option>
              <option value="100">100개 (최대 · 고사양 PC)</option>
            </select>
          </label>
          {/* <div className="time-preview">
            <span className="field-label">예상 렌더링 메시지 수</span>
            <code>
              화면 표시(~15개) + 버퍼({(settings.virtualBuffer ?? 25) * 2}개) ≈ 약{' '}
              {(settings.virtualBuffer ?? 25) * 2 + 15}개
            </code>
          </div> */}
        </div>
      )}

      <small className="muted-note">
        화면에 보이는 메시지 외에 위아래로 미리 렌더링해 둘 여유 개수입니다. 권장값은 25개이며, 휠을 빠르게 굴릴 때 흰 여백 없이 부드럽게 스크롤됩니다.
      </small>
    </section>
  );
}
