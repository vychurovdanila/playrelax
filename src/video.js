/* ============================================================
   Видеофон Kinescope: смена мира кроссфейдом на двух iframe.
   Вынесено из game.js, чтобы логика фона жила отдельно от игры.
   Подключается ПЕРЕД game.js (game.js вызывает window.VideoManager.*).

   В разметке (index.html) уже есть два iframe друг поверх друга:
   #bg-iframe-1 (активный) и #bg-iframe-2 (скрытый, для подгрузки).
   ============================================================ */
window.VideoManager = {
  // Список видеофонов. Порядок — это порядок смены миров.
  videoUrls: [
    'https://kinescope.io/embed/nszJ4cfocx4KjVkpCdx83T?autoplay=1&mute=1&loop=1&controls=0',
    'https://kinescope.io/embed/8zAsGmrzMbTPKZRbTfqj7S?autoplay=1&mute=1&loop=1&controls=0',
    'https://kinescope.io/embed/doXEtFTSEQgmEqia53SpVw?autoplay=1&mute=1&loop=1&controls=0',
    'https://kinescope.io/embed/ovoxefTvckdj5xKAxF15Lg?autoplay=1&mute=1&loop=1&controls=0'
  ],

  currentIndex: 0,
  activeIframe: 1, // 1 или 2

  // Защита от быстрых повторных свайпов: пока идёт кроссфейд (1050 мс),
  // второй вызов не запускает свой переход, а запоминается в pendingSwitch.
  isSwitching: false,
  pendingSwitch: false,
  switchTimer: null,

  // Показывает первое видео (используется при старте игры).
  init() {
    const el1 = document.getElementById('bg-iframe-1');
    if (el1) el1.src = this.videoUrls[0];
  },

  // Кроссфейд на следующий видеофон. Аналог прежней switchWorld() из game.js.
  next() {
    // Быстрый повторный свайп приходит раньше, чем завершилась прошлая анимация
    // (1050 мс). Если пустить его сразу, второй вызов перезапишет src слоя,
    // который в этот момент ещё затухает, и фон мигнёт пустотой. Поэтому
    // запоминаем отложенное переключение и выполняем его после текущего.
    if (this.isSwitching) {
      this.pendingSwitch = true;
      return;
    }

    this.isSwitching = true;
    this.switchTimer = setTimeout(() => {
      this.isSwitching = false;
      this.switchTimer = null;
      if (this.pendingSwitch) {
        this.pendingSwitch = false;
        this.next();
      }
    }, 1050);

    this.currentIndex = (this.currentIndex + 1) % this.videoUrls.length;

    // Определяем, какой iframe сейчас скрыт, а какой активен
    const nextIframeNum = this.activeIframe === 1 ? 2 : 1;
    const activeEl = document.getElementById(`bg-iframe-${this.activeIframe}`);
    const nextEl = document.getElementById(`bg-iframe-${nextIframeNum}`);

    // Слой ещё не в DOM — тихо выходим, чтобы не ронять остальной скрипт.
    if (!activeEl || !nextEl) {
      clearTimeout(this.switchTimer);
      this.isSwitching = false;
      this.switchTimer = null;
      return;
    }

    // 1. Загружаем новое видео в скрытый iframe
    nextEl.src = this.videoUrls[this.currentIndex];

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
    this.activeIframe = nextIframeNum;
  }
};
