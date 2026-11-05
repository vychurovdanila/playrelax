// playrelax — игровая логика (рефакторинг прототипа).
// Стек: ванильный JS + Canvas 2D.
// https://tetris.fandom.com/wiki/Tetris_Guideline

/* ============================================================
   Объявления вверху файла — до функций, которые их используют.
   (Хрупкость сессии 1 устранена: canvas/context/dataset объявлены здесь.)
   ============================================================ */

const canvas = document.getElementById('game');
const context = canvas.getContext('2d');
const grid = 32;

// Очередь фигур (заполняется generateSequence).
const tetrominoSequence = [];

// Игровое поле: большой скрытый стакан 10×200 (условно бесконечный).
// Видна только часть (VISIBLE_ROWS = 20), остальное показывает камера (cameraY).
// При достижении дна массива нижние ряды удаляются (shift), сверху добавляются
// пустые (push) — камера остаётся на пределе, игра не заканчивается.
// 2-мерный массив: playfield[row][col].
const ROWS = 200;
const COLS = 10;
const VISIBLE_ROWS = 20;
let cameraY = 20; // камера показывает ряды с 20 по 39
const playfield = [];

// Как рисуется каждый тетромино.
// @see https://tetris.fandom.com/wiki/SRS
const tetrominos = {
  'I': [
    [0,0,0,0],
    [1,1,1,1],
    [0,0,0,0],
    [0,0,0,0]
  ],
  'J': [
    [1,0,0],
    [1,1,1],
    [0,0,0],
  ],
  'L': [
    [0,0,1],
    [1,1,1],
    [0,0,0],
  ],
  'O': [
    [1,1],
    [1,1],
  ],
  'S': [
    [0,1,1],
    [1,1,0],
    [0,0,0],
  ],
  'Z': [
    [1,1,0],
    [0,1,1],
    [0,0,0],
  ],
  'T': [
    [0,1,0],
    [1,1,1],
    [0,0,0],
  ]
};

// Цвет каждого тетромино.
const colors = {
  'I': 'white',
  'O': 'white',
  'T': 'white',
  'S': 'white',
  'Z': 'white',
  'J': 'white',
  'L': 'white'
};

// Заполняем пустое поле (строки 0..39, столбцы 0..9).
for (let row = 0; row < ROWS; row++) {
  playfield[row] = new Array(COLS).fill(0);
}

// Состояние игры.
let count = 0;
let tetromino = null;
let rAF = null;  // отслеживаем кадр анимации, чтобы при необходимости отменить

// Пауза: переключается коротким тапом двумя пальцами (тапнул — пауза,
// тапнул ещё раз — игра). Свайп двумя пальцами (смена мира) паузу не трогает.
let isPaused = false;

/* ============================================================
   Функции игры.
   ============================================================ */

// Случайное целое в диапазоне [min,max].
// @see https://stackoverflow.com/a/1527820/2124254
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Генерируем новую последовательность тетромино.
// @see https://tetris.fandom.com/wiki/Random_Generator
function generateSequence() {
  const sequence = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

  while (sequence.length) {
    const rand = getRandomInt(0, sequence.length - 1);
    const name = sequence.splice(rand, 1)[0];
    tetrominoSequence.push(name);
  }
}

// Берём следующую фигуру из последовательности.
function getNextTetromino() {
  if (tetrominoSequence.length === 0) {
    generateSequence();
  }

  const name = tetrominoSequence.pop();
  const matrix = tetrominos[name];

  // I и O стартуют по центру, остальные — в левой середине.
  const col = COLS / 2 - Math.ceil(matrix[0].length / 2);

  // Фигура появляется над видимой зоной (за верхним краем экрана)
  // и плавно выезжает на экран.
  const row = cameraY - 2;

  return {
    name: name,      // имя фигуры (L, O, и т.д.)
    matrix: matrix,  // текущая матрица поворота
    row: row,        // текущая строка (стартует за экраном)
    col: col         // текущий столбец
  };
}

// Поворот матрицы NxN на 90°.
// @see https://codereview.stackexchange.com/a/186834
function rotate(matrix) {
  const N = matrix.length - 1;
  const result = matrix.map((row, i) =>
    row.map((val, j) => matrix[N - j][i])
  );

  return result;
}

// Проверяем, что новая матрица/строка/столбец допустимы.
function isValidMove(matrix, cellRow, cellCol) {
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (matrix[row][col] && (
          // Выход за левую/правую границу
          cellCol + col < 0 ||
          cellCol + col >= playfield[0].length ||
          // ЖЁСТКИЙ ПОЛ: фигура не может упасть ниже видимой зоны
          cellRow + row >= cameraY + VISIBLE_ROWS ||
          // Столкновение с другими блоками
          playfield[cellRow + row][cellCol + col])
        ) {
        return false;
      }
    }
  }

  return true;
}

// Кладём тетромино на игровое поле.
function placeTetromino() {
  for (let row = 0; row < tetromino.matrix.length; row++) {
    for (let col = 0; col < tetromino.matrix[row].length; col++) {
      if (tetromino.matrix[row][col]) {

        // Бесконечный режим: фиксация переполнения у верхнего края
        // не теряется — большой стакан хранит ряды, камера едет вниз.
        // Клетки выше стакана просто отбрасываются (row < 0).
        const boardRow = tetromino.row + row;
        if (boardRow >= 0) {
          playfield[boardRow][tetromino.col + col] = tetromino.name;
        }
      }
    }
  }

  // Пакетное удаление собранных линий.
  // Собираем только НЕ-заполненные строки (rowsToKeep), затем сверху
  // добавляем столько же пустых — это корректно работает и когда
  // подряд собрано несколько линий сразу (старый per-row сдвиг «съезжал»).
  const rowsToKeep = [];
  let linesCleared = 0;

  for (let row = 0; row < ROWS; row++) {
    if (playfield[row].every(cell => !!cell)) {
      // строка заполнена целиком — её убираем
      linesCleared++;
    } else {
      rowsToKeep.push(playfield[row]);
    }
  }

  // Если что-то съели — перестраиваем массив: сохранённые строки снизу,
  // пустые сверху (unshift), длина стакана (ROWS) сохраняется.
  if (linesCleared > 0) {
    for (let i = 0; i < linesCleared; i++) {
      rowsToKeep.unshift(new Array(COLS).fill(0));
    }

    // Копируем результат обратно в playfield (массив по const — мутируем по индексу).
    for (let row = 0; row < ROWS; row++) {
      playfield[row] = rowsToKeep[row];
    }
  }

    // 1. Находим верхний и нижний блоки
    let highestBlock = ROWS;
    let lowestBlock = 0;
    for (let r = 0; r < ROWS; r++) {
      if (playfield[r].some(cell => cell !== 0)) {
        if (highestBlock === ROWS) highestBlock = r;
        lowestBlock = r;
      }
    }

    if (highestBlock !== ROWS) {
      // 2. Отступ сверху (9 пустых рядов).
      if (highestBlock < cameraY + 9) {
        cameraY = highestBlock - 9;
      }

      // 3. НАГРАДА: выезд из подвала.
      // Только когда башня в видимой зоне почти разрушена (<= 2 заполненных
      // рядов) и в подвале есть что показывать.
      if (linesCleared > 0) {
        // Считаем количество заполненных рядов в ВИДИМОЙ зоне.
        let filledRowsVisible = 0;
        for (let r = cameraY; r < cameraY + VISIBLE_ROWS; r++) {
          if (playfield[r] && playfield[r].some(cell => cell !== 0)) {
            filledRowsVisible++;
          }
        }

        if (filledRowsVisible <= 2) {
          // Проверяем, есть ли что показывать в подвале.
          let hasHiddenBlocks = false;
          for (let r = cameraY + VISIBLE_ROWS; r < ROWS; r++) {
            if (playfield[r].some(cell => cell !== 0)) {
              hasHiddenBlocks = true;
              break;
            }
          }

          if (hasHiddenBlocks) {
            // Опускаем окно камеры на 1 ряд — в кадр въезжает ряд из подвала.
            // Важно: playfield НЕ сдвигаем. Сдвиг массива вместе с cameraY
            // компенсирует сам себя (playfield.shift() + cameraY -= 1 дают
            // ровно ту же картинку), и подвал остаётся за экраном. А push
            // пустого ряда добавляет пустоту, а не блоки из подвала.
            cameraY += 1;
          }
        }
      }
    }

    // 4. Бесконечность СВЕРХУ (упреждающий сдвиг).
    // Стакан вместе с камерой сдвигается на SHIFT рядов ЗАРАНЕЕ, пока
    // cameraY ещё далёк от 0. Если ждать cameraY < 0, то новая фигура
    // спавнится с row = cameraY - 2 < 0 и isValidMove падает на
    // playfield[отрицательный индекс]: сдвиг на +20 не успевает
    // компенсировать рост highestBlock.
    if (cameraY < 15) {
      const SHIFT = 20;
      for (let i = 0; i < SHIFT; i++) {
        playfield.unshift(new Array(COLS).fill(0));
        playfield.pop();
      }
      cameraY += SHIFT;
      if (tetromino) tetromino.row += SHIFT;
    }

    // 5. Бесконечность СНИЗУ (тот же принцип: стакан едет вместе с камерой).
    if (cameraY > 180) {
      const SHIFT = 20;
      for (let i = 0; i < SHIFT; i++) {
        playfield.push(new Array(COLS).fill(0));
        playfield.shift();
      }
      cameraY -= SHIFT;
      if (tetromino) tetromino.row -= SHIFT;
    }

  tetromino = getNextTetromino();
}

// Игровой цикл.
function loop() {
  rAF = requestAnimationFrame(loop);
  context.clearRect(0, 0, canvas.width, canvas.height);

  // ПАУЗА: логика падения не выполняется, фигура замирает. Сам эффект
  // (размытие канваса + фокус на видео) делается CSS-классом body.is-paused,
  // никакого оверлея на канвасе не рисуем. requestAnimationFrame продолжает
  // крутиться, поэтому снятие паузы мгновенно возвращает игру в работу.
  if (isPaused) return;

  // Рисуем игровое поле (только видимый диапазон камеры).
  for (let r = 0; r < ROWS; r++) {
    const screenRow = r - cameraY;
    if (screenRow < 0 || screenRow >= VISIBLE_ROWS) continue;

    for (let col = 0; col < COLS; col++) {
      if (playfield[r][col]) {
        const name = playfield[r][col];
        context.fillStyle = colors[name];

        // на 1 px меньше grid — создаёт эффект сетки
        context.fillRect(col * grid, screenRow * grid, grid - 1, grid - 1);
      }
    }
  }

  // Рисуем активную фигуру.
  if (tetromino) {

    // фигура падает каждые 35 кадров
    if (++count > 35) {
      tetromino.row++;
      count = 0;

      // ставим фигуру, если во что-то упирается
      if (!isValidMove(tetromino.matrix, tetromino.row, tetromino.col)) {
        tetromino.row--;
        placeTetromino();
      }
    }

    context.fillStyle = colors[tetromino.name];

    for (let row = 0; row < tetromino.matrix.length; row++) {
      for (let col = 0; col < tetromino.matrix[row].length; col++) {
        if (tetromino.matrix[row][col]) {

          // на 1 px меньше grid — создаёт эффект сетки
          context.fillRect((tetromino.col + col) * grid, (tetromino.row + row - cameraY) * grid, grid - 1, grid - 1);
        }
      }
    }
  }
}

/* ============================================================
   Управление: клавиатура (десктоп) + touch (мобилки).
   ============================================================ */

// Сдвиг фигуры по горизонтали. dx = -1 (влево) / +1 (вправо).
function moveHorizontal(dx) {
  if (!tetromino) return;
  const col = tetromino.col + dx;
  if (isValidMove(tetromino.matrix, tetromino.row, col)) {
    tetromino.col = col;
  }
}

// Поворот активной фигуры.
function rotatePiece() {
  if (!tetromino) return;
  const matrix = rotate(tetromino.matrix);
  if (isValidMove(matrix, tetromino.row, tetromino.col)) {
    tetromino.matrix = matrix;
  }
}

// Сдвиг фигуры вниз на 1 клетку; если упирается — ставим на поле.
function moveDown() {
  if (!tetromino) return;
  const row = tetromino.row + 1;

  if (!isValidMove(tetromino.matrix, row, tetromino.col)) {
    // дальше вниз нельзя — фиксируем текущую позицию и ставим фигуру
    tetromino.row = row - 1;
    placeTetromino();
    return;
  }

  tetromino.row = row;
}

// --- Клавиатура (современный API: e.key) ---
document.addEventListener('keydown', function(e) {

  // пробел (десктоп): пауза/продолжить игру.
  // e.code проверяем вместе с e.key — так пробел ловится одинаково на любой
  // раскладке. preventDefault — чтобы страница не скроллилась пробелом.
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    isPaused = !isPaused;
    count = 0;
    document.body.classList.toggle('is-paused', isPaused);
    return;
  }

  // Tab (десктоп): смена видеофона — десктопный аналог свайпа двумя пальцами
  // на мобильных. preventDefault обязателен: без него браузер переведёт фокус
  // на кнопки или адресную строку вместо смены мира.
  if (e.code === 'Tab' || e.key === 'Tab') {
    e.preventDefault();
    switchWorld();
    return;
  }

  // стрелки влево/вправо (движение)
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    moveHorizontal(e.key === 'ArrowLeft' ? -1 : 1);
  }

  // стрелка вверх (поворот)
  if (e.key === 'ArrowUp') {
    rotatePiece();
  }

  // стрелка вниз (ускоренное падение)
  if (e.key === 'ArrowDown') {
    moveDown();
  }
});

// --- Touch-управление ---
// Порог свайпа в пикселях: 30px = распознан свайп.
const SWIPE_THRESHOLD = 30;
let touchStartX = 0;
let touchStartY = 0;
// Позиция пальца на ПРЕДЫДУЩЕМ touchmove — по ней считаем мгновенную
// смену направления: потянул вправо, затем вниз — фигура сразу едет вниз,
// не дожидаясь возврата к точке старта.
let lastTouchX = 0;
let lastTouchY = 0;

// Непрерывное движение при удержании пальца: как только палец сместился
// достаточно для определения направления, запускаем интервал и фигура едет,
// пока палец на экране. 50 мс = 20 шагов в секунду (плавно).
// moveHorizontal/moveDown сами проверяют isValidMove внутри, поэтому фигура
// не проходит сквозь стены и не «застревает» в воздухе.
let moveInterval = null;
let currentDirection = null;

// Останавливаем автоповтор. Вызывается из touchend и из двухпальцевых
// обработчиков: если второй палец коснулся во время одиночного перетаскивания,
// висящий интервал продолжал бы двигать фигуру сам по себе.
function stopSingleSwipe() {
  if (moveInterval) {
    clearInterval(moveInterval);
  }
  moveInterval = null;
  currentDirection = null;
}

canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  const touch = e.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  // Базовая точка для расчёта мгновенной смены направления в touchmove.
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;

  // Страховка от жеста, завершившегося без touchend (например, палец ушёл
  // за пределы окна): перед новым касанием гасим прошлый интервал.
  stopSingleSwipe();
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  // preventDefault — чтобы страница не скроллилась при свайпах
  e.preventDefault();

  const touch = e.changedTouches[0];
  // Смещение от точки касания — нужно только чтобы понять, «распознан» ли
  // свайп вообще (защита от случайного микро-дрожания пальца).
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  // Свайп ещё не распознан и фигура не движется — выходим.
  // Если движение УЖЕ начато (moveInterval), направление пересчитываем
  // всегда, даже при малом смещении от точки старта: это и даёт мгновенную
  // реакцию на разворот пальца.
  if (moveInterval === null &&
      Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
    return;
  }

  // Направление считаем от ПРЕДЫДУЩЕЙ позиции пальца, а не от точки старта:
  // палец повернул — направление меняется на следующем же кадре.
  const stepX = touch.clientX - lastTouchX;
  const stepY = touch.clientY - lastTouchY;
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;

  // Доминирующая ось среди последнего шага. Вниз — только положительное
  // смещение (движение пальцем вверх фигуру не поднимает).
  let direction = currentDirection;
  if (Math.abs(stepX) > Math.abs(stepY)) {
    if (stepX > 0) direction = 'right';
    else if (stepX < 0) direction = 'left';
  } else if (stepY > 0) {
    direction = 'down';
  }

  if (direction === null) return;

  // Обновляем актуальное направление: интервал ниже читает его на каждом
  // тике, поэтому смена оси применяется сразу.
  currentDirection = direction;

  // Движение уже идёт — направление обновлено выше, больше ничего не нужно.
  if (moveInterval) return;

  // Первый шаг жеста. Сдвигаем фигуру СРАЗУ, не дожидаясь первого тика
  // интервала: при быстром коротком свайпе палец отрывается за 20–40 мс,
  // а тик стоит на 50 мс — без мгновенного сдвига фигура не двигалась вовсе.
  if (currentDirection === 'left') {
    moveHorizontal(-1);
  } else if (currentDirection === 'right') {
    moveHorizontal(1);
  } else if (currentDirection === 'down') {
    moveDown();
  }

  // Дальше — непрерывное движение, пока палец на экране.
  moveInterval = setInterval(() => {
    if (currentDirection === 'left') {
      moveHorizontal(-1);
    } else if (currentDirection === 'right') {
      moveHorizontal(1);
    } else if (currentDirection === 'down') {
      moveDown();
    }
  }, 50);
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  e.preventDefault();

  // Свайп был — фигурой уже управлял интервал (непрерывное движение),
  // отдельная обработка на отпускании не нужна.
  const wasSwiping = moveInterval !== null;
  stopSingleSwipe();

  if (wasSwiping) return;

  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  // Палец не сдвинулся — это тап, а не свайп: поворот.
  // Проверяем отдельно от порога: иначе «почти-тап» на 29px тоже
  // крутил бы фигуру вместо сдвига.
  const TAP_SLOP = 10;
  if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) {
    rotatePiece();
    return;
  }

  // Короткий свайп (кончился раньше, чем запустился интервал) —
  // сдвигаем фигуру на 1 клетку в сторону жеста.
  if (Math.abs(dx) > Math.abs(dy)) {
    // Горизонтальный жест: вправо при dx > 0, влево при dx < 0.
    moveHorizontal(dx > 0 ? 1 : -1);
  } else if (dy > 0) {
    // Вертикальный жест вниз — шаг вниз.
    // Жест вверх фигуру не поднимает (как и в touchmove).
    moveDown();
  }
}, { passive: false });

/* ============================================================
   Адаптивный канвас ОТКЛЮЧЁН.
   Раньше функция задавала canvas inline-стили width/height в px
   (100vh по высоте), и они конфликтовали с CSS (height: 80dvh +
   aspect-ratio: 1/2): inline-высота выигрывала, а ширину браузер
   тянул до 100vw — канвас сплющивался.
   Теперь размером управляет ТОЛЬКО CSS (src/styles.css, блок canvas).
   Функция оставлена пустышкой, чтобы не менять места вызовов
   (window resize и старт игры).
   Логический размер 320×640 (canvas.width/height) не затрагивается —
   логика падения, камеры и линий работает как раньше.
   ============================================================ */
function resizeCanvas() {
  // Тело закомментировано намеренно: inline-размеры канваса больше не ставим.
  // return;
  //
  // const ratio = canvas.width / canvas.height; // 1:2
  // const maxW = window.innerWidth;
  // const maxH = window.innerHeight;
  //
  // let w = maxW;
  // let h = w / ratio;
  //
  // if (h > maxH) {
  //   h = maxH;
  //   w = h * ratio;
  // }
  //
  // canvas.style.width = w + 'px';
  // canvas.style.height = h + 'px';
}

window.addEventListener('resize', resizeCanvas);

/* ============================================================
   Аудио запускается по клику на кнопку «Начать» (см. блок стартового экрана
   в конце файла). Слушатели touchstart/click/keydown убраны: они запускали
   музыку до старта игры — при любом тапе по экрану.
   ============================================================ */

/* ============================================================
   Музыка: кнопок переключения/паузы/shuffle больше нет — осталась
   одна кнопка вкл/выкл звука (#btn-unmute).
   Порядок треков СЛУЧАЙНЫЙ по умолчанию (см. forceShuffle).
   ============================================================ */

// Принудительно включаем случайный порядок одним вызовом toggleShuffle().
// isShuffle по умолчанию false, но пользователь мог сохранить в localStorage
// режим «по порядку» — поэтому проверяем флаг и переключаем только если нужно.
// Своего метода включения нет: используем существующий API audio.js.
function forceShuffle(manager) {
  if (!manager) return;
  if (typeof manager.toggleShuffle !== 'function') return;
  if (manager.isShuffle) return; // уже случайный — второй вызов выключил бы его
  manager.toggleShuffle();
}

// Запуск музыки со случайным порядком: shuffle → play.
// Музыка включается всегда, даже если игрок до старта нажал «выключить звук»,
// иначе кнопка звука рассинхронизируется с реальным состоянием.
function startMusic(manager) {
  if (!manager) return;

  // Плейлист грузится из playlist.json асинхронно. Если манифест ещё не
  // пришёл, треков нет — просто выходим: play() выставит playRequested,
  // и музыка стартует сама, как только список будет загружен.
  if (!Array.isArray(manager.tracks) || manager.tracks.length === 0) {
    manager.play(); // no-op, но фиксирует запрос на воспроизведение
    return;
  }

  forceShuffle(manager);
  manager.muted = false;
  manager.unmute();
  manager.play();
  updateUnmuteUI();
}

// Кнопка вкл/выкл звука.
const btnUnmute = document.getElementById('btn-unmute');

// Приводим иконку/подпись кнопки к текущему состоянию звука.
function updateUnmuteUI() {
  const manager = window.audioManager;
  if (!btnUnmute || !manager) return;

  const isMuted = !!manager.muted;
  btnUnmute.textContent = isMuted ? '🔇' : '🔊';
  btnUnmute.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
  btnUnmute.setAttribute('aria-label', isMuted ? 'Включить звук' : 'Выключить звук');
}

if (btnUnmute) {
  btnUnmute.addEventListener('click', function() {
    const manager = window.audioManager;
    if (!manager) return;

    // Первый тап может случиться до старта игры: Howl ещё не создан.
    if (!manager.inited) manager.init();
    // Музыка не играла (пауза/ещё не стартовала) — включаем её.
    if (!manager.playing) forceShuffle(manager);

    if (manager.muted) {
      manager.unmute();
    } else {
      manager.mute();
    }
    updateUnmuteUI();
  });
}

/* ============================================================
   Смена мира: смена видеофона кроссфейдом на двух iframe.
   Логика тетриса и звука выше — здесь только фон.
   ============================================================ */
// --- ЛОГИКА КРОССФЕЙДА ---
const videoUrls = [
  'https://kinescope.io/embed/nszJ4cfocx4KjVkpCdx83T?autoplay=1&mute=1',
  'https://kinescope.io/embed/8zAsGmrzMbTPKZRbTfqj7S?autoplay=1&mute=1',
  'https://kinescope.io/embed/doXEtFTSEQgmEqia53SpVw?autoplay=1&mute=1',
  'https://kinescope.io/embed/ovoxefTvckdj5xKAxF15Lg?autoplay=1&mute=1'
];
let currentVideoIndex = 0;
let activeIframe = 1; // 1 или 2

// Защита от быстрых повторных свайпов: пока идёт кроссфейд (1050 мс),
// второй вызов не запускает свой переход, а запоминается в pendingSwitch.
let isSwitching = false;
let pendingSwitch = false;
let switchTimer = null;

function switchWorld() {
  // Быстрый повторный свайп приходит раньше, чем завершилась прошлая анимация
  // (1050 мс). Если пустить его сразу, второй вызов перезапишет src слоя,
  // который в этот момент ещё затухает, и фон мигнёт пустотой. Поэтому
  // запоминаем отложенное переключение и выполняем его после текущего.
  if (isSwitching) {
    pendingSwitch = true;
    return;
  }

  isSwitching = true;
  switchTimer = setTimeout(() => {
    isSwitching = false;
    switchTimer = null;
    if (pendingSwitch) {
      pendingSwitch = false;
      switchWorld();
    }
  }, 1050);

  currentVideoIndex = (currentVideoIndex + 1) % videoUrls.length;

  // Определяем, какой iframe сейчас скрыт, а какой активен
  const nextIframeNum = activeIframe === 1 ? 2 : 1;
  const activeEl = document.getElementById(`bg-iframe-${activeIframe}`);
  const nextEl = document.getElementById(`bg-iframe-${nextIframeNum}`);

  // Слой ещё не в DOM — тихо выходим, чтобы не ронять остальной скрипт.
  if (!activeEl || !nextEl) {
    clearTimeout(switchTimer);
    isSwitching = false;
    switchTimer = null;
    return;
  }

  // 1. Загружаем новое видео в скрытый iframe
  nextEl.src = videoUrls[currentVideoIndex];

  // Смена мира = смена настроения: вместе с видео переключаем и музыку.
  // window.audioManager создаётся в src/audio.js; проверка на существование
  // защищает от ошибки, если скрипт аудио ещё не загрузился и менеджера нет.
  if (window.audioManager) {
    window.audioManager.next();
  }

  // 2. Ждем миллисекунду, чтобы iframe начал загружаться, и запускаем кроссфейд
  setTimeout(() => {
    activeEl.classList.remove('active'); // Старый плавно уходит в 0
    nextEl.classList.add('active');      // Новый плавно проявляется в 1
  }, 50);

  // 3. Очищаем старый iframe после завершения анимации (через 1 секунду), чтобы не грузить память
  setTimeout(() => {
    activeEl.src = '';
  }, 1050);

  // Меняем указатель активного iframe
  activeIframe = nextIframeNum;
}

// --- ЖЕСТЫ ---
// Ловим жест на document в фазе ПЕРЕХВАТА (capture): как только на экране
// оказываются два пальца, гасим событие (stopImmediatePropagation), чтобы
// обработчик канваса его не получил и не повернул/не сдвинул фигуру.
// Логика: короткий тап двумя пальцами = переключатель паузы,
// свайп двумя пальцами = смена мира (паузу не трогает).
const TWO_FINGER_SWIPE_THRESHOLD = 30;

// Отдельное состояние для ДВУХпальцевого жеста: одиночный свайп игры
// использует свои touchStartX/touchStartY (объявлены выше) и нам не мешает.
let twoFingerStartX = null;
let twoFingerStartY = null;
let twoFingerMoved = false; // Флаг: был ли это свайп, а не тап

document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    twoFingerStartX = e.touches[0].clientX;
    twoFingerStartY = e.touches[0].clientY;
    twoFingerMoved = false;
    // Второй палец коснулся во время одиночного перетаскивания: гасим
    // автоповтор, иначе фигура продолжит ехать сама, пока палец на экране.
    stopSingleSwipe();
    // Двухпальцевый жест — не для игры: гасим его ДО канваса.
    e.stopImmediatePropagation();
  } else {
    twoFingerStartX = null;
  }
}, { passive: true, capture: true });

document.addEventListener('touchmove', (e) => {
  // Если двигаем двумя пальцами, проверяем, не свайп ли это
  if (twoFingerStartX !== null && e.touches.length === 2) {
    const distX = Math.abs(e.touches[0].clientX - twoFingerStartX);
    const distY = Math.abs(e.touches[0].clientY - twoFingerStartY);
    if (distX > TWO_FINGER_SWIPE_THRESHOLD || distY > TWO_FINGER_SWIPE_THRESHOLD) {
      twoFingerMoved = true;
    }
    e.stopImmediatePropagation();
  }
}, { passive: true, capture: true });

document.addEventListener('touchend', (e) => {
  if (twoFingerStartX !== null && e.changedTouches.length > 0) {
    // Пока на экране остался хотя бы один палец — ждём, иначе обработаем дважды.
    if (e.touches.length === 0) {
      if (twoFingerMoved) {
        // Был свайп — меняем видео, паузу не трогаем
        switchWorld();
      } else {
        // Был короткий тап двумя пальцами — переключаем паузу.
        // Счётчик кадров сбрасываем, чтобы фигура не «дёрнулась» вниз
        // сразу после снятия паузы. Класс на body включает CSS-эффект:
        // канвас размывается и уходит в прозрачность, видео становится чётким.
        isPaused = !isPaused;
        count = 0;
        document.body.classList.toggle('is-paused', isPaused);
      }
      twoFingerStartX = null;
      twoFingerStartY = null;
    }
    // Гасим жест, чтобы канвас не воспринял его как тап/свайп игры.
    e.stopImmediatePropagation();
  }
}, { passive: true, capture: true });

/* ============================================================
   Старт игры.
   ============================================================ */
tetromino = getNextTetromino();
resizeCanvas();
rAF = requestAnimationFrame(loop);

// --- ЛОГИКА СТАРТОВОГО ЭКРАНА ---
document.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('start-screen');
  const startBtn = document.getElementById('start-btn');
  const gameCanvas = document.getElementById('game');

  if (startBtn && startScreen && gameCanvas) {
    startBtn.addEventListener('click', () => {
      // 1. Скрываем кнопку
      startScreen.style.opacity = '0';
      setTimeout(() => {
        startScreen.style.display = 'none';
      }, 500);
      
      // 2. Показываем тетрис
      gameCanvas.style.opacity = '0.70';
      gameCanvas.style.pointerEvents = 'auto';
      
      // 3. Запускаем звук: случайный порядок треков + воспроизведение.
      // Принудительная разблокировка аудио на мобильных (iOS/Android):
      // после жеста пользователя контекст может быть в 'suspended' —
      // без resume() play() молча не запустится.
      // Это единственная точка старта музыки: авто-запуск по первому тапу
      // по документу убран намеренно — он перехватывал касание и ломал
      // нормальный запуск по кнопке.
      if (window.Howler && Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume();
      }
      startMusic(window.audioManager);
    });
  }
});

