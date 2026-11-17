import { useEffect, useRef, useState } from 'react';

export type HelpContext =
  | 'log'
  | 'log-editing'
  | 'log-bulk'
  | 'log-cut'
  | 'styles'
  | 'settings';

type HelpSection = {
  title: string;
  items: { key?: string; desc: string }[];
};

const CONTEXT_CONTENT: Record<
  HelpContext,
  { badge: string; title: string; sections: HelpSection[] }
> = {
  log: {
    badge: '도움말',
    title: '로그 편집',
    sections: [
      {
        title: '선택 · 편집 · 입력창 적용',
        items: [
          { key: '클릭 / Ctrl / Shift', desc: '단일 · 다중 · 구간 메시지 선택' },
          {
            key: '더블클릭',
            desc: '메시지 편집',
          },
          { key: '드래그 / Alt+↑↓', desc: '선택 메시지 순서 이동' },
          {
            key: 'Alt+클릭 / Ctrl+C',
            desc: '스포이트: 캐릭터·표정·채널을 채팅창에 복사',
          },
          {
            key: 'Ctrl+1~9 / Alt+1~9',
            desc: '현재 캐릭터를 1~9번 슬롯에 저장 / 저장된 캐릭터로 전환',
          },
          { key: 'Tab', desc: '채팅창 포커스 / 해제' },
        ],
      },
      {
        title: '편집 모드 · 탐색 단축키',
        items: [
          {
            key: 'Ctrl+Shift+Enter',
            desc: '다중 선택 일괄 편집',
          },
          {
            key: 'Ctrl+X / Ctrl+V',
            desc: '메시지 오리기 / 붙여넣기',
          },
          { key: '↑↓ / Shift+↑↓', desc: '커서 이동 / 10개씩 이동 (Ctrl 조합 시 선택 유지)' },
          {
            key: 'PgUp / PgDn',
            desc: '이전 / 다음 장면(북마크) 이동 (Shift 조합 시 1000개 단위 점프)',
          },
          { key: 'Ctrl+G', desc: '메시지 번호로 이동' },
          { key: 'Home / End', desc: '필터 해제 후 맨 처음 / 맨 끝으로 이동' },
          { key: 'Ctrl+Z / Ctrl+Y', desc: '실행 취소 / 다시 하기' },
          { key: 'Del', desc: '삭제' }
        ],
      }
      // ,
      // {
      //   title: '검색 문법 (Ctrl+F 필터 ON/OFF · Ctrl+H 치환)',
      //   items: [
      //     { key: '일반 텍스트', desc: '캐릭터·대사·주사위 판정 통합 검색' },
      //     { key: 'from:이름', desc: '캐릭터 필터' },
      //     { key: 'in:채널', desc: '채널 필터 (in:none 채널 없음)' },
      //     { key: 'scene:장면이름', desc: '해당 장면 시작부터 다음 장면 까지 필터' },
      //     {
      //       key: 'style:카드이름',
      //       desc: '특정 스타일 카드가 적용된 메시지 필터 (style:none 미적용)',
      //     },
      //     { key: 'dice:키워드', desc: '주사위 판정 결과 텍스트 필터' },
      //     { key: 'is:상태', desc: 'dice / system / normal / unlinked' },
      //     { key: '-조건 · Tab/Enter', desc: '조건 제외 · 자동완성 칩 확정' },
      //   ],
      // },
    ],
  },
  'log-editing': {
    badge: '도움말',
    title: '개별 편집',
    sections: [
      {
        title: '메시지 수정 · 스타일',
        items: [
          {
            key: '따옴표·괄호 입력',
            desc: '", \', (, [, 「 등 입력 시 자동 닫기 및 커서 이동 · 선택 시 감싸기',
          },
          { key: '아바타 이미지 클릭', desc: '캐릭터의 다른 표정 이미지로 변경' },
          { key: '캐릭터 · 채널 변경', desc: '연결된 캐릭터나 소속 채널 수정' },
          {
            key: '개별 스타일 지정',
            desc: '메시지 하단 스타일 드롭다운/칩으로 개별 스타일 카드 추가 및 해제',
          },
          { key: 'Enter / 더블클릭 / 저장', desc: '편집 내용 저장 (Shift+Enter 줄바꿈)' },
          { key: 'Esc', desc: '저장하지 않고 편집 종료' },
        ],
      },
    ],
  },
  'log-bulk': {
    badge: '도움말',
    title: '일괄 편집',
    sections: [
      {
        title: '대사 앞뒤 추가 · 치환 · 스타일',
        items: [
          {
            key: '기존 대사 블럭 + 따옴표/괄호',
            desc: '기존 대사 앞뒤를 한 번에 감싸기 (입력창 내 자동 닫기 지원)',
          },
          { key: '↑↓ / ←→', desc: '앞 추가 입력칸 ↔ 기존 블럭 ↔ 뒤 추가 입력칸 이동' },
          {
            key: '일괄 스타일 편집',
            desc: '선택된 모든 메시지에 스타일 카드를 일괄 추가하거나 일괄 해제',
          },
          { key: 'Ctrl+H', desc: '선택 메시지 대사 내부 문자열 찾기/치환 바 토글' },
          {
            key: 'Enter / 일괄 저장',
            desc: '적용한 내용을 일괄적으로 저장',
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
            key: '검색 · 장면/라인 이동',
            desc: '오려둔 상태에서 원하는 목적지를 탐색 가능',
          },
          { key: 'Esc / 오리기 취소', desc: '이동을 취소하고 원래 자리 유지' },
        ],
      },
    ],
  },
  styles: {
    badge: '도움말',
    title: '스타일 편집',
    sections: [
      {
        title: '전역 스타일 (최상단 고정)',
        items: [
          {
            key: '문서 · 기본 메시지 스타일',
            desc: '배경색, 최대 폭(px), 메시지 간격, 제목 서식 및 일반·시스템 기본 스타일 설정',
          },
          {
            key: '기본값 복원 / 저장',
            desc: '코코포리아 기본 테마로 복원 가능 · 편집 후 하단 저장 클릭 시 반영 (Esc 취소)',
          },
        ],
      },
      {
        title: '일반 스타일 카드 · 계층(우선순위)',
        items: [
          {
            key: '＋ 카드 추가 / 복제',
            desc: '스타일 카드 생성 및 복제 · 카드 클릭 시 편집 및 미리보기',
          },
          {
            key: '드래그 / ↑↓ 이동',
            desc: '카드 순서로 변경, 아래쪽 카드가 위쪽보다 우선도가 높음',
          },
          {
            key: '속성별 지정 (+ / ×)',
            desc: '원하는 속성만 부분 지정하고 ×로 해제 시 상위 카드·전역 스타일 값을 계승',
          },
          {
            key: '미리보기',
            desc: '현재 로그에서 조건과 일치하는 메시지와 실제 샘플 적용 모습 즉시 확인',
          },
        ],
      },
      {
        title: '적용 필터 · 서식 · 연동',
        items: [
          {
            key: '적용 필터',
            desc: '검색 문법으로 자동 적용된 필터들 중 하나만 맞아도 적용',
          },
          {
            key: '사용처 칩 해제 (×)',
            desc: '캐릭터·개별 메시지에 직접 연결된 사용처를 칩의 × 버튼으로 일괄 해제',
          },
          {
            key: '패널 · 아바타 · 판정 서식',
            desc: '글씨체, 화자 색/점선 테두리, 아바타 형태(원·사각·마름모·숨김), 주사위 강조 지원',
          },
          {
            key: '로그·설정 연동',
            desc: '로그 편집/일괄 편집에서 개별 지정 가능 · 설정 탭에서 프리셋(.styles.json) 백업',
          },
        ],
      },
    ],
  },
  settings: {
    badge: '도움말',
    title: '설정',
    sections: [
      {
        title: '표시 및 타임라인 · 캐릭터 전환 슬롯',
        items: [
          {
            key: '채널 · 타임스탬프 · 스타일',
            desc: '편집 화면·내보내기 표시 여부 및 타임스탬프 표기 형식(원본 표기/날짜 변환) 지정',
          },
          {
            key: '오버레이 · 가상 스크롤 버퍼',
            desc: '스크롤바 미니맵 표시 토글 및 상하 여유 렌더링 개수(15~100개) 조절',
          },
          {
            key: '캐릭터 전환 슬롯',
            desc: 'Ctrl+1~9로 저장한 화자 목록 확인 및 × 버튼으로 슬롯 지정 해제',
          },
        ],
      },
      {
        title: '편집 동작 및 데이터 관리',
        items: [
          {
            key: '연속 병합 옵션',
            desc: '병합 구분자(\\n, 빈 줄, 공백) 및 표정이 달라도 합치기 허용 여부 설정',
          },
          {
            key: '따옴표·괄호 자동 감싸기/닫기',
            desc: '입력 시 자동 닫힘·닫힘 기호 스킵 및 선택 영역 감싸기 기능',
          },
          {
            key: '스타일 카드 내보내기/불러오기',
            desc: '스타일 카드(.styles.json) 내보내기/불러오기, 기존을 덮어씀',
          },
          {
            key: 'URL 변환 버튼',
            desc: '외부 웹 이미지 URL로 되어있는 이미지를 Base64로 내재화 저장',
          },
        ],
      },
      {
        title: '원본 보관함 · 저장 및 내보내기',
        items: [
          {
            key: '원본 로그 보존',
            desc: '불러온 원본 원문 열람/내려받기 · 보존 해제 시 프로젝트 파일에서 원본 제외 및 일괄 삭제 가능',
          },
          {
            key: '상단 저장 (.project.json)',
            desc: '프로젝트 전체 상태 저장 · 상단 내보내기에서 HTML·TXT·JSON·MD 출력 지원',
          },
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
