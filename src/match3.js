/* ============================================================
   ИГРА MATCH-3 (заглушка). Независимый модуль с тем же контрактом,
   что и Тетрис: update() — логика, draw(ctx) — отрисовка.
   Кадром управляет main.js (window.App.loop).
   ============================================================ */
// Жёсткий счётчик касаний: на каждом touchstart берём фактическое число пальцев
// (e.touches.length — защищает от потери событий), на touchend/touchcancel
// уменьшаем. Не даёт фигурке «зависнуть в руке», если мультитач-жест
// закончился не по сценарию или часть событий потерялась.
let touchCount = 0;
document.addEventListener('touchstart', (e) => { touchCount = e.touches.length; }, { passive: true });
document.addEventListener('touchend', () => { touchCount = Math.max(0, touchCount - 1); }, { passive: true });
document.addEventListener('touchcancel', () => { touchCount = Math.max(0, touchCount - 1); }, { passive: true });

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

  // Возврат фигурки на место, если её бросили не в ту клетку
  returningTile: null, // { row, col, startX, startY, currentX, currentY, targetX, targetY, t }

  // Длительность возврата в кадрах. 60 кадров = ровно 1 секунда при 60 fps.
  // Меняй это число, чтобы ускорить/замедлить возврат фигурки.
  returnDuration: 60,

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
    // ЖЕСТКИЙ СБРОС: если на экране нет пальцев, фигурка не может быть в руке
    if (this.draggedTile && touchCount === 0) {
      this.draggedTile = null;
    }

    // Защита: если поле еще не создано, выходим
    if (!this.board || this.board.length === 0) return;

    // Анимация плавного возврата фигурки на своё место.
    // Позиция считается по времени (t = 0..1), а не накоплением процента:
    // так длительность возврата не зависит от расстояния и её легко менять.
    if (this.returningTile) {
      const rt = this.returningTile;

      rt.t = (rt.t || 0) + 1 / this.returnDuration; // Доля пройденного пути

      if (rt.t >= 1) {
        rt.currentX = rt.targetX;
        rt.currentY = rt.targetY;
        this.returningTile = null; // Прибыли на место
      } else {
        // ease-out cubic: быстрый старт, мягкое торможение у цели
        const k = 1 - Math.pow(1 - rt.t, 3);
        rt.currentX = rt.startX + (rt.targetX - rt.startX) * k;
        rt.currentY = rt.startY + (rt.targetY - rt.startY) * k;
      }
    }

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

  // Проверяет, есть ли линия из 3+ одинаковых кубиков, проходящая через клетку (r, c).
  // Нужна для swapTiles: обмен засчитывается только если линия появилась
  // именно в клетках обмена, а не где-то ещё на доске.
  // ВНИМАНИЕ: ничего не разрушает (в отличие от checkMatches).
  hasLineAt: function(r, c) {
    if (!this.board || this.board.length === 0) return false;

    const color = this.board[r][c];
    if (color === -1) return false;

    // Считаем одинаковые кубики влево и вправо от (r, c)
    let horizontal = 1;
    for (let i = c - 1; i >= 0 && this.board[r][i] === color; i--) horizontal++;
    for (let i = c + 1; i < this.cols && this.board[r][i] === color; i++) horizontal++;
    if (horizontal >= 3) return true;

    // Считаем одинаковые кубики вверх и вниз от (r, c)
    let vertical = 1;
    for (let i = r - 1; i >= 0 && this.board[i][c] === color; i--) vertical++;
    for (let i = r + 1; i < this.rows && this.board[i][c] === color; i++) vertical++;
    if (vertical >= 3) return true;

    return false;
  },

  // Возвращает true, если обмен состоялся (создал линию), иначе false.
  swapTiles: function(r1, c1, r2, c2) {
    let temp = this.board[r1][c1];
    this.board[r1][c1] = this.board[r2][c2];
    this.board[r2][c2] = temp;

    // Обмен засчитывается, только если линия появилась В КЛЕТКАХ ОБМЕНА.
    // Проверяем именно (r1,c1) и (r2,c2): иначе чужая тройка в другом месте
    // доски «подтверждала» бы неудачный обмен, и фигурка не возвращалась.
    if (!this.hasLineAt(r1, c1) && !this.hasLineAt(r2, c2)) {
      // Линии нет — откатываем ход
      let tempBack = this.board[r1][c1];
      this.board[r1][c1] = this.board[r2][c2];
      this.board[r2][c2] = tempBack;
      return false; // Обмена не было
    }
    return true; // Обмен состоялся
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
    // Если на экране нет пальцев, но фигурка взята — принудительно отпускаем.
    // Проверка именно здесь, в отрисовке: она выполняется каждый кадр и не
    // зависит от кэша логики/таймингов update().
    if (this.draggedTile && (typeof touchCount !== 'undefined' && touchCount === 0)) {
      this.draggedTile = null;
    }

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

        // Возвращающуюся фигурку тоже не рисуем в сетке — её отрисуем поверх в конце
        if (this.returningTile && this.returningTile.row === r && this.returningTile.col === c) {
          continue; // Пропускаем, ее отрисуем поверх
        }

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

    // Рисуем возвращающуюся фигурку
    if (this.returningTile) {
      const rt = this.returningTile;
      const colorIndex = this.board[rt.row][rt.col];

      if (colorIndex !== -1 && this.images[colorIndex]) {
        ctx.drawImage(
          this.images[colorIndex],
          rt.currentX, rt.currentY,
          this.cellSize - 2, this.cellSize - 2
        );
      }
    }

    // Частицы здесь НЕ обновляются: вся физика и отрисовка единого пула идут
    // в main.js на полноэкранный #fx-canvas. Иначе был бы второй update за
    // кадр — двойная физика, частицы «уезжали» влево-вверх. Спавн частиц
    // (spawnOne / spawnExplosion) остаётся здесь и работает как раньше.
  }
};

document.addEventListener('touchstart', function(e) {
  if (window.App && window.App.currentGame !== 'match3') return;

  // Если на экране больше одного пальца — это мультитач-жест.
  // Принудительно отпускаем фигурку и НЕ берем новую.
  if (e.touches.length > 1) {
    Match3Game.draggedTile = null;
    Match3Game.touchStartX = null;
    Match3Game.touchStartY = null;
    return;
  }

  // Обычное касание одним пальцем
  if (e.touches.length === 1) {
    // Пока кубики падают — свайп и взятие фигурки игнорируем
    const isFalling = Match3Game.visualY.some(row => row.some(v => v < 0));
    if (isFalling) return;

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
  }
}, { passive: true });

document.addEventListener('touchmove', function(e) {
  if (window.App && window.App.currentGame !== 'match3') return;

  // Если пальцев больше одного — это не таскание фигурки, а жест.
  // Сбрасываем фигурку и игнорируем движение.
  if (e.touches.length > 1) {
    Match3Game.draggedTile = null;
    return;
  }

  // Обычное таскание одним пальцем
  if (Match3Game.draggedTile && e.touches.length === 1) {
    Match3Game.dragX = e.touches[0].clientX;
    Match3Game.dragY = e.touches[0].clientY;
  }
}, { passive: true });

document.addEventListener('touchend', function(e) {
  if (window.App && window.App.currentGame !== 'match3') return;

  // Если пальцев на экране не осталось — принудительно убираем фигурку из руки.
  // Флаг ставим здесь, в начале обработчика, а сам сброс делаем в конце (см.
  // ниже): обнули мы draggedTile прямо сейчас, и не сработал бы ни обмен
  // фигурками, ни возврат её на место — эта логика идёт следом.
  const noFingersLeft = e.touches.length === 0;

  // Если мы тащили фигурку — проверяем, в какую клетку её бросили.
  // Бросок допускается в ЛЮБУЮ клетку поля, а не только в соседнюю.
  if (Match3Game.draggedTile) {
    const rect = window.App.canvas.getBoundingClientRect();
    const scale = rect.width / 320;
    const endCol = Math.floor((e.changedTouches[0].clientX - rect.left) / scale / Match3Game.cellSize);
    const endRow = Math.floor((e.changedTouches[0].clientY - rect.top) / scale / Match3Game.cellSize);

    const dropX = (e.changedTouches[0].clientX - rect.left) / scale;
    const dropY = (e.changedTouches[0].clientY - rect.top) / scale;

    let didSwap = false;
    if (endRow >= 0 && endRow < Match3Game.rows && endCol >= 0 && endCol < Match3Game.cols) {
      if (endRow !== Match3Game.draggedTile.row || endCol !== Match3Game.draggedTile.col) {
        // swapTiles принимает любые координаты и сама откатывает ход,
        // если линия не сложилась (вернёт false).
        didSwap = Match3Game.swapTiles(
          Match3Game.draggedTile.row,
          Match3Game.draggedTile.col,
          endRow,
          endCol
        );
      }
    }

    // Ход не состоялся (бросили мимо поля, в ту же клетку или обмен откатился) —
    // плавно возвращаем фигурку на её родное место из точки отпускания.
    if (!didSwap) {
      const fromCol = Match3Game.draggedTile.col;
      const fromRow = Match3Game.draggedTile.row;

      Match3Game.returningTile = {
        row: fromRow,
        col: fromCol,
        // startX/startY — откуда стартует анимация возврата (точка отпускания)
        startX: dropX - Match3Game.cellSize / 2,
        startY: dropY - Match3Game.cellSize / 2,
        currentX: dropX - Match3Game.cellSize / 2,
        currentY: dropY - Match3Game.cellSize / 2,
        // Куда фигурка возвращается (позиция её родной клетки)
        targetX: Match3Game.offsetX + fromCol * Match3Game.cellSize,
        targetY: Match3Game.offsetY + fromRow * Match3Game.cellSize,
        t: 0 // Прогресс анимации: 0 — старт, 1 — на месте
      };
    }

    Match3Game.draggedTile = null; // Отпустили
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

  // Последний палец ушёл — фигурка ни при каком раскладе не остаётся в руке.
  if (noFingersLeft) {
    Match3Game.draggedTile = null;
  }
});

// Браузер может сам прервать касание (мультитач-жест, системный скролл или
// свайп) — тогда touchend не приходит вовсе, и фигурка «залипает» в руке:
// продолжает висеть по последней координате, ехать за следующим пальцем и
// сыпать искры. Поэтому отпускаем её и по touchcancel.
document.addEventListener('touchcancel', function() {
  if (window.App && window.App.currentGame !== 'match3') return;

  Match3Game.draggedTile = null;
  Match3Game.touchStartX = null;
  Match3Game.touchStartY = null;
});
