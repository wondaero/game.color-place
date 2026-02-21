// ============================================================
// CONSTANTS
// ============================================================
const ALL_COLORS = ['c1','c2','c3','c4','c5','c6','c7'];
const COLOR_KR = {c1:'1',c2:'2',c3:'3',c4:'4',c5:'5',c6:'6',c7:'7'};
const COLOR_HEX = {c1:'#D32F2F',c2:'#6D4C41',c3:'#FBC02D',c4:'#388E3C',c5:'#1565C0',c6:'#7B1FA2',c7:'#00ACC1'};

// Apply CSS variables
(function() {
  const root = document.documentElement.style;
  ALL_COLORS.forEach(c => root.setProperty('--c-' + c, COLOR_HEX[c]));
})();
const BOARD_SIZE = 5;

// Tile types & unlock thresholds (games played)
// type 3 always available, rest unlock at milestones
const ALL_TILE_TYPES = [
  { type: 3, weight: 90, unlockGames: 0 },
  { type: 4, weight: 2,  unlockGames: 100 },
  { type: 5, weight: 2,  unlockGames: 200 },
  { type: 6, weight: 2,  unlockGames: 300 },
  { type: 1, weight: 2,  unlockGames: 500 },
  { type: 2, weight: 2,  unlockGames: 1000 },
];

// Skill definitions
const SKILL_DEFS = [
  // 업적 기반
  { id:'s1',  name:'올체인지',       weight:25, desc:'모든 타일을 놓은 공 색상으로 변경' },
  { id:'s2',  name:'주변동색(1)',    weight:25, desc:'주변 랜덤 1개를 놓은 공 색상으로 변경' },
  { id:'s3',  name:'주변동색(2)',    weight:25, desc:'주변 랜덤 2개를 놓은 공 색상으로 변경' },
  { id:'s4',  name:'주변선택동색',   weight:25, desc:'주변 선택 1개를 놓은 공 색상으로 변경' },
  // 색상 수집 기반
  { id:'s5',  name:'주변제거(무점)', weight:25, desc:'주변 선택 1개 제거 (점수 없음)' },
  { id:'s6',  name:'주변제거(유점)', weight:25, desc:'주변 선택 1개 제거 (점수 있음)' },
  { id:'s7',  name:'선택제거',       weight:25, desc:'전체 중 선택 1개 제거 (점수 있음)' },
  { id:'s8',  name:'주변전체제거',   weight:25, desc:'놓은 곳 주변 전체 제거 (상쇄 먼저)' },
  { id:'s9',  name:'선택주변제거',   weight:25, desc:'선택한 곳의 주변 제거 (상쇄 먼저)' },
  { id:'s10', name:'주변동색화',     weight:25, desc:'선택한 곳의 주변을 같은 색으로 변경 (상쇄 먼저)' },
  { id:'s11', name:'스포이드',       weight:25, desc:'놓기 전 보드에서 색상 복사' },
  { id:'s12', name:'색상전체제거',   weight:25, desc:'놓은 공과 같은 색상 타일 전체 제거' },
  { id:'s13', name:'보드전체제거',   weight:25, desc:'보드의 모든 타일 제거' },
  // 히든미션 기반
  { id:'h1',  name:'덮어쓰기',      weight:25, desc:'기존 타일 위에 덮어서 배치 가능' },
  { id:'h2',  name:'행제거',        weight:25, desc:'놓은 행 전체 제거' },
  { id:'h3',  name:'열제거',        weight:25, desc:'놓은 열 전체 제거' },
  { id:'h4',  name:'십자제거',      weight:25, desc:'놓은 행+열 십자 제거' },
];
// weight 25 out of 10000 = 0.25%
// Skills that do matching FIRST, then remove/change (상쇄 먼저)
const MATCH_FIRST_SKILLS = ['s8', 's9', 's10'];

// ============================================================
// SAVE DATA (localStorage)
// ============================================================
const SAVE_KEY = 'colorplace-save';

function getDefaultSave() {
  return {
    totalGames: 0,
    highScore: 0,
    unlockedSkills: [],
    colorCollected: { c5: 0, c6: 0, c7: 0 },
    achievements: {
      boardClear: false,
      combo3: false,
      combo4: false,
      combo5: false,
    },
    hidden: {
      zeroScore: false,    // 0점으로 게임 끝내기
      rowClear: false,     // 한행 전체 같은색
      colClear: false,     // 한열 전체 같은색
      crossClear: false,   // 십자 맞추기
    },
    scoreMultiplier: 1,    // 상쇄점수 영구 배율 (십자 히든 달성시 1.2)
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return getDefaultSave();
    const data = JSON.parse(raw);
    // Merge with defaults for forward compatibility
    const def = getDefaultSave();
    return {
      totalGames: data.totalGames || def.totalGames,
      highScore: data.highScore || def.highScore,
      unlockedSkills: data.unlockedSkills || def.unlockedSkills,
      colorCollected: { ...def.colorCollected, ...data.colorCollected },
      achievements: { ...def.achievements, ...data.achievements },
      hidden: { ...def.hidden, ...(data.hidden || {}) },
      scoreMultiplier: data.scoreMultiplier || def.scoreMultiplier,
    };
  } catch(e) { return getDefaultSave(); }
}

function writeSave(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

let saveData = loadSave();

// Get available tile types based on totalGames
function getUnlockedTileWeights() {
  return ALL_TILE_TYPES.filter(t => saveData.totalGames >= t.unlockGames);
}

// Get available skills based on unlocked list
function getUnlockedSkills() {
  return SKILL_DEFS.filter(s => saveData.unlockedSkills.includes(s.id));
}

// Pick a skill (or null) for a new tile
function pickSkill() {
  const unlocked = getUnlockedSkills();
  if (unlocked.length === 0) return null;
  // Total pool: 10000 (=100%), each skill weight=25 (0.25%)
  const skillTotal = unlocked.reduce((s, sk) => s + sk.weight, 0);
  const noSkillWeight = 10000 - skillTotal;
  const roll = Math.random() * 10000;
  if (roll < noSkillWeight) return null;
  let r = roll - noSkillWeight;
  for (const sk of unlocked) {
    r -= sk.weight;
    if (r <= 0) return sk.id;
  }
  return null;
}

// Levels
const LEVELS = [
  { minScore: 0,    colors: 4, label: '' },
  { minScore: 500,  colors: 5, label: '색상 추가!' },
  { minScore: 1000, colors: 6, label: '색상 추가!' },
  { minScore: 1500, colors: 6, label: '자동 색변경!', autoChange: true },
  { minScore: 2000, colors: 7, label: '색상 추가!', autoChange: true },
  { minScore: 2500, colors: 7, label: '무효블록 생성!', autoChange: true, voidBlocks: true },
];

// Mission shapes
const MISSION_SHAPES = [
  { id:'h3', cells:[[0,0],[0,1],[0,2]], bonus:30 },
  { id:'v3', cells:[[0,0],[1,0],[2,0]], bonus:30 },
  { id:'giyeok',      cells:[[0,0],[0,1],[1,1]], bonus:40 },  // ㄱ
  { id:'nieun',        cells:[[0,0],[1,0],[1,1]], bonus:40 },  // ㄴ
  { id:'giyeok_flip',  cells:[[0,0],[0,1],[1,0]], bonus:40 },  // ㄱ y축회전
  { id:'nieun_flip',   cells:[[0,1],[1,0],[1,1]], bonus:40 },  // ㄴ y축회전
];

// ============================================================
// STATE
// ============================================================
let board = [];       // null | { color, isVoid }
let queue = [];       // { type, color(or null), dir(or null), num(or null) }
let score = 0;
let combo = 0;
let maxCombo = 0;
let colorChangeMode = false;
let gameActive = false;
let inputLocked = false;
let currentMission = null;
let turnCount = 0;
let missionTurnCounter = 0;
let voidTurnCounter = 0;
let prevLevel = null;
let voidSpawnedAt2500 = false;
let sessionBoardCleared = false;
let sessionRowCleared = false;
let sessionColCleared = false;
let sessionCrossCleared = false;
let sessionColorCount = { c5: 0, c6: 0, c7: 0 };
let missionStreak = 0; // consecutive mission successes
let pendingSkill = null; // { skillId, r, c, color } for match-first skills
let lastPlacedR = -1;
let lastPlacedC = -1;
let lastPlacedColor = null;

// ============================================================
// UTILITY
// ============================================================
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function getLevel() {
  let lv = LEVELS[0];
  for (const l of LEVELS) if (score >= l.minScore) lv = l;
  return lv;
}

function getActiveColors() {
  return ALL_COLORS.slice(0, getLevel().colors);
}

// ============================================================
// BOARD
// ============================================================
function initBoard() {
  board = [];
  for (let r = 0; r < BOARD_SIZE; r++) board.push(new Array(BOARD_SIZE).fill(null));
}

function cellOccupied(r, c) { return board[r][c] !== null; }
function cellPlayable(r, c) { return board[r][c] === null; }
function cellPlayableOrOccupied(r, c) { return board[r][c] === null || (board[r][c] && !board[r][c].isVoid); }


function hasAnyEmptyCell() {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (!board[r][c]) return true;
  return false;
}

function hasTilesOnBoard() {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c] && !board[r][c].isVoid) return true;
  return false;
}

function isBoardEmpty() {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c]) return false;
  return true;
}

// ============================================================
// TILE GENERATION
// ============================================================
function pickTileType() {
  const available = getUnlockedTileWeights();
  const total = available.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const tw of available) {
    r -= tw.weight;
    if (r <= 0) return tw.type;
  }
  return 3;
}

function generateTile(useBoard) {
  const colors = getActiveColors();
  const type = pickTileType();
  const hasColor = (type === 1 || type === 3 || type === 5);
  const color = hasColor ? rand(colors) : null;
  const skill = pickSkill();

  // Types 1,2: free placement - no dir/num
  if (type === 1 || type === 2) {
    if (useBoard && !hasAnyEmptyCell()) return null;
    return { type, color, dir: null, num: null, skill };
  }

  // Types 3,4: row+col (가로세로공) - 같은 번호의 행과 열 모두 배치 가능
  if (type === 3 || type === 4) {
    if (useBoard) {
      const validNums = [];
      for (let n = 1; n <= BOARD_SIZE; n++) {
        const idx = n - 1;
        let hasEmpty = false;
        for (let i = 0; i < BOARD_SIZE; i++) {
          if (!cellOccupied(idx, i) || !cellOccupied(i, idx)) { hasEmpty = true; break; }
        }
        if (hasEmpty) validNums.push(n);
      }
      if (validNums.length === 0) return null;
      return { type, color, dir: 'rowcol', num: rand(validNums), skill };
    } else {
      return { type, color, dir: 'rowcol', num: randInt(1, BOARD_SIZE), skill };
    }
  }

  // Types 5,6: cross (row+col with same num)
  if (type === 5 || type === 6) {
    if (useBoard) {
      const validNums = [];
      for (let n = 1; n <= BOARD_SIZE; n++) {
        const r = n - 1, c = n - 1;
        let hasEmpty = false;
        for (let i = 0; i < BOARD_SIZE; i++) {
          if (!cellOccupied(r, i) || !cellOccupied(i, c)) { hasEmpty = true; break; }
        }
        if (hasEmpty) validNums.push(n);
      }
      if (validNums.length === 0) return null;
      return { type, color, dir: 'cross', num: rand(validNums), skill };
    } else {
      return { type, color, dir: 'cross', num: randInt(1, BOARD_SIZE), skill };
    }
  }

  return { type: 3, color: rand(colors), dir: rand(['row','col']), num: randInt(1, BOARD_SIZE), skill };
}

function getValidCells(tile) {
  const cells = [];
  if (!tile) return cells;
  const canOverwrite = tile.skill === 'h1';
  const check = canOverwrite ? cellPlayableOrOccupied : cellPlayable;

  // Type 1,2: all empty cells (or overwrite)
  if (tile.type === 1 || tile.type === 2) {
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        if (check(r, c)) cells.push({ r, c });
    return cells;
  }

  // Type 3,4: rowcol (가로세로공) - 같은 번호의 행과 열 모두
  if (tile.type === 3 || tile.type === 4) {
    const n = tile.num - 1;
    const added = new Set();
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (check(n, c) && !added.has(`${n},${c}`)) {
        cells.push({ r: n, c });
        added.add(`${n},${c}`);
      }
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (check(r, n) && !added.has(`${r},${n}`)) {
        cells.push({ r, c: n });
        added.add(`${r},${n}`);
      }
    }
    return cells;
  }

  // Type 5,6: cross
  if (tile.type === 5 || tile.type === 6) {
    const n = tile.num - 1;
    const added = new Set();
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (check(n, c) && !added.has(`${n},${c}`)) {
        cells.push({ r: n, c });
        added.add(`${n},${c}`);
      }
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (check(r, n) && !added.has(`${r},${n}`)) {
        cells.push({ r, c: n });
        added.add(`${r},${n}`);
      }
    }
    return cells;
  }

  return cells;
}

// ============================================================
// VOID BLOCKS
// ============================================================
function spawnVoidBlock() {
  const emptyCells = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (!board[r][c]) emptyCells.push({ r, c });
  if (emptyCells.length === 0) return;
  const pos = rand(emptyCells);
  board[pos.r][pos.c] = { color: rand(getActiveColors()), isVoid: true };
}

function crackAdjacentVoids(clearedCells) {
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  const cracked = [];
  const clearedSet = new Set(clearedCells.map(c => `${c.r},${c.c}`));
  for (const { r, c } of clearedCells) {
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
      const cell = board[nr][nc];
      if (cell && cell.isVoid && !clearedSet.has(`${nr},${nc}`)) {
        cracked.push({ r: nr, c: nc });
      }
    }
  }
  for (const { r, c } of cracked) {
    board[r][c] = { color: board[r][c].color, isVoid: false };
  }
  return cracked;
}

// ============================================================
// MATCH DETECTION
// ============================================================
// Hidden mission detection: check after placement (before matching)
function checkHiddenMissions(placedR, placedC, bySkill) {
  // Check full row same color
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r][0] && !board[r][0].isVoid) {
      const color = board[r][0].color;
      let full = true;
      for (let c = 1; c < BOARD_SIZE; c++) {
        if (!board[r][c] || board[r][c].isVoid || board[r][c].color !== color) { full = false; break; }
      }
      if (full) sessionRowCleared = true;
    }
  }
  // Check full column same color
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (board[0][c] && !board[0][c].isVoid) {
      const color = board[0][c].color;
      let full = true;
      for (let r = 1; r < BOARD_SIZE; r++) {
        if (!board[r][c] || board[r][c].isVoid || board[r][c].color !== color) { full = false; break; }
      }
      if (full) sessionColCleared = true;
    }
  }
  // Check cross: row of placedR + col of placedC all same color, not by skill
  if (!bySkill && placedR >= 0 && placedC >= 0) {
    const color = board[placedR][placedC]?.color;
    if (color) {
      let rowOk = true, colOk = true;
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!board[placedR][c] || board[placedR][c].isVoid || board[placedR][c].color !== color) { rowOk = false; break; }
      }
      for (let r = 0; r < BOARD_SIZE; r++) {
        if (!board[r][placedC] || board[r][placedC].isVoid || board[r][placedC].color !== color) { colOk = false; break; }
      }
      if (rowOk && colOk) sessionCrossCleared = true;
    }
  }
}

function findMatches() {
  const visited = Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(false));
  const groups = [];
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (visited[r][c] || !board[r][c] || board[r][c].isVoid) continue;
      const color = board[r][c].color;
      const group = [];
      const stack = [{ r, c }];
      visited[r][c] = true;
      while (stack.length) {
        const cur = stack.pop();
        group.push(cur);
        for (const [dr, dc] of dirs) {
          const nr = cur.r + dr, nc = cur.c + dc;
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE
              && !visited[nr][nc] && board[nr][nc] && !board[nr][nc].isVoid
              && board[nr][nc].color === color) {
            visited[nr][nc] = true;
            stack.push({ r: nr, c: nc });
          }
        }
      }
      if (group.length >= 3) groups.push({ color, cells: group });
    }
  }
  return groups;
}

function collectCells(matches) {
  const set = new Set();
  for (const g of matches) for (const c of g.cells) set.add(`${c.r},${c.c}`);
  return set;
}

// ============================================================
// MISSION
// ============================================================
function generateMission() {
  currentMission = { ...rand(MISSION_SHAPES) };
  renderMission();
}

function renderMission() {
  const grid = document.getElementById('mission-grid');
  const bonus = document.getElementById('mission-bonus');
  grid.innerHTML = '';
  if (!currentMission) { bonus.textContent = ''; return; }
  const cells = currentMission.cells;
  const maxR = Math.max(...cells.map(c => c[0])) + 1;
  const maxC = Math.max(...cells.map(c => c[1])) + 1;
  grid.style.gridTemplateColumns = `repeat(${maxC}, 12px)`;
  grid.style.gridTemplateRows = `repeat(${maxR}, 12px)`;
  const cellSet = new Set(cells.map(c => `${c[0]},${c[1]}`));
  for (let r = 0; r < maxR; r++) {
    for (let c = 0; c < maxC; c++) {
      const dot = document.createElement('div');
      dot.className = cellSet.has(`${r},${c}`) ? 'mission-dot' : 'mission-dot empty';
      grid.appendChild(dot);
    }
  }
  let bonusText = `+${currentMission.bonus}`;
  if (missionStreak >= 2) bonusText += ' x2';
  else if (missionStreak >= 1) bonusText += ' +10';
  bonus.textContent = bonusText;
}

function checkMissionComplete(clearedCells) {
  if (!currentMission) return false;
  const shape = currentMission.cells;
  const clearedSet = new Set(clearedCells.map(c => `${c.r},${c.c}`));
  for (const anchor of clearedCells) {
    const dr = anchor.r - shape[0][0];
    const dc = anchor.c - shape[0][1];
    const translated = shape.map(([r, c]) => [r + dr, c + dc]);
    if (translated.every(([r, c]) => clearedSet.has(`${r},${c}`))) return true;
  }
  return false;
}

// ============================================================
// RENDERING
// ============================================================
function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  const currentTile = queue[0];
  // Only show placement highlights when NOT in any special mode
  const showPlacement = currentTile && !colorChangeMode && !inputLocked && !spoideMode && !skillSelectMode;
  const validCells = showPlacement ? getValidCells(currentTile) : [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const data = board[r][c];
      if (data) {
        const tile = document.createElement('div');
        tile.className = `tile color-${data.color}`;
        if (data.isVoid) tile.classList.add('void-tile');
        cell.appendChild(tile);
        if (colorChangeMode && !data.isVoid) {
          const neighbors = getOccupiedNeighbors(lastPlacedR, lastPlacedC);
          if (neighbors.some(n => n.r === r && n.c === c)) cell.classList.add('change-target');
        }
      }
      if (validCells.some(v => v.r === r && v.c === c)) cell.classList.add('highlight');
      // Skill select mode: highlight candidates with special style
      if (skillSelectMode && skillSelectMode.candidates.some(n => n.r === r && n.c === c)) cell.classList.add('skill-target');
      // Spoide mode: highlight clickable tiles
      if (spoideMode && data && !data.isVoid) cell.classList.add('spoide-target');
      cell.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function renderQueue() {
  const ids = ['current', 'next', 'nextnext'];
  for (let i = 0; i < 3; i++) {
    const t = queue[i];
    const preview = document.getElementById(`qp-${ids[i]}`);
    preview.innerHTML = '';
    if (!t) { preview.className = 'tile-preview'; continue; }

    const hasColor = (t.color !== null);
    preview.className = `tile-preview ${hasColor ? 'color-' + t.color : 'color-unknown'}`;

    // Lines based on type
    if (t.type === 3 || t.type === 4) {
      const lineH = document.createElement('div');
      lineH.className = 'tile-line horizontal';
      preview.appendChild(lineH);
      const lineV = document.createElement('div');
      lineV.className = 'tile-line vertical';
      preview.appendChild(lineV);
    }
    // Number (only for types with position)
    if (t.num !== null) {
      const num = document.createElement('div');
      num.className = 'tile-num';
      num.textContent = t.num;
      // Cross tiles (5,6) have no line background; colorless = dark text on white ball
      if (!hasColor) {
        num.style.color = '#888';
      } else if (t.type === 5 || t.type === 6) {
        num.style.color = '#fff';
      } else {
        num.style.color = COLOR_HEX[t.color];
      }
      preview.appendChild(num);
    }

    // Skill badge + click to show description
    if (t.skill) {
      const badge = document.createElement('div');
      badge.className = 'skill-badge';
      badge.textContent = t.skill.replace('s','').replace('h','H');
      preview.appendChild(badge);

      const sk = SKILL_DEFS.find(s => s.id === t.skill);
      if (sk) {
        const slot = document.getElementById(`q-${ids[i]}`);
        slot.onclick = () => showSkillTooltip(sk.name, sk.desc);
      }
    } else {
      const slot = document.getElementById(`q-${ids[i]}`);
      slot.onclick = null;
    }
  }
}

let skillTooltipTimer = null;
function showSkillTooltip(name, desc) {
  const el = document.getElementById('status');
  el.textContent = `[${name}] ${desc}`;
  el.classList.remove('hidden');
  el.classList.add('skill-tooltip');
  clearTimeout(skillTooltipTimer);
  skillTooltipTimer = setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('skill-tooltip');
  }, 2500);
}

function renderLabels() {
  const rowL = document.getElementById('row-labels');
  const colL = document.getElementById('col-labels');
  rowL.innerHTML = ''; colL.innerHTML = '';
  for (let i = 1; i <= BOARD_SIZE; i++) {
    let d = document.createElement('div'); d.className = 'lbl'; d.textContent = i; rowL.appendChild(d);
    d = document.createElement('div'); d.className = 'lbl'; d.textContent = i; colL.appendChild(d);
  }
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (text) { el.textContent = text; el.classList.remove('hidden'); }
  else { el.classList.add('hidden'); }
}

function updateComboDisplay() {
  const el = document.getElementById('combo-display');
  document.getElementById('combo').textContent = combo;
  if (combo >= 2) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function updateLevelDisplay() {
  document.getElementById('level-display').textContent = '';
}

function renderAll() {
  renderBoard();
  renderQueue();
  document.getElementById('score').textContent = score;
  updateComboDisplay();
  updateLevelDisplay();
  // Check spoide mode
  if (!spoideMode && !colorChangeMode && !skillSelectMode && queue[0] && queue[0].skill === 's11' && hasTilesOnBoard()) {
    spoideMode = true;
    setStatus('스포이드: 색을 복사할 공을 선택하세요');
  }
}

// Sequential popup queue
let popupQueue = [];
let popupRunning = false;

function showPopup(text, cls) {
  popupQueue.push({ text, cls });
  if (!popupRunning) processPopupQueue();
}

function processPopupQueue() {
  if (popupQueue.length === 0) { popupRunning = false; return; }
  popupRunning = true;
  const { text, cls } = popupQueue.shift();
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  document.body.appendChild(el);
  // If more popups waiting, show faster; otherwise full duration
  const hasMore = popupQueue.length > 0;
  const duration = hasMore ? 1000 : (cls === 'combo-popup' ? 1600 : 1800);
  setTimeout(() => {
    el.remove();
    processPopupQueue();
  }, duration);
}

// ============================================================
// LEVEL TRANSITION
// ============================================================
function checkLevelUp() {
  const newLevel = getLevel();
  if (prevLevel && newLevel.minScore > prevLevel.minScore) {
    if (newLevel.label) showPopup(newLevel.label, 'level-popup');
    if (newLevel.voidBlocks && !voidSpawnedAt2500) {
      voidSpawnedAt2500 = true;
      voidTurnCounter = 0;
      spawnVoidBlock();
    }
  }
  prevLevel = newLevel;
}

// ============================================================
// GAME LOGIC
// ============================================================
function onCellClick(r, c) {
  if (!gameActive || inputLocked) return;

  // --- SKILL SELECT MODE ---
  if (skillSelectMode) {
    handleSkillSelect(r, c);
    return;
  }

  // --- SPOIDE MODE (s11) ---
  if (spoideMode) {
    if (board[r][c] && !board[r][c].isVoid) {
      queue[0].color = board[r][c].color;
      queue[0].skill = null; // consumed
      spoideMode = false;
      setStatus(null);
      renderQueue();
      renderBoard();
    }
    return;
  }

  // --- COLOR CHANGE (주변 1개를 놓은 공 색상으로 변경) ---
  if (colorChangeMode) {
    const neighbors = getOccupiedNeighbors(lastPlacedR, lastPlacedC);
    if (board[r][c] && !board[r][c].isVoid && neighbors.some(n => n.r === r && n.c === c)) {
      board[r][c] = { color: lastPlacedColor, isVoid: false };
      endColorChange(r, c);
    }
    return;
  }

  // --- PLACE TILE ---
  const tile = queue[0];
  if (!tile) return;
  const valid = getValidCells(tile);
  if (!valid.some(v => v.r === r && v.c === c)) return;

  // Determine color: if colorless, random
  const placedColor = tile.color || rand(getActiveColors());
  board[r][c] = { color: placedColor, isVoid: false };
  lastPlacedR = r;
  lastPlacedC = c;
  lastPlacedColor = placedColor;
  turnCount++;
  missionTurnCounter++;

  // Void block spawning
  const lv = getLevel();
  if (lv.voidBlocks) {
    voidTurnCounter++;
    if (voidTurnCounter >= 5) {
      voidTurnCounter = 0;
      spawnVoidBlock();
    }
  }

  const placedSkill = tile.skill;
  checkHiddenMissions(r, c, false);

  renderBoard();
  const idx = r * BOARD_SIZE + c;
  const tileEl = document.getElementById('board').children[idx].querySelector('.tile');
  if (tileEl) tileEl.classList.add('place');

  advanceQueue();
  renderQueue();

  inputLocked = true;
  setTimeout(() => {
    inputLocked = false;
    if (placedSkill && MATCH_FIRST_SKILLS.includes(placedSkill)) {
      // 상쇄 먼저: do matching first, then execute skill
      pendingSkill = { skillId: placedSkill, r, c, color: placedColor };
      resolveAfterPlace();
    } else if (placedSkill) {
      executeSkill(placedSkill, r, c, placedColor, () => resolveAfterPlace());
    } else {
      resolveAfterPlace();
    }
  }, 300);
}

function endColorChange(r, c) {
  colorChangeMode = false;
  setStatus(null);
  renderAll();
  const idx = r * BOARD_SIZE + c;
  const tileEl = document.getElementById('board').children[idx].querySelector('.tile');
  if (tileEl) tileEl.classList.add('color-swap');

  inputLocked = true;
  setTimeout(() => {
    inputLocked = false;
    resolveAfterColorChange();
  }, 600);
}

function resolveAfterColorChange() {
  const matches = findMatches();
  if (matches.length > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (combo >= 2) showPopup(`${combo} COMBO! x${combo}`, 'combo-popup');

    const cellsToRemove = collectCells(matches);
    const clearedList = setToList(cellsToRemove);
    let missionDone = checkMissionComplete(clearedList);
    score += calcScore(cellsToRemove.size, combo, missionDone);
    if (missionDone) { showPopup(`QUEST! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => resolveColorChangeChain());
  } else {
    // 내 색변경 상쇄 끝 → 자동 색변경으로
    proceedToAutoChange();
  }
}

function resolveColorChangeChain() {
  const matches = findMatches();
  if (matches.length > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (combo >= 2) showPopup(`${combo} COMBO! x${combo}`, 'combo-popup');

    const cellsToRemove = collectCells(matches);
    const clearedList = setToList(cellsToRemove);
    let missionDone = checkMissionComplete(clearedList);
    score += calcScore(cellsToRemove.size, combo, missionDone);
    if (missionDone) { showPopup(`QUEST! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => resolveColorChangeChain());
  } else {
    proceedToAutoChange();
  }
}

function proceedToAutoChange() {
  const lv = getLevel();
  if (lv.autoChange) {
    doAutoColorChange(() => resolveAfterAutoChange());
  } else {
    finishResolve();
  }
}

function resolveAfterAutoChange() {
  const matches = findMatches();
  if (matches.length > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (combo >= 2) showPopup(`${combo} COMBO! x${combo}`, 'combo-popup');

    const cellsToRemove = collectCells(matches);
    const clearedList = setToList(cellsToRemove);
    let missionDone = checkMissionComplete(clearedList);
    score += calcScore(cellsToRemove.size, combo, missionDone);
    if (missionDone) { showPopup(`QUEST! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => resolveAutoChangeChain());
  } else {
    finishResolve();
  }
}

function resolveAutoChangeChain() {
  const matches = findMatches();
  if (matches.length > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (combo >= 2) showPopup(`${combo} COMBO! x${combo}`, 'combo-popup');

    const cellsToRemove = collectCells(matches);
    const clearedList = setToList(cellsToRemove);
    let missionDone = checkMissionComplete(clearedList);
    score += calcScore(cellsToRemove.size, combo, missionDone);
    if (missionDone) { showPopup(`QUEST! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => resolveAutoChangeChain());
  } else {
    finishResolve();
  }
}

function doAutoColorChange(callback) {
  const candidates = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c] && !board[r][c].isVoid) candidates.push({ r, c });
  if (candidates.length === 0) { callback(); return; }

  const pick = rand(candidates);
  const oldColor = board[pick.r][pick.c].color;
  const others = getActiveColors().filter(cl => cl !== oldColor);
  board[pick.r][pick.c] = { color: rand(others), isVoid: false };

  setStatus('자동 색상 변경!');
  renderAll();
  const idx = pick.r * BOARD_SIZE + pick.c;
  const tileEl = document.getElementById('board').children[idx].querySelector('.tile');
  if (tileEl) tileEl.classList.add('color-swap');

  inputLocked = true;
  setTimeout(() => {
    inputLocked = false;
    setStatus(null);
    callback();
  }, 600);
}

function advanceQueue() {
  queue.shift();
  while (queue.length < 3) {
    if (!hasAnyEmptyCell()) break;
    let tile = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      tile = generateTile(true);
      if (tile) break;
    }
    if (tile) queue.push(tile);
    else break;
  }
}

// ============================================================
// SKILL EXECUTION
// ============================================================
function getNeighbors(r, c) {
  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const result = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) result.push({ r: nr, c: nc });
  }
  return result;
}

function getOccupiedNeighbors(r, c) {
  return getNeighbors(r, c).filter(n => board[n.r][n.c] && !board[n.r][n.c].isVoid);
}

let skillSelectMode = null; // { type, r, c, color, callback, candidates }
let spoideMode = false; // s11: waiting to pick color from board

// --- Skill animation helpers ---
function animateSkillRemoval(targets, withScore, callback) {
  if (targets.length === 0) { callback(); return; }
  renderAll();
  const boardEl = document.getElementById('board');
  for (const { r, c } of targets) {
    const idx = r * BOARD_SIZE + c;
    const tileEl = boardEl.children[idx]?.querySelector('.tile');
    if (tileEl) tileEl.classList.add('skill-remove');
  }
  inputLocked = true;
  setTimeout(() => {
    let count = 0;
    for (const { r, c } of targets) {
      if (board[r][c]) { board[r][c] = null; count++; }
    }
    if (withScore) score += count * 10;
    renderAll();
    setTimeout(() => { inputLocked = false; callback(); }, 200);
  }, 550);
}

function animateSkillChange(targets, callback) {
  if (targets.length === 0) { callback(); return; }
  renderAll();
  const boardEl = document.getElementById('board');
  for (const { r, c } of targets) {
    const idx = r * BOARD_SIZE + c;
    const tileEl = boardEl.children[idx]?.querySelector('.tile');
    if (tileEl) tileEl.classList.add('skill-change');
  }
  inputLocked = true;
  setTimeout(() => { inputLocked = false; callback(); }, 550);
}

function executeSkill(skillId, r, c, placedColor, callback) {
  const skillDef = SKILL_DEFS.find(s => s.id === skillId);
  if (!skillDef) { callback(); return; }
  showPopup(skillDef.name + '!', 'level-popup');

  switch(skillId) {
    case 's1': { // 올체인지: 모든 타일을 놓은 색으로 변경 (상쇄 전)
      const targets = [];
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        for (let cc = 0; cc < BOARD_SIZE; cc++)
          if (board[rr][cc] && !board[rr][cc].isVoid) {
            board[rr][cc].color = placedColor;
            targets.push({ r: rr, c: cc });
          }
      animateSkillChange(targets, callback);
      break;
    }

    case 's2': { // 주변 랜덤 1개를 놓은 색으로 변경
      const neighbors = getOccupiedNeighbors(r, c);
      if (neighbors.length > 0) {
        const pick = rand(neighbors);
        board[pick.r][pick.c].color = placedColor;
        animateSkillChange([pick], callback);
      } else { callback(); }
      break;
    }

    case 's3': { // 주변 랜덤 2개를 놓은 색으로 변경
      const neighbors = getOccupiedNeighbors(r, c);
      if (neighbors.length > 0) {
        const picks = [];
        const pool = [...neighbors];
        for (let i = 0; i < 2 && pool.length > 0; i++) {
          const idx = Math.floor(Math.random() * pool.length);
          picks.push(pool.splice(idx, 1)[0]);
        }
        for (const p of picks) board[p.r][p.c].color = placedColor;
        animateSkillChange(picks, callback);
      } else { callback(); }
      break;
    }

    case 's4': { // 주변 선택 1개를 놓은 색으로 변경
      const candidates = getOccupiedNeighbors(r, c);
      if (candidates.length === 0) { callback(); break; }
      skillSelectMode = { type: 's4', r, c, color: placedColor, callback, candidates };
      setStatus('변경할 주변 타일을 선택하세요');
      renderBoard();
      break;
    }

    case 's5': { // 주변 선택 1개 제거 (점수 없음)
      const candidates = getOccupiedNeighbors(r, c);
      if (candidates.length === 0) { callback(); break; }
      skillSelectMode = { type: 's5', r, c, color: placedColor, callback, candidates };
      setStatus('제거할 주변 타일을 선택하세요');
      renderBoard();
      break;
    }

    case 's6': { // 주변 선택 1개 제거 (점수 있음)
      const candidates = getOccupiedNeighbors(r, c);
      if (candidates.length === 0) { callback(); break; }
      skillSelectMode = { type: 's6', r, c, color: placedColor, callback, candidates };
      setStatus('제거할 주변 타일을 선택하세요');
      renderBoard();
      break;
    }

    case 's7': { // 전체 중 선택 1개 제거 (점수 있음)
      const candidates = [];
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        for (let cc = 0; cc < BOARD_SIZE; cc++)
          if (board[rr][cc] && !board[rr][cc].isVoid && !(rr === r && cc === c))
            candidates.push({ r: rr, c: cc });
      if (candidates.length === 0) { callback(); break; }
      skillSelectMode = { type: 's7', r, c, color: placedColor, callback, candidates };
      setStatus('제거할 타일을 선택하세요');
      renderBoard();
      break;
    }

    // s8: 놓은 곳 주변 전체 제거 (상쇄 먼저 → pendingSkill로 도착)
    case 's8': {
      const targets = getOccupiedNeighbors(r, c);
      animateSkillRemoval(targets, true, callback);
      break;
    }

    // s9: 전체 선택 → 그 주변 제거 (상쇄 먼저 → pendingSkill로 도착)
    case 's9': {
      const candidates = [];
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        for (let cc = 0; cc < BOARD_SIZE; cc++)
          if (board[rr][cc] && !board[rr][cc].isVoid)
            candidates.push({ r: rr, c: cc });
      if (candidates.length === 0) { callback(); break; }
      skillSelectMode = { type: 's9', r, c, color: placedColor, callback, candidates };
      setStatus('주변을 제거할 타일을 선택하세요');
      renderBoard();
      break;
    }

    // s10: 전체 선택 → 주변을 선택타일 색으로 변경 (상쇄 먼저)
    case 's10': {
      const candidates = [];
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        for (let cc = 0; cc < BOARD_SIZE; cc++)
          if (board[rr][cc] && !board[rr][cc].isVoid)
            candidates.push({ r: rr, c: cc });
      if (candidates.length === 0) { callback(); break; }
      skillSelectMode = { type: 's10', r, c, color: placedColor, callback, candidates };
      setStatus('주변을 같은색으로 만들 타일을 선택하세요');
      renderBoard();
      break;
    }

    case 's12': { // 색상전체제거: 놓은 색 모두 제거
      const targets = [];
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        for (let cc = 0; cc < BOARD_SIZE; cc++)
          if (board[rr][cc] && board[rr][cc].color === placedColor && !(rr === r && cc === c))
            targets.push({ r: rr, c: cc });
      animateSkillRemoval(targets, true, callback);
      break;
    }

    case 's13': { // 보드전체제거
      const targets = [];
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        for (let cc = 0; cc < BOARD_SIZE; cc++)
          if (board[rr][cc] && !(rr === r && cc === c))
            targets.push({ r: rr, c: cc });
      animateSkillRemoval(targets, true, callback);
      break;
    }

    // h1: 덮어쓰기 - 배치 로직에서 처리, 여기서는 패스
    case 'h1':
      callback();
      break;

    // h2: 행 제거 (스킬 먼저 → 내 공 포함 삭제)
    case 'h2': {
      const targets = [];
      for (let cc = 0; cc < BOARD_SIZE; cc++)
        if (board[r][cc] && !board[r][cc].isVoid)
          targets.push({ r, c: cc });
      animateSkillRemoval(targets, true, callback);
      break;
    }

    // h3: 열 제거 (스킬 먼저 → 내 공 포함 삭제)
    case 'h3': {
      const targets = [];
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        if (board[rr][c] && !board[rr][c].isVoid)
          targets.push({ r: rr, c });
      animateSkillRemoval(targets, true, callback);
      break;
    }

    // h4: 십자 제거 (스킬 먼저 → 내 공 포함 삭제)
    case 'h4': {
      const targets = [];
      for (let cc = 0; cc < BOARD_SIZE; cc++)
        if (board[r][cc] && !board[r][cc].isVoid) targets.push({ r, c: cc });
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        if (rr !== r && board[rr][c] && !board[rr][c].isVoid) targets.push({ r: rr, c });
      animateSkillRemoval(targets, true, callback);
      break;
    }

    case 's11': // 스포이드는 놓기 전에 처리 (별도 로직)
    default:
      callback();
      break;
  }
}

// Handle skill select mode clicks
function handleSkillSelect(r, c) {
  if (!skillSelectMode) return false;
  const { type, color, callback, candidates } = skillSelectMode;
  const isCandidate = candidates.some(n => n.r === r && n.c === c);
  if (!isCandidate) return true; // consumed click but invalid

  skillSelectMode = null;
  setStatus(null);

  switch (type) {
    case 's4': // 주변 선택 동색 변경
      board[r][c].color = color;
      animateSkillChange([{ r, c }], callback);
      break;
    case 's5': // 주변 선택 제거 (무점)
      animateSkillRemoval([{ r, c }], false, callback);
      break;
    case 's6': // 주변 선택 제거 (유점)
    case 's7': // 전체 선택 제거 (유점)
      animateSkillRemoval([{ r, c }], true, callback);
      break;
    case 's9': { // 선택 타일 주변 제거
      const targets = getOccupiedNeighbors(r, c);
      animateSkillRemoval(targets, true, callback);
      break;
    }
    case 's10': { // 선택 타일 주변 같은색 변경
      const centerColor = board[r][c].color;
      const neighbors = getOccupiedNeighbors(r, c);
      for (const n of neighbors) board[n.r][n.c].color = centerColor;
      animateSkillChange([{ r, c }, ...neighbors], callback);
      break;
    }
    default:
      callback();
  }
  return true;
}

// ============================================================
// SCORE: combo multiplier
// ============================================================
function getMissionBonus() {
  if (!currentMission) return 0;
  let bonus = currentMission.bonus;
  if (missionStreak >= 2) {
    bonus *= 2; // 3+ consecutive: x2 (no +10)
  } else if (missionStreak >= 1) {
    bonus += 10; // 2 consecutive: +10
  }
  return bonus;
}

let lastMissionBonus = 0; // cached for popup display

function calcScore(cleared, comboNum, missionDone) {
  let s = cleared * 10 * Math.max(comboNum, 1);
  s = Math.floor(s * saveData.scoreMultiplier);
  if (missionDone) {
    lastMissionBonus = getMissionBonus();
    s += lastMissionBonus;
    missionStreak++;
  }
  return s;
}

// ============================================================
// RESOLVE PHASES
// ============================================================

// Called when all chains are done — check for pending skill, then finalize
function finishResolve() {
  if (pendingSkill) {
    const ps = pendingSkill;
    pendingSkill = null;
    executeSkill(ps.skillId, ps.r, ps.c, ps.color, () => {
      // After skill removal, check for new matches
      const matches = findMatches();
      if (matches.length > 0) {
        combo = 1;
        if (combo > maxCombo) maxCombo = combo;
        const cellsToRemove = collectCells(matches);
        const clearedList = setToList(cellsToRemove);
        let missionDone = checkMissionComplete(clearedList);
        score += calcScore(cellsToRemove.size, combo, missionDone);
        if (missionDone) { showPopup(`QUEST! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
        checkLevelUp();
        animateRemoval(cellsToRemove, clearedList, () => {
          enterColorChangeMode();
        });
      } else {
        maybeNewMission();
        renderAll();
        checkGameOver();
      }
    });
    return;
  }
  maybeNewMission();
  renderAll();
  checkGameOver();
}

function resolveAfterPlace() {
  const matches = findMatches();
  if (matches.length > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (combo >= 2) showPopup(`${combo} COMBO! x${combo}`, 'combo-popup');

    const cellsToRemove = collectCells(matches);
    const clearedList = setToList(cellsToRemove);
    let missionDone = checkMissionComplete(clearedList);
    score += calcScore(cellsToRemove.size, combo, missionDone);
    if (missionDone) { showPopup(`QUEST! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => {
      enterColorChangeMode();
    });
  } else {
    combo = 0;
    updateComboDisplay();
    finishResolve();
  }
}

function setToList(set) {
  return [...set].map(k => { const [r, c] = k.split(',').map(Number); return { r, c }; });
}

function animateRemoval(cellsToRemove, clearedList, callback) {
  renderAll();
  const boardEl = document.getElementById('board');
  for (const key of cellsToRemove) {
    const [rr, cc] = key.split(',').map(Number);
    const idx = rr * BOARD_SIZE + cc;
    const tileEl = boardEl.children[idx].querySelector('.tile');
    if (tileEl) tileEl.classList.add('pop');
  }

  inputLocked = true;
  setTimeout(() => {
    const cracked = crackAdjacentVoids(clearedList);

    // Track color collection before removing
    for (const key of cellsToRemove) {
      const [rr, cc] = key.split(',').map(Number);
      const cell = board[rr][cc];
      if (cell && !cell.isVoid && (cell.color === 'c5' || cell.color === 'c6' || cell.color === 'c7')) {
        sessionColorCount[cell.color]++;
        saveData.colorCollected[cell.color]++;
      }
      board[rr][cc] = null;
    }

    if (isBoardEmpty()) {
      sessionBoardCleared = true;
      score += 100;
      showPopup('CLEAR! +100', 'mission-popup');
    }

    if (cracked.length > 0) {
      renderAll();
      const boardEl2 = document.getElementById('board');
      for (const { r, c } of cracked) {
        const idx = r * BOARD_SIZE + c;
        const tileEl = boardEl2.children[idx].querySelector('.tile');
        if (tileEl) tileEl.classList.add('color-swap');
      }
      setTimeout(() => { inputLocked = false; callback(); }, 400);
    } else {
      inputLocked = false;
      callback();
    }
  }, 450);
}

function enterColorChangeMode() {
  if (!hasTilesOnBoard()) {
    finishResolve();
    return;
  }
  const neighbors = getOccupiedNeighbors(lastPlacedR, lastPlacedC);
  if (neighbors.length === 0) {
    // 주변에 변경할 타일 없음 → 건너뛰기
    proceedToAutoChange();
    return;
  }
  colorChangeMode = true;
  setStatus('주변 타일을 선택하여 색상 변경!');
  renderBoard();
}

function maybeNewMission() {
  if (missionTurnCounter >= 3) {
    missionTurnCounter = 0;
    missionStreak = 0; // failed to complete before timeout → reset streak
    generateMission();
  }
}

function checkGameOver() {
  if (!queue[0]) { gameOver(); return; }
  if (getValidCells(queue[0]).length === 0) { gameOver(); return; }
}

function gameOver() {
  gameActive = false;

  // Update save data
  saveData.totalGames++;
  if (score > saveData.highScore) saveData.highScore = score;

  // Check achievement unlocks
  const newUnlocks = [];

  if (maxCombo >= 3 && !saveData.achievements.combo3) {
    saveData.achievements.combo3 = true;
    if (!saveData.unlockedSkills.includes('s2')) { saveData.unlockedSkills.push('s2'); newUnlocks.push('스킬: 주변동색(1)'); }
  }
  if (maxCombo >= 4 && !saveData.achievements.combo4) {
    saveData.achievements.combo4 = true;
    if (!saveData.unlockedSkills.includes('s3')) { saveData.unlockedSkills.push('s3'); newUnlocks.push('스킬: 주변동색(2)'); }
  }
  if (maxCombo >= 5 && !saveData.achievements.combo5) {
    saveData.achievements.combo5 = true;
    if (!saveData.unlockedSkills.includes('s4')) { saveData.unlockedSkills.push('s4'); newUnlocks.push('스킬: 주변선택동색'); }
  }
  if (sessionBoardCleared && !saveData.achievements.boardClear) {
    saveData.achievements.boardClear = true;
    if (!saveData.unlockedSkills.includes('s1')) { saveData.unlockedSkills.push('s1'); newUnlocks.push('스킬: 올체인지'); }
  }

  // Color collection skill unlocks
  const colorSkillMap = [
    { color:'c5', count:100, skill:'s5', name:'주변제거(무점)' },
    { color:'c6', count:100, skill:'s6', name:'주변제거(유점)' },
    { color:'c7', count:100, skill:'s7', name:'선택제거' },
    { color:'c5', count:300, skill:'s8', name:'주변전체제거' },
    { color:'c6', count:300, skill:'s9', name:'선택주변제거' },
    { color:'c7', count:300, skill:'s10', name:'주변동색화' },
    { color:'c5', count:500, skill:'s11', name:'스포이드' },
    { color:'c6', count:500, skill:'s12', name:'색상전체제거' },
    { color:'c7', count:500, skill:'s13', name:'보드전체제거' },
  ];
  for (const entry of colorSkillMap) {
    if (saveData.colorCollected[entry.color] >= entry.count && !saveData.unlockedSkills.includes(entry.skill)) {
      saveData.unlockedSkills.push(entry.skill);
      newUnlocks.push(`스킬: ${entry.name}`);
    }
  }

  // Hidden mission unlocks
  if (score === 0 && !saveData.hidden.zeroScore) {
    saveData.hidden.zeroScore = true;
    if (!saveData.unlockedSkills.includes('h1')) { saveData.unlockedSkills.push('h1'); newUnlocks.push('히든 스킬: 덮어쓰기'); }
  }
  if (sessionRowCleared && !saveData.hidden.rowClear) {
    saveData.hidden.rowClear = true;
    if (!saveData.unlockedSkills.includes('h2')) { saveData.unlockedSkills.push('h2'); newUnlocks.push('히든 스킬: 행제거'); }
  }
  if (sessionColCleared && !saveData.hidden.colClear) {
    saveData.hidden.colClear = true;
    if (!saveData.unlockedSkills.includes('h3')) { saveData.unlockedSkills.push('h3'); newUnlocks.push('히든 스킬: 열제거'); }
  }
  if (sessionCrossCleared && !saveData.hidden.crossClear) {
    saveData.hidden.crossClear = true;
    if (!saveData.unlockedSkills.includes('h4')) { saveData.unlockedSkills.push('h4'); newUnlocks.push('히든 스킬: 십자제거'); }
    saveData.scoreMultiplier = 1.2;
    newUnlocks.push('상쇄점수 x1.2 영구 적용!');
  }

  // Tile type unlocks
  const typeUnlockMap = [
    { games: 100, type: 4, name: '색상미지정 줄공' },
    { games: 200, type: 5, name: '색상지정 십자공' },
    { games: 300, type: 6, name: '색상미지정 십자공' },
    { games: 500, type: 1, name: '색상지정 자유배치' },
    { games: 1000, type: 2, name: '색상미지정 자유배치' },
  ];
  for (const entry of typeUnlockMap) {
    if (saveData.totalGames >= entry.games) {
      // Check if this is newly unlocked (totalGames just crossed)
      if (saveData.totalGames - 1 < entry.games) {
        newUnlocks.push(`타일: ${entry.name}`);
      }
    }
  }

  writeSave(saveData);

  // Display
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-combo').textContent = maxCombo >= 2 ? `최대 콤보: ${maxCombo}` : '';

  const unlockEl = document.getElementById('final-level');
  if (newUnlocks.length > 0) {
    unlockEl.innerHTML = newUnlocks.map(u => `🔓 ${u}`).join('<br>');
    unlockEl.style.color = '#FBBC04';
  } else {
    unlockEl.textContent = '';
  }

  document.getElementById('game-over').classList.add('active');
}

// ============================================================
// INIT
// ============================================================
function initGame() {
  initBoard();
  score = 0;
  combo = 0;
  maxCombo = 0;
  colorChangeMode = false;
  inputLocked = false;
  gameActive = true;
  turnCount = 0;
  missionTurnCounter = 0;
  voidTurnCounter = 0;
  prevLevel = LEVELS[0];
  voidSpawnedAt2500 = false;
  sessionBoardCleared = false;
  sessionRowCleared = false;
  sessionColCleared = false;
  sessionCrossCleared = false;
  sessionColorCount = { c5: 0, c6: 0, c7: 0 };
  spoideMode = false;
  skillSelectMode = null;
  pendingSkill = null;
  missionStreak = 0;
  currentMission = null;
  popupQueue = [];
  popupRunning = false;
  saveData = loadSave();

  document.getElementById('game-over').classList.remove('active');
  setStatus(null);

  queue = [];
  for (let i = 0; i < 3; i++) queue.push(generateTile(false));

  generateMission();
  renderLabels();
  renderAll();
}

// ============================================================
// INTRO / SCREEN NAVIGATION
// ============================================================
let currentScreen = 'intro';

function showIntro() {
  currentScreen = 'intro';
  saveData = loadSave();
  document.getElementById('intro').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('game-over').classList.remove('active');
  document.getElementById('mission-screen').classList.remove('active');

  // High score
  const hsEl = document.getElementById('intro-highscore');
  hsEl.textContent = saveData.highScore > 0 ? `최고점수  ${saveData.highScore}` : '';

  // Stats
  const stEl = document.getElementById('intro-stats');
  stEl.textContent = saveData.totalGames > 0 ? `${saveData.totalGames}판 플레이` : '';
}

function startGame() {
  currentScreen = 'game';
  history.pushState({ screen: 'game' }, '', '#game');
  document.getElementById('intro').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('game-over').classList.remove('active');
  initGame();
}

function backToIntro() {
  gameActive = false;
  document.getElementById('game-over').classList.remove('active');
  document.getElementById('app').style.display = 'none';
  history.pushState({ screen: 'intro' }, '', '#');
  showIntro();
}

function exitGame() {
  history.back();
}

function resetSave() {
  if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;
  localStorage.removeItem(SAVE_KEY);
  saveData = getDefaultSave();
  showIntro();
}

function showMissionScreen() {
  currentScreen = 'mission';
  history.pushState({ screen: 'mission' }, '', '#mission');
  document.getElementById('mission-screen').classList.add('active');
  renderUnlockList();
}

function closeMissionScreen() {
  currentScreen = 'intro';
  document.getElementById('mission-screen').classList.remove('active');
}

window.addEventListener('popstate', function() {
  if (currentScreen === 'game') {
    gameActive = false;
    document.getElementById('game-over').classList.remove('active');
    document.getElementById('app').style.display = 'none';
    showIntro();
  } else if (currentScreen === 'mission') {
    document.getElementById('mission-screen').classList.remove('active');
    currentScreen = 'intro';
  }
  // intro 상태에서는 브라우저 기본 뒤로가기 동작
});

function makeProgressItem(name, current, goal, isDone, condText, desc) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  const item = document.createElement('div');
  item.className = `unlock-item ${isDone ? 'completed' : ''}`;
  item.innerHTML = `
    <div class="unlock-row">
      <span class="name">${name}</span>
      <span class="progress-text">${isDone ? condText || '달성' : `${current} / ${goal}`}</span>
      <span class="status">${isDone ? '&#10003;' : ''}</span>
    </div>
    ${desc ? `<div class="unlock-desc">${desc}</div>` : ''}
    <div class="progress-bar"><div class="fill ${isDone ? 'done' : 'in-progress'}" style="width:${pct}%"></div></div>`;
  return item;
}

function renderUnlockList() {
  saveData = loadSave();
  const el = document.getElementById('unlock-list');
  el.innerHTML = '';
  const games = saveData.totalGames;

  // Tile types
  const tileSection = document.createElement('div');
  tileSection.className = 'unlock-section';
  tileSection.innerHTML = '<div class="unlock-section-title">타일 해금</div>';
  const tiles = [
    { name: '줄공 (색상지정)', goal: 0, desc: '가로/세로 한 줄에 지정된 색상으로 배치' },
    { name: '줄공 (색상미지정)', goal: 100, desc: '가로/세로 한 줄에 랜덤 색상으로 배치' },
    { name: '십자공 (색상지정)', goal: 200, desc: '십자 방향으로 지정된 색상 배치' },
    { name: '십자공 (색상미지정)', goal: 300, desc: '십자 방향으로 랜덤 색상 배치' },
    { name: '자유배치 (색상지정)', goal: 500, desc: '빈 칸 어디든 지정된 색상 배치' },
    { name: '자유배치 (색상미지정)', goal: 1000, desc: '빈 칸 어디든 랜덤 색상 배치' },
  ];
  for (const t of tiles) {
    if (t.goal === 0) {
      tileSection.appendChild(makeProgressItem(t.name, 1, 1, true, '기본', t.desc));
    } else {
      tileSection.appendChild(makeProgressItem(t.name, Math.min(games, t.goal), t.goal, games >= t.goal, `${t.goal}판 달성`, t.desc));
    }
  }
  el.appendChild(tileSection);

  // Skills
  const skillSection = document.createElement('div');
  skillSection.className = 'unlock-section';
  skillSection.innerHTML = '<div class="unlock-section-title">스킬 해금</div>';
  const cc = saveData.colorCollected;
  const ach = saveData.achievements;
  const skillProgress = [
    { id: 's1', current: ach.boardClear ? 1 : 0, goal: 1, cond: '보드클리어 1회', desc: '모든 타일을 놓은 공 색상으로 변경 (상쇄 전 발동)' },
    { id: 's2', current: ach.combo3 ? 3 : 0, goal: 3, cond: '3콤보 달성', desc: '주변 랜덤 1개를 놓은 공 색상으로 변경' },
    { id: 's3', current: ach.combo4 ? 4 : 0, goal: 4, cond: '4콤보 달성', desc: '주변 랜덤 2개를 놓은 공 색상으로 변경' },
    { id: 's4', current: ach.combo5 ? 5 : 0, goal: 5, cond: '5콤보 달성', desc: '주변 선택 1개를 놓은 공 색상으로 변경' },
    { id: 's5', current: Math.min(cc.c5||0, 100), goal: 100, cond: '색상5 100개 수집', desc: '주변 선택 1개 제거 (점수 없음)' },
    { id: 's6', current: Math.min(cc.c6||0, 100), goal: 100, cond: '색상6 100개 수집', desc: '주변 선택 1개 제거 (점수 있음)' },
    { id: 's7', current: Math.min(cc.c7||0, 100), goal: 100, cond: '색상7 100개 수집', desc: '전체 중 선택 1개 제거 (점수 있음)' },
    { id: 's8', current: Math.min(cc.c5||0, 300), goal: 300, cond: '색상5 300개 수집', desc: '놓은 곳 주변 전체 제거 (상쇄 먼저)' },
    { id: 's9', current: Math.min(cc.c6||0, 300), goal: 300, cond: '색상6 300개 수집', desc: '전체 중 선택 → 그 주변 제거 (상쇄 먼저)' },
    { id: 's10', current: Math.min(cc.c7||0, 300), goal: 300, cond: '색상7 300개 수집', desc: '전체 중 선택 → 주변을 같은 색으로 변경 (상쇄 먼저)' },
    { id: 's11', current: Math.min(cc.c5||0, 500), goal: 500, cond: '색상5 500개 수집', desc: '놓기 전 보드에서 색상을 복사 (스포이드)' },
    { id: 's12', current: Math.min(cc.c6||0, 500), goal: 500, cond: '색상6 500개 수집', desc: '놓은 공과 같은 색상 타일 전체 제거' },
    { id: 's13', current: Math.min(cc.c7||0, 500), goal: 500, cond: '색상7 500개 수집', desc: '보드의 모든 타일 제거' },
  ];
  for (const sp of skillProgress) {
    const sk = SKILL_DEFS.find(s => s.id === sp.id);
    const done = saveData.unlockedSkills.includes(sp.id);
    skillSection.appendChild(makeProgressItem(sk ? sk.name : sp.id, sp.current, sp.goal, done, sp.cond, sp.desc));
  }
  el.appendChild(skillSection);

  // Hidden missions
  const hiddenSection = document.createElement('div');
  hiddenSection.className = 'unlock-section';
  hiddenSection.innerHTML = '<div class="unlock-section-title">히든 미션</div>';
  const hid = saveData.hidden;
  const hiddenProgress = [
    { id: 'h1', done: hid.zeroScore, cond: '???', desc: '???' },
    { id: 'h2', done: hid.rowClear, cond: '???', desc: '???' },
    { id: 'h3', done: hid.colClear, cond: '???', desc: '???' },
    { id: 'h4', done: hid.crossClear, cond: '???', desc: '???' },
  ];
  for (const hp of hiddenProgress) {
    const sk = SKILL_DEFS.find(s => s.id === hp.id);
    const name = hp.done ? (sk ? sk.name : hp.id) : '???';
    const desc = hp.done ? hp.desc : null;
    const cond = hp.done ? hp.cond : null;
    hiddenSection.appendChild(makeProgressItem(name, hp.done ? 1 : 0, 1, hp.done, cond, desc));
  }
  el.appendChild(hiddenSection);

  // Color collection progress
  const collectSection = document.createElement('div');
  collectSection.className = 'unlock-section';
  collectSection.innerHTML = '<div class="unlock-section-title">색상 수집</div>';
  const colorInfo = [
    { key: 'c5', goal: 500, desc: '100개: 주변제거(무점) / 300개: 주변전체제거 / 500개: 스포이드' },
    { key: 'c6', goal: 500, desc: '100개: 주변제거(유점) / 300개: 선택주변제거 / 500개: 색상전체제거' },
    { key: 'c7', goal: 500, desc: '100개: 선택제거 / 300개: 주변동색화 / 500개: 보드전체제거' },
  ];
  for (const ci of colorInfo) {
    const count = cc[ci.key] || 0;
    collectSection.appendChild(makeProgressItem(`색상 ${ci.key.replace('c','')}`, Math.min(count, ci.goal), ci.goal, count >= ci.goal, `${ci.goal}개 달성`, ci.desc));
  }
  el.appendChild(collectSection);
}

// ===== 개발자 콘솔 테스트 헬퍼 =====
window.DEV = {
  // 현재 타일에 스킬 부여: DEV.skill('s1')
  skill(id) {
    if (!queue[0]) { console.warn('큐가 비어있음'); return; }
    const sk = SKILL_DEFS.find(s => s.id === id);
    if (!sk) { console.warn('존재하지 않는 스킬:', id); return; }
    queue[0].skill = id;
    renderAll();
    console.log(`현재 타일에 [${sk.name}] 스킬 부여됨`);
  },
  // 모든 스킬 해금: DEV.unlockAll()
  unlockAll() {
    SKILL_DEFS.forEach(s => {
      if (!saveData.unlockedSkills.includes(s.id)) saveData.unlockedSkills.push(s.id);
    });
    saveData.hidden = { zeroScore:true, rowClear:true, colClear:true, crossClear:true };
    saveSave();
    console.log('모든 스킬/히든 해금 완료');
  },
  // 세이브 데이터 직접 수정: DEV.save({ totalGames: 500 })
  save(obj) {
    Object.assign(saveData, obj);
    saveSave();
    console.log('세이브 데이터 수정됨:', obj);
  },
  // 현재 타일 색상 변경: DEV.color('c3')
  color(c) {
    if (!queue[0]) { console.warn('큐가 비어있음'); return; }
    queue[0].color = c;
    renderAll();
    console.log(`현재 타일 색상 → ${c}`);
  },
  // 스킬 목록 출력: DEV.list()
  list() {
    console.table(SKILL_DEFS.map(s => ({ id: s.id, name: s.name, desc: s.desc })));
  },
  // 도움말: DEV.help()
  help() {
    console.log(`
=== Color Place 테스트 헬퍼 ===
DEV.skill('s1')      - 현재 타일에 스킬 부여
DEV.color('c3')      - 현재 타일 색상 변경
DEV.unlockAll()      - 모든 스킬/히든 해금
DEV.save({key:val})  - 세이브 데이터 수정
DEV.list()           - 스킬 목록 출력
DEV.help()           - 이 도움말
    `);
  }
};

// Start at intro
history.replaceState({ screen: 'intro' }, '', '#');
showIntro();
