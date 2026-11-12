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

  // --- Замер FPS и динамическая оптимизация ---
  // fpsFrames накапливает кадры за текущую секунду, fpsLastTime — отметка
  // начала окна замера. Если за окно набралось меньше 40 кадров — включаем
  // режим максимальной оптимизации (отключаем lighter и режем частицы).
  fpsFrames: 0,
  fpsLastTime: performance.now(),
  lowPerformanceMode: false,

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

  // Мост для gestures.js (мультитач).
  // Двухпальцевый тап переключает паузу. Сначала пробуем метод игры
  // (window.TetrisGame), затем рабочий фасад тетриса (window.GameAPI,
  // см. src/tetris.js) и только в крайнем случае — локальный флаг suspended.
  togglePause: function() {
    if (window.TetrisGame && window.TetrisGame.togglePause) {
      window.TetrisGame.togglePause();
    } else if (window.GameAPI && window.GameAPI.togglePause) {
      window.GameAPI.togglePause();
    } else {
      this.suspended = !this.suspended;
    }
  },

  // Жест увёл палец с игры: снимаем удержание «вниз», иначе фигура залипнет.
  releaseDownHold: function() {
    if (window.TetrisGame && window.TetrisGame.releaseDownHold) {
      window.TetrisGame.releaseDownHold();
    } else if (window.GameAPI && window.GameAPI.releaseDownHold) {
      window.GameAPI.releaseDownHold();
    }
  },

  loop: function() {
    requestAnimationFrame(() => this.loop());

    // Замер FPS
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsLastTime >= 1000) {
      const currentFps = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsLastTime = now;

      // Если FPS упал ниже 40 и мы еще не в режиме оптимизации
      if (currentFps < 40 && !this.lowPerformanceMode) {
        console.warn(`Низкий FPS (${currentFps}). Включаем режим максимальной оптимизации.`);
        this.lowPerformanceMode = true;
        document.body.classList.add('low-perf-mode');
        if (window.Particles) window.Particles.setLowPerformanceMode(true);
      }
    }

    // Генерация медленных частиц на паузе
    if (document.body.classList.contains('is-paused') && window.Particles) {
      if (Math.random() < 0.1) { // ~6 частиц в секунду
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        window.Particles.spawnAmbient(x, y);
      }
    }

    // Очистка экрана
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // ВСЕ частицы (онбординг, шлейф фигуры, взрывы) рисуются только здесь —
    // на полноэкранном #fx-canvas, всегда. Игровые модули частицы больше не
    // обновляют: пул в Particles общий, и двойной update за кадр давал двойную
    // физику (частицы «уезжали» влево-вверх).
    if (window.Particles) {
      const fxCanvas = document.getElementById('fx-canvas');
      if (fxCanvas) {
        fxCanvas.width = window.innerWidth;
        fxCanvas.height = window.innerHeight;
        const fxCtx = fxCanvas.getContext('2d');
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

        // Частицы игр спавнятся в координатах игрового поля (#game, 320×640),
        // а рисуются здесь — на полноэкранном холсте, чей битмап 1:1 равен
        // экрану. Переводим координаты поля в экранные через масштаб и
        // положение #game. Во время онбординга (suspended) частицы и так
        // спавнятся в экранных координатах, поэтому там трансформация
        // единичная — иначе сцену онбординга сместило бы и сжало.
        if (window.Particles.setTransform) {
          if (this.suspended || !this.canvas) {
            window.Particles.setTransform(1, 1, 0, 0);
          } else {
            const rect = this.canvas.getBoundingClientRect();
            window.Particles.setTransform(
              rect.width / this.canvas.width,
              rect.height / this.canvas.height,
              rect.left,
              rect.top
            );
          }
        }

        window.Particles.update(fxCtx);
      }
    }

    // Онбординг: игры не обновляются и не рисуются.
    if (this.suspended) {
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

  // Всегда запускаем онбординг для отладки
  // Скрываем основное меню, пока идёт онбординг
  document.getElementById('ui-layer').style.display = 'none';

  window.Onboarding.start();
});
