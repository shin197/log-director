import { useEffect, useRef, useState } from 'react';

export type HelpContext =
  'log' | 'log-editing' | 'log-bulk' | 'log-cut' | 'characters' | 'settings';

type HelpSection = {
  title: string;
  items: { key?: string; desc: string }[];
};

const CONTEXT_CONTENT: Record<
  HelpContext,
  { badge: string; title: string; sections: HelpSection[] }
> = {
  log: {
    badge: '로그 편집',
    title: '타임라인 탐색 및 검색',
    sections: [
      {
        title: '선택 · 편집 · 스포이트',
        items: [
          { key: '클릭 / Ctrl / Shift', desc: '단일 · 다중 · 구간 메시지 선택' },
          { key: '더블클릭', desc: '메시지 편집 (선택 후 따옴표·괄호 자동 감싸기)' },
          { key: '드래그 / Alt+↑↓', desc: '선택 메시지 순서 이동' },
          { key: 'Alt+클릭 / Ctrl+C', desc: '스포이트: 캐릭터·표정·채널을 입력창에 복사' },
          { key: 'Tab', desc: '하단 채팅창(Composer) 포커스 / 해제' },
        ],
      },
      {
        title: '편집 모드 · 단축키',
        items: [
          { key: 'Ctrl+Shift+Enter', desc: '다중 선택 일괄 편집 시작' },
          {
            key: 'Ctrl+X / Ctrl+V',
            desc: '선택 메시지 오려두기 / 원하는 위치에 붙여넣기',
          },
          { key: '↑↓ / Ctrl+↑↓', desc: '커서 이동 / 선택 확장 유지 이동' },
          { key: 'PgUp/Dn · Home/End', desc: '10개 이동 · 필터 해제 후 처음/끝' },
          { key: 'Ctrl+Z / Ctrl+Y', desc: '실행 취소 / 다시 하기 · Del 선택 삭제' },
        ],
      },
      {
        title: '검색 문법 (Ctrl+F 필터 ON/OFF · Ctrl+H 치환)',
        items: [
          { key: '일반 텍스트', desc: '캐릭터·대사·주사위 판정 통합 검색' },
          { key: 'from:이름 · in:채널', desc: '캐릭터 또는 채널 필터 (in:none 빈 채널)' },
          { key: 'dice:키워드', desc: '주사위 판정 결과 텍스트 필터' },
          { key: 'is:상태', desc: 'dice / system / normal / unlinked' },
          { key: '-조건 · Tab/Enter', desc: '조건 제외 · 자동완성 칩 확정' },
        ],
      },
    ],
  },
  'log-editing': {
    badge: '개별 편집 중',
    title: '단일 메시지 편집 도움말',
    sections: [
      {
        title: '메시지 수정',
        items: [
          {
            key: '텍스트 선택 + 괄호/따옴표',
            desc: '선택 영역을 ", \', (, [, 「, 『 등으로 자동 감싸기',
          },
          { key: '아바타 이미지 클릭', desc: '캐릭터의 다른 표정 이미지로 변경' },
          { key: '캐릭터 · 채널 변경', desc: '연결된 캐릭터나 소속 채널 수정' },
          { key: '더블클릭 / 저장', desc: '편집 내용 커밋 (단일 실행 취소 단위)' },
          { key: 'Esc', desc: '저장하지 않고 편집 종료' },
        ],
      },
    ],
  },
  'log-bulk': {
    badge: '일괄 편집 중',
    title: '다중 선택 일괄 편집 도움말',
    sections: [
      {
        title: '대사 앞뒤 추가 · 치환',
        items: [
          {
            key: '기존 대사 블럭 + 따옴표/괄호',
            desc: '기존 대사 앞뒤를 한 번에 감싸기',
          },
          { key: '↑↓ / ←→', desc: '앞 추가 입력칸 ↔ 기존 블럭 ↔ 뒤 추가 입력칸 이동' },
          { key: 'Ctrl+H', desc: '선택 메시지 대사 내부 문자열 찾기/치환 바 토글' },
          {
            key: 'Ctrl+Enter / 일괄 저장',
            desc: '변경 사항 한 번의 commit으로 일괄 적용',
          },
          { key: 'Esc', desc: '치환 바 닫기 또는 일괄 편집 취소' },
        ],
      },
    ],
  },
  'log-cut': {
    badge: '오려붙이기 모드',
    title: '선택 블록 일괄 이동 도움말',
    sections: [
      {
        title: '위치 지정 및 이동',
        items: [
          {
            key: '이 곳에 붙여넣기',
            desc: '대상 메시지 앞 또는 뒤로 오린 메시지들 일괄 이동',
          },
          { key: 'Ctrl+V', desc: '현재 커서 위치 기준으로 즉시 붙여넣기' },
          {
            key: '검색 · 페이지 이동',
            desc: '오려둔 상태에서 원하는 목적지를 탐색 가능',
          },
          { key: 'Esc / 오리기 취소', desc: '이동을 취소하고 원래 자리 유지' },
        ],
      },
    ],
  },
  characters: {
    badge: '캐릭터 탭',
    title: '캐릭터 및 표정 관리 도움말',
    sections: [
      {
        title: '목록 · 정보 관리',
        items: [
          { key: '좌측 목록 드래그', desc: '캐릭터 표시 순서를 드래그로 자유롭게 변경' },
          {
            key: '＋ 추가 (Ctrl+V)',
            desc: '새 캐릭터 생성 또는 코코포리아 캐릭터 JSON 붙여넣기 등록',
          },
          { key: '저장 버튼', desc: '이름·색상·표정 변경을 연결된 메시지와 함께 저장' },
        ],
      },
      {
        title: '표정 카드 관리',
        items: [
          {
            key: '이미지 사각형 클릭',
            desc: '사진 파일 업로드(base64) 또는 URL/base64 입력',
          },
          {
            key: '＋ 파일로 추가',
            desc: '여러 이미지 파일을 한 번에 표정으로 즉시 등록',
          },
          { key: '⋮⋮ 핸들 드래그', desc: '표정 카드 간 순서를 드래그로 재정렬' },
          { key: '기본 지정', desc: '캐릭터 대표 아이콘으로 사용할 기본 표정 설정' },
        ],
      },
    ],
  },
  settings: {
    badge: '설정 탭',
    title: '표시 설정 · 보관함 · 내보내기 도움말',
    sections: [
      {
        title: '출력 및 프로젝트 관리',
        items: [
          {
            key: '채널 · 타임스탬프 설정',
            desc: '편집 화면과 4종 내보내기에 일괄 적용 (원본 보존)',
          },
          {
            key: '상단 저장 (.project.json)',
            desc: '원본·캐릭터·편집 상태를 프로젝트 파일로 보관',
          },
          {
            key: '상단 내보내기',
            desc: 'HTML·TXT·JSON·MD 출력 (검색 필터·Base64 최적화 지원)',
          },
          { key: '원본 보관함', desc: '처음 불러온 원본 로그 문자열 확인' },
        ],
      },
    ],
  },
};

export function HelpSheet({
  context,
  onClose,
}: {
  context: HelpContext;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const maxX = Math.max(8, window.innerWidth - drag.width - 8);
      const maxY = Math.max(8, window.innerHeight - drag.height - 8);
      setPos({
        x: Math.min(maxX, Math.max(8, drag.originX + dx)),
        y: Math.min(maxY, Math.max(8, drag.originY + dy)),
      });
    };
    const onUp = () => {
      dragState.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const data = CONTEXT_CONTENT[context];

  return (
    <aside
      ref={sheetRef}
      className="help-sheet"
      role="region"
      aria-label="단축키 및 도움말 치트 시트"
      style={pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto' } : undefined}
    >
      <div
        className="help-sheet-header"
        title="드래그하여 창 위치 이동"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const rect = sheetRef.current?.getBoundingClientRect();
          if (!rect) return;
          dragState.current = {
            startX: e.clientX,
            startY: e.clientY,
            originX: rect.left,
            originY: rect.top,
            width: rect.width,
            height: rect.height,
          };
          setPos({ x: rect.left, y: rect.top });
        }}
      >
        <div className="help-sheet-title">
          <span className="help-sheet-badge">{data.badge}</span>
          <strong>{data.title}</strong>
        </div>
        <button
          type="button"
          className="ghost icon-btn"
          aria-label="도움말 닫기"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="help-sheet-body">
        {data.sections.map((section) => (
          <section key={section.title} className="help-sheet-section">
            <h3>{section.title}</h3>
            <ul>
              {section.items.map((item, idx) => (
                <li key={idx}>
                  {item.key && <kbd>{item.key}</kbd>}
                  <span>{item.desc}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="help-sheet-footer">
        <span>상단 바를 드래그해 이동 · Esc 또는 ? 로 닫기</span>
      </div>
    </aside>
  );
}
