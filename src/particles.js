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
// ВАЖНО: присваиваем именно в window.Particles, а НЕ `const Particles = ...`.
// `const` на верхнем уровне классического скрипта создаёт лишь лексическую
// привязку в глобальной области, но НЕ свойство window — поэтому проверки
// вида `if (window.Particles)` всегда были ложны, и частицы не рисовались.

window.Particles = (function () {
  'use strict';

  // --- Настройки эффекта (правь тут) ---
  const MAX_PARTICLES = 3000;   // Жёсткий потолок: защита от перегрузки памяти
                                // (с запасом: 40 блоков × ~14 частиц на 4 линии)
  const PER_CELL_CHANCE = 0.13; // Шлейф будет гуще
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
    if (particles.length >= MAX_PARTICLES) return;

    const p = acquire();
    p.x = x;
    p.y = y;
    p.vx = (Math.random() - 0.5) * 2 * SPREAD; // Разлет в стороны
    p.vy = (Math.random() - 0.5) * 2 * SPREAD + RISE; // Легкий подъем вверх
    p.life = 1.0; // Жизнь от 1 до 0
    p.decay = DECAY_SLOW + Math.random() * (DECAY_FAST - DECAY_SLOW);
    p.size = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN); // Разный размер
    p.color = color;

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

        // Случайная точка внутри клетки (в пикселях экрана).
        const px = (piece.visualCol + col + Math.random()) * grid;
        const py = (piece.visualRow + row + Math.random() - cameraY) * grid;

        spawnOne(px, py, color);
      }
    }
  }

  // Обновление и отрисовка всех частиц. Вызывается раз за кадр из loop().
  function update(ctx) {
    if (!ctx || particles.length === 0) return;

    ctx.save();
    // Аддитивное смешивание — частицы светятся и складываются в «искры».
    ctx.globalCompositeOperation = 'lighter';

    // Идём с конца: удаляем мёртвые через splice, индексы ниже не сдвигаются.
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // Физика: позиция -> вязкость -> жизнь.
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
      ctx.globalAlpha = p.life * p.life; // Квадрат — гаснет мягче к концу
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Взрыв одного блока (для цепной реакции при съедании линий).
  // Разлетается веером на 360 градусов, скорость и размер — случайные,
  // гаснет быстро (decay 0.02–0.05), чтобы взрывы не забивали экран.
  function spawnExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) break;

      const p = acquire();
      p.x = x;
      p.y = y;
      // Разлет веером на 360 градусов
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6; // Разная скорость разлета
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 8.5 + Math.random() * 2.5; // Живут дольше, чем шлейф
      p.decay = 0.01 + Math.random() * 0.015; // Взрывные частицы тоже живут дольше
      p.size = 0.2 + Math.random() * 0.23; // Разный размер
      p.color = color;
      particles.push(p);
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
    spawnFromPiece: spawnFromPiece,
    spawnExplosion: spawnExplosion, // Цепная реакция при съедании линий
    update: update,
    clear: clear,
    count: count
  };
})();
