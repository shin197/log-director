# Log Director 배포 및 빌드 가이드

Log Director는 서버나 외부 DB 없이 브라우저 내에서 100% 동작하는 순수 클라이언트 웹 애플리케이션입니다.
따라서 **인터넷 연결이 필요 없는 오프라인 단일 HTML 파일** 또는 **GitHub Pages 등 정적 웹 호스팅**으로 자유롭게 배포할 수 있습니다.

---

## 1. 빌드 모드 안내

| 명령어 | 산출물 | 용도 |
| :--- | :--- | :--- |
| `npm run build:single` | `dist/index.html` (단 1개의 파일, 약 360KB) | **독립 실행 단일 HTML 파일** (USB, 메신저 공유, 오프라인 소장용) |
| `npm run build` | `dist/index.html` + `dist/assets/*` (CSS, JS 분리) | 일반 웹 호스팅 (GitHub Pages, Vercel, Netlify 등) |

---

## 2. 단일 HTML 파일로 빌드하기 (오프라인 독립 배포)

1. 터미널에서 다음 명령어를 실행합니다:
   ```sh
   npm run build:single
   ```
2. 빌드가 완료되면 `dist/` 폴더에 `index.html` 파일 1개만 생성됩니다.
3. 이 `index.html` 파일은 다음과 같이 사용할 수 있습니다:
   - **로컬에서 바로 실행**: 웹 서버를 켤 필요 없이 파일을 더블클릭하면 크롬, 엣지, 웨일 등 브라우저에서 바로 실행됩니다.
   - **이름 변경 및 배포**: 파일 이름을 `LogDirector.html` 등으로 바꾸어 메신저, 구글 드라이브, USB 등으로 다른 사람에게 전달하면 상대방도 설치 없이 바로 사용할 수 있습니다.
   - **데이터 보존**: 프로젝트 열기/저장, 브라우저 LocalStorage 자동저장 등 모든 기능이 정상 동작합니다.

---

## 3. 웹사이트(GitHub Pages)로 무료 배포하기

누구나 인터넷 주소(`https://<사용자이름>.github.io/<저장소이름>/`)로 접속해 사용할 수 있도록 배포하는 방법입니다.

### 방법 A: GitHub Actions 자동 배포 (추천)
저장소의 `.github/workflows/deploy.yml` 파일을 생성하면 `main` 브랜치에 푸시할 때마다 자동으로 최신 버전이 웹에 반영됩니다:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'
      - id: deployment
        uses: actions/deploy-pages@v4
```

> **GitHub 저장소 설정**:
> 저장소의 **Settings** → **Pages** → **Build and deployment** 항목의 **Source**를 `GitHub Actions`로 설정하면 자동 배포가 활성화됩니다.
