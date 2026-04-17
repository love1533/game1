---
name: game-qa
description: "게임 프로젝트의 빌드 검증, 코드 품질, 모바일 호환성을 테스트하는 스킬. 게임 테스트, 게임 검증, 빌드 확인, QA 요청 시 사용."
---

# Game QA Skill

Next.js 게임 프로젝트의 품질을 검증한다.

## 검증 단계

### 1. 빌드 검증
```bash
npm run build
```
빌드 실패 시 에러를 분석하고 직접 수정한다.

### 2. 구조 검증
- 모든 게임 라우트 존재 확인 (app/games/*/page.tsx)
- 'use client' 디렉티브 확인
- 메인 허브(app/page.tsx)에서 모든 게임 링크 확인

### 3. 게임 로직 검증
- Canvas ref 초기화 확인
- requestAnimationFrame 게임 루프 확인
- cleanup(cancelAnimationFrame) 확인
- 터치 이벤트 핸들링 확인
- 게임 오버/재시작 로직 확인

### 4. 모바일 호환성
- viewport 설정 확인
- touch-action: none 설정 확인
- 반응형 Canvas 크기 확인

## 발견된 문제 처리
- TypeScript 에러: 직접 수정
- 빌드 에러: 직접 수정
- 로직 문제: 보고서에 기술
