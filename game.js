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

// Tile types:
// 1: color fixed, free placement
// 2: color random, free placement
// 3: color fixed, row or col (EXISTING)
// 4: color random, row or col
// 5: color fixed, cross (row+col)
// 6: color random, cross (row+col)
const TILE_WEIGHTS = [
  { type: 3, weight: 90 },
  { type: 1, weight: 2 },
  { type: 2, weight: 2 },
  { type: 4, weight: 2 },
  { type: 5, weight: 2 },
  { type: 6, weight: 2 },
];
const TOTAL_WEIGHT = TILE_WEIGHTS.reduce((s, w) => s + w.weight, 0);

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
  let r = Math.random() * TOTAL_WEIGHT;
  for (const tw of TILE_WEIGHTS) {
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

  // Types 1,2: free placement - no dir/num
  if (type === 1 || type === 2) {
    if (useBoard && !hasAnyEmptyCell()) return null;
    return { type, color, dir: null, num: null };
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
    return { type, color, dir, num };
  }

  // Types 5,6: cross (row+col with same num)
  if (type === 5 || type === 6) {
    if (useBoard) {
      // Need a num where either its row or col has empty cells
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
      return { type, color, dir: 'cross', num: rand(validNums) };
    } else {
      return { type, color, dir: 'cross', num: randInt(1, BOARD_SIZE) };
    }
  }

  return { type: 3, color: rand(colors), dir: rand(['row','col']), num: randInt(1, BOARD_SIZE) };
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
  bonus.textContent = `+${currentMission.bonus}`;
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
  const validCells = (currentTile && !colorChangeMode && !inputLocked) ? getValidCells(currentTile) : [];

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
}

function showPopup(text, cls) {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
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

  renderBoard();
  const idx = r * BOARD_SIZE + c;
  const tileEl = document.getElementById('board').children[idx].querySelector('.tile');
  if (tileEl) tileEl.classList.add('place');

  advanceQueue();
  renderQueue();

  inputLocked = true;
  setTimeout(() => { inputLocked = false; resolveAfterPlace(); }, 300);
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
// SCORE: combo multiplier
// ============================================================
function calcScore(cleared, comboNum, missionDone) {
  // Base: cleared * 10 * comboMultiplier
  let s = cleared * 10 * Math.max(comboNum, 1);
  if (missionDone && currentMission) s += currentMission.bonus;
  return s;
}

// ============================================================
// RESOLVE PHASES
// ============================================================
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
    if (missionDone) { showPopup(`MISSION! +${currentMission.bonus}`, 'mission-popup'); generateMission(); }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => {
      enterColorChangeMode();
    });
  } else {
    combo = 0;
    updateComboDisplay();
    maybeNewMission();
    renderAll();
    checkGameOver();
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
    if (missionDone) { showPopup(`MISSION! +${currentMission.bonus}`, 'mission-popup'); generateMission(); }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => resolveChain());
  } else {
    maybeNewMission();
    renderAll();
    checkGameOver();
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
    if (missionDone) { showPopup(`MISSION! +${currentMission.bonus}`, 'mission-popup'); generateMission(); }
    checkLevelUp();

    animateRemoval(cellsToRemove, clearedList, () => resolveChain());
  } else {
    maybeNewMission();
    renderAll();
    checkGameOver();
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

    for (const key of cellsToRemove) {
      const [rr, cc] = key.split(',').map(Number);
      board[rr][cc] = null;
    }

    if (isBoardEmpty()) {
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
    generateMission();
  }
}

function checkGameOver() {
  if (!queue[0]) { gameOver(); return; }
  if (getValidCells(queue[0]).length === 0) { gameOver(); return; }
}

function gameOver() {
  gameActive = false;
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-combo').textContent = maxCombo >= 2 ? `최대 콤보: ${maxCombo}` : '';
  const lv = getLevel();
  document.getElementById('final-level').textContent = '';
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
  currentMission = null;

  document.getElementById('game-over').classList.remove('active');
  setStatus(null);

  queue = [];
  for (let i = 0; i < 3; i++) queue.push(generateTile(false));

  generateMission();
  renderLabels();
  renderAll();
}

initGame();
