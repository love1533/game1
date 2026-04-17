---
name: game-orchestrator
description: "모바일 미니게임 프로젝트를 총괄하는 오케스트레이터. 게임 만들어줘, 미니게임 개발, 게임 프로젝트, 게임 추가, 새 게임 요청 시 사용. 후속 작업: 게임 수정, 업데이트, 보완, 다시 실행, 새 게임 추가, 난이도 조절, 캐릭터 변경 시에도 반드시 이 스킬을 사용."
---

# Game Orchestrator

모바일 미니게임 프로젝트의 개발을 총괄하는 오케스트레이터.

## 실행 모드: 서브 에이전트 (팬아웃/팬인)

## 에이전트 구성

| 에이전트 | 역할 | 스킬 | 출력 |
|---------|------|------|------|
| game-developer | 게임 개발 | game-dev | app/games/*/page.tsx |
| qa-agent | 품질 검증 | game-qa | 검증 보고서 |

## 워크플로우

### Phase 0: 컨텍스트 확인
1. 프로젝트 디렉토리에 `package.json` 존재 여부 확인
2. 실행 모드 결정:
   - package.json 미존재 → 초기 실행 (Phase 1부터)
   - package.json 존재 + 수정 요청 → 부분 재실행 (해당 게임만)
   - package.json 존재 + 새 게임 요청 → 추가 실행

### Phase 1: 프로젝트 초기화 (초기 실행 시)
1. `npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir`
2. 불필요한 보일러플레이트 정리
3. layout.tsx에 모바일 viewport 설정
4. globals.css 설정

### Phase 2: 게임 개발 (팬아웃)
game-developer 에이전트를 게임별로 병렬 실행:

1. **점프점프** (jump) - 끝없이 올라가는 점프 게임
2. **캐릭터 달리기** (runner) - 장애물 피하기 러닝 게임  
3. **짝맞추기** (match) - 카드 매칭 메모리 게임
4. **퀴즈 대결** (quiz) - OX 퀴즈 게임
5. **꾸미기** (dress) - 캐릭터 코디 게임

각 에이전트에게 전달할 정보:
- 에이전트 정의: `.claude/agents/game-developer.md`
- 스킬: `.claude/skills/game-dev/SKILL.md`
- 담당 게임의 핵심 메커닉
- 출력 경로

### Phase 3: 메인 허브 개발
app/page.tsx에 게임 선택 화면 구현:
- 5개 게임 카드 그리드
- 각 게임의 미리보기 이미지/아이콘
- 캐릭터 소개 섹션

### Phase 4: QA 검증
qa-agent로 전체 프로젝트 검증:
- 빌드 성공 확인
- 모든 게임 라우트 확인
- 에러 발견 시 직접 수정

### Phase 5: 배포
1. Vercel CLI로 배포: `npx vercel --yes`
2. 배포 URL 사용자에게 전달

## 에러 핸들링
- 게임 개발 에이전트 실패 시: 1회 재시도, 재실패 시 해당 게임 제외하고 진행
- 빌드 실패 시: QA 에이전트가 에러 수정 후 재빌드
- 배포 실패 시: 에러 로그 분석 후 수정, Vercel 로그인 필요 시 사용자에게 안내

## 테스트 시나리오

### 정상 흐름
1. 프로젝트 초기화 → 5개 게임 병렬 개발 → 허브 페이지 → QA → 빌드 성공 → 배포

### 에러 흐름  
1. 게임 1개 개발 실패 → 재시도 → 성공 시 계속, 실패 시 4개 게임으로 진행
2. 빌드 실패 → QA가 TypeScript 에러 수정 → 재빌드 → 성공
