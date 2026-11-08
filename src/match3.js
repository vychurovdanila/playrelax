/* ============================================================
   ИГРА MATCH-3 (заглушка). Независимый модуль с тем же контрактом,
   что и Тетрис: update() — логика, draw(ctx) — отрисовка.
   Кадром управляет main.js (window.App.loop).
   ============================================================ */
window.Match3Game = {
  cols: 5,
  rows: 10,
  cellSize: 64, // 320 / 5 = 64, и 640 / 10 = 64. Идеальные квадраты.
  offsetX: 0,
  offsetY: 0,        // Сетка начинается с самого верха
  board: [],
  colors: ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FFD733'], // 5 цветов

  init: function() {
    this.board = [];
    for (let r = 0; r < this.rows; r++) {
      let row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(Math.floor(Math.random() * this.colors.length));
      }
      this.board.push(row);
    }
  },

  update: function() {
    // Пока пусто, логика свайпов будет в следующих шагах
  },

  handleSwipe: function(startX, startY, dx, dy) {
    const rect = window.App.canvas.getBoundingClientRect();
    const scale = rect.width / 320; // Масштабирование экрана

    const localX = (startX - rect.left) / scale;
    const localY = (startY - rect.top) / scale;

    const col = Math.floor(localX / this.cellSize);
    const row = Math.floor(localY / this.cellSize);

    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;

    let targetRow = row;
    let targetCol = col;

    // Определяем направление
    if (Math.abs(dx) > Math.abs(dy)) {
      targetCol += (dx > 0 ? 1 : -1);
    } else {
      targetRow += (dy > 0 ? 1 : -1);
    }

    // Меняем местами, если не вышли за границы
    if (targetRow >= 0 && targetRow < this.rows && targetCol >= 0 && targetCol < this.cols) {
      this.swapTiles(row, col, targetRow, targetCol);
    }
  },

  swapTiles: function(r1, c1, r2, c2) {
    let temp = this.board[r1][c1];
    this.board[r1][c1] = this.board[r2][c2];
    this.board[r2][c2] = temp;
  },

  draw: function(ctx) {
    if (this.board.length === 0) this.init();

    // Темный фон под сеткой
    ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
    ctx.fillRect(0, 0, 320, 640);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let colorIndex = this.board[r][c];
        if (colorIndex === -1) continue; // Пустая клетка

        ctx.fillStyle = this.colors[colorIndex];

        // Рисуем квадрат с небольшим отступом (сетка)
        ctx.fillRect(
          this.offsetX + c * this.cellSize + 1,
          this.offsetY + r * this.cellSize + 1,
          this.cellSize - 2,
          this.cellSize - 2
        );
      }
    }
  }
};

document.addEventListener('touchstart', function(e) {
  if (window.App && window.App.currentGame !== 'match3') return;
  if (e.touches.length > 1) return;
  Match3Game.touchStartX = e.touches[0].clientX;
  Match3Game.touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchend', function(e) {
  if (window.App && window.App.currentGame !== 'match3') return;
  if (!Match3Game.touchStartX) return;

  const dx = e.changedTouches[0].clientX - Match3Game.touchStartX;
  const dy = e.changedTouches[0].clientY - Match3Game.touchStartY;

  if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
    Match3Game.handleSwipe(Match3Game.touchStartX, Match3Game.touchStartY, dx, dy);
  }
  Match3Game.touchStartX = null;
  Match3Game.touchStartY = null;
});
