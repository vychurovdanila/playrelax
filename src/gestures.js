/* ============================================================
   Многопальцевые (2 и 3 пальца) жесты. Вынесены из src/game.js.

   Почему отдельным файлом: жесты работают на уровне document и не имеют
   отношения к самой игре — они управляют паузой и музыкой. Подключён
   ПОСЛЕ game.js, поэтому window.GameAPI уже существует.

   Логика:
   - 2 пальца: короткий тап = пауза, свайп = смена мира (video).
   - 3 пальца: короткий тап = вкл/выкл звук, свайп = следующий трек.

   Ловим жест в фазе ПЕРЕХВАТА (capture): как только на экране оказываются
   два пальца, гасим событие (stopImmediatePropagation), чтобы обработчик
   канваса его не получил и не повернул/не сдвинул фигуру.

   Доступ к внутренним переменным game.js идёт через window.GameAPI
   (let-переменные игрового модуля не видны через window).
   ============================================================ */
const TWO_FINGER_SWIPE_THRESHOLD = 30;

// Отдельное состояние для ДВУХпальцевого жеста: одиночный свайп игры
// использует свои touchStartX/touchStartY (объявлены в game.js) и не мешает.
let twoFingerStartX = null;
let twoFingerStartY = null;
let twoFingerMoved = false; // Флаг: был ли это свайп, а не тап

// Отдельное состояние для ТРЁХпальцевого жеста (тап = вкл/выкл звук,
// свайп = следующий трек). Двухпальцевый жест эти переменные не трогает.
let threeFingerStartX = null;
let threeFingerStartY = null;
let threeFingerMoved = false;

document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 3) {
    threeFingerStartX = e.touches[0].clientX;
    threeFingerStartY = e.touches[0].clientY;
    threeFingerMoved = false;
    stopSingleSwipe(); // На всякий случай гасим одиночное движение
    // Жест не для игры: удержание «вниз» завершено, блок новой фигуры снимаем,
    // иначе игра «залипнет» и фигура зависнет до следующего touchend.
    window.GameAPI.releaseDownHold();
    e.stopImmediatePropagation();
    return;
  }
  if (e.touches.length === 2) {
    twoFingerStartX = e.touches[0].clientX;
    twoFingerStartY = e.touches[0].clientY;
    twoFingerMoved = false;
    // Второй палец коснулся во время одиночного перетаскивания: гасим
    // автоповтор, иначе фигура продолжит ехать сама, пока палец на экране.
    stopSingleSwipe();
    // Жест не для игры: удержание «вниз» завершено, блок снимаем.
    window.GameAPI.releaseDownHold();
    // Двухпальцевый жест — не для игры: гасим его ДО канваса.
    e.stopImmediatePropagation();
  } else {
    twoFingerStartX = null;
  }
}, { passive: true, capture: true });

document.addEventListener('touchmove', (e) => {
  // Три пальца: определяем, свайп это или тап (порог 30px, как у двух пальцев).
  if (threeFingerStartX !== null && e.touches.length === 3) {
    const distX = Math.abs(e.touches[0].clientX - threeFingerStartX);
    const distY = Math.abs(e.touches[0].clientY - threeFingerStartY);
    if (distX > 30 || distY > 30) { // Порог свайпа
      threeFingerMoved = true;
    }
    e.stopImmediatePropagation();
    return;
  }

  // Если двигаем двумя пальцами, проверяем, не свайп ли это
  if (twoFingerStartX !== null && e.touches.length === 2) {
    const distX = Math.abs(e.touches[0].clientX - twoFingerStartX);
    const distY = Math.abs(e.touches[0].clientY - twoFingerStartY);
    if (distX > TWO_FINGER_SWIPE_THRESHOLD || distY > TWO_FINGER_SWIPE_THRESHOLD) {
      twoFingerMoved = true;
    }
    e.stopImmediatePropagation();
  }
}, { passive: true, capture: true });

document.addEventListener('touchend', (e) => {
  // Три пальца: тап = вкл/выкл звук, свайп = следующий трек.
  if (threeFingerStartX !== null && e.changedTouches.length > 0) {
    if (e.touches.length === 0) { // Все пальцы оторваны
      if (threeFingerMoved) {
        // Свайп тремя пальцами — следующий трек
        if (window.audioManager) window.audioManager.next();
      } else {
        // Тап тремя пальцами — вкл/выкл звук
        if (window.audioManager) {
          if (window.audioManager.muted) {
            window.audioManager.unmute();
          } else {
            window.audioManager.mute();
          }
          if (typeof updateUnmuteUI === 'function') updateUnmuteUI(); // Обновляем иконку (если она есть на ПК)
        }
      }
      threeFingerStartX = null;
      threeFingerStartY = null;
    }
    e.stopImmediatePropagation();
    return;
  }

  if (twoFingerStartX !== null && e.changedTouches.length > 0) {
    // Пока на экране остался хотя бы один палец — ждём, иначе обработаем дважды.
    if (e.touches.length === 0) {
      if (twoFingerMoved) {
        // Был свайп — меняем видео, паузу не трогаем
        window.VideoManager.next();
      } else {
        // Был короткий тап двумя пальцами — переключаем паузу.
        // Счётчик кадров и класс на body переключает GameAPI.togglePause
        // (канвас размывается и уходит в прозрачность, видео становится чётким).
        window.GameAPI.togglePause();
      }
      twoFingerStartX = null;
      twoFingerStartY = null;
    }
    // Гасим жест, чтобы канвас не воспринял его как тап/свайп игры.
    e.stopImmediatePropagation();
  }
}, { passive: true, capture: true });
