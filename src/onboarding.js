window.Onboarding = {
  phrases: ["ЭТО НЕ ИГРА", "ВЫИГРАТЬ ИЛИ ПРОИГРАТЬ НЕВОЗМОЖНО", "ЭТО ПУТЕШЕСТВИЕ К САМОМУ СЕБЕ", "ОТКРЫВАЙ НОВЫЕ ПРОСТРАНСТВА", "СОБИРАЯ ЧАСТИЦЫ СВЕТА"],
  sleep: ms => new Promise(r => setTimeout(r, ms)),

  typeText: async function(el, text, speed=40) {
    el.textContent = "";
    for (let char of text) {
      el.textContent += char;
      await this.sleep(speed + Math.random() * 40);
    }
  },

  // Приостановка игровых модулей на время онбординга.
  // В цикле (App.loop) при suspended = true игры не обновляются и не
  // рисуются — остаются только частицы. Так match3 не работает в фоне и
  // не сыпет искры шлейфа во время сцены.
  _suspendGame: function() {
    if (window.App) window.App.suspended = true;
    if (window.Particles) window.Particles.clear(); // чистим накопленное до сцены
  },

  // Взрыв частиц из точки. Канвас #game имеет внутренний размер 320×640 и
  // свою область на экране, поэтому экранные координаты (client) переводим
  // в систему канваса — иначе искры улетают мимо поля.
  _explodeAt: function(clientX, clientY, amount) {
    if (!window.Particles || !window.Particles.spawnExplosion) return;
    const canvas = document.getElementById('game');
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    if (!cr.width || !cr.height) return;
    const x = (clientX - cr.left) * (canvas.width / cr.width);
    const y = (clientY - cr.top) * (canvas.height / cr.height);
    window.Particles.spawnExplosion(x, y, 'white', amount);
  },

  start: async function() {
    const screen = document.getElementById('onboarding-screen');
    const vignette = document.querySelector('.ob-vignette');
    const logoContainer = document.getElementById('ob-logo-container');
    const brackets = document.querySelector('.ob-brackets');
    const bgVideo = document.querySelector('.bg-video');

    // Глушим игру: её цикл продолжает обслуживать частицы (см. App.loop).
    this._suspendGame();

    // data-onboarding поднимает канвас частиц над экраном онбординга
    // (см. правило body[data-onboarding] canvas в styles.css).
    document.body.setAttribute('data-onboarding', '');

    // Блокируем игру и размываем видео
    if (bgVideo) bgVideo.classList.add('bg-blur');

    // 1. Экран 1-2: Скобки открываются
    await this.sleep(1000);
    brackets.classList.add('open');

    // 2. Экран 3: Скобки закрываются, уходят вверх, фон 40%
    await this.sleep(2000);
    brackets.classList.remove('open');
    logoContainer.classList.add('move-top');
    vignette.style.background = 'rgba(0,0,0,0.6)';

    // 3. Текст (Экраны 4-9)
    await this.sleep(1000);
    const textContainer = document.getElementById('ob-text-container');
    for (let i = 0; i < this.phrases.length; i++) {
      const line = document.createElement('div');
      line.className = 'ob-line op-100';
      textContainer.appendChild(line);

      // Обновляем прозрачность старых строк
      const lines = textContainer.querySelectorAll('.ob-line');
      lines.forEach((l, idx) => {
        const diff = lines.length - 1 - idx;
        if (diff === 1) l.className = 'ob-line op-50';
        if (diff === 2) l.className = 'ob-line op-25';
        if (diff === 3) l.className = 'ob-line op-0';
      });

      await this.typeText(line, this.phrases[i]);
      await this.sleep(800);
    }

    // 4. Взрыв текста и уход лого (Экран 10)
    await this.sleep(1000);
    const lines = textContainer.querySelectorAll('.ob-line');
    if (window.Particles) {
      lines.forEach(l => {
        const r = l.getBoundingClientRect();
        if (!r.width || !r.height) return; // уже невидимые строки не взрываем
        this._explodeAt(r.left + r.width / 2, r.top + r.height / 2, 40);
      });
    }
    textContainer.style.display = 'none';
    logoContainer.classList.add('fade-left');
    vignette.style.background = 'rgba(0,0,0,0.8)';

    // 5. Текст у лого (Экраны 11-12)
    const subtext = document.getElementById('ob-typing-subtext');
    await this.sleep(1000);
    await this.typeText(subtext, "вызов меню", 50);
    await this.sleep(1500);

    // Стирание (backspace)
    for (let i = subtext.textContent.length; i >= 0; i--) {
      subtext.textContent = subtext.textContent.substring(0, i);
      await this.sleep(30);
    }
    await this.typeText(subtext, "ВЫБЕРИ ЗАНЯТИЕ И В ПУТЬ", 40);

    // 6. Убираем блюр с видео (Экран 12->13)
    if (bgVideo) bgVideo.classList.remove('bg-blur');

    // 7. Скобки открываются с текстом (Экран 13)
    await this.sleep(1000);
    document.getElementById('ob-text-container').style.display = 'none';
    document.getElementById('ob-interaction-area').style.display = 'flex';
    document.getElementById('ob-hint').style.display = 'block';

    // Ждем свайпа или клика (пока имитируем клик)
    document.getElementById('ob-hint').addEventListener('click', function showCarousel() {
      document.getElementById('ob-hint').style.display = 'none';
      document.querySelector('.ob-marquee').style.display = 'none';
      document.getElementById('ob-carousel').style.display = 'flex';
      document.getElementById('ob-start-btn').style.display = 'block';
    });

    // 8. Кнопка старт
    const startBtn = document.getElementById('ob-start-btn');
    startBtn.addEventListener('click', () => {
      if (window.Particles) {
        const r = startBtn.getBoundingClientRect();
        this._explodeAt(r.left + r.width / 2, r.top + r.height / 2, 100);
      }
      screen.style.transition = 'opacity 1s ease';
      screen.style.opacity = '0';

      setTimeout(() => {
        screen.style.display = 'none';
        document.body.removeAttribute('data-onboarding');
        localStorage.setItem('playrelax_onboarded', 'true');
        window.App.startGame('match3');
        if (window.audioManager) window.audioManager.startMusic();
      }, 1000);
    });
  }
};
