# Pinterest 개인용 다운로더 기획안

## 1. 기술 방향

현재 구현은 빠르게 로드해서 바로 사용할 수 있도록 `순수 Chrome Extension Manifest V3 + HTML/CSS/JavaScript` 구조로 설계한다.

선정 이유는 다음과 같다.

- 빌드 도구 없이 바로 `압축해제된 확장프로그램`으로 로드 가능
- 개인용 도구에 필요한 기능을 가장 짧은 경로로 구현 가능
- 문제 발생 시 파일 단위로 빠르게 수정 가능
- Pinterest 화면 구조 변경에 대응하기 쉬움

## 2. 실제 기술스택

- Chrome Extension Manifest V3
- Background Service Worker
- Popup UI
- 동적 주입 방식 Content Script
- 로컬 저장소: `chrome.storage.local`
- 다운로드 처리: `chrome.downloads`

백엔드는 사용하지 않는다.

## 3. 필요한 권한

### 기본 권한

- `activeTab`
- `downloads`
- `scripting`
- `storage`
- `tabs`

### 호스트 권한

- `https://www.pinterest.com/*`
- `https://*.pinimg.com/*`

사용 목적:

- 현재 Pinterest 탭에 스크립트 주입
- 상세 페이지 DOM 분석
- 이미지 URL 수집
- 이미지 다운로드 및 형식 변환

## 4. 전체 구조

### A. Popup

역할:

- 현재 탭이 Pinterest 페이지인지 확인
- Content Script 주입
- 선택 모드 시작
- 다시 스캔, 전체 선택, 선택 해제, 다운로드 실행
- 파일명 접두어 설정

### B. Content Script

역할:

- Pinterest 상세 페이지의 메인 이미지 감지
- 주변 유사 이미지 감지
- 화면 위 오버레이 선택 UI 렌더링
- 다중 선택 상태 관리
- 다운로드 요청 전달
- 다운로드 진행 상태 표시

### C. Background Service Worker

역할:

- 설정 저장/조회
- 다운로드 큐 처리
- 이미지 fetch
- `PNG` 변환
- `chrome.downloads`로 최종 저장

## 5. 데이터 흐름

1. 사용자가 Pinterest 핀 상세 페이지를 연다.
2. Popup을 열고 `선택 모드 시작`을 누른다.
3. Popup이 Content Script를 현재 탭에 주입한다.
4. Content Script가 메인 이미지와 주변 유사 이미지를 찾는다.
5. 사용자가 페이지 위 오버레이를 클릭해 이미지를 선택한다.
6. Popup 또는 플로팅 패널에서 다운로드를 실행한다.
7. 선택된 이미지 정보가 Background로 전달된다.
8. Background가 각 이미지를 순차 처리한다.
   - 이미지 fetch
   - 필요 시 형식 변환
   - 파일명 생성
   - 다운로드 저장
9. 진행 상태가 다시 Content Script와 Popup에 반영된다.

## 6. 파일 구조

```text
pinterest/
  content/
    content.js
  docs/
    project-plan.md
    technical-design.md
  popup/
    popup.html
    popup.css
    popup.js
  background.js
  manifest.json
  README.md
```

## 7. 파일별 역할

### `manifest.json`

- 확장 기본 정보
- 권한 정의
- popup 및 background 연결

### `background.js`

- 설정 저장과 조회
- 이미지 다운로드 큐 처리
- Blob 변환 및 저장

### `content/content.js`

- Pinterest 화면 분석
- 메인 핀 및 유사 이미지 탐지
- 오버레이 UI 표시
- 선택 상태 관리
- 다운로드 진행 상태 표시

### `popup/popup.html`

- 확장 팝업 기본 구조

### `popup/popup.css`

- 팝업 스타일 정의

### `popup/popup.js`

- 현재 탭 확인
- Content Script 주입
- 버튼 동작 연결
- 상태 표시 및 설정 저장

## 8. 감지 전략

현재 구현은 Pinterest 전용 고정 셀렉터 하나에 의존하지 않고, 화면에 보이는 이미지들의 크기와 위치를 기준으로 감지한다.

### 메인 이미지 감지

- 현재 화면에서 큰 영역을 차지하는 이미지를 우선 후보로 선택
- 상세 페이지 구조상 중앙 또는 좌측의 큰 이미지를 메인으로 우선 판단

### 유사 이미지 감지

- 메인 이미지 오른쪽 또는 아래쪽에 있는 이미지 카드 우선 탐색
- 너무 작은 아이콘, 프로필 이미지, 썸네일성 요소는 제외
- 현재 뷰포트에 보이는 이미지 중심으로 처리

## 9. 다운로드 전략

### 1단계. 이미지 수집

- 선택된 이미지 URL 목록을 만든다.

### 2단계. 이미지 가져오기

- Background에서 각 이미지를 fetch로 가져온다.

### 3단계. 형식 변환

- 필요 시 canvas 기반으로 `PNG`로 재인코딩한다.

### 4단계. 저장

- `chrome.downloads`를 사용해 파일을 저장한다.
- 파일명은 접두어 + 역할 + 순번 규칙을 따른다.

## 10. UI 구성

### Popup

- 현재 페이지 상태
- 감지 수 / 선택 수 / 메인 감지 여부
- 선택 모드 시작
- 다시 스캔
- 전체 선택
- 선택 해제
- 다운로드
- 저장 형식 설정
- 파일명 접두어 설정

### 페이지 오버레이

- 메인 이미지와 유사 이미지에 선택 박스 표시
- 선택된 이미지 시각 강조
- 메인 이미지에는 `MAIN` 라벨 표시
- 우측 하단 플로팅 패널 제공

## 11. 예외 처리

다음 상황을 고려한다.

- Pinterest가 DOM을 다시 그리는 경우
- 일부 이미지 URL이 늦게 로드되는 경우
- 같은 이미지가 여러 카드에서 중복되는 경우
- 일부 이미지 다운로드가 실패하는 경우

대응 방식:

- `MutationObserver`로 재스캔
- URL 기반 중복 제거
- 개별 실패 허용
- 전체 작업은 계속 진행

## 12. 최종 제안

개인용 기준에서는 현재 구조가 가장 현실적이다.

- 빌드 없는 MV3 구조
- Popup + Content Script + Background 분리
- 화면 기반 감지
- 순차 다운로드 처리
- 설정은 로컬 저장

이 방식이면 유지보수 부담을 크게 늘리지 않으면서 바로 설치하고 사용할 수 있는 수준까지 빠르게 갈 수 있다.
