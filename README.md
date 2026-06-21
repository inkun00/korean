# 애국가 탐험대

초등학교 4~6학년 창의적체험활동을 위한 3차시 애국가 학습 웹 앱 MVP입니다.

## 실행

Node.js 18 이상에서 다음 명령을 실행합니다.

```powershell
npm start
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다.

## 현재 구현

- 학생 탐험 지도와 서버 진도·점수 자동 저장
- 1차시 역사 학습, 퀴즈, 순서형 방탈출
- 2차시 가사 풀이, 빈칸 채우기, 브라우저 한국어 음성 인식
- 음성 파일 비저장 구조와 음성 인식 미지원 환경용 체험 결과
- 3차시 모둠방, 학생 그림 업로드, 자동 슬라이드 영상 미리보기
- 학생 그림을 서버에서 실제 1280×720 MP4로 렌더링하고 다운로드
- 영상 작업 상태 표시와 Padlet 게시 제목·소개 문구 자동 생성
- 100점 평가, 개척가·숙련가·전문가 등급
- 교육용 인증서 PNG 생성 및 다운로드
- 교사 대시보드와 성적 CSV 다운로드
- 태블릿·모바일 반응형 화면

## 데이터 처리

- 학습 진도와 점수는 `/api/students/:id`를 통해 `data/db.json`에 저장되며, 오프라인 복구를 위해 브라우저 `localStorage`에도 사본을 둡니다.
- 음성 파일은 앱 데이터 모델이나 저장소에 포함하지 않습니다.
- 학생 그림은 현재 브라우저 세션에서만 영상 미리보기에 사용됩니다.

## 로컬 API

- `GET /api/health` — 서버 상태
- `GET /api/config` — 음성 AI·애국가 음원 연결 상태
- `GET /api/students/demo-student` — 학생 진도 조회
- `PUT /api/students/demo-student` — 학생 진도 저장
- `GET /api/classes/class-neulbom-5-2/dashboard` — 학급 현황
- `POST /api/videos` — 그림 파일을 받아 MP4 생성 작업 시작
- `GET /api/videos/:id` — 영상 생성 상태 조회
- `GET /api/videos/:id/file` — 완성된 MP4 다운로드
- `POST /api/transcriptions` — 녹음 음성 전사와 가사 정확도 평가

## OpenAI 음성 전사 연결

서버를 시작하기 전에 API 키를 환경변수로 설정합니다. 키가 없으면 앱은 브라우저 음성 인식 체험 모드로 동작합니다.

```powershell
$env:OPENAI_API_KEY = "로컬에 설정한 API 키"
$env:OPENAI_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe"
npm start
```

녹음 파일은 전사 요청 중 임시 폴더에서만 처리하며 응답 직후 삭제합니다. 서비스 데이터, 로그, 백업에는 포함하지 않습니다.

## 애국가 음원 연결

사용 권리가 확인된 음원을 `assets/audio/aegukga.mp3`에 배치하거나 `AEGUKGA_AUDIO_PATH`로 경로를 지정합니다. 설정 여부는 `/api/config`와 3차시 화면에 표시됩니다.

## 정식 서비스 전 연결할 기능

- 학교·학급·학생 계정과 서버 데이터베이스
- 어린이 음성에 최적화된 한국어 음성 인식 API
- 사용 권리가 확인된 애국가 음원 파일과 영상 렌더러 연결
- 교사용 콘텐츠·문제 관리 CMS
- 학교별 배포, 모니터링, 백업 및 운영 환경

## 파일 구조

```text
index.html          앱 진입점
server.mjs          의존성 없는 로컬 정적 서버
src/app.js          화면, 활동, 점수 및 상태 로직
src/styles.css      반응형 UI 디자인
public/hero.png     AI로 생성한 만화풍 메인 삽화
data/videos/        생성된 MP4 결과물
PRD.md              제품 요구사항 문서
```
