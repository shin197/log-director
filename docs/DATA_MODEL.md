# 데이터 모델 및 불변 조건

타입의 최종 기준은 `src/core.ts`입니다. 문서와 코드가 다르면 코드를 확인하고 문서를 갱신하세요.

## 프로젝트

```ts
Project = {
  format: 'log-studio'; // 앱 이름은 Log Director지만 저장 형식 식별자는 유지
  version: 1;
  title: string;
  original: { name: string; raw: string } | null;
  blocks: Block[];
  characters?: Character[];
  display?: DisplaySettings;
  expressions?: { speaker: string; iconUrl: string; name: string }[];
}
```

`expressions`는 이전 형식의 호환용 필드입니다. 새 표정 정보는 characters의 faces에 저장합니다. 버전 1에서 선택 필드를 추가해 왔으므로 호환 처리는 이름만 보고 추정하지 말고 실제 필드 존재 여부를 검사합니다.

## 메시지와 캐릭터

Block에는 id, 선택적인 characterId/sourceIndex/speaker, text, diceResult, 선택적인 color/iconUrl/timestamp/channel/sourceType이 있습니다. `blocks` 배열 순서가 편집 순서입니다. sourceIndex는 원본 messages 배열의 위치이며 재정렬해도 바꾸지 않습니다.

Character는 `{id,name,iconUrl,color,faces:[{name,iconUrl}]}`입니다. 색상은 #RRGGBB, 표정 이름 기본값은 빈 문자열입니다. 일반 캐릭터 ID는 UUID입니다. faces에는 별도의 ID가 없으므로 URL 변경과 삭제 처리를 주의하세요.

메시지는 캐릭터 ID와 함께 표시 이름·색상·이미지 값을 저장합니다. 캐릭터 이름·색상 변경은 ID가 일치하는 블록에 동기화합니다. 메시지 이미지는 개별 표정을 유지합니다. 캐릭터 기본 표정 변경은 기존 모든 메시지의 표정을 교체하지 않습니다. 표정 URL 수정은 해당 캐릭터에서 이전 URL을 사용하는 메시지에 반영합니다.

## 시스템

- 고정 ID: `builtin:system`.
- 목록 표시용 이름은 시스템이며 내부 고정 색상만 사용합니다.
- 메시지는 characterId가 고정 ID, sourceType이 system입니다.
- speaker는 **키 자체가 없어야 합니다**. null을 새로 저장하지 않습니다.
- 화면에서 이름·이미지 숨김. JSON 출력에서도 speaker/color/iconUrl 제거.
- 기존 null 화자 시스템 메시지는 로딩 시 키 없는 형태로 정규화합니다.
- `asSystemMessage`, `ensureSystemCharacter`, `inheritCharacter`를 통해 일관성을 유지합니다.

## 가져오기와 보존

`parse`는 원본 JSON 또는 프로젝트 JSON을 판별합니다. 원본은 같은 화자 이름으로 캐릭터를 생성합니다. 이미 characters가 있는 프로젝트는 ID를 유지하고, 없는 기존 프로젝트는 마이그레이션합니다. 원본에 없는 플레이어 정체성을 추정하지 않습니다.

빈 본문에도 판정이 있을 수 있습니다. diceResult와 roll.result는 같다고 가정하지 마세요. roll은 공통 블록에 별도 저장하지 않고 원본에서 참조합니다.

원본 raw 문자열은 모든 편집에서 유지합니다. 현재 구조는 원본 바이트 아카이브가 아니며 File.text()의 BOM 처리 등으로 바이트 동일성은 보장하지 않습니다.

## 내보내기

`exportLog`는 블록 순서를 따릅니다. JSON은 원본 레코드의 추가 필드를 먼저 보존하고 편집 필드로 덮어씁니다. 판정 결과가 원본과 다르면 오래된 roll을 제거합니다. 시각이 바뀌면 오래된 createdAt을 제거합니다. 시스템 전환 시 이전 일반 화자 정보가 남지 않도록 명시적으로 삭제합니다.

HTML은 텍스트를 이스케이프하고 이미지 URL/색상 사용을 제한합니다. 미리보기는 sandbox iframe입니다. 입력 로그의 HTML 문자열을 실행 가능한 마크업으로 삽입하지 마세요.

## 이력

App의 past/future 배열이 프로젝트 스냅샷을 관리합니다. 새 편집은 future를 비우고 최근 100단계까지만 유지합니다. 원본 객체를 직접 변경하지 말고 새 배열·객체를 만들고 commit을 호출하세요. 여러 메시지에 대한 일괄 작업은 한 번의 commit으로 적용해야 한 번에 취소됩니다.
