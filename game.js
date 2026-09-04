const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const shotsEl = document.querySelector("#shots");
const levelEl = document.querySelector("#level");
const restartBtn = document.querySelector("#restart");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");
const overlayButton = document.querySelector("#overlayButton");

const W = canvas.width;
const H = canvas.height;
const R = 32;
const STEP_X = R * 2;
const STEP_Y = Math.sqrt(3) * R;
const ORIGIN_X = 86;
const ORIGIN_Y = 78;
const ROWS = 13;
const COLS = 12;
const FINAL_LEVEL = 5;
const COLORS = [
  { fill: "#ff5d73", shade: "#b32542", eye: "#3a0c16" },
  { fill: "#42d392", shade: "#16895b", eye: "#052f22" },
  { fill: "#56a8ff", shade: "#1766b8", eye: "#071f42" },
  { fill: "#ffcf56", shade: "#b07c0d", eye: "#3d2900" },
  { fill: "#b981ff", shade: "#6a35b8", eye: "#211032" },
  { fill: "#ff8a3d", shade: "#b34d13", eye: "#351403" }
];

let grid;
let shooter;
let nextColor;
let aim = -Math.PI / 2;
let pointer = { x: W / 2, y: H - 220 };
let score = 0;
let shots = 0;
let level = 1;
let dropCounter = 0;
let state = "playing";
let sparks = [];

function colorPool() {
  return COLORS.slice(0, Math.min(4 + Math.floor((level - 1) / 2), COLORS.length));
}

function randomColorFrom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomColor() {
  const pool = colorPool();
  return Math.floor(Math.random() * pool.length);
}

function remainingColors() {
  const colors = new Set();
  for (const row of grid) {
    for (const color of row) {
      if (color !== null) colors.add(color);
    }
  }
  return [...colors];
}

function randomPlayableColor() {
  const colors = remainingColors();
  return colors.length ? randomColorFrom(colors) : randomColor();
}

function keepShotsPlayable() {
  const colors = remainingColors();
  if (!colors.length) return;
  if (!colors.includes(shooter.color)) shooter.color = randomColorFrom(colors);
  if (!colors.includes(nextColor)) nextColor = randomColorFrom(colors);
}

function refreshIdleShots() {
  if (state === "playing" && !shooter.moving) keepShotsPlayable();
}

function rowLength(row) {
  return COLS;
}

function cellToPixel(row, col) {
  return {
    x: ORIGIN_X + col * STEP_X + (row % 2 ? R : 0),
    y: ORIGIN_Y + row * STEP_Y
  };
}

function pixelToCell(x, y) {
  let best = { row: 0, col: 0, dist: Infinity };
  for (let row = 0; row < ROWS + 2; row++) {
    for (let col = 0; col < rowLength(row); col++) {
      const p = cellToPixel(row, col);
      const dist = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (dist < best.dist) best = { row, col, dist };
    }
  }
  return best;
}

function neighbors(row, col) {
  const even = row % 2 === 0;
  const offsets = even
    ? [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]]
    : [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]];
  return offsets
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter((n) => n.row >= 0 && n.row < ROWS && n.col >= 0 && n.col < rowLength(n.row));
}

function reset() {
  grid = Array.from({ length: ROWS }, (_, row) => Array(rowLength(row)).fill(null));
  const startRows = Math.min(5 + level, 10);
  for (let row = 0; row < startRows; row++) {
    for (let col = 0; col < rowLength(row); col++) {
      if (row > 3 && Math.random() < 0.18) continue;
      grid[row][col] = randomColor();
    }
  }
  shooter = makeShooter(randomPlayableColor());
  nextColor = randomPlayableColor();
  aim = -Math.PI / 2;
  state = "playing";
  sparks = [];
  overlay.classList.add("hidden");
  updateStats();
}

function makeShooter(color) {
  return {
    x: W / 2,
    y: H - 88,
    vx: 0,
    vy: 0,
    color,
    moving: false
  };
}

function updateStats() {
  scoreEl.textContent = score;
  shotsEl.textContent = shots;
  levelEl.textContent = level;
}

function updateAim(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * W;
  pointer.y = ((clientY - rect.top) / rect.height) * H;
  const dx = pointer.x - W / 2;
  const dy = pointer.y - (H - 88);
  aim = Math.atan2(dy, dx);
  aim = Math.max(-Math.PI + 0.15, Math.min(-0.15, aim));
}

function shoot() {
  if (state !== "playing" || shooter.moving) return;
  keepShotsPlayable();
  const speed = 13.8;
  shooter.vx = Math.cos(aim) * speed;
  shooter.vy = Math.sin(aim) * speed;
  shooter.moving = true;
  shots += 1;
  dropCounter += 1;
  updateStats();
}

function placeShooter() {
  const target = pixelToCell(shooter.x, shooter.y);
  const landing = findLandingCell(target.row, target.col);

  if (!landing) {
    showOverlay("Game over", "No safe landing spaces remain.", "Try again");
    state = "ended";
    return;
  }

  grid[landing.row][landing.col] = shooter.color;
  resolve(landing.row, landing.col);

  if (countPieces() === 0) {
    if (level >= FINAL_LEVEL) {
      score += 5000;
      updateStats();
      showOverlay("You win!", "You cleared the final board.", "Play again");
      state = "won";
      return;
    }
    level += 1;
    showOverlay("Cleared!", `Level ${level} is ready. Clear level ${FINAL_LEVEL} to win.`, "Next level");
    state = "level";
    return;
  }

  if (dropCounter >= 6) {
    dropCounter = 0;
    descend();
  }

  if (isDanger()) {
    showOverlay("Game over", "The board reached the launcher.", "Try again");
    state = "ended";
    return;
  }

  keepShotsPlayable();
  shooter = makeShooter(nextColor);
  nextColor = randomPlayableColor();
}

function findLandingCell(row, col) {
  const start = {
    row: Math.max(0, Math.min(ROWS - 1, row)),
    col: Math.max(0, Math.min(COLS - 1, col))
  };
  if (isOpenLanding(start.row, start.col)) return start;

  let best = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < rowLength(r); c++) {
      if (!isOpenLanding(r, c)) continue;
      const p = cellToPixel(r, c);
      const dist = (p.x - shooter.x) ** 2 + (p.y - shooter.y) ** 2;
      if (!best || dist < best.dist) best = { row: r, col: c, dist };
    }
  }
  return best;
}

function isOpenLanding(row, col) {
  if (grid[row][col] !== null) return false;
  if (row === 0) return true;
  return neighbors(row, col).some((n) => grid[n.row][n.col] !== null);
}

function resolve(row, col) {
  const color = grid[row][col];
  const cluster = connected(row, col, (r, c) => grid[r][c] === color);
  if (cluster.length >= 3) {
    popCells(cluster, 12);
    const floating = findFloating();
    popCells(floating, 22);
    score += cluster.length * 100 + floating.length * 160;
    updateStats();
  }
}

function connected(row, col, predicate) {
  const seen = new Set();
  const stack = [{ row, col }];
  const cells = [];
  while (stack.length) {
    const cur = stack.pop();
    const key = `${cur.row},${cur.col}`;
    if (seen.has(key) || !predicate(cur.row, cur.col)) continue;
    seen.add(key);
    cells.push(cur);
    for (const n of neighbors(cur.row, cur.col)) stack.push(n);
  }
  return cells;
}

function findFloating() {
  const anchored = new Set();
  const stack = [];
  for (let col = 0; col < rowLength(0); col++) {
    if (grid[0][col] !== null) stack.push({ row: 0, col });
  }
  while (stack.length) {
    const cur = stack.pop();
    const key = `${cur.row},${cur.col}`;
    if (anchored.has(key) || grid[cur.row][cur.col] === null) continue;
    anchored.add(key);
    for (const n of neighbors(cur.row, cur.col)) stack.push(n);
  }

  const floating = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < rowLength(row); col++) {
      if (grid[row][col] !== null && !anchored.has(`${row},${col}`)) floating.push({ row, col });
    }
  }
  return floating;
}

function popCells(cells, impulse) {
  for (const cell of cells) {
    const color = grid[cell.row][cell.col];
    if (color === null) continue;
    const p = cellToPixel(cell.row, cell.col);
    sparks.push({
      x: p.x,
      y: p.y,
      color,
      life: 28,
      vx: (Math.random() - 0.5) * impulse,
      vy: -Math.random() * impulse
    });
    grid[cell.row][cell.col] = null;
  }
}

function descend() {
  for (let row = ROWS - 1; row > 0; row--) {
    grid[row] = grid[row - 1].slice();
  }
  const colors = remainingColors();
  grid[0] = Array.from({ length: COLS }, () => {
    if (Math.random() >= 0.75) return null;
    return colors.length ? randomColorFrom(colors) : randomColor();
  });
}

function countPieces() {
  return grid.flat().filter((cell) => cell !== null).length;
}

function isDanger() {
  for (let row = ROWS - 3; row < ROWS; row++) {
    if (grid[row].some((cell) => cell !== null)) return true;
  }
  return false;
}

function showOverlay(title, text, button) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayButton.textContent = button;
  overlay.classList.remove("hidden");
}

function step() {
  refreshIdleShots();

  if (shooter.moving) {
    shooter.x += shooter.vx;
    shooter.y += shooter.vy;
    if (shooter.x < R || shooter.x > W - R) {
      shooter.vx *= -1;
      shooter.x = Math.max(R, Math.min(W - R, shooter.x));
    }
    if (shooter.y < ORIGIN_Y - R) placeShooter();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < rowLength(row); col++) {
        if (grid[row][col] === null) continue;
        const p = cellToPixel(row, col);
        if ((p.x - shooter.x) ** 2 + (p.y - shooter.y) ** 2 < (R * 1.82) ** 2) {
          placeShooter();
          row = ROWS;
          break;
        }
      }
    }
  }

  sparks = sparks
    .map((s) => ({ ...s, x: s.x + s.vx, y: s.y + s.vy, vy: s.vy + 0.7, life: s.life - 1 }))
    .filter((s) => s.life > 0);
}

function drawBlob(x, y, colorIndex, scale = 1, mood = 0) {
  const c = COLORS[colorIndex];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const wobble = Math.sin(performance.now() / 220 + x * 0.03) * 1.3;
  const grad = ctx.createRadialGradient(-10, -12, 4, 5, 9, R * 1.28);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.12, c.fill);
  grad.addColorStop(1, c.shade);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, wobble, R, R * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.26)";
  ctx.stroke();

  ctx.fillStyle = "#fff7ef";
  ctx.beginPath();
  ctx.ellipse(-10, -7, 7, 9, -0.15, 0, Math.PI * 2);
  ctx.ellipse(12, -7, 7, 9, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.eye;
  ctx.beginPath();
  ctx.arc(-8 + mood, -6, 3.2, 0, Math.PI * 2);
  ctx.arc(10 + mood, -6, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(30, 15, 10, 0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(1, 8, 9, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0e2429");
  bg.addColorStop(0.62, "#102129");
  bg.addColorStop(1, "#251b2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.lineWidth = 2;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < rowLength(row); col++) {
      const p = cellToPixel(row, col);
      ctx.beginPath();
      ctx.arc(p.x, p.y, R + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < rowLength(row); col++) {
      const color = grid[row][col];
      if (color === null) continue;
      const p = cellToPixel(row, col);
      drawBlob(p.x, p.y, color, 1);
    }
  }

  drawAim();
  drawLauncher();
  drawBlob(shooter.x, shooter.y, shooter.color, 1.06, shooter.moving ? 1 : 0);
  drawBlob(W - 76, H - 80, nextColor, 0.62);

  ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("NEXT", W - 76, H - 132);

  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, s.life / 28);
    drawBlob(s.x, s.y, s.color, 0.36);
    ctx.globalAlpha = 1;
  }
}

function drawAim() {
  if (shooter.moving || state !== "playing") return;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = 5;
  ctx.setLineDash([12, 18]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2, H - 88);
  let x = W / 2;
  let y = H - 88;
  let vx = Math.cos(aim) * 52;
  let vy = Math.sin(aim) * 52;
  for (let i = 0; i < 12; i++) {
    x += vx;
    y += vy;
    if (x < R || x > W - R) vx *= -1;
    if (y < 40) break;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawLauncher() {
  ctx.save();
  ctx.translate(W / 2, H - 88);
  ctx.rotate(aim + Math.PI / 2);
  ctx.fillStyle = "rgba(255, 207, 86, 0.94)";
  ctx.strokeStyle = "rgba(35, 22, 2, 0.8)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -76);
  ctx.lineTo(28, 22);
  ctx.lineTo(-28, 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function loop() {
  step();
  draw();
  requestAnimationFrame(loop);
}

canvas.addEventListener("pointermove", (event) => updateAim(event.clientX, event.clientY));
canvas.addEventListener("pointerdown", (event) => {
  updateAim(event.clientX, event.clientY);
  shoot();
});
restartBtn.addEventListener("click", () => {
  score = 0;
  shots = 0;
  level = 1;
  dropCounter = 0;
  reset();
});
overlayButton.addEventListener("click", () => {
  if (state === "level") reset();
  else {
    score = 0;
    shots = 0;
    level = 1;
    dropCounter = 0;
    reset();
  }
});

reset();
loop();
