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

const Particles = (function () {
  'use strict';

  // --- Настройки эффекта (правь тут) ---
  const MAX_PARTICLES = 500;   // Жёсткий потолок: защита от перегрузки памяти
  const PER_CELL_CHANCE = 0.20; // Вероятность испустить частицу из клетки за кадр
  const LIFE_DECAY_MIN = 0.008; // Минимальная скорость затухания (дольше живёт)
  const LIFE_DECAY_MAX = 0.002; // Максимальная скорость затухания (быстрее гаснет)
  const SIZE_MIN = 0.4;         // Минимальный радиус частицы
  const SIZE_MAX = 2.4;         // Максимальный радиус частицы
  const SPREAD = 1.1;           // Разлёт в стороны (px/кадр)
  const RISE = -0.27;           // Легкий подъем вверх (как дым/искры)
  const DRAG = 0.94;           // Вязкость: частица постепенно тормозится

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
    p.decay = LIFE_DECAY_MIN + Math.random() * (LIFE_DECAY_MAX - LIFE_DECAY_MIN);
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
    update: update,
    clear: clear,
    count: count
  };
})();
