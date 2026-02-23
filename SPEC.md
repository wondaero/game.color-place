# Color Place 레퍼런스 (game.js 요약)

## 게임 모드
| 모드 | 버튼 | 타일 | 특징 |
|------|------|------|------|
| classic | 게임시작 | 가로세로공/십자공/자유배치 | 기본 |
| zone | 게임시작 2 | ㅁ/#/+/X/◇ 패턴 존 | 존 안에만 배치 |
| free | 게임시작 3 | 자유배치(type1/2)만 | 아무데나 |
| checker | 게임시작 4 | A(홀수칸)/B(짝수칸) 랜덤 | 체커판 제한 |

## 타일 타입
| type | 이름 | 해금 | dir | num |
|------|------|------|-----|-----|
| 3 | 가로세로공(색지정) | 기본 | rowcol | 1~5 |
| 4 | 가로세로공(색미지정) | 100판 | rowcol | 1~5 |
| 5 | 십자공(색지정) | 200판 | cross | 1~5 |
| 6 | 십자공(색미지정) | 300판 | cross | 1~5 |
| 1 | 자유(색지정) | 500판 | null | null |
| 2 | 자유(색미지정) | 1000판 | null | null |

- zone모드: dir='zone', zone='sq'|'hash'|'plus'|'x'|'dia'
- checker모드: dir='checker', pattern='A'|'B'

## 레벨 진행 (classic)
- 0pt: 4색
- 500pt: 5색
- 1000pt: 6색
- 1500pt: 6색+자동색변경
- 2000pt: 7색+자동색변경
- 2500pt: 무효블록
- 3000pt: 다크보드

## 해결 파이프라인 (턴 순서)
```
배치 → [스킬 실행 or MATCH_FIRST면 대기] → resolveAfterPlace()
→ 상쇄 → enterColorChangeMode()
→ 유저 색변경 (주변 1개 선택 → 놓은 공 색으로) → resolveAfterColorChange()
→ 체인 상쇄 → resolveColorChangeChain()
→ proceedToAutoChange() → 자동 색변경 → resolveAfterAutoChange()
→ 체인 상쇄 → resolveAutoChangeChain()
→ finishResolve() [pendingSkill 있으면 실행 후 재상쇄]
```

## 스킬 목록
| ID | 이름 | 분류 | 발동 시점 |
|----|------|------|----------|
| s1 | 올체인지 | 업적(보드클리어) | 배치 직후 |
| s2 | 주변동색(1) | 업적(3콤보) | 배치 직후 |
| s3 | 주변동색(2) | 업적(4콤보) | 배치 직후 |
| s4 | 주변선택동색 | 업적(5콤보) | 배치 직후 |
| s5 | 주변제거(무점) | c5×100 | 배치 직후 |
| s6 | 주변제거(유점) | c6×100 | 배치 직후 |
| s7 | 선택제거 | c7×100 | 배치 직후 |
| s8 | 주변전체제거 | c5×300 | 상쇄 먼저(MATCH_FIRST) |
| s9 | 선택주변제거 | c6×300 | 상쇄 먼저(MATCH_FIRST) |
| s10 | 주변동색화 | c7×300 | 상쇄 먼저(MATCH_FIRST) |
| s11 | 스포이드 | c5×500 | 배치 전 |
| s12 | 색상전체제거 | c6×500 | 배치 직후 |
| s13 | 보드전체제거 | c7×500 | 배치 직후 |
| h1 | 덮어쓰기 | 히든(0점) | 배치 조건 변경 |
| h2 | 행제거 | 히든(행동색) | 배치 직후(내 공 포함) |
| h3 | 열제거 | 히든(열동색) | 배치 직후(내 공 포함) |
| h4 | 십자제거 | 히든(십자) | 배치 직후(내 공 포함) |

`MATCH_FIRST_SKILLS = ['s8','s9','s10']`

## 색상변경 모드
- 상쇄 후 진입
- 놓은 곳 **주변 1개** 선택 → **놓은 공 색상**으로 변경
- 주변에 타일 없으면 자동 스킵
- `lastPlacedR`, `lastPlacedC`, `lastPlacedColor` 변수 사용

## 다크보드 모드 (3000pt+)
번쩍 규칙:
- 공놓기 → 주변 200ms 번쩍 → 어둠 → 진행
- 상쇄 → 전체번쩍(제거 애니 동안) → **어둠** → 색변경 선택(어두운 상태) → 어둠
- 자동색변경 → 변경된 타일+주변만 번쩍(600ms) → 어둠 → 진행
- 주변번쩍 타이머: 200ms (300ms resolve 전에 꺼짐 → double flash 방지)

관련 변수: `darkMode`, `darkRevealAll`(전체공개), `darkRevealCells`(부분공개 Set), `darkRevealTimer`

## 얼음(void) 블록
- `spawnVoidBlock()`: 기존 공에 `isVoid=true` 부여 (빈 칸에 새 공 생성 X)
- 렌더: 색상 그대로 + 오른쪽 위 `*` 뱃지 + cell에 `ice-cell` 클래스(파란 배경)
- 상쇄 시: 얼음 포함/인접 모두 **얼음만 제거**, 공은 그대로 남음
  - `iceCellsToConvert`: 상쇄 그룹 내 얼음 → isVoid=false
  - `cracked`: 상쇄 인접 얼음 → isVoid=false (삭제 X)

## 체커 패턴
- A: (r+c) % 2 === 1 → 12칸
- B: (r+c) % 2 === 0 → 13칸
- 매 타일 랜덤 A/B, 해당 패턴 꽉 차면 반대 패턴 fallback

## 세이브 데이터 구조
```js
{
  totalGames, highScore,
  unlockedSkills: ['s1',...],
  colorCollected: { c5, c6, c7 },
  achievements: { boardClear, combo3, combo4, combo5 },
  hidden: { zeroScore, rowClear, colClear, crossClear },
  scoreMultiplier: 1  // 십자히든 달성시 1.2
}
```

## 히든 미션 감지
`checkHiddenMissions(r, c, bySkill)` — 배치 직후만 호출
- 행/열 전체 동색 → rowClear/colClear
- 배치 위치 기준 십자 동색 (스킬 아닐 때만) → crossClear

## 점수 계산
`calcScore(cleared, comboNum, missionDone)`
- `cleared × 10 × max(combo,1) × scoreMultiplier`
- 퀘스트 보너스: 기본 bonus, 1연속+10, 2연속+×2

## 퀘스트 (인게임 미션)
MISSION_SHAPES: h3(가로3), v3(세로3), ㄱ, ㄴ, ㄱ반전, ㄴ반전
- 3턴 안에 완성 못하면 갱신
- bonus: 30~40점

## 주요 함수 위치 (game.js)
- `generateTile` : 타일 생성
- `getValidCells` : 배치 가능 셀
- `executeSkill` : 스킬 실행 switch
- `handleSkillSelect` : 선택형 스킬 처리
- `enterColorChangeMode` : 색변경 진입
- `animateRemoval` : 상쇄 애니메이션 + 색수집 카운트
- `gameOver` : 세이브 + 해금 처리
- `window.DEV` : 콘솔 테스트 헬퍼
