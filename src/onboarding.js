window.Onboarding = {
  phrases: [
    "ЭТО НЕ ИГРА",
    "ВЫИГРАТЬ ИЛИ ПРОИГРАТЬ НЕВОЗМОЖНО",
    "ЭТО ПУТЕШЕСТВИЕ К САМОМУ СЕБЕ",
    "ОТКРЫВАЙ НОВЫЕ ПРОСТРАНСТВА",
    "СОБИРАЯ ЧАСТИЦЫ СВЕТА"
  ],
  
  sleep: function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  typeText: async function(element, text) {
    element.textContent = "";
    for (let i = 0; i < text.length; i++) {
      element.textContent += text[i];
      await this.sleep(30 + Math.random() * 50); // Неравномерный набор
    }
  },

  // Приостановка игровых модулей на время онбординга.
  // В цикле (App.loop) при suspended = true игры не обновляются и не
  // рисуются — остаются только частицы. Так тетрис не работает в фоне и
  // не сыпет искры шлейфа во время сцены.
  _suspendGame: function() {
    if (window.App) window.App.suspended = true;
    if (window.Particles) window.Particles.clear(); // чистим накопленное до сцены
  },

  start: async function() {
    const screen = document.getElementById('onboarding-screen');
    const logo = document.getElementById('onboarding-logo');
    const textContainer = document.getElementById('onboarding-text-container');

    // Глушим игру: её цикл продолжает обслуживать частицы (см. App.loop).
    this._suspendGame();

    // data-onboarding поднимает канвас частиц над экраном онбординга
    // (см. правило body[data-onboarding] canvas в styles.css).
    document.body.setAttribute('data-onboarding', '');

    // 1. Ждем 1 секунду в закрытом состоянии
    await this.sleep(1000);
    
    // 2. Открываем скобки и показываем лого
    logo.classList.add('open');
    
    // 3. Ждем 2 секунды
    await this.sleep(2000);
    
    // 4. Закрываем скобки и уезжаем наверх
    logo.classList.remove('open');
    logo.classList.add('move-top');
    
    // Ждем, пока скобки уедут, и показываем текст.
    // Фон НЕ затемняем: на кадрах 5–9 прототипа фон чистый чёрный,
    // затемнение нужно только перед появлением кнопки (см. финал).
    await this.sleep(1000);
    textContainer.classList.add('show');

    // 5. Печатаем фразы.
    // На кадрах 6–9 видно РОВНО ТРИ строки одновременно:
    //   активная (белая) → над ней dimmed (серая) → выше opacity 0.
    // Всё, что старше, уже прозрачно, поэтому класс hidden вешаем на все
    // строки, кроме двух последних.
    for (let i = 0; i < this.phrases.length; i++) {
      const line = document.createElement('div');
      line.className = 'ob-line active';
      textContainer.appendChild(line);

      const lines = textContainer.querySelectorAll('.ob-line');
      const lastIdx = lines.length - 1;
      lines.forEach((l, index) => {
        if (index === lastIdx) return;               // новая строка — активная
        if (index === lastIdx - 1) {                 // предыдущая — серая
          l.classList.remove('active');
          l.classList.add('dimmed');
        } else {                                     // все остальные — прозрачные
          l.classList.add('hidden');
        }
      });

      await this.typeText(line, this.phrases[i]);
      await this.sleep(1000);
    }

    // 6. Ждем 3 секунды перед взрывом
    await this.sleep(3000);

    // 7. Взрыв текста.
    // Взрываем НЕ по одной точке на строку (тогда искры летят узкой колонной),
    // а по нескольким точкам ВДОЛЬ каждой строки — облако накрывает текст.
    // getBoundingClientRect даёт экранные координаты, а канвас занимает свою
    // область и имеет внутр. размер 320×640, поэтому переводим координаты
    // в систему канваса (иначе искры улетают мимо поля).
    const textLines = textContainer.querySelectorAll('.ob-line');
    const canvas = document.getElementById('game');
    if (window.Particles && canvas) {
      const cr = canvas.getBoundingClientRect();
      const sx = canvas.width / cr.width;
      const sy = canvas.height / cr.height;
      const PER_ROW = 3;  // точек на строку
      const PER_POINT = 16; // частиц на точку (итого ≈ 40 на строку, как раньше)

      textLines.forEach(line => {
        if (line.classList.contains('hidden')) return; // уже невидимые не взрываем
        const r = line.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        for (let k = 0; k < PER_ROW; k++) {
          // Равномерно вдоль строки: 1/6, 3/6, 5/6 ширины
          const fx = (k * 2 + 1) / (PER_ROW * 2);
          const x = (r.left + r.width * fx - cr.left) * sx;
          const y = (r.top + r.height / 2 - cr.top) * sy;
          window.Particles.spawnExplosion(x, y, 'white', PER_POINT);
        }
      });
    }

    // Скрываем текст, обесцвечиваем логотип, открываем видеофон.
    textContainer.classList.remove('show');
    logo.classList.add('fade-left');
    screen.classList.replace('bg-20', 'bg-50');
    // Видео за финальной кнопкой должно быть резким (кадр 10 прототипа).
    document.body.setAttribute('data-onboarding', 'final');

    // 8. Появление кнопки (класс .show — стили в styles.css)
    const btn = document.createElement('button');
    btn.id = 'ob-final-btn';
    btn.type = 'button';
    btn.textContent = '[ В ПУТЬ ]';
    screen.appendChild(btn);
    // requestAnimationFrame — чтобы transition opacity сработал (не «в один кадр»)
    requestAnimationFrame(() => btn.classList.add('show'));

    // 9. Переход в игру
    btn.addEventListener('click', () => {
      localStorage.setItem('playrelax_onboarded', 'true');
      // Игровой цикл уже работает (App.loop) — он сам подхватит игру
      // после App.startGame(), а частицы продолжит рисовать.
      document.body.removeAttribute('data-onboarding');
      screen.style.opacity = '0';

      setTimeout(() => {
        screen.style.display = 'none';
        window.App.startGame('match3');
        if (window.GameAPI) window.GameAPI.togglePause();
        if (window.audioManager) window.audioManager.startMusic();
      }, 1000);
    });
  }
};