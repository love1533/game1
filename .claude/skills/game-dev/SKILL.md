---
name: game-dev
description: "Next.js/React 기반 모바일 미니게임을 개발하는 스킬. 점프 게임, 달리기 게임, 매칭 게임, 퀴즈, 꾸미기 등 HTML5 Canvas 게임을 React 컴포넌트로 구현. 게임 만들기, 게임 개발, 미니게임, 캐릭터 게임, 모바일 게임 요청 시 사용. 게임 수정, 게임 업데이트, 난이도 조절, 캐릭터 추가, 새 게임 추가 요청 시에도 사용."
---

# Game Development Skill

Next.js App Router 프로젝트에서 HTML5 Canvas 미니게임을 React 컴포넌트로 구현한다.

## 프로젝트 구조

```
app/
├── page.tsx              # 메인 허브 (게임 선택)
├── layout.tsx            # 공통 레이아웃
├── globals.css           # Tailwind + 글로벌 스타일
└── games/
    ├── jump/page.tsx     # 점프점프
    ├── runner/page.tsx   # 캐릭터 달리기
    ├── match/page.tsx    # 짝맞추기
    ├── quiz/page.tsx     # 퀴즈 대결
    └── dress/page.tsx    # 꾸미기
components/
├── GameCanvas.tsx        # Canvas 래퍼 컴포넌트
└── BackButton.tsx        # 홈으로 돌아가기 버튼
```

## 게임 구현 패턴

각 게임 페이지는 다음 구조를 따른다:

```tsx
'use client';
import { useRef, useEffect, useState, useCallback } from 'react';

export default function GamePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  
  // 게임 로직은 useEffect 내에서 Canvas API로 구현
  // 터치/클릭 이벤트는 Canvas에 직접 바인딩
  // requestAnimationFrame으로 60fps 게임 루프
  // cleanup에서 cancelAnimationFrame
}
```

## 캐릭터 렌더링

Canvas에 캐릭터를 그릴 때 이모지 + 원형 배경 + 이름 라벨 조합:
- 수현: 보라색(#9B59B6) 배경, 😎 이모지
- 이현: 파란색(#3498DB) 배경, 🤓 이모지  
- 은영: 핑크색(#E91E8C) 배경, 🥰 이모지
- 민구: 초록색(#2ECC71) 배경, 😜 이모지

## 모바일 최적화 필수사항

1. Canvas 크기: `window.innerWidth`, `window.innerHeight` 기반 반응형
2. 터치 이벤트: `touchstart`, `touchmove`, `touchend` 처리
3. viewport: layout.tsx에 `viewport` export 설정
4. 스크롤 방지: Canvas에서 `touch-action: none`
5. 더블탭 줌 방지

## 효과음 (Web Audio API)

간단한 비프음으로 효과음 생성 (외부 파일 불필요):
```tsx
const playSound = (freq: number, duration: number) => {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  osc.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
};
```

## 게임별 핵심 메커닉

### 1. 점프점프 (jump)
- 캐릭터가 발판을 밟고 계속 위로 올라감
- 좌우 틸트 또는 터치로 이동
- 발판 종류: 일반, 움직이는, 부서지는
- 높이 = 점수

### 2. 캐릭터 달리기 (runner)
- 자동 스크롤, 탭하면 점프
- 장애물: 돌, 구덩이
- 코인 수집
- 4캐릭터 중 선택

### 3. 짝맞추기 (match)
- 4x4 카드 그리드
- 캐릭터 이모지 매칭
- 제한 시간 내 모두 맞추기
- 최소 뒤집기 수 = 점수

### 4. 퀴즈 대결 (quiz)
- 재미있는 OX 퀴즈
- 캐릭터가 정답/오답 리액션
- 연속 정답 보너스
- 초등학생 수준 문제

### 5. 꾸미기 (dress)
- 캐릭터 선택 후 아이템 배치
- 모자, 안경, 배경 등
- 터치로 드래그 & 드롭
- 완성 후 스크린샷(Canvas toDataURL)
