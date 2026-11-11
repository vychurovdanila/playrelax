window.Onboarding = {
  sleep: ms => new Promise(r => setTimeout(r, ms)),

  start: async function() {
    const screen = document.getElementById('onboarding-screen');
    const vignette = document.querySelector('.ob-vignette');
    const logo = document.getElementById('ob-logo-container');
    const textContainer = document.getElementById('ob-text-container');
    const startBtn = document.getElementById('ob-start-btn');

    window.App.suspended = true; // Останавливаем игру
    if (window.Particles && window.Particles.clear) window.Particles.clear(); // Очищаем старые частицы

    // 1. Логотип: открытие
    await this.sleep(1000);
    logo.classList.add('split-vertical');
    await this.sleep(500);
    logo.classList.add('open');

    // 2. Пауза и улет логотипа
    await this.sleep(2000);
    logo.classList.remove('open');
    await this.sleep(800);
    logo.classList.remove('split-vertical');
    logo.classList.add('move-up-left');

    // 3. Печать текста
    await this.sleep(1600);
    const phrases = [
      "ЭТО НЕ ИГРА",
      "ВЫИГРАТЬ ИЛИ ПРОИГРАТЬ НЕВОЗМОЖНО",
      "ЭТО ПУТЕШЕСТВИЕ К САМОМУ СЕБЕ",
      "ОТКРЫВАЙ НОВЫЕ ПРОСТРАНСТВА",
      "СОБИРАЯ ЧАСТИЦЫ СВЕТА"
    ];

    for (let i = 0; i < phrases.length; i++) {
      const line = document.createElement('div');
      line.className = 'ob-line op-100';
      textContainer.appendChild(line);

      const lines = textContainer.querySelectorAll('.ob-line');
      lines.forEach((l, idx) => {
        const diff = lines.length - 1 - idx;
        if (diff === 1) l.className = 'ob-line op-50';
        if (diff === 2) l.className = 'ob-line op-25';
      });

      // Печать
      line.textContent = "";
      for (const char of phrases[i]) {
        line.textContent += char;
        await this.sleep(40);
      }
      await this.sleep(1000);
    }

    // 4. Пауза и ВЗРЫВ
    await this.sleep(1000);
    const lines = textContainer.querySelectorAll('.ob-line');
    if (window.Particles) {
      lines.forEach(l => {
        const r = l.getBoundingClientRect();
        window.Particles.spawnExplosion(r.left + r.width/2, r.top + r.height/2, 'white', 50);
      });
    }

    // 5. Скрываем текст и показываем кнопку
    await this.sleep(100);
    textContainer.style.display = 'none';
    vignette.style.background = 'rgba(0,0,0,0.6)';
    startBtn.classList.add('ob-visible');

    // 6. Кнопка «В путь»
    startBtn.addEventListener('click', () => {
      if (window.Particles) {
        const r = startBtn.getBoundingClientRect();
        window.Particles.spawnExplosion(r.left + r.width/2, r.top + r.height/2, 'white', 100);
      }
      screen.style.transition = 'opacity 1s ease';
      screen.style.opacity = '0';

      setTimeout(() => {
        screen.style.display = 'none';
        window.App.suspended = false; // Включаем игру обратно
        window.App.startGame('match3');
        if (window.audioManager) window.audioManager.startMusic();
      }, 1000);
    });
  }
};
