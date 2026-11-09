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

  start: async function() {
    const screen = document.getElementById('onboarding-screen');
    const logo = document.getElementById('onboarding-logo');
    const textContainer = document.getElementById('onboarding-text-container');
    
    // 1. Ждем 1 секунду в закрытом состоянии
    await this.sleep(1000);
    
    // 2. Открываем скобки и показываем лого
    logo.classList.add('open');
    
    // 3. Ждем 2 секунды
    await this.sleep(2000);
    
    // 4. Закрываем скобки и уезжаем наверх
    logo.classList.remove('open');
    logo.classList.add('move-top');
    
    // Ждем, пока скобки уедут, и показываем текст
    await this.sleep(1000);
    textContainer.classList.add('show');
    screen.classList.add('bg-20'); // Затемнение фона (как на 6 экране)

    // 5. Печатаем фразы
    for (let i = 0; i < this.phrases.length; i++) {
      const line = document.createElement('div');
      line.className = 'ob-line active';
      textContainer.appendChild(line);
      
      const lines = textContainer.querySelectorAll('.ob-line');
      lines.forEach((l, index) => {
        if (index === lines.length - 1) return;
        if (index === lines.length - 2) {
          l.classList.remove('active');
          l.classList.add('dimmed');
        } else if (index === lines.length - 4) {
          l.classList.add('hidden');
        }
      });

      await this.typeText(line, this.phrases[i]);
      await this.sleep(1000); 
    }

    // 6. Ждем 3 секунды перед взрывом
    await this.sleep(3000);

    // 7. Взрыв текста
    const textLines = textContainer.querySelectorAll('.ob-line');
    if (window.Particles) {
      textLines.forEach(line => {
        const r = line.getBoundingClientRect();
        window.Particles.spawnExplosion(r.left + r.width/2, r.top + r.height/2, 'white', 40);
      });
    }

    // Скрываем текст, уводим логотип влево, меняем фон на 50%
    textContainer.style.opacity = '0';
    logo.classList.add('fade-left');
    screen.classList.replace('bg-20', 'bg-50');

    // 8. Появление кнопки
    const btn = document.createElement('button');
    btn.id = 'ob-final-btn';
    btn.textContent = '[ В ПУТЬ ]';
    screen.appendChild(btn);
    btn.style.display = 'block';

    // 9. Переход в игру
    btn.addEventListener('click', () => {
      localStorage.setItem('playrelax_onboarded', 'true');
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