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
  colors: [
    'rgba(255, 255, 255, 0.65)', // Tile 1 (65%)
    'rgba(255, 255, 255, 1.0)',  // Tile 2 (100%)
    'rgba(255, 255, 255, 0.85)', // Tile 3 (85%)
    'rgba(255, 255, 255, 0.90)', // Tile 4 (90%)
    'rgba(255, 255, 255, 1.0)'   // Tile 5 (100%)
  ],
  imagePaths: [
    'assets/images/tile1.svg',
    'assets/images/tile2.svg',
    'assets/images/tile3.svg',
    'assets/images/tile4.svg',
    'assets/images/tile5.svg'
  ],
  images: [], // Сюда загрузятся сами картинки
  isLoaded: false, // Флаг: все картинки загружены
  visualY: [], // Смещение кубика по Y в пикселях (для плавного падения)
  velY: [],    // Скорость падения

  // Состояние перетаскивания (drag-and-drop) фигурки пальцем
  dragX: 0,
  dragY: 0,
  draggedTile: null, // { row, col } взятой фигурки

  init: function() {
    if (this.images.length === 0) {
      // Запускаем загрузку картинок
      let promises = this.imagePaths.map(path => {
        return new Promise((resolve) => {
          let img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(img); // Даже если ошибка — не блокируем игру
          img.src = path;
        });
      });

      // Когда всё загрузится — ставим флаг
      Promise.all(promises).then((loadedImages) => {
        this.images = loadedImages;
        this.isLoaded = true;
      });

      // Генерируем доску (как было раньше)
      this.board = [];
      for (let r = 0; r < this.rows; r++) {
        let row = [];
        for (let c = 0; c < this.cols; c++) {
          row.push(Math.floor(Math.random() * this.colors.length));
        }
        this.board.push(row);
      }

      // Массивы физики: смещение и скорость для каждого кубика
      this.visualY = Array.from({ length: this.rows }, () => new Array(this.cols).fill(0));
      this.velY = Array.from({ length: this.rows }, () => new Array(this.cols).fill(0));

      // Убираем готовые линии на старте: чистим и досыпаем, пока есть совпадения.
      // Ограничение попыток — страховка от зацикливания (браузер не зависнет).
      let safetyCounter = 0;
      while (this.checkMatches() && safetyCounter < 50) {
        this.dropTiles();
        safetyCounter++;
      }
    }
  },

  update: function() {
    // Защита: если поле еще не создано, выходим
    if (!this.board || this.board.length === 0) return;

    // Если фигурка в руке — сыпем искры (шлейф под пальцем)
    if (this.draggedTile && window.Particles && window.Particles.spawnOne) {
      const rect = window.App.canvas.getBoundingClientRect();
      const scale = rect.width / 320;
      const localX = (this.dragX - rect.left) / scale;
      const localY = (this.dragY - rect.top) / scale;

      // Спавним 2 маленькие частицы за кадр (как шлейф в Тетрисе)
      window.Particles.spawnOne(localX, localY, 'white');
      window.Particles.spawnOne(localX, localY, 'white');
    }

    let isFalling = false;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.visualY[r][c] < 0) {
          this.velY[r][c] += 0.2; // Ускорение свободного падения
          this.visualY[r][c] += this.velY[r][c];
          isFalling = true;
          if (this.visualY[r][c] >= 0) {
            this.visualY[r][c] = 0; // Приземлился
            this.velY[r][c] = 0;
          }
        }
      }
    }

    // Если что-то падает, не проверяем совпадения, пока не упадет всё
    if (isFalling) return;

    // 1. Проверяем, есть ли совпадения (каскады после падения)
    if (this.checkMatches()) {
      this.dropTiles();
      return; // Ждем следующего кадра для отрисовки
    }

    // 2. Проверяем, есть ли пустые клетки (дырки)
    let hasEmpty = false;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c] === -1) {
          hasEmpty = true;
          break;
        }
      }
    }

    // 3. Если есть пустые места, запускаем падение
    if (hasEmpty) {
      this.dropTiles();
    }
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

    // Обмен засчитывается только если он создал линию: иначе возвращаем всё назад
    if (!this.checkMatches()) {
      let tempBack = this.board[r1][c1];
      this.board[r1][c1] = this.board[r2][c2];
      this.board[r2][c2] = tempBack;
    }
  },

  checkMatches: function() {
    // Защита: до init() доски нет — иначе TypeError и пустой экран
    if (!this.board || this.board.length === 0) return false;

    let found = false;
    const marks = [];

    // Горизонтальные линии из 3+ одинаковых цветов
    for (let r = 0; r < this.rows; r++) {
      let runStart = 0;
      for (let c = 1; c <= this.cols; c++) {
        const same = c < this.cols &&
          this.board[r][c] !== -1 &&
          this.board[r][c] === this.board[r][runStart];
        if (!same) {
          if (c - runStart >= 3 && this.board[r][runStart] !== -1) {
            for (let k = runStart; k < c; k++) marks.push([r, k]);
          }
          runStart = c;
        }
      }
    }

    // Вертикальные линии из 3+ одинаковых цветов
    for (let c = 0; c < this.cols; c++) {
      let runStart = 0;
      for (let r = 1; r <= this.rows; r++) {
        const same = r < this.rows &&
          this.board[r][c] !== -1 &&
          this.board[r][c] === this.board[runStart][c];
        if (!same) {
          if (r - runStart >= 3 && this.board[runStart][c] !== -1) {
            for (let k = runStart; k < r; k++) marks.push([k, c]);
          }
          runStart = r;
        }
      }
    }

    for (let i = 0; i < marks.length; i++) {
      const r = marks[i][0];
      const c = marks[i][1];
      if (this.board[r][c] !== -1) {
        const colorIndex = this.board[r][c];

        // Взрыв частиц в центре кубика
        if (window.Particles && window.Particles.spawnExplosion) {
          const px = this.offsetX + c * this.cellSize + this.cellSize / 2;
          const py = this.offsetY + r * this.cellSize + this.visualY[r][c] + this.cellSize / 2;
          // Цвет — белый: фактическая прозрачность задаётся внутри движка частиц (p.alpha)
          window.Particles.spawnExplosion(px, py, 'white', 30);
        }

        this.board[r][c] = -1;
        found = true;
      }
    }

    return found;
  },

  dropTiles: function() {
    for (let c = 0; c < this.cols; c++) {
      let emptySpaces = 0;
      // Идем по колонке снизу вверх
      for (let r = this.rows - 1; r >= 0; r--) {
        if (this.board[r][c] === -1) {
          emptySpaces++;
        } else if (emptySpaces > 0) {
          // Двигаем кубик вниз на количество пустых мест
          this.board[r + emptySpaces][c] = this.board[r][c];
          this.board[r][c] = -1;
          // Задаем визуальное смещение (отрицательное, чтобы кубик отрисовался выше)
          this.visualY[r + emptySpaces][c] = -emptySpaces * this.cellSize;
          this.velY[r + emptySpaces][c] = 0; // Сбрасываем скорость
        }
      }
      // Заполняем пустые места сверху новыми случайными кубиками
      for (let r = 0; r < emptySpaces; r++) {
        this.board[r][c] = Math.floor(Math.random() * this.colors.length);
        this.visualY[r][c] = -(emptySpaces - r) * this.cellSize; // Появляются сверху экрана
        this.velY[r][c] = 0;
      }
    }
  },

  draw: function(ctx) {
    // Защита: доска создается при первом кадре, если init() еще не вызывался
    if (!this.board || this.board.length === 0) this.init();

    // Пока картинки не загрузились — ничего не рисуем (оставляем прозрачный фон)
    if (!this.isLoaded || !this.board || this.board.length === 0) return;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let colorIndex = this.board[r][c];
        if (colorIndex === -1) continue; // Пустая клетка

        // Взятую фигурку не рисуем здесь — она отрисуется поверх всех в конце с подсветкой
        if (this.draggedTile && this.draggedTile.row === r && this.draggedTile.col === c) continue;

        // Рисуем только картинку (фолбэк на цвета убран — он давал мигание при загрузке)
        if (this.images[colorIndex]) {
          ctx.drawImage(
            this.images[colorIndex],
            this.offsetX + c * this.cellSize + 1,
            this.offsetY + r * this.cellSize + this.visualY[r][c] + 1, // <-- Добавили visualY
            this.cellSize - 2,
            this.cellSize - 2
          );
        }
      }
    }

    // Рисуем взятую фигурку поверх всех, со свечением
    if (this.draggedTile) {
      const rect = window.App.canvas.getBoundingClientRect();
      const scale = rect.width / 320;
      // Центрируем фигурку под пальцем
      const drawX = (this.dragX - rect.left) / scale - this.cellSize / 2;
      const drawY = (this.dragY - rect.top) / scale - this.cellSize / 2;

      const colorIndex = this.board[this.draggedTile.row][this.draggedTile.col];

      if (colorIndex !== -1 && this.images[colorIndex]) {
        ctx.save();
        // Добавляем свечение
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'white';
        // Рисуем фигурку
        ctx.drawImage(
          this.images[colorIndex],
          drawX, drawY,
          this.cellSize - 2, this.cellSize - 2
        );
        ctx.restore();
      }
    }

    // Отрисовка частиц поверх поля
    if (window.Particles && window.Particles.update) {
      window.Particles.update(ctx);
    }
  }
};

document.addEventListener('touchstart', function(e) {
  if (window.App && window.App.currentGame !== 'match3') return;
  if (e.touches.length > 1) return;

  // Проверяем, есть ли падающие кубики
  let isFalling = Match3Game.visualY.some(row => row.some(v => v < 0));
  if (isFalling) return; // Если падают — игнорируем свайп

  Match3Game.touchStartX = e.touches[0].clientX;
  Match3Game.touchStartY = e.touches[0].clientY;

  // Вычисляем клетку под пальцем и берем фигурку в руку (для drag-and-drop)
  const rect = window.App.canvas.getBoundingClientRect();
  const scale = rect.width / 320;
  const localX = (e.touches[0].clientX - rect.left) / scale;
  const localY = (e.touches[0].clientY - rect.top) / scale;
  const col = Math.floor(localX / Match3Game.cellSize);
  const row = Math.floor(localY / Match3Game.cellSize);

  // Если палец попал в сетку — берем фигурку
  if (row >= 0 && row < Match3Game.rows && col >= 0 && col < Match3Game.cols) {
    Match3Game.draggedTile = { row: row, col: col };
    Match3Game.dragX = e.touches[0].clientX;
    Match3Game.dragY = e.touches[0].clientY;
  }
});

document.addEventListener('touchmove', function(e) {
  if (window.App && window.App.currentGame !== 'match3') return;
  if (Match3Game.draggedTile && e.touches.length === 1) {
    Match3Game.dragX = e.touches[0].clientX;
    Match3Game.dragY = e.touches[0].clientY;
  }
}, { passive: true });

document.addEventListener('touchend', function(e) {
  if (window.App && window.App.currentGame !== 'match3') return;

  // Если мы тащили фигурку, проверяем, куда ее бросили
  if (Match3Game.draggedTile) {
    // Пересчитываем финальную позицию (логика как в свайпе)
    const rect = window.App.canvas.getBoundingClientRect();
    const scale = rect.width / 320;
    const endCol = Math.floor((e.changedTouches[0].clientX - rect.left) / scale / Match3Game.cellSize);
    const endRow = Math.floor((e.changedTouches[0].clientY - rect.top) / scale / Match3Game.cellSize);

    // Если бросили в пределах поля и это не та же клетка
    if (endRow >= 0 && endRow < Match3Game.rows && endCol >= 0 && endCol < Match3Game.cols) {
      if (endRow !== Match3Game.draggedTile.row || endCol !== Match3Game.draggedTile.col) {
        Match3Game.swapTiles(Match3Game.draggedTile.row, Match3Game.draggedTile.col, endRow, endCol);
      }
    }
    Match3Game.draggedTile = null; // Отпустили
    Match3Game.touchStartX = null;
    Match3Game.touchStartY = null;
    return; // Выходим, чтобы не сработал обычный свайп
  }

  if (!Match3Game.touchStartX) return;

  const dx = e.changedTouches[0].clientX - Match3Game.touchStartX;
  const dy = e.changedTouches[0].clientY - Match3Game.touchStartY;

  if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
    Match3Game.handleSwipe(Match3Game.touchStartX, Match3Game.touchStartY, dx, dy);
  }
  Match3Game.touchStartX = null;
  Match3Game.touchStartY = null;
});
