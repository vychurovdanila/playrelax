// playrelax — система частиц (шлейф от летящей фигуры).
// Чистый Canvas 2D, без библиотек.
//
// Эффект: мелкие круглые «светлячки», которые испускаются ПО ВСЕЙ ПЛОЩАДИ
// каждой клетки фигуры (а не из одной точки), слегка разлетаются в стороны
// с завихрением, плавно затухают и укорачиваются. Частицы простые — обычные
// точки (без вытянутых штрихов).
//
// Модуль экспортирует глобальный объект `Particles` (скрипт подключается
// через <script> перед game.js, поэтому никаких import/export нет).
//
// Координаты: игры спавнят частицы в координатах игрового поля (#game, 320×640),
// а рисуются они на полноэкранном #fx-canvas, чей битмап 1:1 равен экрану.
// Перевод «поле → экран» выполняет setTransform() (вызывается из main.js).
// Онбординг спавнит частицы уже в экранных координатах — для него
// трансформация единичная (см. main.js: она сбрасывается на время онбординга).
//
// ВАЖНО: присваиваем именно в window.Particles, а НЕ `const Particles = ...`.
// `const` на верхнем уровне классического скрипта создаёт лишь лексическую
// привязку в глобальной области, но НЕ свойство window — поэтому проверки
// вида `if (window.Particles)` всегда были ложны, и частицы не рисовались.

window.Particles = (function () {
  'use strict';

  // --- Настройки эффекта (правь тут) ---
  const MAX_PARTICLES = 3200;   // Жёсткий потолок: защита от перегрузки памяти
                                // (с запасом: 40 блоков × ~14 частиц на 4 линии)
  const PER_CELL_CHANCE = 0.09; // Шлейф от фигур (−30% частиц: было 0.13)
  const LIFE_DECAY_MIN = 0.0035; // Дольше живут
  const LIFE_DECAY_MAX = 0.0012; // Еще дольше живут
  const SIZE_MIN = 0.3;         // Минимальный радиус частицы
  const SIZE_MAX = 2.6;         // Максимальный радиус частицы
  const SPREAD = 0.7;           // Чуть меньше разлет
  const RISE = -0.27;           // Легкий подъем вверх (как дым/искры)
  const DRAG = 0.97;            // Медленнее тормозят (дольше висят в воздухе)

  // Быстрое и медленное затухание (в исходных константах порядок может быть
  // «перевёрнут», поэтому нормализуем: сразу получаем [медленное, быстрое]).
  const DECAY_FAST = Math.max(LIFE_DECAY_MIN, LIFE_DECAY_MAX); // быстрее гаснет
  const DECAY_SLOW = Math.min(LIFE_DECAY_MIN, LIFE_DECAY_MAX); // дольше живёт

  // --- Режим максимальной оптимизации ---
  // Включается извне (main.js) при просадке FPS: отключает аддитивное
  // смешивание (lighter) и урезает количество частиц вдвое.
  let lowPerfMode = false;

  // --- Система координат «игровое поле → экран» ---
  // Игровые модули (Тетрис, Match-3) спавнят частицы в координатах игрового
  // поля: у #game битмап 320×640, а на экране он растянут по CSS
  // (styles.css: height 80dvh + aspect-ratio 1/2). Рисуются же частицы на
  // полноэкранном #fx-canvas, у которого битмап 1:1 совпадает с экраном,
  // поэтому координаты надо перевести в экранные прямо при спавне.
  // Трансформацию задаёт main.js каждый кадр через setTransform().
  // По умолчанию она тождественная: онбординг спавнит частицы сразу
  // в экранных координатах (getBoundingClientRect), их пересчитывать нельзя.
  let scaleX = 1;
  let scaleY = 1;
  let offsetX = 0;
  let offsetY = 0;

  // Задать трансформацию «координаты игрового поля → координаты экрана»:
  // sx/sy — масштаб #game, ox/oy — его положение на экране.
  function setTransform(sx, sy, ox, oy) {
    scaleX = sx;
    scaleY = sy;
    offsetX = ox;
    offsetY = oy;
  }

  // Перевод координат игрового поля в экранные.
  function toScreenX(x) { return x * scaleX + offsetX; }
  function toScreenY(y) { return y * scaleY + offsetY; }

  // Массив живых частиц. Переиспользуем объекты через пул, чтобы
  // сборщик мусора не дёргался на каждой частице.
  const particles = [];
  const pool = [];

  // Достаём объект частицы из пула или создаём новый.
  function acquire() {
    return pool.length ? pool.pop() : {};
  }

  // Возвращаем объект частицы в пул (после смерти).
  function release(p) {
    if (pool.length < MAX_PARTICLES) pool.push(p);
  }

  // Испускаем ОДНУ частицу в точке (x, y) с заданным цветом.
  // Размер и время жизни — случайные, чтобы облако было неоднородным.
  function spawnOne(x, y, color) {
    // В режиме низкой производительности оставляем только 25% частиц шлейфа
    if (lowPerfMode && Math.random() > 0.25) return;
    if (particles.length >= MAX_PARTICLES) return;

    const p = acquire();
    // Координаты приходят из игрового поля (Тетрис / шлейф Match-3) —
    // переводим их в экранные. spawnFromPiece вызывает spawnOne, поэтому
    // перевод выполняется ровно один раз (двойного масштабирования нет).
    p.x = toScreenX(x);
    p.y = toScreenY(y);
    p.vx = (Math.random() - 0.5) * 2 * SPREAD * 1.2; // Разлет в стороны (+20% скорости шлейфа)
    p.vy = (Math.random() - 0.5) * 2 * SPREAD * 1.2 + RISE; // Легкий подъем вверх (+20% скорости)
    p.life = 1.0; // Жизнь от 1 до 0
    p.decay = DECAY_SLOW + Math.random() * (DECAY_FAST - DECAY_SLOW);
    p.size = (SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN)) * 1.2; // Разный размер (+20% крупнее)
    p.color = color;
    p.blur = 0; // Без размытия по умолчанию (объект из пула мог нести старое значение)

    particles.push(p);
  }

  // Испускаем частицы по ВСЕЙ площади фигуры.
  // piece — активный тетромино {matrix, visualCol, visualRow};
  // grid — размер клетки; cameraY — визуальная позиция камеры;
  // color — цвет частиц.
  // Внутри каждой заполненной клетки берём случайную точку — так шлейф
  // идёт не из центра, а ровным «облаком» по всей фигуре.
  function spawnFromPiece(piece, grid, cameraY, color) {
    if (!piece || !piece.matrix) return;

    const matrix = piece.matrix;
    for (let row = 0; row < matrix.length; row++) {
      for (let col = 0; col < matrix[row].length; col++) {
        if (!matrix[row][col]) continue;
        if (Math.random() > PER_CELL_CHANCE) continue; // Не каждый кадр/клетка

        // Случайная точка внутри клетки — в координатах игрового поля.
        const px = (piece.visualCol + col + Math.random()) * grid;
        const py = (piece.visualRow + row + Math.random() - cameraY) * grid;

        // spawnOne сам переводит координаты поля в экранные — ровно один раз.
        spawnOne(px, py, color);
      }
    }
  }

  // Обновление и отрисовка всех частиц. Вызывается раз за кадр из loop().
  function update(ctx) {
    if (!ctx || particles.length === 0) return;

    ctx.save();
    // Аддитивное смешивание — частицы светятся и складываются в «искры».
    // В экономном режиме (просадка FPS) — обычный source-over: дешевле и
    // без накопления перекрывающихся пикселей.
    ctx.globalCompositeOperation = lowPerfMode ? 'source-over' : 'lighter';

    // Идём с конца: удаляем мёртвые через splice, индексы ниже не сдвигаются.
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // Физика: позиция -> вязкость -> жизнь.
      // Применяем ускорение (для частиц паузы)
      if (p.ax !== undefined) {
        p.vx += p.ax;
        p.vy += p.ay;
        // Ограничиваем скорость, чтобы не улетали за экран
        const maxSpeed = 2.0;
        if (Math.abs(p.vx) > maxSpeed) p.vx = Math.sign(p.vx) * maxSpeed;
        if (Math.abs(p.vy) > maxSpeed) p.vy = Math.sign(p.vy) * maxSpeed;
        
        // Волновое движение (синусоидальное смещение)
        p.wavePhase += p.waveSpeed;
        p.x += Math.cos(p.wavePhase) * p.waveAmp * 0.1;
        p.y += Math.sin(p.wavePhase) * p.waveAmp * 0.1;
      }

      // Завихрение: поворачиваем вектор скорости, чтобы разлет был «живым».
      if (p.swirl) {
        const cos = Math.cos(p.swirl);
        const sin = Math.sin(p.swirl);
        const nvx = p.vx * cos - p.vy * sin;
        const nvy = p.vx * sin + p.vy * cos;
        p.vx = nvx;
        p.vy = nvy;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.life -= p.decay;

      // Частица умерла — возвращаем объект в пул и убираем из массива.
      if (p.life <= 0) {
        release(p);
        particles.splice(i, 1);
        continue;
      }

      // Отрисовка: прозрачность и радиус зависят от жизни — мягкое затухание.
      ctx.globalAlpha = p.life * p.life * (p.alpha || 1); // Квадрат — гаснет мягче к концу; p.alpha — разброс прозрачности
      ctx.fillStyle = p.color;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Взрыв одного блока (для цепной реакции при съедании линий).
  // Разлетается веером на 360 градусов, скорость и размер — случайные,
  // гаснет быстро (decay 0.012–0.028 ≈ 36–80 кадров), чтобы взрывы не забивали экран.
  function spawnExplosion(x, y, color, count) {
    // Снижаем количество частиц на 30% для производительности
    count = Math.max(1, Math.floor(count * 0.7));
    if (lowPerfMode) count = Math.floor(count * 0.5); // Еще минус 50% в экономном режиме

    // Пересчёт координат игрового поля в экранные (см. setTransform выше).
    const screenX = toScreenX(x);
    const screenY = toScreenY(y);

    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) break;

      const p = acquire();
      p.x = screenX;
      p.y = screenY;
      // Добавляем случайный разброс, чтобы облако было неидеальным
      const angle = (Math.random() * Math.PI * 2) + (Math.random() - 0.8) * 0.75;
      const speed = 1.8 + Math.random() * 6;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;

      // Случайное закручивание вектора скорости (от -0.3 до 0.3 рад за кадр)
      p.swirl = (Math.random() - 0.2) * 0.1; // Больше хаоса и закручивания

      // life — доля жизни [1..0], а радиус при рендере = size * life.
      // Раньше life стартовал с 8.5–11, из-за чего стартовый радиус был
      // size * 8.5–11 (10–40 px) — отсюда «огромные» взрывы на playrelax.ru.
      p.life = 1.4 + Math.random() * 0.8; // ≈1.4–2.2
      p.decay = 0.007 + Math.random() * 0.009; // ≈36–80 кадров жизни
      p.size = 1.4 + Math.random() * 1.7; // 1.6–3.4 px в первый кадр
      p.color = color;

      // Разнообразие по тону (яркости) для белого цвета
      if (color === 'white') {
        const brightness = 200 + Math.floor(Math.random() * 55); // От 200 (сероватый) до 255 (чисто белый)
        p.color = `rgb(${brightness}, ${brightness}, ${brightness})`;
      }

      // Случайное размытие (свечение) для 30% искр
      p.blur = Math.random() < 0.3 ? 3 : 0;

      // Случайная базовая прозрачность (от 40% до 100%)
      p.alpha = 0.6 + Math.random() * 0.9;

      particles.push(p);
    }
  }

  // Взрыв при приземлении (частицы летят вверх и в стороны)
  function spawnImpact(x, y, color, count) {
    // Снижаем количество частиц на 30% для производительности
    count = Math.max(1, Math.floor(count * 0.7));
    if (lowPerfMode) count = Math.floor(count * 0.5); // Еще минус 50% в экономном режиме

    // Пересчёт координат игрового поля в экранные (см. setTransform выше).
    const screenX = toScreenX(x);
    const screenY = toScreenY(y);

    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) break;

      const p = acquire();
      p.x = screenX;
      p.y = screenY;
      // Угол от 180 до 360 градусов (в Canvas Y идет вниз, значит вверх это минус)
      const angle = Math.PI + Math.random() * Math.PI;
      const speed = 1.6 + Math.random() * 3;

      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed; // Летят вверх
      p.life = 1.3; // life — доля жизни [1..0]; радиус при ренте = size * life
      p.decay = 0.01 + Math.random() * 0.009; // Гаснут за ≈40–85 кадров
      // Размер заметный, но без «шаров»: при ренте радиус = size * life,
      // поэтому 2.2–4.2 даёт видимые искры 2–4 px в первый кадр.
      p.size = 2.0 + Math.random() * 1.8;
      p.color = color;
      p.blur = 0; // Без размытия по умолчанию (объект из пула мог нести старое значение)
      particles.push(p);
    }
  }

  // Медленная «фоновая» частица для паузы: спавнится в ЭКРАННЫХ координатах
  // (x, y — пиксели экрана, трансформация поля здесь НЕ применяется, т.к.
  // main.js сбрасывает её в единичную, пока игра на паузе).
  // Живёт долго (3–20 с) и еле дрейфует — создаёт спокойный «звёздный» фон.
  function spawnAmbient(x, y) {
    // Ограничение: не больше 25 частиц одновременно
    if (particles.length >= 25) return;

    const p = acquire();
    p.x = x;
    p.y = y;
    const angle = Math.random() * Math.PI * 2;
    // Скорость от медленной к быстрой (увеличенный разброс)
    const speed = 0.15 + Math.random() * 1.5; 
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    
    // Добавляем случайное ускорение (частица может ускоряться в полете)
    p.ax = (Math.random() - 0.5) * 0.02;
    p.ay = (Math.random() - 0.5) * 0.02;
    
    // Хаотичное закручивание (в обе стороны с разной силой)
    p.swirl = (Math.random() - 0.5) * 0.4;
    
    // Добавляем случайную частоту "дыхания" (волнообразное движение)
    p.waveSpeed = 0.01 + Math.random() * 0.03;
    p.waveAmp = 0.5 + Math.random() * 1.5;
    p.wavePhase = Math.random() * Math.PI * 2;

    p.life = 1.0;
    // Время жизни от 3 до 20 секунд (при 60fps: от 180 до 1200 кадров)
    // decay = 1 / (жизнь в кадрах)
    const framesLife = (3 + Math.random() * 17) * 60;
    p.decay = 1 / framesLife;

    p.size = 0.9 + Math.random() * 2.0; // Мелкие (1-3 px)
    p.color = `rgb(255, 255, 255)`;
    p.alpha = 0.25 + Math.random() * 0.7; // Разная прозрачность
    p.blur = Math.random() < 0.5 ? 2 : 0; // 50% с размытием
    particles.push(p);
  }

  // Включение/выключение режима максимальной оптимизации (вызывает main.js
  // при просадке FPS). Пока включён — рисуем обычным source-over и режем
  // количество частиц наполовину.
  function setLowPerformanceMode(isLow) {
    lowPerfMode = !!isLow;
    if (lowPerfMode) {
      console.log("Particles: Low Performance Mode ENABLED");
    }
  }

  // Полная очистка (например, при смене мира / перезапуске).
  function clear() {
    for (let i = 0; i < particles.length; i++) release(particles[i]);
    particles.length = 0;
  }

  // Отладочная информация (сколько частиц живо сейчас).
  function count() {
    return particles.length;
  }

  return {
    spawnOne: spawnOne,             // Одиночная мелкая частица (шлейф в Тетрисе / drag в Match-3)
    spawnFromPiece: spawnFromPiece,
    spawnExplosion: spawnExplosion, // Цепная реакция при съедании линий
    spawnImpact: spawnImpact,       // Взрыв частиц при жёстком приземлении фигуры
    setTransform: setTransform,     // Масштаб и смещение игрового поля (задаёт main.js)
    spawnAmbient: spawnAmbient,     // Медленная фоновая частица на паузе (экранные координаты)
    update: update,
    clear: clear,
    count: count,
    setLowPerformanceMode: setLowPerformanceMode // Экономный режим при просадке FPS (вызывает main.js)
  };
})();
