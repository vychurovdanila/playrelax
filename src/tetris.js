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
// Условие искр: фигура в момент СТОЛКНОВЕНИЯ движется на максимальной скорости
// (задержка между шагами уже достигла MIN_DOWN_DELAY). Считается не пройденный
// путь, а само состояние скорости в момент удара: разогналась до максимума и
// врезалась — искры. Если в момент касания скорость ещё не максимальна (разгон
// или обычная гравитация) — искр нет.
const IMPACT_MIN_SPEED = 1.5;
// Сколько частиц добавлять на каждую пройденную «быстрым» падением строку
// сверх порога — чем дальше упала фигура, тем сильнее выбивает искры.
const IMPACT_PARTICLES_PER_ROW = 4;

// --- Настройки ускорения при удержании «вниз» (можно менять) ---
// currentDownDelay — текущая задержка между шагами вниз (мс). Стартуем с
// DOWN_START_DELAY и постепенно уменьшаем её при каждом шаге: фигура сначала
// едет плавно, затем всё быстрее. Меньше = быстрее старт.
const DOWN_START_DELAY = 55;      // Начальная задержка (мс)
let currentDownDelay = DOWN_START_DELAY; // Текущая задержка (мс)
const DOWN_ACCELERATION = 3.5;      // Насколько уменьшать задержку за шаг (мс)
const MIN_DOWN_DELAY = 40;        // Максимальная скорость (минимальная задержка, мс)

// --- Въезд новой фигуры сверху (можно менять) ---
// Фигура появляется чуть выше верхнего края и БЫСТРО проезжает вниз, замедляясь
// до стандартной скорости. Главное: почти весь путь фигура едет ВНУТРИ видимой
// зоны — за краем скрыты только SPAWN_ENTER_OFFSET клеток, чтобы был виден
// «влёт», а не мгновенная материализация.
//
// ВАЖНО про скорость: логическая «душа» падает очень медленно — 1 клетка за
// 36 кадров (1/36 кл/кадр). Если двигать только тело, оно упрётся в душу за
// пару кадров и эффект не проявится. Поэтому на время въезда обе координаты
// (row и visualRow) продвигаются ОДНИМ законом затухания: фигура реально
// проезжает SPAWN_ENTER_TOTAL клеток, а затем обе переходят на базовую скорость.
const SPAWN_ENTER_OFFSET = 0;     // Сколько клеток пути скрыто за верхним краем
const SPAWN_ENTER_CELLS = 1;      // Сколько клеток фигура проезжает ВИДИМО
// Полный путь въезда = SPAWN_ENTER_TOTAL = 1 клетка. Фигура появляется прямо
// на верхней строке видимой зоны и проезжает одну клетку вниз — всё движение
// видно игроку, за краем не скрыто ничего.
const SPAWN_ENTER_TOTAL = SPAWN_ENTER_OFFSET + SPAWN_ENTER_CELLS;
const SPAWN_ENTER_FRAMES = 15;    // За сколько кадров въезд завершается (15 = 0.25 сек при 60 fps)
// Стартовая скорость въезда (клеток за кадр). Аналитически подобрана так,
// чтобы сумма SPAWN_ENTER_FRAMES шагов с линейным спадом до базовой скорости
// давала РОВНО SPAWN_ENTER_TOTAL = 1 клетку:
//   v0 = base + (cells - frames * base) / (frames * (frames + 1) / 2 / frames)
// Итог: 0.100694 -> ровно 1.000000 клетка за 15 кадров (0.25 сек при 60 fps).
// Последний шаг въезда (0.0326) близок к базовой скорости (1/36 = 0.0278),
// поэтому фигура переходит в обычное падение БЕЗ остановки и без рывка.
const SPAWN_ENTER_SPEED = 0.100694;

// --- Нераспространение удержания «вниз» на следующую фигуру ---
//
// ЗАДАЧА: если игрок держит кнопку «вниз» (или долгий свайп вниз) и фигура от
// этого падает и фиксируется, автоповтор НЕ должен «переехать» на следующую
// появившуюся сверху фигуру. Пока игрок физически не отпустит ввод — новая
// фигура стоит и не управляется.
//
// Почему токен, а не булев флаг: у автоповтора (рекурсивный setTimeout) есть
// гонка — stopSingleSwipe() гасит таймаут, но «живой» step успевает завести
// следующий. Поэтому каждое движение идёт со своим «поколением»
// (swipeGeneration), а step самоаннулируется, если его поколение устарело.

// Текущее поколение автоповтора. Инкремент — «все висящие step недействительны».
let swipeGeneration = 0;

// Ввод «вниз» физически удерживается прямо сейчас (палец на экране / клавиша
// нажата). true только пока есть реальное удержание.
let downHoldActive = false;

// Управление новой фигурой заблокировано до НАСТОЯЩЕГО отпускания ввода.
// Снимается исключительно событием touchend / keyup / свайпом вверх.
// НИКОГДА не снимается таймером или появлением фигуры — иначе баг «иногда
// срабатывает, иногда нет».
let newPieceLock = false;
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
   (подключён в index.html перед game.js). Здесь частицы только РОЖДАЮТСЯ:
   Particles.spawnFromPiece(...) — шлейф от фигуры (эмиссия),
   Particles.spawnImpact(...) — искры от жёсткой посадки,
   Particles.spawnExplosion(...) — цепной взрыв блоков при съедании линий.
   Физику и отрисовку всего пула за кадр делает main.js на #fx-canvas.
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

  // Фигура появляется чуть выше верхнего края (на SPAWN_ENTER_OFFSET клеток —
  // только чтобы был виден «влёт», а не материализация) и затем БЫСТРО
  // проезжает SPAWN_ENTER_CELLS клеток уже ВНУТРИ видимой зоны. Так почти весь
  // въезд (6 клеток) игрок видит на экране, а не за краем.
  const row = cameraY - SPAWN_ENTER_OFFSET;

  return {
    name: name,      // имя фигуры (L, O, и т.д.)
    matrix: matrix,  // текущая матрица поворота
    row: row,        // текущая строка (стартует чуть выше экрана)
    col: col,        // текущий столбец
    // Визуальные координаты для «физики тела»: отрисовка плавно догоняет
    // логические row/col, логика и коллизии остаются мгновенными.
    visualRow: row,
    visualCol: col,
    // Фаза ускоренного въезда из-за края. Пока счётчик меньше SPAWN_ENTER_FRAMES
    // — фигура выезжает ускоренно с линейным спадом скорости (см. loop()).
    // Отрицательное значение = фаза не активна (движение обычное).
    spawnEnterFrame: 0,
    // Строка, с которой начался въезд. Нужна, чтобы в конце фазы поставить
    // фигуру ровно на startRow + SPAWN_ENTER_TOTAL: иначе накопленная
    // float-погрешность оставит дробную строку и вызовет рывок.
    spawnEnterStartRow: row,
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
// cellRow может быть ДРОБНЫМ: во время въезда новой фигуры тело и душа едут
// плавно (см. SPAWN_ENTER_*). Индекс массива обязан быть целым, поэтому
// строку приводим к целому ВНИЗ — фигура считается стоящей в той клетке,
// в которую уже въехала (иначе на дробном значении playfield[18.5] === undefined).
function isValidMove(matrix, cellRow, cellCol) {
  const baseRow = Math.floor(cellRow);
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (matrix[row][col] && (
          // Выход за левую/правую границу
          cellCol + col < 0 ||
          cellCol + col >= playfield[0].length ||
          // Выход за ВЕРХНЮЮ границу поля: выше нулевой строки фигуры нет.
          // Проверка нужна для фазы въезда новой фигуры — она стартует за
          // верхним краем (отрицательные строки), и без этого playfield[-1]
          // дал бы undefined и уронил игру.
          baseRow + row < 0 ||
          // ЖЁСТКИЙ ПОЛ: фигура не может упасть ниже видимой зоны
          baseRow + row >= cameraY + VISIBLE_ROWS ||
          // Столкновение с другими блоками
          playfield[baseRow + row][cellCol + col])
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
  // Искры — ТОЛЬКО если фигура в момент столкновения двигалась на МАКСИМАЛЬНОЙ
  // скорости. Признак передаёт moveDown: он знает состояние удержания и текущую
  // задержку. Пройденный путь роли не играет — важен сам факт «врезалась на
  // максимальной скорости».
  const fallSpeed = speed || 0;
  if (fallSpeed <= IMPACT_MIN_SPEED) {
    return; // Мягкая посадка (разгон ещё не завершён / гравитация) — искр нет
  }

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
    // спавнится с row = cameraY - SPAWN_ENTER_OFFSET < 0 и isValidMove
    // падает на playfield[отрицательный индекс]: сдвиг на +20 не успевает
    // компенсировать рост highestBlock.
    // Порог 15 с большим запасом покрывает въезд: стартовая строка =
    // cameraY - 2, поэтому даже при cameraY = 15 фигура спавнится на row = 13.
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
    // Новая фигура сверху — управление начинается с нуля.
    //  1) гасим автоповтор (свайп/зажатие) и инкрементируем поколение —
    //     висящие step самоаннулируются, фигура не поедет сама;
    //  2) если ввод «вниз» ещё физически удерживается — новая фигура ждёт
    //     настоящего отпускания (newPieceLock);
    //  3) СБРАСЫВАЕМ скорость падения: иначе унаследованные «быстрые» мс улетели
    //     бы на новую фигуру и следующие несколько валились бы с большой скоростью.
    stopSingleSwipe();
    newPieceLock = downHoldActive;
    currentDownDelay = DOWN_START_DELAY;
    tetromino = getNextTetromino();
  }
}

/* ============================================================
   ИГРОВОЙ ЦИКЛ ТЕТРИСА.
   Модуль отдаёт наружу две чистые операции, которыми управляет main.js:
     - window.TetrisGame.update() — вся ЛОГИКА кадра (камера, падение,
       физика, цепная реакция). Ничего не рисует.
     - window.TetrisGame.draw(ctx) — вся ОТРИСОВКА кадра (поле, фигура,
       частицы) в переданный контекст.
   requestAnimationFrame и clearRect теперь в main.js — здесь их нет.
   ============================================================ */
window.TetrisGame = {};

/* ------------------------------------------------------------
   ЛОГИКА КАДРА: камера, постановка фигуры, физика.
   Рисование вынесено в draw() — порядок «сначала логика, потом
   отрисовка» сохранён: main.js вызывает update(), затем draw().
   ------------------------------------------------------------ */
window.TetrisGame.update = function() {
  // ПАУЗА: логика падения не выполняется, фигура замирает. Сам эффект
  // (размытие канваса + фокус на видео) делается CSS-классом body.is-paused,
  // никакого оверлея на канвасе не рисуем. Цикл в main.js продолжает
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
      // Новая фигура — то же правило, что и в placeTetromino: гасим автоповтор
      // (с инкрементом поколения), сбрасываем скорость,
      // а если ввод «вниз» ещё удерживается — фигура ждёт отпускания.
      stopSingleSwipe();
      newPieceLock = downHoldActive;
      currentDownDelay = DOWN_START_DELAY;
      tetromino = getNextTetromino();
    }

    // --- ЧАСТИЦЫ ---
    // Логику и отрисовку частиц делает draw(): она рисует в канвас, а в
    // update() ей делать нечего — оставлено только пояснение порядка.
  // Логика фигуры заканчивается здесь.

  // Рисуем активную фигуру.
  if (tetromino) {

    // Базовая скорость равномерного падения: ровно 1 клетка за 36 кадров
    // (столько же, сколько шагает логическая «душа» — см. count > 35).
    const baseSpeed = 1 / 36;

    // --- ФАЗА ВЪЕЗДА НОВОЙ ФИГУРЫ (выполняется ДО логики шага) ---
    // Фигура появляется за верхним краем и должна быстро выплыть в видимую
    // зону, резко сбросив скорость до стандартной. Логическая «душа» падает
    // слишком медленно (1/36 кл/кадр), поэтому двигать только тело нельзя:
    // оно упрётся в душу за пару кадров. На время въезда продвигаем ОБЕ
    // координаты одним законом — фигура реально проезжает SPAWN_ENTER_CELLS,
    // после чего душа и тело возвращаются к обычному падению.
    //
    // Пока въезд активен, обычный логический шаг (count > 35) пропускается:
    // иначе он сдвинул бы душу целой клеткой и сломал кривую замедления.
    const entering = tetromino.spawnEnterFrame >= 0;

    if (entering) {
      const f = tetromino.spawnEnterFrame;
      // Линейный спад скорости от SPAWN_ENTER_SPEED до базовой за
      // SPAWN_ENTER_FRAMES кадров. Линейный закон выбран вместо
      // экспоненциального: он даёт ровно SPAWN_ENTER_TOTAL пути за отведённое
      // время (экспонента гаснет слишком рано и не «добивает» дистанцию).
      const t = Math.min(1, f / SPAWN_ENTER_FRAMES);
      const speed = baseSpeed + (SPAWN_ENTER_SPEED - baseSpeed) * (1 - t);

      // ТЕЛО едет ровно SPAWN_ENTER_TOTAL клеток за фазу — это та дистанция,
      // которую видит игрок. Замедление идёт от SPAWN_ENTER_SPEED к базовой.
      const row = tetromino.visualRow + speed;

      // Душа во время въезда едет вместе с телом. Точное положение обеих
      // координат задаётся в конце фазы (там создаётся нужное отставание),
      // поэтому здесь важно только проверить коллизию и не разойтись сильно.
      const logicalRow = tetromino.row + speed;

      // Коллизию проверяем по ЦЕЛОЙ строке фигуры: въезд не должен протащить
      // фигуру сквозь пол или башню. Если места нет — въезд досрочно завершён,
      // дальше работает обычная логика постановки.
      if (isValidMove(tetromino.matrix, Math.floor(row), tetromino.col)) {
        tetromino.visualRow = row;
        tetromino.row = logicalRow;
      } else {
        tetromino.spawnEnterFrame = -1; // места нет — фаза въезда закончена
      }

      // Кадры въезда истекли ИЛИ въезд прерван коллизией — дальше обычное
      // движение. Тело НЕ откатываем: оно уже прошло свой путь и стоит там,
      // где его видит игрок.
      if (f + 1 >= SPAWN_ENTER_FRAMES || tetromino.spawnEnterFrame < 0) {
        // ДУША должна оказаться РОВНО на одну клетку ниже тела. Именно такое
        // отставание даёт бесшовное продолжение движения: обычное падение в
        // игре устроено так, что душа стоит 36 кадров и лишь потом прыгает на
        // целую клетку, а тело плавно её догоняет. Если тело догонит душу
        // вплотную (diffY = 0), ему станет НЕЧЕГО догонять — фигура замрёт на
        // 35 кадров. С отставанием ровно в 1 клетку догон включается сразу,
        // тело едет каждый кадр ровно со стандартной скоростью — без пауз и
        // без рывков.
        // Позицию тела НЕ трогаем: оно прошло свой путь и стоит там, где его
        // видит игрок. Любая «доправка» здесь давала бы микрорывок на стыке.
        //
        // Душу ставим на одну клетку ниже тела, а тело чуть-чуть приподнимаем
        // — так отставание равно 0.97 клетки (1 - 1/36), и это ЕДИНСТВЕННОЕ
        // значение, которое даёт сразу оба нужных свойства:
        //   * нет паузы — телу есть что догонять, оно едет с первого кадра;
        //   * нет рывка — diffY остаётся меньше 1.0, поэтому порог ускорения
        //     (diffY > 1.0) не срабатывает и скорость строго базовая.
        // Проверено численно: при 1.0 включался разгон, при 0.95 появлялась
        // пауза. 0.97 = 1 - 1/36 — ровно один базовый шаг недоезда.
        //
        // Тело при этом доводим до целой строки startRow + SPAWN_ENTER_TOTAL:
        // ровно такую дистанцию оно и прошло за фазу, здесь гасится лишь
        // накопленная float-погрешность.
        const bodyRow = tetromino.spawnEnterStartRow + SPAWN_ENTER_TOTAL;
        tetromino.visualRow = bodyRow + 1 / 36;
        tetromino.row = bodyRow + 1;

        // Въезд мог упереться в башню или пол: не проталкиваем душу в занятую
        // клетку, а подтягиваем её к телу (отставание просто станет нулевым).
        if (!isValidMove(tetromino.matrix, tetromino.row, tetromino.col)) {
          tetromino.visualRow = bodyRow;
          tetromino.row = bodyRow;
        }

        tetromino.velRow = baseSpeed;
        tetromino.spawnEnterFrame = -1; // въезд завершён
        count = 0;                      // логический шаг стартует заново
      } else {
        tetromino.spawnEnterFrame++;
      }
      tetromino.prevLogicRow = tetromino.row;
    }

    // фигура падает каждые 35 кадров
    if (!entering && ++count > 35) {
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

    // ФИЗИКА ПО ОСИ Y (обычное падение и догон остаточного «хвоста»).
    // На кадре ЗАВЕРШЕНИЯ въезда пропускаем: отставание тела от души уже
    // выставлено ровно в 1 клетку, и лишний шаг догона дал бы микрорывок
    // на стыке фаз.
    const diffY = tetromino.row - tetromino.visualRow;

    if (!entering && diffY > 0.01) {
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
};

/* ------------------------------------------------------------
   ОТРИСОВКА КАДРА в переданный контекст.
   Порядок ровно тот же, что был в старом loop(): поле → частицы →
   «душа» и «тело» активной фигуры. Координаты берутся из состояния,
   которое подготовил update(), поэтому физика не меняется.
   ------------------------------------------------------------ */
window.TetrisGame.draw = function(ctx) {
  const context = ctx; // локальная ссылка — тело перенесено из loop() как есть

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

  // --- ЧАСТИЦЫ ---
  // Здесь они только РОЖДАЮТСЯ: spawnFromPiece / spawnImpact / spawnExplosion.
  // Физику и отрисовку всего пула за кадр делает main.js на полноэкранном
  // #fx-canvas — второй update здесь давал бы двойную физику за кадр.

  // Рисуем активную фигуру.
  if (tetromino) {
    // Базовая скорость (нужна только update(); в draw берём готовое состояние).
    const pieceWidth = tetromino.matrix[0].length;
    const pieceHeight = tetromino.matrix.length;

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
};

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
  // Новая фигура ждёт НАСТОЯЩЕГО отпускания ввода: игрок всё ещё держит «вниз»
  // (или палец на экране после свайпа), а сверху уже появилась свежая фигура.
  // Блок снимается только touchend / keyup / свайпом вверх (см. newPieceLock).
  if (newPieceLock) return;
  const row = tetromino.row + 1;

  if (!isValidMove(tetromino.matrix, row, tetromino.col)) {
    // дальше вниз нельзя — фиксируем текущую позицию и ставим фигуру.
    // Признак «жёсткой» посадки: фигура в момент удара движется на МАКСИМАЛЬНОЙ
    // скорости (удержание активно и задержка уже минимальна). Только тогда
    // высекаются искры. Если скорость ещё не максимальна — мягкая посадка.
    tetromino.row = row - 1;
    const atMaxSpeed = downHoldActive && currentDownDelay <= MIN_DOWN_DELAY;
    placeTetromino(atMaxSpeed ? IMPACT_MIN_SPEED + 1 : 0);
    return;
  }

  tetromino.row = row;
  // Фигура сдвинулась логикой вручную — фиксируем базу для подсчёта
  // пройденных за кадр строк (иначе тик посчитает ручной сдвиг как падение).
  tetromino.prevLogicRow = row;
}

// --- Клавиатура (современный API: e.key) ---
document.addEventListener('keydown', function(e) {

  // На паузе игра не должна реагировать на клавиши
  if (isPaused) {
    // Исключение: пробел (снятие паузы) обрабатывается ниже
    if (e.code !== 'Space' && e.key !== ' ') return;
  }

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
    window.VideoManager.next();
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

  // стрелка вниз — ускоренное падение с удержанием.
  // Автоповтор браузера (e.repeat) даёт «зажатие»: пока клавиша нажата,
  // фигура едет вниз и разгоняется.
  if (e.key === 'ArrowDown') {
    // Пока ввод не отпущен, а наверху новая фигура — ждём keyup.
    if (newPieceLock) return;
    downHoldActive = true;   // клавиша физически нажата
    moveDown();
    currentDownDelay = Math.max(MIN_DOWN_DELAY, currentDownDelay - DOWN_ACCELERATION);
  }
});

// Отпускание клавиши «вниз» — единственное, что снимает блок новой фигуры.
// Пока клавиша не отпущена, движение не «переезжает» на следующую фигуру.
document.addEventListener('keyup', function(e) {
  if (e.key === 'ArrowDown') {
    downHoldActive = false;
    newPieceLock = false;
    currentDownDelay = DOWN_START_DELAY;
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
//
// ВАЖНО: инкрементируем поколение — это аннулирует ВСЕ висящие step, даже тот,
// что успел завести следующий таймаут уже после clearTimeout (гонка). Без этого
// «мёртвый» step мог ожить и двигать фигуру без пальца — тот самый баг
// «иногда срабатывает, иногда нет».
function stopSingleSwipe() {
  swipeGeneration++; // все текущие step недействительны
  if (moveInterval) {
    clearTimeout(moveInterval);
  }
  moveInterval = null;
  currentDirection = null;
}

canvas.addEventListener('touchstart', function(e) {
  if (isPaused) return;
  if (window.App && window.App.currentGame !== 'tetris') return;
  e.preventDefault();
  const touch = e.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  // Базовая точка для расчёта мгновенной смены направления в touchmove.
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;

  // Новое касание — новое удержание. Скорость падения снова стартовая, а блок
  // новой фигуры снимаем: игрок ВРУЧНУЮ начинает новый жест, значит управление
  // снова доступно (палец оторвался и коснулся заново = отпустил и нажал).
  currentDownDelay = DOWN_START_DELAY;
  downHoldActive = false;
  newPieceLock = false;

  // Страховка от жеста, завершившегося без touchend (например, палец ушёл
  // за пределы окна): перед новым касанием гасим прошлый интервал.
  stopSingleSwipe();
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  if (isPaused) return;
  if (window.App && window.App.currentGame !== 'tetris') return;
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
  let swipeUp = false; // палец явно пошёл вверх — это ОТПУСКАНИЕ удержания
  if (Math.abs(stepX) > Math.abs(stepY)) {
    if (stepX > 0) direction = 'right';
    else if (stepX < 0) direction = 'left';
  } else if (stepY > 0) {
    direction = 'down';
  } else if (stepY < 0) {
    // Вертикальный жест вверх: фигуру вверх не тянем, но это явный отказ от
    // удержания «вниз» — снимаем блок новой фигуры, как при отпускании.
    swipeUp = true;
  }

  if (swipeUp) {
    // Свайп вверх = отпускание: ввод «вниз» больше не удерживается, новая
    // фигура снова управляется.
    downHoldActive = false;
    newPieceLock = false;
    currentDownDelay = DOWN_START_DELAY;
    stopSingleSwipe();
    return;
  }

  if (direction === null) return;

  // Обновляем актуальное направление: интервал ниже читает его на каждом
  // тике, поэтому смена оси применяется сразу.
  currentDirection = direction;

  // downHoldActive отражает ФАКТИЧЕСКОЕ удержание «вниз»: если палец ушёл в
  // сторону, ввод «вниз» больше не удерживается. Обновляем ДО выхода ниже —
  // иначе при уже идущем автоповторе смена направления не сбросила бы флаг,
  // и moveDown поставил бы newPieceLock, хотя игрок уже не давит вниз.
  downHoldActive = (currentDirection === 'down');

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
  // Рекурсивный setTimeout вместо setInterval: задержку между шагами можно
  // менять «на лету». При удержании «вниз» она уменьшается на
  // DOWN_ACCELERATION за шаг — фигура плавно разгоняется до MIN_DOWN_DELAY.
  //
  // ПОКОЛЕНИЕ (myGen): stopSingleSwipe() и новый жест инкрементируют
  // swipeGeneration. step, чьё поколение устарело, немедленно выходит и НЕ
  // заводит новый таймаут — так «мёртвый» step не может ожить и двигать
  // фигуру без пальца.
  const myGen = swipeGeneration;
  function step() {
    if (myGen !== swipeGeneration) return; // поколение устарело — выходим навсегда
    if (!currentDirection) return;

    if (currentDirection === 'left') {
      moveHorizontal(-1);
    } else if (currentDirection === 'right') {
      moveHorizontal(1);
    } else if (currentDirection === 'down') {
      moveDown();
      // УСКОРЕНИЕ: уменьшаем задержку, но не ниже MIN_DOWN_DELAY.
      currentDownDelay = Math.max(MIN_DOWN_DELAY, currentDownDelay - DOWN_ACCELERATION);
    }

    moveInterval = setTimeout(step, currentDownDelay);
  }
  moveInterval = setTimeout(step, currentDownDelay);
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  if (isPaused) return;
  if (window.App && window.App.currentGame !== 'tetris') return;
  e.preventDefault();

  // Палец оторван — ввод «вниз» больше не удерживается. Только это событие
  // (а не таймер и не появление фигуры) снимает блок новой фигуры.
  downHoldActive = false;
  newPieceLock = false;

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
   Порядок треков СЛУЧАЙНЫЙ по умолчанию (см. AudioManager.forceShuffle
   в src/audio.js).
   ============================================================ */

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
    if (!manager.playing) manager.forceShuffle();

    if (manager.muted) {
      manager.unmute();
    } else {
      manager.mute();
    }
    updateUnmuteUI();
  });
}
// --- ГЛОБАЛЬНЫЙ API ДЛЯ ВНЕШНИХ МОДУЛЕЙ (см. src/gestures.js) ---
// Многопальцевые жесты вынесены в src/gestures.js, но им нужен доступ к
// внутренним let-переменным game.js (isPaused, count, downHoldActive,
// newPieceLock). Через window их не видно, поэтому отдаём узкий фасад:
// только те операции, которые реально нужны жестам.
window.GameAPI = {
  togglePause: () => {
    isPaused = !isPaused;
    count = 0;
    document.body.classList.toggle('is-paused', isPaused);
  },
  releaseDownHold: () => {
    downHoldActive = false;
    newPieceLock = false;
  }
};

/* ============================================================
   Старт игры.
   ============================================================ */
tetromino = getNextTetromino();
resizeCanvas();
// Цикл кадров запускает main.js (window.App.init): он вызывает
// window.TetrisGame.update() и .draw(ctx). Свой rAF модуль больше не крутит.

// --- ЛОГИКА СТАРТОВОГО ЭКРАНА ---
document.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('start-screen');
  const startBtn = document.getElementById('start-btn');
  const gameCanvas = document.getElementById('game');

  // Инициализируем видеофон: подставляем первое видео в активный iframe
  // (см. src/video.js — подключён перед game.js).
  if (window.VideoManager) window.VideoManager.init();

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
      if (window.audioManager) window.audioManager.startMusic();
    });
  }
});

