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
// Сколько частиц рождает взрыв одного блока. При сборке 4 рядов сразу
// это 40 блоков, поэтому значение держим заметным — иначе «вспышка» теряется.
const EXPLOSION_PARTICLES = 14;
const IMPACT_PARTICLES = 6; // Количество частиц на 1 кубик
// Порог «жёсткого» приземления: сколько строк фигура прошла за ОДИН кадр.
// Обычный тик логики даёт ровно 1 строку за постановку — это мягкая посадка,
// искр быть не должно. Жёсткая посадка — от 2 строк за кадр и больше
// (быстрое падение / свайп вниз / серия нажатий «вниз»).
const IMPACT_MIN_SPEED = 1.5;
// Сколько частиц добавлять на каждую пройденную «быстрым» падением строку
// сверх порога — чем дальше упала фигура, тем сильнее выбивает искры.
const IMPACT_PARTICLES_PER_ROW = 4;
let cameraY = 20; // камера показывает ряды с 20 по 39
// Визуальная (отрисовываемая) позиция камеры. Логика (коллизии, спавн,
// сдвиги стакана) работает с cameraY мгновенно, а отрисовка плавно догоняет
// её по экспоненте. Вверх и вниз — одинаково.
let visualCameraY = cameraY; // Визуальная позиция
let globalFallOffset = 0;    // Визуальный сдвиг «подвешенных» блоков при падении
let globalFallVelocity = 0;  // Скорость падения
let fallThresholdRow = 0;    // Ниже этой строки (вкл.) блоки не падают после съедания линий
// Очередь отложенных взрывов блоков (цепная реакция). Работает по кадрам:
// в placeTetromino() блоки только регистрируются с временем срабатывания,
// а спавн выполняется в loop(), когда наступает время. Так вся логика
// идёт в одном игровом цикле, без setTimeout и без рассинхрона с rAF.
let pendingExplosions = [];

// Отложенная перестройка стакана. Пока «горит» цепная реакция, съеденные
// ряды ВИЗУАЛЬНО ещё стоят на месте (иначе блоки исчезают в тот же кадр и
// задержки не видно вообще). Как только очередь взрывов опустеет, loop()
// применяет это описание: ряды убираются, пустые вставляются сверху и
// запускается падение висящих блоков.
// null — перестройки нет.
let pendingClear = null;

// Идёт разбор съеденных линий (горит цепная реакция). Пока true — управление
// фигурой игнорируется, потому что активной фигуры нет: она появится после
// применения pendingClear.
let isResolving = false;
const playfield = [];

/* ============================================================
   Вспомогательная отрисовка блока со скруглением только
   внешних углов. Углы задаются флагами tl/tr/br/bl: угол
   скругляется, только если у клетки нет соседа по обеим
   сторонам этого угла (иначе стык остаётся прямым).
   ============================================================ */
function drawRoundedBlock(ctx, x, y, w, h, r, tl, tr, br, bl) {
  ctx.beginPath();
  ctx.moveTo(x + (tl ? r : 0), y);
  ctx.lineTo(x + w - (tr ? r : 0), y);
  if (tr) ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - (br ? r : 0));
  if (br) ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + (bl ? r : 0), y + h);
  if (bl) ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + (tl ? r : 0));
  if (tl) ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

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
   Частицы вынесены в отдельный модуль src/particles.js
   (подключён в index.html перед game.js). Здесь только вызовы:
   Particles.spawnFromPiece(...) — шлейф от фигуры (эмиссия),
   Particles.spawnExplosion(...) — цепной взрыв блоков при съедании линий,
   Particles.update(...) — физика и отрисовка всех частиц.
   ============================================================ */

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
    col: col,        // текущий столбец
    // Визуальные координаты для «физики тела»: отрисовка плавно догоняет
    // логические row/col, логика и коллизии остаются мгновенными.
    visualRow: row,
    visualCol: col,
    visualRot: 0, // Ошибка угла отрисовки относительно матрицы (гаснет к 0)
    targetRot: 0, // Целевой угол визуального доворота (всегда 0 — «догнать форму»)
    velRot: 0,    // Скорость визуального вращения (инерция)
    // Логическая строка на прошлом кадре. По ней считается скорость посадки
    // (createLandingImpact): разница за кадр > IMPACT_MIN_SPEED = жёсткое
    // приземление. Визуальные координаты для этого не подходят — тело плавно
    // догоняет душу, и разрыв к моменту постановки почти нулевой.
    prevLogicRow: row
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

// Взрыв частиц при жёстком приземлении.
//
// Искры рождаются ТОЛЬКО в точках стыка падающей фигуры с башней (или с полом):
// для каждой нижней клетки фигуры проверяется ровно одна строка под ней.
// Если там блок башни или пол — это и есть место соприкосновения, там искры.
// Если под клеткой пусто — стыка нет, искр нет (никакого прощупывания шахты
// вниз: иначе частицы рождались бы в проекции фигуры, далеко под ней).
//
// Y берётся по ЛОГИЧЕСКОЙ строке контакта: это физическая плоскость удара
// (визуальное тело в этот момент ещё догоняет логику).
//
// speed — насколько «жёстко» села фигура (строки за последний кадр).
function createLandingImpact(piece, speed) {
  const fallSpeed = speed || 0;
  if (fallSpeed <= IMPACT_MIN_SPEED) return; // Мягкая посадка — искр нет

  const matrix = piece.matrix;

  // Чем быстрее упала фигура, тем больше искр на каждый кубик нижней грани.
  const extra = Math.min(3, Math.floor(fallSpeed - IMPACT_MIN_SPEED));
  const perCube = IMPACT_PARTICLES + extra * IMPACT_PARTICLES_PER_ROW;

  // Жёсткий пол: ниже этой строки фигура не опускается (см. isValidMove).
  const floorRow = cameraY + VISIBLE_ROWS;

  const color = colors[piece.name] || 'white';

  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (!matrix[row][col]) continue;

      // Это нижняя грань? (Снизу либо пусто, либо конец матрицы)
      const isBottomEdge = (row === matrix.length - 1 || !matrix[row + 1][col]);
      if (!isBottomEdge) continue;

      const boardCol = piece.col + col;
      // Строка непосредственно под этим кубиком — единственное место,
      // где возможен стык именно этой клетки.
      const contactRow = piece.row + row + 1;

      const hitsTower = contactRow < floorRow && playfield[contactRow] &&
                        playfield[contactRow][boardCol];
      const hitsFloor = contactRow >= floorRow;

      // Ни башни, ни пола под клеткой — соприкосновения нет.
      if (!hitsTower && !hitsFloor) continue;

      // Координаты стыка в экранной системе отрисовки: X — центр колонки,
      // Y — граница между соприкасающимися горизонтальными поверхностями
      // (низ нашего кубика = верх блока башни / пол).
      const screenX = (boardCol + 0.5) * grid;
      const screenY = (contactRow - visualCameraY) * grid;

      Particles.spawnImpact(screenX, screenY, color, perCube);
    }
  }
}

// Кладём тетромино на игровое поле.
// fallSpeed — насколько быстро фигура села (строки за последний кадр).
function placeTetromino(fallSpeed) {
  createLandingImpact(tetromino, fallSpeed); // Искры от нижней грани при жёсткой посадке

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
  let lastClearedRow = -1; // индекс самой нижней съеденной строки (в старом массиве)

  for (let row = 0; row < ROWS; row++) {
    if (playfield[row].every(cell => !!cell)) {
      // строка заполнена целиком — её убираем
      linesCleared++;
      lastClearedRow = row;
    } else {
      rowsToKeep.push(playfield[row]);
    }
  }

  // Если что-то съели — перестраиваем массив: сохранённые строки снизу,
  // пустые сверху (unshift), длина стакана (ROWS) сохраняется.
  if (linesCleared > 0) {
    // --- ЦЕПНОЙ ВЗРЫВ БЛОКОВ (регистрация очереди) ---
    // Координаты считаем ДО сдвига массива: блоки должны взорваться на тех
    // экранных позициях, где игрок их видел. Перестройку стакана НЕ делаем
    // здесь — она откладывается в pendingClear и выполнится в loop(), когда
    // волна догорит (иначе ряды уезжают в тот же кадр и задержки не видно).
    // Смещение берём по visualCameraY — именно по нему рисуется канвас,
    // поэтому взрывы совпадают с картинкой на экране.
    //
    // Волна идёт ГОРИЗОНТАЛЬНО от замыкающей клетки — той клетки в ряду,
    // которую достроила только что поставленная фигура (она и собрала линию).
    // Это самая правая колонка фигуры. От anchor волна расходится В ОБЕ
    // СТОРОНЫ: задержка пропорциональна расстоянию по горизонтали.
    // ПЛЮС вертикальный каскад: каждая следующая съеденная строка стартует
    // со сдвигом, поэтому 4 ряда подряд горят как настоящая цепочка,
    // а не все одновременно.
    // setTimeout не используем: вместо него время срабатывания
    // (performance.now() + задержка) и покадровый разбор в loop().
    pendingExplosions = []; // Очищаем старую очередь

    // Колонка «замыкающей» клетки: самая правая занятая колонка фигуры.
    let anchorCol = tetromino.col;
    for (let col = 0; col < tetromino.matrix[0].length; col++) {
      for (let row = 0; row < tetromino.matrix.length; row++) {
        if (tetromino.matrix[row][col] && tetromino.col + col > anchorCol) {
          anchorCol = tetromino.col + col;
        }
      }
    }
    if (anchorCol < 0) anchorCol = 0;
    if (anchorCol > COLS - 1) anchorCol = COLS - 1;

    // Шаг волны по горизонтали (мс на одну клетку в сторону от anchor).
    // По вертикали задержки НЕТ: все съедаемые ряды горят одновременно,
    // волна расходится только влево/вправо от замыкающей клетки.
    const STEP_X = 15;

    // Съеденные строки — порядок не важен, время у всех одинаковое.
    const clearedRows = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      if (playfield[row].every(cell => !!cell)) clearedRows.push(row);
    }

    const now = performance.now();
    for (let ci = 0; ci < clearedRows.length; ci++) {
      const row = clearedRows[ci];
      for (let col = 0; col < COLS; col++) {
        const screenX = col * grid + grid / 2;
        const screenY = (row - visualCameraY) * grid + grid / 2;

        // Только горизонтальное расстояние до anchor: у всех рядов одна
        // и та же задержка, поэтому цепная реакция идёт по всем сразу.
        const delay = Math.abs(col - anchorCol) * STEP_X;

        pendingExplosions.push({
          x: screenX,
          y: screenY,
          color: colors[playfield[row][col]] || 'white',
          row: row,
          col: col,
          timeToExplode: now + delay
        });
      }
    }

    // Откладываем перестройку: применится в loop(), когда очередь опустеет.
    pendingClear = {
      linesCleared: linesCleared,
      lastClearedRow: lastClearedRow,
      // Момент, когда взорвался последний блок этой волны.
      doneAt: now + (COLS - 1) * STEP_X,
      // Уже взорвавшиеся клетки: ключ = row * COLS + col. Отрисовка пропускает
      // их, поэтому ряды «съедаются» по мере волны, а не исчезают все сразу.
      exploded: new Set()
    };
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
      visualCameraY += SHIFT; // Телепортируем визуальную камеру вместе с логической
      if (tetromino) {
        tetromino.row += SHIFT;
        // Сдвиг камеры — телепорт логики, а не падение. Визуальную координату
        // двигаем синхронно, иначе «тело» отстанет на 20 строк и уедет за экран.
        tetromino.visualRow += SHIFT;
      }
    }

    // 5. Бесконечность СНИЗУ (тот же принцип: стакан едет вместе с камерой).
    if (cameraY > 180) {
      const SHIFT = 20;
      for (let i = 0; i < SHIFT; i++) {
        playfield.push(new Array(COLS).fill(0));
        playfield.shift();
      }
      cameraY -= SHIFT;
      visualCameraY -= SHIFT; // Телепортируем визуальную камеру вместе с логической
      if (tetromino) {
        tetromino.row -= SHIFT;
        // Симметрично верхнему сдвигу: камера — телепорт, тело едет вместе.
        tetromino.visualRow -= SHIFT;
      }
    }

  // Пока волна горит, новую фигуру НЕ выдаём: иначе игрок поставит её поверх
  // ещё не удалённых рядов. Фигура появится в loop(), когда pendingClear
  // применится. Остальные шаги (камера, сдвиги стакана) безопасны и выполняются.
  if (pendingClear) {
    isResolving = true;
  } else {
    tetromino = getNextTetromino();
  }
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

  // ФИЗИКА КАМЕРЫ (Экспоненциальное погружение/всплытие)
  const diffCam = cameraY - visualCameraY;

  if (Math.abs(diffCam) > 0.05) {
    // Экспоненциальный шаг: чем больше разрыв (высота столба), тем быстрее старт
    let step = diffCam * 0.15;

    // ЖЕСТКИЙ ЛИМИТ МАКСИМАЛЬНОЙ СКОРОСТИ (чтобы не проиграть)
    const MAX_SPEED = 1.5; // Максимум 1.5 ряда за кадр
    if (step > MAX_SPEED) step = MAX_SPEED;
    if (step < -MAX_SPEED) step = -MAX_SPEED;

    visualCameraY += step;
  } else {
    // Прилипаем к цели, если почти доехали
    visualCameraY = cameraY;
  }

  // Рисуем игровое поле (только видимый диапазон камеры).
  for (let r = 0; r < ROWS; r++) {
    const screenRow = r - visualCameraY;
    if (screenRow < 0 || screenRow >= VISIBLE_ROWS) continue;

    for (let col = 0; col < COLS; col++) {
      if (playfield[r][col]) {
        // Блок уже взорвался в цепной реакции — не рисуем его. Ряд осыпается
        // по мере волны, а не исчезает целиком в конце.
        if (pendingClear && pendingClear.exploded.has(r * COLS + col)) continue;

        const name = playfield[r][col];
        context.fillStyle = colors[name];

        // на 1 px меньше grid — создаёт эффект сетки.
        // Падают (визуально сдвигаются вниз на globalFallOffset) только блоки
        // выше съеденных линий: их строки идут до fallThresholdRow.
        const fallShift = r < fallThresholdRow ? globalFallOffset : 0;

        // Скругляем только внешние углы: угол прямой, если у клетки есть
        // сосед по обеим сторонам этого угла (внутренний стык фигуры).
        const hasTop = r > 0 && playfield[r - 1][col];
        const hasBottom = r < ROWS - 1 && playfield[r + 1][col];
        const hasLeft = col > 0 && playfield[r][col - 1];
        const hasRight = col < COLS - 1 && playfield[r][col + 1];

        drawRoundedBlock(
          context,
          col * grid,
          screenRow * grid - fallShift,
          grid - 1,
          grid - 1,
          5,
          !hasTop && !hasLeft,
          !hasTop && !hasRight,
          !hasBottom && !hasRight,
          !hasBottom && !hasLeft
        );
      }
    }
  }

    // Обработка цепной реакции: взрываем по одному блоку, когда наступает
    // его время (performance.now() >= timeToExplode). Идём с конца массива,
    // чтобы splice не сбивал индексы. Без setTimeout — всё в такт rAF.
    if (pendingExplosions.length > 0) {
      const now = performance.now();
      for (let i = pendingExplosions.length - 1; i >= 0; i--) {
        const exp = pendingExplosions[i];
        if (now >= exp.timeToExplode) {
          Particles.spawnExplosion(exp.x, exp.y, exp.color, EXPLOSION_PARTICLES);
          // Отмечаем клетку взорванной — отрисовка перестанет её рисовать,
          // и ряд визуально «осыпается» вслед за волной.
          if (pendingClear) pendingClear.exploded.add(exp.row * COLS + exp.col);
          pendingExplosions.splice(i, 1);
        }
      }
    }

    // Перестройка стакана выполняется ТОЛЬКО когда волна догорела, чтобы
    // игрок успел увидеть всю цепную реакцию, а не мгновенное исчезновение.
    if (pendingClear && pendingExplosions.length === 0) {
      // Пересобираем playfield: неполные строки вниз, пустые сверху.
      const rowsToKeep = [];
      for (let row = 0; row < ROWS; row++) {
        if (!playfield[row].every(cell => !!cell)) rowsToKeep.push(playfield[row]);
      }
      for (let i = 0; i < pendingClear.linesCleared; i++) {
        rowsToKeep.unshift(new Array(COLS).fill(0));
      }
      for (let row = 0; row < ROWS; row++) {
        playfield[row] = rowsToKeep[row];
      }

      // Теперь ряды реально удалены — запускаем падение висящих блоков.
      // В новых координатах порог — lastClearedRow + 1: строки с индексом
      // >= него не меняли позицию, а с индексом < него «висят» на
      // linesCleared строк выше нужного и должны упасть.
      globalFallOffset = pendingClear.linesCleared * grid;
      globalFallVelocity = 0;
      fallThresholdRow = pendingClear.lastClearedRow + 1;

      pendingClear = null;

      // Волна догорела и ряды убраны — теперь выдаём новую фигуру.
      // Здесь же снимаем блокировку управления.
      isResolving = false;
      tetromino = getNextTetromino();
    }

    // --- ОБНОВЛЕНИЕ И ОТРИСОВКА ЧАСТИЦ ---
    // Вся логика (физика, затухание, пул объектов, режим свечения) внутри
    // модуля src/particles.js — здесь только вызов на один кадр.
    // Вызывается БЕЗУСЛОВНО каждый кадр: модуль гарантированно существует,
    // так как particles.js подключён в index.html перед game.js и пишет
    // себя в window.Particles.
    Particles.update(context);

  // Рисуем активную фигуру.
  if (tetromino) {

    // фигура падает каждые 35 кадров
    if (++count > 35) {
      tetromino.row++;
      count = 0;

      // ставим фигуру, если во что-то упирается.
      // Скорость посадки считаем по ЛОГИКЕ: сколько строк фигура прошла
      // с предыдущего кадра (prevLogicRow). Визуальный разрыв row-visualRow
      // для этого не годится — loop() подтягивает visualRow к row с зажимом,
      // поэтому к моменту постановки разрыв почти всегда около нуля.
      const passed = tetromino.row - (tetromino.prevLogicRow ?? tetromino.row);
      if (!isValidMove(tetromino.matrix, tetromino.row, tetromino.col)) {
        tetromino.row--;
        placeTetromino(passed);
      }
    }
    tetromino.prevLogicRow = tetromino.row;

    // ФИЗИКА: Плавное движение "тела" к "душе" (к логическим координатам).
    // Логика и коллизии остались мгновенными — догоняет только отрисовка.
    // При СМЕНЕ фигуры visual-координаты ставим жёстко: новая фигура уже
    // стартует с нужной позиции, интерполировать от предыдущей нельзя —
    // иначе «тело» прилетело бы из места последней постановки через пол-экрана.
    if (tetromino.visualCol === undefined) {
      tetromino.visualRow = tetromino.row;
      tetromino.visualCol = tetromino.col;
    }

    // Мгновенные прыжки по вертикали (сдвиг камеры на SHIFT=20 в updateCamera,
    // строки без привязки к визуальной координате) — не инерция, а телепорт.
    // Их нужно переносить на тело рывком, иначе оно «уедет» на 20 строк.
    // Признак: логическая строка далеко за пределами видимой зоны.
    if (Math.abs(tetromino.row - tetromino.visualRow) > VISIBLE_ROWS) {
      tetromino.visualRow = tetromino.row;
    }

    // Коэффициент массы (чем меньше, тем тяжелее).
    const smoothFactor = 0.12;
    tetromino.visualCol += (tetromino.col - tetromino.visualCol) * smoothFactor;

    // ФИЗИКА ПО ОСИ Y
    const diffY = tetromino.row - tetromino.visualRow;

    if (diffY > 0.01) {
      // Базовая скорость равномерного падения: ровно 1 клетка за 36 кадров
      // (столько же, сколько шагает логическая «душа» — см. count > 35).
      // Именно постоянная скорость даёт абсолютно равномерное падение
      // без рывков: шаг за кадр не зависит от diffY.
      const baseSpeed = 1 / 36;

      let step = baseSpeed;

      // Догон остаточного «хвоста» — только после свайпа вниз, когда тело
      // отстало БОЛЬШЕ чем на одну логическую клетку (diffY > 1).
      // В обычном падении diffY колеблется 0..1 (это штатная фаза шага души),
      // поэтому порог 1 не даёт догону вмешиваться и ломать равномерность.
      if (diffY > 1.0) {
        if (!tetromino.velRow) tetromino.velRow = baseSpeed;
        const targetSpeed = baseSpeed + (diffY - 1.0) * 0.4;
        tetromino.velRow += (targetSpeed - tetromino.velRow) * 0.3;
        step = Math.max(baseSpeed, tetromino.velRow);
      } else {
        // Спокойный режим: скорость строго базовая, инерция не накапливается.
        tetromino.velRow = baseSpeed;
      }

      // Двигаем тело
      tetromino.visualRow += step;

      // Защита от перелета сквозь душу
      if (tetromino.visualRow > tetromino.row) {
        tetromino.visualRow = tetromino.row;
        tetromino.velRow = baseSpeed; // Сбрасываем скорость на базовую при касании
      }
    }

    // Физика вращения (инерция): визуальный угол плавно гаснет к targetRot (=0).
    // Отдельной переменной velRot управляем скоростью доворота.
    const rotStiffness = 0.095;
    const rotDamping = 0.62;

    if (tetromino.velRot === undefined) tetromino.velRot = 0; // Инициализация скорости вращения

    tetromino.velRot += (tetromino.targetRot - tetromino.visualRot) * rotStiffness;
    tetromino.velRot *= rotDamping;
    tetromino.visualRot += tetromino.velRot;

    // Когда угол почти догнал цель — обнуляем, чтобы не копить «дрожание»
    // и не накапливать дрейф от младших разрядов float.
    if (Math.abs(tetromino.targetRot - tetromino.visualRot) < 0.001) {
      tetromino.visualRot = tetromino.targetRot;
      tetromino.velRot = 0;
    }

    // Испускаем частицы по всей площади фигуры (после обновления
    // visualRow/visualCol, чтобы шлейф шёл точно за телом). Внутри модуля
    // каждая клетка может испустить частицу в случайной точке — облако
    // распределяется ровно по форме, а не льётся из одного центра.
    Particles.spawnFromPiece(tetromino, grid, visualCameraY, colors[tetromino.name] || 'white');

    // Физика падения стакана после съедания линий (гравитация с ускорением).
    if (globalFallOffset > 0) {
      globalFallVelocity += 0.4; // Ускорение свободного падения (гравитация)
      globalFallOffset -= globalFallVelocity;

      if (globalFallOffset <= 0) {
        globalFallOffset = 0;
        globalFallVelocity = 0;
      }
    }

    // «Душа» — прозрачный контур точно на логической позиции (на сетке).
    // Это целевая точка, куда летит тело.
    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    context.lineWidth = 1;
    for (let row = 0; row < tetromino.matrix.length; row++) {
      for (let col = 0; col < tetromino.matrix[row].length; col++) {
        if (tetromino.matrix[row][col]) {
          context.strokeRect(
            (tetromino.col + col) * grid,
            (tetromino.row + row - visualCameraY) * grid,
            grid - 1, grid - 1
          );
        }
      }
    }

    // «Тело» — плотные блоки, поворачивающиеся с инерцией (visualRot).
    // Матрица уже отражает логический поворот; visualRot — визуальная ошибка,
    // которая плавно гаснет к нулю, поэтому форма «докручивается» на месте.
    context.save(); // Сохраняем состояние контекста

    const pieceWidth = tetromino.matrix[0].length;
    const pieceHeight = tetromino.matrix.length;

    // Вычисляем центр фигуры для вращения (вычитаем visualCameraY для Y)
    const centerX = (tetromino.visualCol + pieceWidth / 2) * grid;
    const centerY = (tetromino.visualRow + pieceHeight / 2 - visualCameraY) * grid;

    context.translate(centerX, centerY); // Переносим начало координат в центр фигуры
    context.rotate(tetromino.visualRot); // Вращаем холст

    context.fillStyle = colors[tetromino.name];

    for (let row = 0; row < pieceHeight; row++) {
      for (let col = 0; col < pieceWidth; col++) {
        if (tetromino.matrix[row][col]) {
          // Скругляем только внешние углы: угол прямой, если у клетки есть
          // сосед по обеим сторонам этого угла (внутренний стык фигуры).
          const hasTop = row > 0 && tetromino.matrix[row - 1][col];
          const hasBottom = row < pieceHeight - 1 && tetromino.matrix[row + 1][col];
          const hasLeft = col > 0 && tetromino.matrix[row][col - 1];
          const hasRight = col < pieceWidth - 1 && tetromino.matrix[row][col + 1];

          // Рисуем блоки относительно центра фигуры.
          drawRoundedBlock(
            context,
            (col - pieceWidth / 2) * grid,
            (row - pieceHeight / 2) * grid,
            grid - 1,
            grid - 1,
            5,
            !hasTop && !hasLeft,
            !hasTop && !hasRight,
            !hasBottom && !hasRight,
            !hasBottom && !hasLeft
          );
        }
      }
    }
    context.restore(); // Возвращаем контекст в исходное состояние
  }
}

/* ============================================================
   Управление: клавиатура (десктоп) + touch (мобилки).
   ============================================================ */

// Сдвиг фигуры по горизонтали. dx = -1 (влево) / +1 (вправо).
function moveHorizontal(dx) {
  if (!tetromino || isResolving) return;
  const col = tetromino.col + dx;
  if (isValidMove(tetromino.matrix, tetromino.row, col)) {
    tetromino.col = col;
  }
}

// Поворот активной фигуры.
function rotatePiece() {
  if (!tetromino || isResolving) return;
  // rotate() вращает матрицу по часовой стрелке. Canvas rotate(+a) — тоже
  // по часовой (ось Y вниз), поэтому знаки совпадают.
  const rotated = rotate(tetromino.matrix);
  if (isValidMove(rotated, tetromino.row, tetromino.col)) {
    // Матрица меняется мгновенно (логика и коллизии — как раньше). Чтобы
    // отрисовка НЕ прыгнула, в кадр подмены компенсируем угол: рисуем новую
    // матрицу «как старую» (visualRot = -PI/2), а инерция плавно доводит
    // визуальный угол до 0 — то есть до истинного вида новой формы.
    // Иначе получается двойной поворот: матрица уже повёрнута И холст
    // дополнительно крутится на +90° — тело улетает в противоположную сторону.
    tetromino.matrix = rotated;
    tetromino.visualRot -= Math.PI / 2; // компенсация: рисуем как до поворота
    tetromino.targetRot = 0;            // цель — «догнать» новый вид

    // При повороте матрица меняется, а вместе с ней и bounding box фигуры:
    // центр «прыгает» на клетку. Логические row/col остаются прежними, поэтому
    // тело мгновенно перестраивается вокруг души, а не улетает догонять старую
    // форму. Визуальные координаты синхронизируем, чтобы не было рывка.
    tetromino.visualRow = tetromino.row;
    tetromino.visualCol = tetromino.col;
  }
}

// Сдвиг фигуры вниз на 1 клетку; если упирается — ставим на поле.
function moveDown() {
  if (!tetromino || isResolving) return;
  const row = tetromino.row + 1;

  if (!isValidMove(tetromino.matrix, row, tetromino.col)) {
    // дальше вниз нельзя — фиксируем текущую позицию и ставим фигуру.
    // Явное быстрое действие игрока (стрелка/свайп вниз) — это жёсткая
    // посадка: передаём скорость заведомо выше IMPACT_MIN_SPEED, потому что
    // тело к этому моменту уже догнало логику и разрыв был бы нулевым.
    tetromino.row = row - 1;
    placeTetromino(IMPACT_MIN_SPEED + 1);
    return;
  }

  tetromino.row = row;
  // Фигура сдвинулась логикой вручную — фиксируем базу для подсчёта
  // пройденных за кадр строк (иначе тик посчитает ручной сдвиг как падение).
  tetromino.prevLogicRow = row;
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
  'https://kinescope.io/embed/nszJ4cfocx4KjVkpCdx83T?autoplay=1&mute=1&loop=1&controls=0',
  'https://kinescope.io/embed/8zAsGmrzMbTPKZRbTfqj7S?autoplay=1&mute=1&loop=1&controls=0',
  'https://kinescope.io/embed/doXEtFTSEQgmEqia53SpVw?autoplay=1&mute=1&loop=1&controls=0',
  'https://kinescope.io/embed/ovoxefTvckdj5xKAxF15Lg?autoplay=1&mute=1&loop=1&controls=0'
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

// Отдельное состояние для ТРЁХпальцевого жеста (тап = вкл/выкл звук,
// свайп = следующий трек). Двухпальцевый жест эти переменные не трогает.
let threeFingerStartX = null;
let threeFingerStartY = null;
let threeFingerMoved = false;

document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 3) {
    threeFingerStartX = e.touches[0].clientX;
    threeFingerStartY = e.touches[0].clientY;
    threeFingerMoved = false;
    stopSingleSwipe(); // На всякий случай гасим одиночное движение
    e.stopImmediatePropagation();
    return;
  }
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
  // Три пальца: определяем, свайп это или тап (порог 30px, как у двух пальцев).
  if (threeFingerStartX !== null && e.touches.length === 3) {
    const distX = Math.abs(e.touches[0].clientX - threeFingerStartX);
    const distY = Math.abs(e.touches[0].clientY - threeFingerStartY);
    if (distX > 30 || distY > 30) { // Порог свайпа
      threeFingerMoved = true;
    }
    e.stopImmediatePropagation();
    return;
  }

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
  // Три пальца: тап = вкл/выкл звук, свайп = следующий трек.
  if (threeFingerStartX !== null && e.changedTouches.length > 0) {
    if (e.touches.length === 0) { // Все пальцы оторваны
      if (threeFingerMoved) {
        // Свайп тремя пальцами — следующий трек
        if (window.audioManager) window.audioManager.next();
      } else {
        // Тап тремя пальцами — вкл/выкл звук
        if (window.audioManager) {
          if (window.audioManager.muted) {
            window.audioManager.unmute();
          } else {
            window.audioManager.mute();
          }
          if (typeof updateUnmuteUI === 'function') updateUnmuteUI(); // Обновляем иконку (если она есть на ПК)
        }
      }
      threeFingerStartX = null;
      threeFingerStartY = null;
    }
    e.stopImmediatePropagation();
    return;
  }

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
      // 0.65 — фигуры заметно плотнее (0.70 → 0.55 → 0.35 → 0.65),
      // подобранное значение: сливаются с фоном, но остаются читаемыми.
      // Значение продублировано в src/styles.css (canvas — стартовое состояние 0).
      gameCanvas.style.opacity = '0.65';
      gameCanvas.style.pointerEvents = 'auto';
      
      // 3. Запускаем звук: случайный порядок треков + воспроизведение.
      startMusic(window.audioManager);
    });
  }
});

