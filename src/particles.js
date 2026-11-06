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
  const MAX_PARTICLES = 1000;   // Жёсткий потолок: защита от перегрузки памяти
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
      p.decay = 0.1 + Math.random() * 0.03; // Быстро гаснут
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
