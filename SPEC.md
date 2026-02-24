# Color Place — SPEC (코딩 레퍼런스)

---

## 모드 비교 (한눈에)

| 항목 | classic | zone | free | checker |
|------|---------|------|------|---------|
| 버튼 | 게임시작 | 게임시작2 | 게임시작3 | 게임시작4 |
| 배치 제한 | 행/열 | 존(ㅁ/#/+/X/◇) | 없음 | A칸/B칸 |
| 타일 방향 | rowcol / cross | zone | null | checker |
| 상쇄 최소 | **3개** | **3개** | **4개** | **3개** |
| 시작 색상 | 4색 | 4색 | 5색 | 4색 |
| 레벨표 | LEVELS | LEVELS | LEVELS_FREE | LEVELS_CHECKER |

---

## 레벨 진행

### classic / zone (LEVELS)
- 0pt: 4색
- 500pt: 5색
- 1000pt: 6색
- 1500pt: 6색 + 자동색변경
- 2000pt: 7색 + 자동색변경
- 2500pt: 얼음 블록
- 3000pt: 다크보드

### free — 게임3 (LEVELS_FREE)
- 0pt: 5색
- 1000pt: 6색
- 1500pt: 7색
- 2000pt: 자동색변경
- 3000pt: 얼음 시작
- 5000pt: 다크보드

### checker — 게임4 (LEVELS_CHECKER)
- 0pt: 4색
- 500pt: 5색
- 1000pt: 6색
- 1500pt: 7색
- 2000pt: 자동색변경
- 3000pt: 얼음 시작

---

## 상태 변수 (시스템별)

### 게임 진행
| 변수 | 설명 |
|------|------|
| `gameMode` | 'classic' \| 'zone' \| 'free' \| 'checker' |
| `inputLocked` | true면 클릭 무시 |
| `combo` | 현재 콤보 수 |
| `score` | 현재 점수 |
| `queue[0]` | 현재 타일, `[1]` next, `[2]` nextnext |

### 색변경 모드
| 변수 | 설명 |
|------|------|
| `colorChangeMode` | true면 색변경 대기 중 |
| `lastPlacedR/C` | 마지막 배치 위치 |
| `lastPlacedColor` | 마지막 배치 색상 |

### 다크보드
| 변수 | 설명 |
|------|------|
| `darkMode` | 다크보드 활성화 여부 |
| `darkRevealAll` | true면 전체 공개 (상쇄 중) |
| `darkRevealCells` | Set\<"r,c"\> — 부분 번쩍 셀 |
| `darkRevealTimer` | 번쩍 타이머 ID |
| `darkPreviewActive` | 5초 미리보기 중 |

### 얼음 블록
| 변수 | 설명 |
|------|------|
| `tile.isVoid` | true = 얼음 상태 |
| `iceCellsToConvert` | 그룹 내 얼음 → isVoid=false |
| `cracked` | 인접 얼음 → isVoid=false (삭제 X) |

### 스킬
| 변수 | 설명 |
|------|------|
| `pendingSkill` | MATCH_FIRST 스킬 대기 객체 |
| `skillSelectMode` | 선택형 스킬 대기 객체 |
| `spoideMode` | 스포이드 스킬 활성화 |

---

## 비직관 동작 모음 (Gotchas)

- **free 모드만 4-match**, 나머지는 3개
- `spawnVoidBlock()`: 빈 칸에 새 공 X, **기존 공에 `isVoid=true`** 부여
- 얼음 블록: `cracked`(인접) → `isVoid=false` (사라지지 않음, 해제만)
- `findMatches()` BFS는 얼음 타일도 **동일 색이면 포함** (outer loop는 스킵, inner에서 연결)
- `collectCells()`: 얼음 제외 → 실제 제거 대상만
- `setStatus(null)` → queue[0]에 스킬 있으면 자동으로 스킬 설명 표시
- 다크보드: 상쇄 시 `darkRevealAll=true` → `finishResolve()`에서 false
- 색변경: 주변 타일 없으면 자동 스킵 → `proceedToAutoChange()`

---

## 해결 파이프라인 (턴 순서)

```
배치
→ [MATCH_FIRST 스킬이면 pendingSkill 저장, 아니면 스킬 즉시 실행]
→ resolveAfterPlace()
  → 상쇄 있으면: animateRemoval() → enterColorChangeMode()
  → 없으면: finishResolve()
→ 유저 색변경 1개 선택 → resolveAfterColorChange()
  → 체인 상쇄: resolveColorChangeChain() (반복)
→ proceedToAutoChange()
  → autoChange 있으면: doAutoColorChange() → resolveAfterAutoChange()
    → 체인 상쇄: resolveAutoChangeChain() (반복)
→ finishResolve()
  → pendingSkill 있으면 스킬 실행 후 재상쇄 → enterColorChangeMode()
  → setStatus(null) → renderAll() → checkGameOver()
```

---

## 타일 구조

```js
{
  type: 1|2|3|4|5|6,   // 타일 종류
  color: 'c1'~'c7' | null, // null = 색미지정
  dir: 'rowcol'|'cross'|'zone'|'checker'|null,
  num: 1~5 | null,      // rowcol/cross 번호
  zone: 'sq'|'hash'|'plus'|'x'|'dia', // zone 모드
  pattern: 'A'|'B',    // checker 모드
  skill: 's1'~'s13'|'h1'~'h4' | null,
  isVoid: true|false   // 얼음 여부 (board 타일에만)
}
```

---

## 얼음(void) 블록

- `spawnVoidBlock()`: 기존 공에 `isVoid=true` 부여 (빈 칸에 새 공 생성 X)
- 렌더: 색상 그대로 + 오른쪽 위 `*` 뱃지 + cell에 `ice-cell` 클래스(파란 배경)
- 상쇄 시: 얼음만 해제, 공은 그대로
  - 그룹 내 얼음(`iceCellsToConvert`) → `isVoid=false`
  - 인접 얼음(`cracked`) → `isVoid=false` (삭제 X)

---

## 체커 패턴

- A: `(r+c) % 2 === 1` → 12칸
- B: `(r+c) % 2 === 0` → 13칸
- 매 타일 랜덤 A/B, 해당 패턴 꽉 차면 반대 패턴 fallback
- A칸의 상하좌우는 항상 B칸 (같은 패턴끼리 직접 인접 불가)

---

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
| s8 | 주변전체제거 | c5×300 | MATCH_FIRST |
| s9 | 선택주변제거 | c6×300 | MATCH_FIRST |
| s10 | 주변동색화 | c7×300 | MATCH_FIRST |
| s11 | 스포이드 | c5×500 | 배치 전 |
| s12 | 색상전체제거 | c6×500 | 배치 직후 |
| s13 | 보드전체제거 | c7×500 | 배치 직후 |
| h1 | 덮어쓰기 | 히든(0점) | 배치 조건 변경 |
| h2 | 행제거 | 히든(행동색) | 배치 직후 |
| h3 | 열제거 | 히든(열동색) | 배치 직후 |
| h4 | 십자제거 | 히든(십자) | 배치 직후 |

`MATCH_FIRST_SKILLS = ['s8','s9','s10']`

---

## 스킬 뱃지 / 상태 표시

- 스킬 뱃지: 공 오른쪽 위 **흰색 동그라미** (텍스트 없음, 그림자로 가시성 확보)
- current 타일에 스킬 있으면 하단 status에 `[스킬명] 설명` 자동 표시
  - `setStatus(null)` 호출 시 `queue[0].skill` 체크 → 있으면 desc 표시
  - 다른 상태 메시지(색변경 등) 뜨면 override, 턴 종료(`finishResolve`) 후 복귀

---

## 색상변경 모드

- 상쇄 후 진입
- 놓은 곳 **주변 1개** 선택 → **놓은 공 색상**으로 변경
- 주변에 타일 없으면 자동 스킵 → `proceedToAutoChange()`
- `lastPlacedR`, `lastPlacedC`, `lastPlacedColor` 변수 사용

---

## 다크보드 모드

번쩍 규칙:
- 공놓기 → 주변 200ms 번쩍 → 어둠 → 진행
- 상쇄 → 전체번쩍(제거 애니 동안) → 어둠 → 색변경(어두운 상태) → 어둠
- 자동색변경 → 변경 타일+주변 번쩍(600ms) → 어둠 → 진행

---

## 점수 계산

`calcScore(cleared, comboNum, missionDone)`
- `cleared × 10 × max(combo,1) × scoreMultiplier`
- 퀘스트 보너스: 기본 bonus, 1연속+10, 2연속+×2
- 얼음 타일은 cleared 카운트에 미포함 (변환만, 제거 X)

---

## 퀘스트 (인게임 미션)

- MISSION_SHAPES: h3(가로3), v3(세로3), ㄱ, ㄴ, ㄱ반전, ㄴ반전
- 3턴 안에 완성 못하면 갱신
- bonus: 30~40점

---

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

---

## 주요 함수 위치 (game.js)

- `generateTile(useBoard)` : 타일 생성 — 모드별 분기
- `getValidCells(tile)` : 배치 가능 셀 반환
- `findMatches()` : BFS 상쇄 감지 — free는 4개, 나머지 3개
- `collectCells(matches)` : 제거 대상 Set (얼음 제외)
- `collectIceCells(matches)` : 변환 대상 얼음 Set
- `animateRemoval(cellsToRemove, clearedList, iceCellsToConvert, callback)` : 상쇄 애니
- `crackAdjacentVoids(clearedCells, iceToConvert)` : 인접 얼음 크랙 목록 반환
- `executeSkill(id, r, c, color, callback)` : 스킬 실행 switch
- `handleSkillSelect(r, c)` : 선택형 스킬 처리
- `enterColorChangeMode()` : 색변경 진입
- `finishResolve()` : 턴 최종 마무리
- `setStatus(text, color)` : 상태 표시 — null이면 스킬 desc 자동 표시
- `gameOver()` : 세이브 + 해금 처리
- `window.DEV` : 콘솔 테스트 헬퍼
