# Log Director 기여 가이드 (Contributing Guide)

Log Director 프로젝트에 관심을 가져주셔서 감사합니다!  
이 문서는 버그 제보, 새로운 기능 제안, 코드 및 문서 기여를 원활하게 진행할 수 있도록 돕는 안내서입니다.

---

## 1. 개발 환경 준비

- **Node.js**: 20 이상 (권장: Node.js 24)
- **패키지 관리자**: npm (`package-lock.json` 기준)

```sh
# 의존성 설치
npm ci

# 로컬 개발 서버 실행 (기본: http://127.0.0.1:5173)
npm run dev

# 단위/회귀 테스트 실행
npm test

# 프로덕션 빌드 (TypeScript 컴파일 + Vite 번들링)
npm run build

# 코드 스타일 검사 및 자동 포맷팅
npm run format:check
npm run format
```

---

## 2. 기여 시 필수 준수 사항

Log Director는 사용자의 소중한 TRPG 세션 기록을 다루는 로컬 편집기입니다. 아래의 핵심 원칙을 반드시 지켜주세요.

1. **사용자 원본 데이터 불변성**
   - 사용자의 원본 파일(`original`)과 원본 raw 문자열을 절대 임의로 수정하거나 덮어쓰지 않습니다.
   - 메시지 ID와 캐릭터 ID는 서로 다른 개념입니다.
2. **저장 식별자 및 데이터 모델 호환성**
   - 현재 프로젝트 저장 식별자는 `log-director`, 버전은 `1`입니다 (구버전 `log-studio` 하위 호환 포함). 기존 저장본과의 호환성을 깨뜨리지 마세요.
   - 데이터 모델을 변경할 경우 [docs/DATA_MODEL.md](docs/DATA_MODEL.md)를 먼저 확인하고 스키마 마이그레이션을 신중히 처리해야 합니다.
3. **프라이버시 및 세션 로그 보호**
   - 사용자의 실제 TRPG 플레이 로그나 비공개 이미지 URL을 GitHub 이슈, PR 설명, 테스트 코드에 올리지 마세요.
   - 테스트 및 검증 시에는 가상의 캐릭터와 메시지를 사용하세요.
4. **공통 아키텍처 패턴 준수**
   - 오류 처리는 임의의 `alert()` 대신 공통 `notifyError`를 사용합니다.
   - 캐릭터 연결은 이름이 아닌 고유 ID 기준입니다.
   - 시스템 화자는 고정 식별자 `builtin:system`을 사용하며, 시스템 메시지에는 `speaker` 필드가 없어야 합니다.
   - 화면 레이아웃이나 스크롤 구조 수정 시 [src/workspace-layout.css](src/workspace-layout.css)의 독립 스크롤 구조를 확인하세요.

---

## 3. Pull Request (PR) 절차

1. **브랜치 생성**: 최신 `main` 브랜치에서 새 기능이나 버그 수정을 위한 브랜치를 분기합니다.
   ```sh
   git checkout -b feat/my-new-feature
   ```
2. **코드 작성 및 테스트**:
   - 의미 있는 로직 변경 시 `src/core.test.ts`에 적절한 회귀 테스트 케이스를 추가해 주세요.
   - 제출 전 아래 세 가지 검증을 통과해야 합니다.
     ```sh
     npm test              # 모든 테스트 통과 (47+ tests)
     npm run build         # TypeScript 타입 오류 없음
     npm run format:check  # Prettier 스타일 통과
     ```
3. **PR 제출**:
   - PR 설명에 **어떤 문제를 해결했는지**, **어떻게 테스트했는지**를 명확히 작성해 주세요.
   - 브라우저 실화면 조작 검증 여부도 있는 그대로 투명하게 기록해 주세요.
4. **리뷰 및 반영**:
   - 리뷰 피드백에 따라 코드를 보완한 뒤 `main` 브랜치로 병합됩니다.

---

## 4. 참고 문서

더 자세한 개발 및 동작 원리는 아래 문서들을 확인하세요:

- [기능 명세 및 단축키 목록](docs/FEATURES.md)
- [데이터 모델과 변경 규칙](docs/DATA_MODEL.md)
- [개발 인수인계 및 검증 가이드](docs/DEVELOPMENT.md)
- [배포 및 빌드 가이드](docs/DEPLOYMENT.md)
- [에이전트 작업 지침](AGENTS.md)

---

## 5. 라이선스 동의

Log Director에 제출된 모든 기여는 프로젝트의 [MIT License](LICENSE)에 따라 배포 및 공유되는 것에 동의한 것으로 간주됩니다.
