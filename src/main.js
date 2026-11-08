/* ============================================================
   ДИРИЖЁР ПРИЛОЖЕНИЯ (main.js).
   Единственный владелец requestAnimationFrame и очистки канваса.
   Игры — независимые модули со своим API:
     - Тетрис:    window.TetrisGame.update() / .draw(ctx)  (src/tetris.js)
     - Match-3:   window.Match3Game.update() / .draw(ctx)  (src/match3.js)
   Подключается ПОСЛЕДНИМ: к моменту DOMContentLoaded модули уже объявлены.
   ============================================================ */
window.App = {
  currentGame: 'tetris',
  canvas: document.getElementById('game'),
  ctx: document.getElementById('game').getContext('2d'),

  init: function() {
    this.loop();
  },

  switchGame: function(gameName) {
    this.currentGame = gameName;
    // Очищаем экран при переключении
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  loop: function() {
    requestAnimationFrame(() => this.loop());

    // Очистка экрана
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.currentGame === 'tetris' && window.TetrisGame) {
      window.TetrisGame.update();
      window.TetrisGame.draw(this.ctx);
    } else if (this.currentGame === 'match3') {
      try {
        window.Match3Game.update();
        window.Match3Game.draw(this.ctx);
      } catch (e) {
        console.error("Match3 Error:", e);
        this.ctx.fillStyle = 'red';
        this.ctx.font = '14px sans-serif';
        this.ctx.fillText("Ошибка Match3: " + e.message, 10, 50);
      }
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
