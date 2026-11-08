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
  imagePaths: [
    'assets/images/tile1.svg',
    'assets/images/tile2.svg',
    'assets/images/tile3.svg',
    'assets/images/tile4.svg',
    'assets/images/tile5.svg'
  ],
  images: [], // Сюда загрузятся сами картинки
  isLoaded: false, // Флаг: все картинки загружены

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
        }
      }
      // Заполняем пустые места сверху новыми случайными кубиками
      for (let r = 0; r < emptySpaces; r++) {
        this.board[r][c] = Math.floor(Math.random() * this.colors.length);
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

        // Рисуем только картинку (фолбэк на цвета убран — он давал мигание при загрузке)
        if (this.images[colorIndex]) {
          ctx.drawImage(
            this.images[colorIndex],
            this.offsetX + c * this.cellSize + 1,
            this.offsetY + r * this.cellSize + 1,
            this.cellSize - 2,
            this.cellSize - 2
          );
        }
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
