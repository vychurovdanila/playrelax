/* ============================================================
   ИГРА MATCH-3 (заглушка). Независимый модуль с тем же контрактом,
   что и Тетрис: update() — логика, draw(ctx) — отрисовка.
   Кадром управляет main.js (window.App.loop).
   ============================================================ */
window.Match3Game = {
  cols: 6,
  rows: 12,
  cellSize: 320 / 6, // Динамический размер ячейки (53.33px), чтобы заполнить ширину 320px
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
