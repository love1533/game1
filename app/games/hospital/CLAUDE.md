# 이현봇 병원 대모험 (Ihyunbot's Hospital Adventure)

> 꼬마 로봇 의사 "이현봇"이 3D 병원을 탐험하며 환자를 치료하는 탑다운/쿼터뷰 어드벤처 게임

---

## 📌 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| **제목** | 이현봇 병원 대모험 |
| **장르** | 3D 탑다운 어드벤처 / 캐주얼 게임 |
| **타겟 플랫폼** | 웹 (데스크톱 + 모바일), PWA |
| **비주얼** | Roblox 스타일 저폴리(low-poly) 3D |
| **배포** | Vercel 정적 호스팅 (백엔드 없음) |
| **저장** | localStorage (클라이언트 전용) |
| **세션 길이** | 1회 플레이 3~10분 |
| **라이선스** | 개인 프로젝트 |

### 1.1 제약사항
- **프론트엔드 전용**: 서버·DB·인증 일체 없음
- **Vercel 정적 배포**: SSR 필요 없음
- **모바일 우선**: 터치 조이스틱 필수
- **에셋**: CC0/MIT 무료 에셋만 사용 (Kenney, Quaternius 등)

---

## 🎨 2. 비주얼 컨셉

### 2.1 아트 스타일
- **Roblox 스타일 저폴리 3D**
- 밝고 채도 높은 색상 팔레트
- Flat shading 또는 soft toon shading
- PBR 없음, 단순 MeshStandardMaterial/MeshToonMaterial
- 앰비언트 라이트 + 1개 디렉셔널 라이트 (부드러운 그림자)

### 2.2 컬러 팔레트
```
Primary:   #FF6B6B (의료 빨강)
Secondary: #4ECDC4 (민트, 이현봇 메인)
Accent:    #FFE66D (노란 약)
BG Wall:   #F7F7F7 (밝은 회백)
BG Floor:  #E8E8E8 (타일)
Success:   #95E1D3
Warning:   #F38181
```

### 2.3 카메라
- **3인칭 쿼터뷰 (isometric-like)**
- 각도: pitch -45°, yaw 따라 회전 가능
- 캐릭터 위에서 약간 뒤쪽, 살짝 내려다보는 구도
- `OrbitControls` 대신 캐릭터 트래킹 카메라 (부드러운 lerp)

---

## 🛠️ 3. 기술 스택

### 3.1 핵심
```json
{
  "runtime": "Node.js 20+",
  "package_manager": "pnpm (권장) 또는 npm",
  "framework": "Vite 5 + React 19 + TypeScript 5",
  "rendering": "Three.js (latest) + @react-three/fiber v9",
  "helpers": "@react-three/drei",
  "physics": "@react-three/rapier",
  "state": "zustand",
  "audio": "howler",
  "mobile_input": "nipplejs (가상 조이스틱)",
  "post_fx": "@react-three/postprocessing (선택)",
  "dev_tools": "leva (개발 중 파라미터 튜닝)"
}
```

### 3.2 설치 커맨드
```bash
# 프로젝트 초기화
pnpm create vite@latest ihyunbot-hospital -- --template react-ts
cd ihyunbot-hospital

# 3D 코어
pnpm add three @react-three/fiber @react-three/drei
pnpm add @react-three/rapier @react-three/postprocessing

# 게임 시스템
pnpm add zustand howler nipplejs

# 유틸
pnpm add clsx

# 타입 정의
pnpm add -D @types/three @types/howler

# 개발 도구 (선택)
pnpm add -D leva
```

### 3.3 빌드/배포
- **개발**: `pnpm dev`
- **빌드**: `pnpm build` → `dist/` 정적 파일
- **Vercel**: `vercel.json`에서 `dist` 지정, SPA fallback 설정

---

## 📁 4. 프로젝트 구조

```
ihyunbot-hospital/
├── public/
│   ├── models/              # .glb 3D 모델
│   │   ├── ihyunbot.glb     # 메인 캐릭터 (이현봇)
│   │   ├── hospital.glb     # 병원 맵 (통합 or 파츠별)
│   │   ├── patients/        # 환자 모델들
│   │   └── tools/           # 도구 (청진기, 주사기, 약 등)
│   ├── textures/            # 추가 텍스처 (필요시)
│   ├── sounds/
│   │   ├── bgm/             # 배경음악
│   │   └── sfx/             # 효과음
│   └── ui/                  # UI 아이콘 PNG/SVG
├── src/
│   ├── App.tsx              # 루트 (Canvas + UI 레이어)
│   ├── main.tsx
│   ├── game/
│   │   ├── Scene.tsx        # <Canvas> 내부 루트 씬
│   │   ├── Hospital.tsx     # 병원 환경 + 충돌체
│   │   ├── Ihyunbot.tsx     # 플레이어 캐릭터
│   │   ├── Patient.tsx      # 환자 컴포넌트
│   │   ├── Tool.tsx         # 도구 오브젝트
│   │   ├── Camera.tsx       # 추적 카메라
│   │   └── Lighting.tsx     # 조명 셋업
│   ├── controls/
│   │   ├── useKeyboard.ts   # WASD/화살표
│   │   ├── useJoystick.ts   # 모바일 터치
│   │   └── useInteract.ts   # 상호작용 (Space/탭)
│   ├── systems/
│   │   ├── interaction.ts   # 근접 감지 + 상호작용 로직
│   │   ├── inventory.ts     # 인벤토리 관리
│   │   ├── dialogue.ts      # 말풍선/대사
│   │   └── save.ts          # localStorage 저장/로드
│   ├── state/
│   │   ├── gameStore.ts     # 전역 게임 상태 (Zustand)
│   │   ├── playerStore.ts   # 플레이어 상태
│   │   └── patientStore.ts  # 환자 상태
│   ├── data/
│   │   ├── patients.ts      # 환자 정의 (증상, 치료법)
│   │   ├── tools.ts         # 도구 정의
│   │   ├── rooms.ts         # 방 정의 (위치, 타입)
│   │   └── days.ts          # 스테이지/Day 정의
│   ├── ui/
│   │   ├── HUD.tsx          # 체력/코인/인벤토리 바
│   │   ├── Joystick.tsx     # 모바일 조이스틱
│   │   ├── Dialogue.tsx     # 대사창
│   │   ├── PauseMenu.tsx
│   │   └── MainMenu.tsx
│   ├── types/
│   │   └── game.ts          # 공용 타입
│   ├── hooks/
│   │   └── useIsMobile.ts
│   └── styles/
│       └── global.css
├── index.html
├── vite.config.ts
├── tsconfig.json
├── vercel.json
├── package.json
└── CLAUDE.md                # 이 문서
```

---

## 🧩 5. 데이터 모델 (TypeScript)

```ts
// src/types/game.ts

export type Vec3 = [number, number, number];

export type ToolId =
  | 'stethoscope'    // 청진기
  | 'syringe'        // 주사기
  | 'pill'           // 약
  | 'bandage'        // 붕대
  | 'thermometer';   // 체온계

export interface Tool {
  id: ToolId;
  name: string;
  nameKo: string;
  modelPath: string;      // public/models/tools/xxx.glb
  iconPath: string;       // UI 아이콘
  description: string;
}

export type SymptomId =
  | 'fever'       // 열
  | 'wound'       // 상처
  | 'cough'       // 기침
  | 'fracture'    // 골절
  | 'stomachache';// 복통

export interface Symptom {
  id: SymptomId;
  emoji: string;          // 말풍선에 뜨는 임시 아이콘 (추후 3D 아이콘으로 교체)
  requiredTool: ToolId;
  hint: string;           // 힌트 텍스트
}

export type PatientState =
  | 'waiting'     // 대기 중
  | 'diagnosed'   // 진료됨, 치료 대기
  | 'treated'     // 치료 완료
  | 'discharged'; // 퇴원

export interface Patient {
  id: string;
  name: string;
  modelPath: string;
  position: Vec3;
  roomId: string;
  symptom: SymptomId;
  state: PatientState;
  dialogue: {
    waiting: string;
    treated: string;
  };
}

export type RoomId =
  | 'reception'   // 접수/대기실
  | 'clinic'      // 진료실
  | 'injection'   // 주사실
  | 'surgery'     // 수술실
  | 'pharmacy'    // 약국
  | 'ward';       // 입원실

export interface Room {
  id: RoomId;
  name: string;
  nameKo: string;
  bounds: {
    min: Vec3;
    max: Vec3;
  };
  spawnPoints: Vec3[];     // 환자 스폰 위치
  color: string;           // 방 식별 컬러
}

export interface Day {
  day: number;
  title: string;
  patientCount: number;
  availableSymptoms: SymptomId[];
  unlockedTools: ToolId[];
  timeLimit?: number;      // 초 단위, 없으면 무제한
  bossEvent?: boolean;
}

export interface PlayerState {
  position: Vec3;
  rotation: number;
  battery: number;         // 0-100 (HP 대신)
  coins: number;
  inventory: ToolId[];
  activeTool: ToolId | null;
  stars: number;           // 누적 별
}

export interface GameState {
  phase: 'menu' | 'playing' | 'paused' | 'dayComplete' | 'gameOver';
  currentDay: number;
  patientsRemaining: number;
  patientsHealed: number;
  mistakes: number;
  startedAt: number;
}
```

---

## ⚙️ 6. 핵심 시스템 명세

### 6.1 캐릭터 이동
- **데스크톱**: WASD / 화살표 → 카메라 상대 방향 이동
- **모바일**: 화면 좌하단 가상 조이스틱 (nipplejs)
- 속도: 기본 4 units/sec, 대쉬 시 7 units/sec
- 이동 시 `walk` 애니메이션, 정지 시 `idle`
- 충돌: Rapier CapsuleCollider (높이 1.6, 반지름 0.3)
- 모델 회전: 이동 방향으로 부드럽게 lerp (slerp rate 0.15)

### 6.2 상호작용 시스템
```ts
// 매 프레임 체크
// 1. 이현봇 반경 1.5 units 내 인터랙터블 탐색
// 2. 가장 가까운 대상 하이라이트 (outline 또는 위쪽 ↓ 아이콘)
// 3. Space/탭 입력 시:
//    - 환자인 경우: activeTool과 symptom.requiredTool 비교
//    - 도구인 경우: 인벤토리에 추가
//    - 문인 경우: 방 전환 (필요 시)
```

### 6.3 인벤토리
- 최대 4슬롯
- 단축키: 1, 2, 3, 4 (데스크톱) / 하단 UI 탭 (모바일)
- 활성 도구는 이현봇 손에 3D 모델로 부착 (bone attach 또는 hand transform)

### 6.4 환자 AI (단순)
- **waiting**: 제자리, 말풍선 위로 떠오르는 bob 애니메이션, 증상 아이콘 회전
- **treated**: 환한 색으로 변하고 ⭐ 파티클
- **discharged**: 출구 쪽으로 walk 애니메이션 후 fade out

### 6.5 카메라
```ts
// Smooth follow camera
const CAMERA_OFFSET: Vec3 = [0, 8, 6];
const CAMERA_LOOK_OFFSET: Vec3 = [0, 0.5, 0];
const CAMERA_LERP = 0.08;

// useFrame 내부에서:
// target = playerPos + CAMERA_OFFSET
// camera.position.lerp(target, CAMERA_LERP)
// camera.lookAt(playerPos + CAMERA_LOOK_OFFSET)
```

### 6.6 저장 시스템
- 키: `ihyunbot:save:v1`
- 저장 타이밍: Day 클리어 시, 메뉴 진입 시
- 구조: `{ player, progress, settings }` JSON 직렬화

---

## 🎨 7. 에셋 소싱

### 7.1 3D 모델 (우선순위 순)

| 용도 | 소스 | 라이선스 | URL |
|---|---|---|---|
| 이현봇 캐릭터 | Quaternius - Ultimate Robots | CC0 | https://quaternius.com/packs/ultimaterobots.html |
| 병원 환경 | Kenney - Hospital Kit | CC0 | https://kenney.nl/assets/hospital-kit |
| 환자 (사람) | Kenney - Character Pack | CC0 | https://kenney.nl/assets/character-pack |
| 의료 도구 | Poly Pizza 검색 (stethoscope, syringe 등) | CC BY / CC0 | https://poly.pizza/ |
| 애니메이션 | Mixamo (리타겟) | 무료 | https://www.mixamo.com/ |

### 7.2 사운드

| 용도 | 소스 |
|---|---|
| BGM | Kenney Music Loops, Pixabay |
| SFX (발소리, 삐-, 딩동) | Freesound, Kenney Interface Sounds |

### 7.3 에셋 최적화
- **GLTF/GLB** 포맷만 사용
- **Draco 압축** 적용 (`gltf-pipeline -i in.glb -o out.glb -d`)
- 텍스처: 최대 1024x1024, WebP 권장
- 폴리곤: 캐릭터 1개당 3k 이하, 환경 오브젝트 500 이하
- 공유 머터리얼 인스턴싱

### 7.4 에셋 명명 규칙
```
캐릭터:  char_[name]_[state].glb      예) char_ihyunbot_idle.glb
환경:    env_[room]_[object].glb      예) env_clinic_bed.glb
도구:    tool_[id].glb                예) tool_stethoscope.glb
사운드:  sfx_[action].mp3             예) sfx_heal.mp3
```

---

## 🎮 8. 게임 컨텐츠

### 8.1 방 구성 (아이 그림 기반)
```
       [접수/대기실 Reception]
              |
       [진료실 Clinic] ---- [주사실 Injection]
              |                    |
       [수술실 Surgery] ---- [약국 Pharmacy]
              |
       [입원실 Ward - 침대 4개]
```

### 8.2 도구 목록 (Phase 1 MVP는 ★표시만)

| ID | 이름 | 대응 증상 | MVP |
|---|---|---|---|
| stethoscope | 청진기 | (진단용, 증상 공개) | ★ |
| pill | 약 | 열, 복통 | ★ |
| syringe | 주사기 | 기침 | |
| bandage | 붕대 | 상처 | |
| thermometer | 체온계 | (진단 보조) | |

### 8.3 Day 진행

| Day | 환자 수 | 해금 도구 | 특이사항 |
|---|---|---|---|
| 1 | 2 | 청진기, 약 | 튜토리얼 |
| 2 | 3 | + 붕대 | |
| 3 | 4 | + 주사기 | 응급환자 1명 등장 |
| 4 | 5 | 전체 | |
| 5 | 보스 | - | 로봇 바이러스 |

---

## 🚀 9. 구현 단계 (Claude Code 실행 순서)

### Phase 0: 프로젝트 셋업 (0.5일)
1. Vite + React + TS 프로젝트 생성
2. 위 의존성 전부 설치
3. `vercel.json` 작성 (SPA 설정)
4. 빈 `<Canvas>` 렌더링 확인
5. Git 초기화, `.gitignore`에 `node_modules`, `dist` 추가

**완료 기준**: `pnpm dev` 실행 시 빈 3D 씬 표시

### Phase 1: 캐릭터 + 이동 (1~2일)
1. Quaternius Robot 다운로드, `public/models/ihyunbot.glb`로 배치
2. `<Ihyunbot />` 컴포넌트 작성 (`useGLTF` 로드)
3. 키보드 입력 훅 (`useKeyboard`)
4. `useFrame`으로 position 업데이트
5. Rapier 물리 바디 부착 (KinematicCharacterController)
6. 애니메이션 (idle, walk) 블렌딩
7. 추적 카메라 구현

**완료 기준**: WASD로 로봇이 평면 위를 걸어다니고 카메라가 따라옴

### Phase 2: 병원 환경 (1~2일)
1. Kenney Hospital Kit 다운로드
2. 병원 맵 조립 — 옵션 A: Blender에서 단일 `.glb`로 export / 옵션 B: 파츠별 로드 후 코드로 배치
3. 벽·가구 충돌체 (`<RigidBody type="fixed">`)
4. 방별 영역 정의 (`rooms.ts`)
5. 조명 셋업 (ambient + directional + 방별 포인트 라이트)

**완료 기준**: 이현봇이 병원 내부를 벽에 막히며 돌아다님

### Phase 3: 환자 & 상호작용 (2일)
1. 환자 모델 로드 (Kenney Character Pack)
2. `<Patient />` 컴포넌트: 위치·증상·상태
3. 머리 위 `<Html>` (drei)로 말풍선 표시
4. 근접 감지 훅 (`useInteract`)
5. 인벤토리 상태 (Zustand) + UI
6. 도구 픽업 로직
7. 치료 로직: `activeTool === symptom.requiredTool` 체크

**완료 기준**: 청진기 들고 환자에게 가서 Space → 치료 완료 연출

### Phase 4: 게임 루프 & UI (1~2일)
1. Day 시스템 (`days.ts` 로드)
2. HUD (배터리, 코인, 별, 인벤토리)
3. 메인 메뉴 / 일시정지 / Day 클리어 화면
4. 저장/로드 시스템
5. BGM/SFX 통합

**완료 기준**: Day 1 시작 → 환자 모두 치료 → Day 클리어 화면 → Day 2 로드

### Phase 5: 모바일 & 폴리시 (1~2일)
1. `useIsMobile` 분기
2. nipplejs 조이스틱 + 상호작용 버튼 UI
3. 반응형 HUD
4. 파티클·이펙트 (치료 시 ✨)
5. 포스트프로세싱 (선택: bloom, outline)
6. PWA 매니페스트 + 아이콘

**완료 기준**: 아이폰/안드로이드 브라우저에서 풀 플레이 가능

### Phase 6: 배포
1. `pnpm build` 검증
2. Vercel 연결 (GitHub 레포)
3. 프리뷰 배포 → 프로덕션 승격
4. Lighthouse 점검 (Performance 80+ 목표)

---

## 📊 10. 성능 예산

| 지표 | 데스크톱 | 모바일 |
|---|---|---|
| 목표 FPS | 60 | 30~60 |
| 초기 로드 | 5초 이하 | 8초 이하 |
| 번들 크기 (JS) | 1MB 이하 | 동일 |
| 에셋 총량 | 15MB 이하 | 10MB 이하 (모바일 분기 로드) |
| Draw calls | 150 이하 | 100 이하 |
| 메모리 | 300MB 이하 | 200MB 이하 |

### 최적화 기법
- 모델 Draco 압축
- 텍스처 KTX2/WebP
- 인스턴싱 (환자·가구 등 반복 오브젝트)
- Frustum culling 기본 활성
- LOD 적용 (멀리 있는 오브젝트)
- `<Suspense>` + lazy load
- 방 단위 활성화/비활성화

---

## 🔑 11. Claude Code 실행 가이드

### 11.1 초기 프롬프트 예시
```
이 CLAUDE.md를 읽고 Phase 0부터 Phase 1까지 구현해줘.
완료 후 `pnpm dev`로 실행 가능한 상태여야 하고,
WASD로 이현봇이 평면에서 움직이는 것까지 확인할 수 있어야 해.
각 Phase 완료 후 커밋하고, 구현 결정사항은 docs/DECISIONS.md에 기록해.
```

### 11.2 반복 프롬프트 패턴
```
현재 Phase [N] 완료. 다음 Phase [N+1] 시작해줘.
- CLAUDE.md의 해당 섹션 준수
- 완료 기준 충족 시 커밋
- 막히면 docs/BLOCKERS.md에 남기고 중단
```

### 11.3 디버깅 컨벤션
- 모든 에러는 `src/utils/logger.ts`로 중앙화
- 개발 중 `leva` 컨트롤로 파라미터 라이브 조정
- `?debug=1` 쿼리 시 콜라이더·그리드 시각화

### 11.4 규칙
1. **외부 API 호출 금지** (백엔드 없음)
2. **라이선스 명시되지 않은 에셋 금지**
3. **타입스크립트 strict 모드 유지**
4. **커밋 단위는 기능별** (Phase 내에서도 세분화)
5. **CSS-in-JS 금지**, 순수 CSS 또는 Tailwind 중 택일 (권장: Tailwind)
6. 3D 씬 내부는 반드시 `@react-three/fiber` 컴포넌트로만 구성 (DOM 금지, HTML 오버레이는 `<Html>` drei 사용)

---

## 📝 12. 오픈 이슈 (Claude Code가 결정할 사항)

- [ ] **맵 로딩 방식**: 단일 GLB vs 파츠별 조립 — 첫 구현은 파츠별 권장
- [ ] **이현봇 커스터마이징**: 컬러 변경 기능 포함 여부 (Phase 5+)
- [ ] **다국어**: 기본 한글, 영어 지원 여부
- [ ] **사운드 라이선스**: 실제 선택한 트랙 URL을 `CREDITS.md`에 기록
- [ ] **Tailwind vs 순수 CSS**: Tailwind 권장 (모바일 반응형 빠름)

---

## 🙏 13. 크레딧 (배포 시 `CREDITS.md`에 기재)
- 3D Models: Quaternius (CC0), Kenney.nl (CC0)
- Animations: Mixamo by Adobe
- Sounds: [실제 선택한 것 기재]
- Font: [선택 시 기재 — 추천: Gaegu 또는 Gowun Dodum, Google Fonts]
- Built with Three.js, React Three Fiber

---

**문서 버전**: v1.0
**최종 수정**: 2026-04-21
**작성자**: 김민구 × Claude