/* ============================================================
   КИНЕМАТОГРАФИЧНЫЙ ОНБОРДИНГ (onboarding.js).
   Показывается ТОЛЬКО ОДИН РАЗ — при первом заходе. Флаг прохождения
   хранится в localStorage под ключом 'playrelax_onboarded'.

   Сценарий:
     1. Скобки разъезжаются в стороны, логотип проявляется (.open);
     2. По одной печатаются фразы с неровным «человеческим» темпом;
        предыдущая строка тускнеет (.dimmed), четвёртая с конца исчезает
        (.hidden) — экран не забивается длинным списком;
     3. На третьей фразе фон экрана светлеет до 80% (класс .bg-20);
     4. Текст взрывается частицами (window.Particles.spawnExplosion),
        логотип уезжает влево и обесцвечивается (.fade-left);
     5. Появляется кнопка [ В ПУТЬ ] — по клику экран гаснет, стартует
        Match-3 в паузе и включается музыка.

   Точки входа: window.Onboarding.start() (вызывает src/main.js).
   ============================================================ */
window.Onboarding = {
  // Фразы печатаются в этом порядке, по одной строке за раз.
  phrases: [
    "ЭТО НЕ ИГРА",
    "ВЫИГРАТЬ ИЛИ ПРОИГРАТЬ НЕВОЗМОЖНО",
    "ЭТО ПУТЕШЕСТВИЕ К САМОМУ СЕБЕ",
    "ОТКРЫВАЙ НОВЫЕ ПРОСТРАНСТВА",
    "СОБИРАЯ ЧАСТИЦЫ СВЕТА"
  ],

  // Защита от повторного запуска (например, двойной вызов start()).
  started: false,

  // Пауза в миллисекундах. Promise вместо setTimeout-callback — чтобы
  // сценарий читался сверху вниз как обычный линейный код (await).
  sleep: function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Один кадр через requestAnimationFrame.
  nextFrame: function() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  },

  // Печать текста по символу с НЕРОВНЫМ темпом (30–80 мс на символ):
  // так набор выглядит как живой ввод с клавиатуры, а не как анимация.
  typeText: async function(element, text) {
    element.textContent = "";
    for (let i = 0; i < text.length; i++) {
      element.textContent += text[i];
      await this.sleep(30 + Math.random() * 50);
    }
  },

  // Основная сцена.
  start: async function() {
    // Повторный вызов игнорируем: сцена уже идёт или уже прошла.
    if (this.started) return;
    this.started = true;

    const screen = document.getElementById('onboarding-screen');
    const logoContainer = document.getElementById('onboarding-logo');
    const textContainer = document.getElementById('onboarding-text-container');
    if (!screen || !logoContainer || !textContainer) return;

    // Экран должен быть виден явно: main.js скрывает меню, но сам онбординг
    // мог быть скрыт из прошлой сессии.
    screen.style.display = 'flex';
    screen.style.opacity = '1';

    // 1. Открываем логотип: скобки разъезжаются, название проявляется.
    await this.sleep(500);
    logoContainer.classList.add('open');
    await this.sleep(2000); // Пауза, чтобы логотип «подышал» перед текстом

    // 2. Печатаем фразы по одной.
    for (let i = 0; i < this.phrases.length; i++) {
      const line = document.createElement('div');
      line.className = 'ob-line active';
      textContainer.appendChild(line);

      // Затухание старых строк: предыдущая темнеет, четвёртая с конца
      // полностью исчезает. Самый последний элемент — текущая строка, её
      // не трогаем (последней в querySelectorAll она и приходит).
      const lines = textContainer.querySelectorAll('.ob-line');
      lines.forEach((l, index) => {
        if (index === lines.length - 1) return; // Текущая строка
        if (index === lines.length - 2) {
          l.classList.remove('active');
          l.classList.add('dimmed'); // Предыдущая темнеет
        } else if (index === lines.length - 4) {
          l.classList.add('hidden'); // Четвёртая с конца исчезает
        }
      });

      await this.typeText(line, this.phrases[i]);
      await this.sleep(1000); // Пауза после набора

      // Фон начинает проявляться со третьей фразы.
      if (i === 2) screen.classList.add('bg-20');
    }

    // 3. Взрыв текста и уход логотипа.
    await this.sleep(500);
    const textLines = textContainer.querySelectorAll('.ob-line');

    // Взрыв частиц в центре каждой строки.
    if (window.Particles && window.Particles.spawnExplosion) {
      textLines.forEach(line => {
        const r = line.getBoundingClientRect();
        window.Particles.spawnExplosion(r.left + r.width / 2, r.top + r.height / 2, 'white', 50);
      });
    }

    // Прячем текст, логотип уходит влево и обесцвечивается.
    textContainer.style.opacity = '0';
    logoContainer.classList.add('fade-left');

    // Появление кнопки.
    const btn = document.createElement('button');
    btn.id = 'ob-final-btn';
    btn.type = 'button';
    btn.textContent = '[ В ПУТЬ ]';
    screen.appendChild(btn);

    screen.classList.replace('bg-20', 'bg-50');
    btn.style.display = 'block';

    // 4. Завершение онбординга — только по явному нажатию кнопки.
    btn.addEventListener('click', () => {
      localStorage.setItem('playrelax_onboarded', 'true');
      screen.style.opacity = '0';

      setTimeout(() => {
        screen.style.display = 'none';
        // Запускаем игру на паузе и включаем музыку.
        window.App.startGame('match3');
        if (window.GameAPI) window.GameAPI.togglePause();
        if (window.audioManager) window.audioManager.startMusic();
      }, 1000);
    }, { once: true });
  }
};