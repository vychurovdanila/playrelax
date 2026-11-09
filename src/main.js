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

  // suspended — «игра на паузе до старта». Пока true, цикл не обновляет и не
  // рисует игровые модули, а только частицы. Ставится онбордингом: иначе
  // тетрис работал в фоне и сыпал частицы шлейфа прямо во время сцены
  // (искры летели ещё до взрыва текста).
  suspended: false,

  init: function() {
    this.loop();
  },

  // Запуск игры из главного меню. Раньше стартовый экран (#start-screen)
  // и показ канваса обслуживал обработчик в src/tetris.js — теперь меню
  // #ui-layer, поэтому запуск передаётся сюда (см. DOMContentLoaded ниже).
  startGame: function(gameName) {
    // Снимаем приостановку: цикл снова обновляет и рисует игру.
    this.suspended = false;

    // Переключаем текущую игру и чистим экран
    this.switchGame(gameName);

    // Показываем канвас: 0.65 — подобранная прозрачность фигур,
    // значение продублировано в src/styles.css (там стартовое 0).
    this.canvas.style.opacity = '0.65';
    this.canvas.style.pointerEvents = 'auto';

    // Запускаем звук: случайный порядок треков + воспроизведение.
    if (window.audioManager) window.audioManager.startMusic();
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

    // Онбординг: игры не обновляются/не рисуются, но частицы — да.
    // Частицы рисуются здесь, а не своим циклом в onboarding.js, потому что
    // это единственный владелец requestAnimationFrame и очистки канваса:
    // второй цикл конфликтовал бы (два clearRect за кадр).
    if (this.suspended) {
      if (window.Particles && window.Particles.count()) {
        window.Particles.update(this.ctx);
      }
      return;
    }

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

  // Кнопка [ НАЧАЛО ] главного меню: скрываем меню и запускаем игру.
  // Пока по умолчанию Match-3, так как он выбран в меню («ВНИМАНИЕ»).
  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('ui-layer').style.display = 'none'; // Скрываем меню
    window.App.startGame('match3');
  });

  // Проверяем, проходил ли пользователь онбординг.
  // Флаг ставит src/onboarding.js по кнопке [ В ПУТЬ ].
  if (!localStorage.getItem('playrelax_onboarded')) {
    // Скрываем основное меню, пока идёт онбординг
    document.getElementById('ui-layer').style.display = 'none';
    // Запускаем онбординг
    if (window.Onboarding) window.Onboarding.start();
  } else {
    // Если уже проходил, показываем меню
    document.getElementById('ui-layer').style.display = 'flex';
  }
});
