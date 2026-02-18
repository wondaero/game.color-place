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
  { id:'s1',  name:'올체인지',     weight:25, unlock:'boardClear' },
  { id:'s2',  name:'랜덤변경',     weight:25, unlock:'combo3' },
  { id:'s3',  name:'동색변경',     weight:25, unlock:'combo4' },
  { id:'s4',  name:'선택동색',     weight:25, unlock:'combo5' },
  { id:'s5',  name:'랜덤제거(무점)', weight:25, unlock:'c5_100' },
  { id:'s6',  name:'랜덤제거(유점)', weight:25, unlock:'c6_100' },
  { id:'s7',  name:'선택제거',     weight:25, unlock:'c7_100' },
  { id:'s8',  name:'행열제거',     weight:25, unlock:'c5_300' },
  { id:'s9',  name:'주변제거',     weight:25, unlock:'c6_300' },
  { id:'s10', name:'행열십자제거',  weight:25, unlock:'c7_300' },
  { id:'s11', name:'대각선제거',   weight:25, unlock:'c7_300b' },
  { id:'s12', name:'스포이드',     weight:25, unlock:'c5_500' },
  { id:'s13', name:'색상전체제거', weight:25, unlock:'c6_500' },
  { id:'s14', name:'보드전체제거', weight:25, unlock:'c7_500' },
];
// weight 25 out of 10000 = 0.25%
// Skills that do matching FIRST, then remove (상쇄 먼저)
const MATCH_FIRST_SKILLS = ['s8', 's9', 's10', 's11'];

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
let sessionColorCount = { c5: 0, c6: 0, c7: 0 };
let missionStreak = 0; // consecutive mission successes
let pendingSkill = null; // { skillId, r, c, color } for match-first skills

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

function getAvailableLines() {
  const lines = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let empty = 0;
    for (let c = 0; c < BOARD_SIZE; c++) if (!cellOccupied(r, c)) empty++;
    if (empty > 0) lines.push({ dir: 'row', num: r + 1 });
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let empty = 0;
    for (let r = 0; r < BOARD_SIZE; r++) if (!cellOccupied(r, c)) empty++;
    if (empty > 0) lines.push({ dir: 'col', num: c + 1 });
  }
  return lines;
}

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

  // Types 3,4: single line
  if (type === 3 || type === 4) {
    let dir, num;
    if (useBoard) {
      const lines = getAvailableLines();
      if (lines.length === 0) return null;
      const pick = rand(lines);
      dir = pick.dir; num = pick.num;
    } else {
      dir = rand(['row', 'col']);
      num = randInt(1, BOARD_SIZE);
    }
    return { type, color, dir, num, skill };
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

  // Type 1,2: all empty cells
  if (tile.type === 1 || tile.type === 2) {
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        if (cellPlayable(r, c)) cells.push({ r, c });
    return cells;
  }

  // Type 3,4: single line
  if (tile.type === 3 || tile.type === 4) {
    if (tile.dir === 'row') {
      const r = tile.num - 1;
      for (let c = 0; c < BOARD_SIZE; c++) if (cellPlayable(r, c)) cells.push({ r, c });
    } else {
      const c = tile.num - 1;
      for (let r = 0; r < BOARD_SIZE; r++) if (cellPlayable(r, c)) cells.push({ r, c });
    }
    return cells;
  }

  // Type 5,6: cross
  if (tile.type === 5 || tile.type === 6) {
    const n = tile.num - 1;
    const added = new Set();
    // Row n
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (cellPlayable(n, c) && !added.has(`${n},${c}`)) {
        cells.push({ r: n, c });
        added.add(`${n},${c}`);
      }
    }
    // Col n
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (cellPlayable(r, n) && !added.has(`${r},${n}`)) {
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

function getRotations(cells) {
  const results = [];
  let cur = cells.map(c => [...c]);
  for (let i = 0; i < 4; i++) {
    const minR = Math.min(...cur.map(c => c[0]));
    const minC = Math.min(...cur.map(c => c[1]));
    results.push(cur.map(c => [c[0] - minR, c[1] - minC]));
    cur = cur.map(([r, c]) => [c, -r]);
  }
  return results;
}

function checkMissionComplete(clearedCells) {
  if (!currentMission) return false;
  const rotations = getRotations(currentMission.cells);
  const clearedSet = new Set(clearedCells.map(c => `${c.r},${c.c}`));
  for (const shape of rotations) {
    for (const anchor of clearedCells) {
      const dr = anchor.r - shape[0][0];
      const dc = anchor.c - shape[0][1];
      const translated = shape.map(([r, c]) => [r + dr, c + dc]);
      if (translated.every(([r, c]) => clearedSet.has(`${r},${c}`))) return true;
    }
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
        if (colorChangeMode && !data.isVoid) cell.classList.add('change-target');
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
      const line = document.createElement('div');
      line.className = `tile-line ${t.dir === 'row' ? 'horizontal' : 'vertical'}`;
      preview.appendChild(line);
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

    // Skill badge
    if (t.skill) {
      const badge = document.createElement('div');
      badge.className = 'skill-badge';
      const skillNum = t.skill.replace('s','');
      badge.textContent = skillNum;
      badge.title = (SKILL_DEFS.find(s => s.id === t.skill) || {}).name || '';
      preview.appendChild(badge);
    }
  }
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
  if (!spoideMode && !colorChangeMode && !skillSelectMode && queue[0] && queue[0].skill === 's12' && hasTilesOnBoard()) {
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

  // --- SPOIDE MODE (s12) ---
  if (spoideMode) {
    if (board[r][c] && !board[r][c].isVoid) {
      // Copy color to current tile
      queue[0].color = board[r][c].color;
      queue[0].skill = null; // consumed
      spoideMode = false;
      setStatus(null);
      renderQueue();
      renderBoard();
    }
    return;
  }

  // --- COLOR CHANGE ---
  if (colorChangeMode) {
    if (!hasTilesOnBoard()) {
      if (!board[r][c]) {
        board[r][c] = { color: rand(getActiveColors()), isVoid: false };
        endColorChange(r, c);
      }
      return;
    }
    if (board[r][c] && !board[r][c].isVoid) {
      const oldColor = board[r][c].color;
      const others = getActiveColors().filter(cl => cl !== oldColor);
      board[r][c] = { color: rand(others), isVoid: false };
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
    const lv = getLevel();
    if (lv.autoChange) {
      doAutoColorChange(() => resolveAfterColorChange());
    } else {
      resolveAfterColorChange();
    }
  }, 600);
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

let skillSelectMode = null; // { type: 's4'|'s7', r, c, color, callback, candidates }
let spoideMode = false; // s12: waiting to pick color from board

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

// --- Collect removal targets for skills ---
function getSkillRemovalTargets(skillId, r, c) {
  const targets = [];
  switch (skillId) {
    case 's8': {
      const dir = rand(['row', 'col']);
      if (dir === 'row') {
        for (let cc = 0; cc < BOARD_SIZE; cc++)
          if (board[r][cc] && cc !== c) targets.push({ r, c: cc });
      } else {
        for (let rr = 0; rr < BOARD_SIZE; rr++)
          if (board[rr][c] && rr !== r) targets.push({ r: rr, c });
      }
      break;
    }
    case 's9': {
      for (const n of getNeighbors(r, c))
        if (board[n.r][n.c] && !board[n.r][n.c].isVoid) targets.push(n);
      break;
    }
    case 's10': {
      for (let cc = 0; cc < BOARD_SIZE; cc++)
        if (board[r][cc] && cc !== c) targets.push({ r, c: cc });
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        if (board[rr][c] && rr !== r) targets.push({ r: rr, c });
      break;
    }
    case 's11': {
      for (let i = -BOARD_SIZE; i <= BOARD_SIZE; i++) {
        const r1 = r + i, c1 = c + i;
        const r2 = r + i, c2 = c - i;
        if (r1 >= 0 && r1 < BOARD_SIZE && c1 >= 0 && c1 < BOARD_SIZE && !(r1 === r && c1 === c) && board[r1][c1])
          targets.push({ r: r1, c: c1 });
        if (r2 >= 0 && r2 < BOARD_SIZE && c2 >= 0 && c2 < BOARD_SIZE && !(r2 === r && c2 === c) && board[r2][c2])
          targets.push({ r: r2, c: c2 });
      }
      break;
    }
  }
  return targets;
}

function executeSkill(skillId, r, c, placedColor, callback) {
  showPopup(SKILL_DEFS.find(s => s.id === skillId).name + '!', 'level-popup');

  switch(skillId) {
    case 's1': { // 올체인지: 보드 모든 공을 놓은 공 색으로 변경
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

    case 's2': { // 랜덤변경: 주변 랜덤 1개 임의색 변경
      const neighbors = getOccupiedNeighbors(r, c);
      if (neighbors.length > 0) {
        const pick = rand(neighbors);
        board[pick.r][pick.c].color = rand(getActiveColors());
        animateSkillChange([pick], callback);
      } else { callback(); }
      break;
    }

    case 's3': { // 동색변경: 주변 랜덤 1개를 같은색으로
      const neighbors = getOccupiedNeighbors(r, c);
      if (neighbors.length > 0) {
        const pick = rand(neighbors);
        board[pick.r][pick.c].color = placedColor;
        animateSkillChange([pick], callback);
      } else { callback(); }
      break;
    }

    case 's4': { // 선택동색: 주변 중 선택 1개를 같은색으로
      const candidates = getOccupiedNeighbors(r, c);
      if (candidates.length === 0) { callback(); break; }
      skillSelectMode = { type: 's4', r, c, color: placedColor, callback, candidates };
      setStatus('변경할 주변 타일을 선택하세요');
      renderBoard();
      break;
    }

    case 's5': { // 랜덤제거(무점): 주변 랜덤 1개 제거
      const neighbors = getOccupiedNeighbors(r, c);
      if (neighbors.length > 0) {
        animateSkillRemoval([rand(neighbors)], false, callback);
      } else { callback(); }
      break;
    }

    case 's6': { // 랜덤제거(유점): 주변 랜덤 1개 제거 + 점수
      const neighbors = getOccupiedNeighbors(r, c);
      if (neighbors.length > 0) {
        animateSkillRemoval([rand(neighbors)], true, callback);
      } else { callback(); }
      break;
    }

    case 's7': { // 선택제거: 주변 중 선택 1개 제거 + 점수
      const candidates = getOccupiedNeighbors(r, c);
      if (candidates.length === 0) { callback(); break; }
      skillSelectMode = { type: 's7', r, c, color: placedColor, callback, candidates };
      setStatus('제거할 주변 타일을 선택하세요');
      renderBoard();
      break;
    }

    // s8~s11 are match-first: they arrive here AFTER matching is done
    case 's8':   // 행열제거
    case 's9':   // 주변제거
    case 's10':  // 행열십자제거
    case 's11': { // 대각선제거
      const targets = getSkillRemovalTargets(skillId, r, c);
      animateSkillRemoval(targets, true, callback);
      break;
    }

    case 's13': { // 색상전체제거: 같은 색 모두 제거
      const targets = [];
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        for (let cc = 0; cc < BOARD_SIZE; cc++)
          if (board[rr][cc] && board[rr][cc].color === placedColor && !(rr === r && cc === c))
            targets.push({ r: rr, c: cc });
      animateSkillRemoval(targets, true, callback);
      break;
    }

    case 's14': { // 보드전체제거
      const targets = [];
      for (let rr = 0; rr < BOARD_SIZE; rr++)
        for (let cc = 0; cc < BOARD_SIZE; cc++)
          if (board[rr][cc] && !(rr === r && cc === c))
            targets.push({ r: rr, c: cc });
      animateSkillRemoval(targets, true, callback);
      break;
    }

    case 's12': // 스포이드는 놓기 전에 처리 (별도 로직)
    default:
      callback();
      break;
  }
}

// Handle skill select mode clicks (s4, s7)
function handleSkillSelect(r, c) {
  if (!skillSelectMode) return false;
  const { type, color, callback, candidates } = skillSelectMode;
  const isCandidate = candidates.some(n => n.r === r && n.c === c);
  if (!isCandidate) return true; // consumed click but invalid

  skillSelectMode = null;
  setStatus(null);

  if (type === 's4') {
    board[r][c].color = color;
    animateSkillChange([{ r, c }], callback);
  } else if (type === 's7') {
    animateSkillRemoval([{ r, c }], true, callback);
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
        if (missionDone) { showPopup(`MISSION! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
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
    if (missionDone) { showPopup(`MISSION! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
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
    if (missionDone) { showPopup(`MISSION! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => resolveChain());
  } else {
    finishResolve();
  }
}

function resolveChain() {
  const matches = findMatches();
  if (matches.length > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (combo >= 2) showPopup(`${combo} COMBO! x${combo}`, 'combo-popup');

    const cellsToRemove = collectCells(matches);
    const clearedList = setToList(cellsToRemove);
    let missionDone = checkMissionComplete(clearedList);
    score += calcScore(cellsToRemove.size, combo, missionDone);
    if (missionDone) { showPopup(`MISSION! +${lastMissionBonus}`, 'mission-popup'); generateMission(); missionTurnCounter = 0; }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => resolveChain());
  } else {
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
  colorChangeMode = true;
  if (hasTilesOnBoard()) {
    setStatus('색상 변경! 타일을 클릭하세요');
  } else {
    setStatus('빈 칸을 클릭하면 랜덤 타일 생성');
  }
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
    if (!saveData.unlockedSkills.includes('s2')) { saveData.unlockedSkills.push('s2'); newUnlocks.push('스킬: 랜덤변경'); }
  }
  if (maxCombo >= 4 && !saveData.achievements.combo4) {
    saveData.achievements.combo4 = true;
    if (!saveData.unlockedSkills.includes('s3')) { saveData.unlockedSkills.push('s3'); newUnlocks.push('스킬: 동색변경'); }
  }
  if (maxCombo >= 5 && !saveData.achievements.combo5) {
    saveData.achievements.combo5 = true;
    if (!saveData.unlockedSkills.includes('s4')) { saveData.unlockedSkills.push('s4'); newUnlocks.push('스킬: 선택동색'); }
  }
  if (sessionBoardCleared && !saveData.achievements.boardClear) {
    saveData.achievements.boardClear = true;
    if (!saveData.unlockedSkills.includes('s1')) { saveData.unlockedSkills.push('s1'); newUnlocks.push('스킬: 올체인지'); }
  }

  // Color collection skill unlocks
  const colorSkillMap = [
    { color:'c5', count:100, skill:'s5', name:'랜덤제거(무점)' },
    { color:'c6', count:100, skill:'s6', name:'랜덤제거(유점)' },
    { color:'c7', count:100, skill:'s7', name:'선택제거' },
    { color:'c5', count:300, skill:'s8', name:'행열제거' },
    { color:'c6', count:300, skill:'s9', name:'주변제거' },
    { color:'c7', count:300, skill:'s10', name:'행열십자제거' },
    { color:'c7', count:300, skill:'s11', name:'대각선제거' },
    { color:'c5', count:500, skill:'s12', name:'스포이드' },
    { color:'c6', count:500, skill:'s13', name:'색상전체제거' },
    { color:'c7', count:500, skill:'s14', name:'보드전체제거' },
  ];
  for (const entry of colorSkillMap) {
    if (saveData.colorCollected[entry.color] >= entry.count && !saveData.unlockedSkills.includes(entry.skill)) {
      saveData.unlockedSkills.push(entry.skill);
      newUnlocks.push(`스킬: ${entry.name}`);
    }
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

initGame();
