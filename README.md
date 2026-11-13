# The Tower Idle — Preset Archive

블랙/화이트 테마의 개인 프리셋 관리 사이트. `Farm`, `Push_Trn_DS`, `DisAtk`, `DisUW`, `DisUtil` 다섯 개의 설정을 열람하고 수정할 수 있습니다.

## 바로 사용하기

`index.html`을 브라우저에서 열면 됩니다. 또는 Python으로 `python -m http.server 8000`을 실행하고 `http://localhost:8000`으로 접속하세요. 별도의 빌드/설치가 필요 없는 정적 사이트입니다.

## 제공 기능

- 다섯 개 프리셋 전환 및 작업장·봇·모듈·우선순위·특전·가디언·궁무·카드·기타 기록
- 수정 내용 브라우저 `localStorage` 자동 저장
- 현재 프리셋 내 항목 검색, 두 프리셋 비교, 설정 요약 복사
- JSON 내보내기/가져오기 (수동 백업), 프리셋별 초기화
- 다크/라이트 테마, 모바일 대응

## GitHub에 게시하기

1. 자신의 GitHub에서 새 저장소 `TheTowerPresets`를 생성합니다.
2. 이 폴더 내용을 업로드하거나 아래 명령으로 올립니다.

```bash
git remote add origin https://github.com/wkwmd19-sketch/TheTowerPresets.git
git branch -M main
git push -u origin main
```

3. 저장소 **Settings → Pages → Build and deployment → Deploy from a branch**로 이동하여 `main` / `/(root)`를 지정합니다.
4. 배포 후 사이트 주소는 대략 `https://wkwmd19-sketch.github.io/TheTowerPresets/`입니다.

**중요:** 저장된 프리셋 수정 내용은 해당 브라우저에만 보관됩니다. 사이트에서 **JSON 백업**을 내려받은 후 Git 기록에 남기려면 저장소에 백업 파일을 별도로 커밋해야 합니다. GitHub 계정 토큰을 정적 페이지 코드에 넣지 마세요. 브라우저 저장 공간을 삭제하거나 다른 기기로 접속하면 설정이 자동 공유되지 않으므로 JSON 백업을 권장합니다.

## 파일 구조

- `index.html`: 페이지 마크업
- `styles.css`: 블랙/화이트 테마 및 반응형 스타일
- `presets.js`: 프리셋 5종 기본값, 필드 구조
- `app.js`: 렌더링, 로컬 저장, 검색·비교·백업 기능

기본 데이터는 이전 대화에서 확인된 설정만 반영했으며 불확실한 항목은 빈칸 또는 확인 필요 메모로 처리했습니다.