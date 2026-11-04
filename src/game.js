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

// Игровое поле: большой скрытый стакан 10×40.
// Видна только часть (VISIBLE_ROWS = 20), остальное показывает камера (cameraY).
// 2-мерный массив: playfield[row][col].
const ROWS = 40;
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
          // выход за границы игрового поля (сверху можно — спавн за экраном)
          cellCol + col < 0 ||
          cellCol + col >= COLS ||
          cellRow + row >= ROWS ||
          // столкновение с другой фигурой
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

  // Проверяем и убираем собранные линии (снизу вверх).
  for (let row = ROWS - 1; row >= 0; row--) {
    if (playfield[row].every(cell => !!cell)) {

      // Опускаем каждую строку выше этой на одну вниз.
      for (let r = row; r > 0; r--) {
        playfield[r] = [...playfield[r - 1]];
      }
      playfield[0] = new Array(COLS).fill(0);
    }
  }

  // --- Камера: следим за верхом башни ---
  // Ищем самый верхний (минимальный row) заполненный ряд.
  let highestBlock = ROWS;
  for (let r = 0; r < ROWS; r++) {
    if (playfield[r].some(cell => cell !== 0)) {
      highestBlock = r;
      break;
    }
  }

  // Если башня выросла до верха экрана — камера едет вниз (cameraY уменьшается),
  // между верхним блоком и верхним краем держим запас 6 рядов.
  if (highestBlock < cameraY + 6) {
    cameraY = highestBlock - 6;
  }
  // Если башня просела (съели линии) — камера едет вверх (cameraY растёт),
  // но не ниже 20 (нижние ряды памяти не должны уехать за экран).
  if (highestBlock > cameraY + 12) {
    cameraY = highestBlock - 12;
  }
  // Ограничитель: не выходим за пределы массива playfield.
  if (cameraY < 0) cameraY = 0;
  if (cameraY > 20) cameraY = 20;

  tetromino = getNextTetromino();
}

// Игровой цикл.
function loop() {
  rAF = requestAnimationFrame(loop);
  context.clearRect(0, 0, canvas.width, canvas.height);

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

canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  const touch = e.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  // preventDefault — чтобы страница не скроллилась при свайпах
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  e.preventDefault();
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  // Тап (короткое касание без движения) — поворот.
  if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
    rotatePiece();
    return;
  }

  // Свайп: определяем доминирующую ось.
  if (Math.abs(dx) > Math.abs(dy)) {
    // влево/вправо
    moveHorizontal(dx > 0 ? 1 : -1);
  } else {
    // вниз — ускоренное падение на 1 клетку
    if (dy > 0) {
      moveDown();
    }
  }
}, { passive: false });

/* ============================================================
   Адаптивный канвас: логический размер 320×640 не меняется,
   меняется только CSS-отображение с сохранением пропорций 1:2.
   TODO: devicePixelRatio для Retina — сессия 3/4.
   ============================================================ */
function resizeCanvas() {
  const ratio = canvas.width / canvas.height; // 1:2
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;

  let w = maxW;
  let h = w / ratio;

  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }

  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}

window.addEventListener('resize', resizeCanvas);

/* ============================================================
   Аудио: запуск музыки только после первого действия пользователя
   (требование автоплея iOS Safari).
   ============================================================ */
let audioStarted = false;

function startAudioOnFirstInteraction() {
  if (audioStarted) return;
  audioStarted = true;

  window.audioManager.init();
  window.audioManager.play();

  // Убираем слушатели после первого действия.
  document.removeEventListener('touchstart', startAudioOnFirstInteraction);
  document.removeEventListener('click', startAudioOnFirstInteraction);
  document.removeEventListener('keydown', startAudioOnFirstInteraction);
}

document.addEventListener('touchstart', startAudioOnFirstInteraction);
document.addEventListener('click', startAudioOnFirstInteraction);
document.addEventListener('keydown', startAudioOnFirstInteraction);

// Кнопки управления музыкой.
const btnMusicPlay = document.getElementById('music-play');
const btnMusicNext = document.getElementById('music-next');
const btnMusicShuffle = document.getElementById('music-shuffle');

if (btnMusicPlay) {
  btnMusicPlay.addEventListener('click', function() {
    if (window.audioManager.playing) {
      window.audioManager.pause();
    } else {
      window.audioManager.play();
    }
  });
}

if (btnMusicNext) {
  btnMusicNext.addEventListener('click', function() {
    window.audioManager.next();
  });
}

if (btnMusicShuffle) {
  btnMusicShuffle.addEventListener('click', function() {
    window.audioManager.toggleShuffle();
  });
}

/* ============================================================
   Старт игры.
   ============================================================ */
tetromino = getNextTetromino();
resizeCanvas();
rAF = requestAnimationFrame(loop);



