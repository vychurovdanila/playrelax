/* ============================================================
   КИНЕМАТОГРАФИЧНЫЙ ОНБОРДИНГ (15-шаговый сценарий).
   Тайминги и геометрия повторяют prototype/1.jpg … 15.jpg.
   Модуль подключается перед main.js и запускается из main.js при первом
   заходе (флаг — localStorage 'playrelax_onboarded').

   Хронометраж сцены:
     0.0 c  — скобки вплотную, чёрный фон                        (экран 1)
     1.0 c  — скобки раздвигаются, проявляется PLAYRELAX         (экран 2)  1 c
     3.0 c  — пауза на развёрнутом логотипе                               2 c
     3.0 c  — скобки закрываются, узел уезжает вверх, фон 40%    (экран 3)  1 c
     4.0 c  — печатаются 5 фраз, старые тускнеют               (экраны 4-9)
     +1.0 c  — пауза после последней фразы
     затем  — лого уезжает ВЛЕВО за 0.5 c + взрыв текста, фон 80% (экран 10)
     +1.0 c  — у лого печатается «- вызов меню»                  (экран 11)
     +1.5 c  — стирается backspace → «ВЫБЕРИ ЗАНЯТИЕ И В ПУТЬ»   (экран 12)
     затем  — блюр с видео снят, открываются скобки со строкой
              «свайп двумя пальцами» + подсказка 2 пальцев       (экран 13)
     клик/свайп — карусель занятий: build.svg / find.svg      (экраны 14-15)
     клик по кнопке — взрыв кнопки, фон в 0, музыка из тишины,
              игра проявляется из блюра за 2 c                   (экран 16)
   ============================================================ */
window.Onboarding = {
  phrases: ["ЭТО НЕ ИГРА", "ВЫИГРАТЬ ИЛИ ПРОИГРАТЬ НЕВОЗМОЖНО", "ЭТО ПУТЕШЕСТВИЕ К САМОМУ СЕБЕ", "ОТКРЫВАЙ НОВЫЕ ПРОСТРАНСТВА", "СОБИРАЯ ЧАСТИЦЫ СВЕТА"],

  // Бесконечный список занятий из прототипов (14.jpg — строить, 15.jpg — искать).
  items: [
    { img: 'assets/ui/build.svg', label: 'строить' },
    { img: 'assets/ui/find.svg',  label: 'искать' }
  ],
  currentItem: 0,

  // Таймер искр по периметру кнопки (свечение кнопки [ В ПУТЬ ]).
  _sparkTimer: null,

  sleep: ms => new Promise(r => setTimeout(r, ms)),

  // Печать текста по символу. speed — базовая скорость, jitter — разброс,
  // чтобы машинка «щёлкала» неравномерно, как в прототипе.
  typeText: async function(el, text, speed = 45, jitter = 30) {
    el.textContent = "";
    for (const char of text) {
      el.textContent += char;
      await this.sleep(speed + Math.random() * jitter);
    }
  },

  // Стирание текста «как backspace».
  eraseText: async function(el, speed = 30) {
    while (el.textContent.length > 0) {
      el.textContent = el.textContent.slice(0, -1);
      await this.sleep(speed);
    }
  },

  // Приостановка игровых модулей на время онбординга.
  // В цикле (App.loop) при suspended = true игры не обновляются и не
  // рисуются — остаются только частицы. Так match3/tetris не работают в
  // фоне и не сыпят искры шлейфа во время сцены.
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

  // Взрыв по ПЕРИМЕТРУ прямоугольного элемента: искры идут по рамке.
  // Нужен для кнопки [ В ПУТЬ ], которая должна «искрить» по контуру.
  _sparkPerimeter: function(el, perSide) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const n = perSide || 3;
    for (let i = 0; i < n; i++) {
      const fx = Math.random();
      const fy = Math.random();
      this._explodeAt(r.left + r.width * fx, r.bottom, 1); // верхняя грань (низ)
      this._explodeAt(r.left + r.width * fx, r.top, 1);    // верхняя грань
      this._explodeAt(r.left, r.top + r.height * fy, 1);   // левая грань
      this._explodeAt(r.right, r.top + r.height * fy, 1);  // правая грань
    }
  },

  // Непрерывное свечение кнопки: каждые 160 мс по её периметру вылетает
  // горстка искр. Останавливается при клике (см. обработчик кнопки).
  _startSparkles: function(el) {
    this._stopSparkles();
    this._sparkTimer = setInterval(() => this._sparkPerimeter(el, 2), 160);
  },

  _stopSparkles: function() {
    if (this._sparkTimer) {
      clearInterval(this._sparkTimer);
      this._sparkTimer = null;
    }
  },

  // Смена элемента карусели: затухание → подмена картинки → проявление.
  // Бесконечная прокрутка: индекс зацикливается в обе стороны.
  shiftItem: async function(direction) {
    const img = document.getElementById('ob-item-img');
    if (!img) return;
    const total = this.items.length;
    this.currentItem = (this.currentItem + direction + total) % total;

    img.classList.add('switching');
    await this.sleep(350);
    img.src = this.items[this.currentItem].img;
    img.classList.remove('switching');
  },

  // Плавное появление музыки из тишины за seconds секунд.
  _fadeAudio: function(seconds, targetVolume) {
    const am = window.audioManager;
    if (!am) return;
    const target = targetVolume || 0.5;
    const steps = 40;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      am.volume = target * (step / steps);
      // Howler читает громкость с живого Howl — обновляем текущий трек.
      if (am.sounds && am.sounds[am.currentIndex] && am.sounds[am.currentIndex].volume) {
        am.sounds[am.currentIndex].volume(am.volume);
      }
      if (step >= steps) {
        clearInterval(timer);
        am.volume = target;
      }
    }, (seconds * 1000) / steps);
  },

  start: async function() {
    const screen = document.getElementById('onboarding-screen');
    const vignette = document.querySelector('.ob-vignette');
    const logoContainer = document.getElementById('ob-logo-container');
    const brackets = document.querySelector('.ob-brackets');
    const bgVideo = document.querySelector('.bg-video');
    const textContainer = document.getElementById('ob-text-container');
    const subtext = document.getElementById('ob-typing-subtext');
    const interaction = document.getElementById('ob-interaction-area');
    const hint = document.getElementById('ob-hint');
    const swipeBar = document.getElementById('ob-swipe-bar');
    const carousel = document.getElementById('ob-carousel');
    const startBtn = document.getElementById('ob-start-btn');

    // Глушим игру: её цикл продолжает обслуживать частицы (см. App.loop).
    this._suspendGame();

    // data-onboarding поднимает канвас частиц над экраном онбординга
    // (см. правило body[data-onboarding] canvas в styles.css).
    document.body.setAttribute('data-onboarding', '');

    // Видеофон размыт и приглушён на всё время сцены — игровые элементы
    // полностью невидимы (по сценарию).
    if (bgVideo) bgVideo.classList.add('bg-blur');

    // ---- Экран 1: скобки вплотную, чёрная подложка непрозрачна ----
    await this.sleep(1000);

    // ---- Экран 2: скобки раздвигаются, проявляется PLAYRELAX (1 с) ----
    brackets.classList.add('open');

    // ---- Пауза на развёрнутом логотипе: 2 с ----
    await this.sleep(2000);

    // ---- Экран 3: скобки закрываются, узел уезжает вверх (1 с) и
    //      чёрный фон становится прозрачнее на 40% (0.6) ----
    brackets.classList.remove('open');
    logoContainer.classList.add('move-top');
    vignette.style.background = 'rgba(0,0,0,0.6)';
    await this.sleep(1000);

    // ---- Экраны 4-9: печать фраз.
    //      Новые строки добавляются вниз, старые тускнеют ступенями
    //      100% → 50% → 25% → 0%, и весь блок сдвигается вверх. ----
    for (let i = 0; i < this.phrases.length; i++) {
      const line = document.createElement('div');
      line.className = 'ob-line op-100';
      textContainer.appendChild(line);

      // Обновляем прозрачность уже напечатанных строк.
      const lines = textContainer.querySelectorAll('.ob-line');
      lines.forEach((l, idx) => {
        const diff = lines.length - 1 - idx; // насколько строка «старше» свежей
        if (diff === 1) l.className = 'ob-line op-50';
        else if (diff === 2) l.className = 'ob-line op-25';
        else if (diff >= 3) l.className = 'ob-line op-0';
      });

      await this.typeText(line, this.phrases[i]);
      await this.sleep(800);
    }

    // ---- После последней фразы задержка 1 с ----
    await this.sleep(1000);

    // ---- Экран 10: лого уезжает ВЛЕВО за 0.5 с, текст взрывается
    //      одновременно с повышением плотности фона до 80% за 1 с ----
    const lines = textContainer.querySelectorAll('.ob-line');
    lines.forEach(l => {
      const r = l.getBoundingClientRect();
      if (!r.width || !r.height) return; // уже невидимые строки не взрываем
      this._explodeAt(r.left + r.width / 2, r.top + r.height / 2, 40);
    });
    textContainer.style.display = 'none';
    logoContainer.classList.add('fade-left');
    vignette.style.background = 'rgba(0,0,0,0.8)';

    // ---- Экраны 11-12: подпись у лого ----
    await this.sleep(1000);
    await this.typeText(subtext, "- вызов меню", 55, 25);
    await this.sleep(1500);
    await this.eraseText(subtext, 35);
    await this.typeText(subtext, "ВЫБЕРИ ЗАНЯТИЕ И В ПУТЬ", 50, 28);

    // ---- Экран 13: блюр снят, скобки открыты со строкой «свайп двумя
    //      пальцами» и подсказкой-анимацией двух пальцев ----
    if (bgVideo) bgVideo.classList.remove('bg-blur');
    await this.sleep(700);

    // Заголовок «ВЫБЕРИ ЗАНЯТИЕ И В ПУТЬ» на 13.jpg стоит по центру экрана,
    // а узел лого — маленький в левом верхнем углу. Переносы строк задаём
    // явно: в прототипе это ровно три строки «ВЫБЕРИ / ЗАНЯТИЕ / И В ПУТЬ».
    subtext.textContent = "ВЫБЕРИ\nЗАНЯТИЕ\nИ В ПУТЬ";
    subtext.classList.add('ob-heading');
    logoContainer.classList.add('ob-logo-mini');

    interaction.style.display = 'flex';
    if (swipeBar) swipeBar.style.display = 'flex';
    hint.style.display = 'block';
    hint.classList.add('animate');

    // Ожидание жеста: тап по подсказке или свайп двумя пальцами открывают
    // карусель занятий (экраны 14-15).
    const revealCarousel = () => {
      if (carousel.classList.contains('ob-visible')) return;
      hint.style.display = 'none';
      hint.classList.remove('animate');
      if (swipeBar) swipeBar.style.display = 'none';
      carousel.classList.add('ob-visible');
      startBtn.classList.add('ob-visible');
      this._startSparkles(startBtn); // кнопка светится и искрит по периметру
    };

    hint.addEventListener('click', revealCarousel);
    if (swipeBar) swipeBar.addEventListener('click', revealCarousel);
    // Свайп двумя пальцами по горизонтали — тот же переход к карусели.
    document.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length >= 2) revealCarousel();
    }, { passive: true });

    // Стрелки карусели: бесконечное листание занятий.
    document.getElementById('ob-prev').addEventListener('click', () => this.shiftItem(-1));
    document.getElementById('ob-next').addEventListener('click', () => this.shiftItem(1));

    // ---- Экран 16: кнопка [ В ПУТЬ ] ----
    startBtn.addEventListener('click', () => {
      this._stopSparkles();

      // Взрыв кнопки частицами.
      const r = startBtn.getBoundingClientRect();
      this._explodeAt(r.left + r.width / 2, r.top + r.height / 2, 100);

      // Чёрный фон становится полностью прозрачным и исчезает.
      vignette.style.background = 'rgba(0,0,0,0)';
      screen.style.transition = 'opacity 2s ease';
      screen.style.opacity = '0';

      // Игра стартует сразу, но канвас проявляется из блюра и прозрачности
      // за 2 с (класс .ob-intro-add), а музыка плавно выходит из тишины.
      // data-onboarding снимаем ПОСЛЕ проявления — иначе правило
      // body[data-onboarding] canvas перебьёт прозрачную анимацию.
      window.App.suspended = false;
      window.App.switchGame('match3');
      window.App.canvas.style.pointerEvents = 'auto';
      startBtn.classList.add('ob-intro-add');

      if (window.audioManager) {
        window.audioManager.volume = 0; // старт «из тишины»
        window.audioManager.startMusic();
        this._fadeAudio(2, 0.5);
      }

      setTimeout(() => {
        startBtn.classList.remove('ob-intro-add');
        document.body.removeAttribute('data-onboarding');
        screen.style.display = 'none';
        localStorage.setItem('playrelax_onboarded', 'true');
      }, 2000);
    });
  },
};

