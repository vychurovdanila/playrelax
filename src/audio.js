// playrelax — аудиомодуль (фоновая музыка).
// Стек: Howler.js (vendor/howler.min.js).
// Запуск только после первого действия пользователя — требование iOS Safari.

/* ============================================================
   Плейлист. Список треков больше не хардкодится в коде:
   он читается из JSON-манифеста рядом с аудиофайлами.
   Пути считаются относительно src/ (там лежат index.html и этот скрипт).
   ============================================================ */
const PLAYLIST_URL = 'assets/audio/playlist.json';
// Папка с аудио — префикс для имён файлов из манифеста.
const AUDIO_DIR = 'assets/audio/';

// Ключ для localStorage.
const STORAGE_KEY = 'playrelax_audio';

/* ============================================================
   AudioManager — управление фоновой музыкой.
   ============================================================ */
class AudioManager {
  constructor() {
    this.sounds = [];        // массив Howl (по одному на трек)
    // Список треков приходит из playlist.json (см. loadPlaylist).
    this.tracks = [];
    this.currentIndex = 0;   // индекс текущего трека
    this.isShuffle = false;  // режим: по порядку / случайно
    this.volume = 0.5;       // громкость
    this.playing = false;    // играет ли сейчас
    this.inited = false;     // инициализированы ли Howl-объекты
    // Манифест грузится асинхронно: если play() позвали раньше, чем
    // пришёл JSON, запоминаем запрос и стартуем сразу после загрузки.
    this.playRequested = false;
    // Отдельный флаг «звук выключен» (кнопка #btn-unmute). Не путать с pause():
    // при mute трек продолжает играть без звука, playing остаётся true.
    this.muted = false;
  }

  // Читаем сохранённые настройки из localStorage.
  loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);

      if (typeof saved.currentIndex === 'number' &&
          saved.currentIndex >= 0 && saved.currentIndex < this.tracks.length) {
        this.currentIndex = saved.currentIndex;
      }
      if (typeof saved.isShuffle === 'boolean') {
        this.isShuffle = saved.isShuffle;
      }
      if (typeof saved.volume === 'number') {
        this.volume = saved.volume;
      }
    } catch (e) {
      // повреждённые данные — игнорируем, работаем с дефолтами
      console.warn('playrelax: не удалось прочитать настройки аудио', e);
    }
  }

  // Сохраняем настройки в localStorage.
  saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentIndex: this.currentIndex,
        isShuffle: this.isShuffle,
        volume: this.volume
      }));
    } catch (e) {
      console.warn('playrelax: не удалось сохранить настройки аудио', e);
    }
  }

  // Загружаем список треков из JSON-манифеста.
  // Возвращает промис; ошибки не пробрасываем — аудио не критично для игры.
  async loadPlaylist() {
    try {
      const response = await fetch(PLAYLIST_URL, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      const list = await response.json();
      if (!Array.isArray(list)) {
        throw new Error('манифест должен быть массивом имён файлов');
      }

      // Оставляем только непустые строки.
      // Путь формируем так: абсолютные URL (http/https) используем как есть —
      // манифест может указывать на внешнее хранилище (Vercel Blob).
      // Локальные имена файлов получают префикс папки с аудио.
      this.tracks = list
        .filter((name) => typeof name === 'string' && name.trim() !== '')
        .map((name) => {
          const track = name.trim();
          return track.startsWith('http') ? track : (AUDIO_DIR + track);
        });

      // Сохранённый индекс мог указывать за пределы нового списка.
      if (this.currentIndex >= this.tracks.length) {
        this.currentIndex = 0;
      }
    } catch (e) {
      this.tracks = [];
      console.warn('playrelax: не удалось загрузить плейлист', PLAYLIST_URL, e);
    }
  }

  // Создаём Howl для каждого трека из загруженного списка.
  buildSounds() {
    this.sounds = this.tracks.map((src) => new Howl({
      src: [src],
      // html5: true — стриминг (важно для iOS, длинных файлов и экономии памяти)
      html5: true,
      volume: this.volume,
      // muted — сохранённое состояние звука (см. mute/unmute)
      muted: this.muted,
      // по окончании трека автоматически запускаем следующий
      onend: () => {
        this.next();
      }
    }));
  }

  // Создаём Howl для каждого трека.
  // Список берётся из playlist.json, поэтому метод асинхронный:
  // пока JSON грузится, музыка просто не играет (это миллисекунды).
  async init() {
    if (this.inited) return;
    // Флаг ставим сразу — иначе параллельные вызовы (play/pause/mute)
    // запустят несколько загрузок манифеста.
    this.inited = true;

    await this.loadPlaylist();

    // Манифест не загрузился или пуст — работать не с чем.
    if (this.tracks.length === 0) {
      this.inited = false; // даём шанс повторить при следующем вызове
      return;
    }

    // Настройки читаем ПОСЛЕ манифеста: проверка currentIndex
    // опирается на this.tracks.length.
    this.loadSettings();

    this.buildSounds();

    // play() просили до готовности Howl-объектов — запускаем сейчас.
    if (this.playRequested) {
      this.playRequested = false;
      this.play();
    }
  }

  // Запускаем текущий трек (если не играет).
  play() {
    if (!this.inited) this.init();
    if (this.playing) return;

    const sound = this.sounds[this.currentIndex];
    // Howl-объекты ещё не готовы: манифест грузится асинхронно.
    // Запоминаем запрос — init() запустит воспроизведение сам,
    // как только список треков будет загружен.
    if (!sound) {
      this.playRequested = true;
      return;
    }

    sound.volume(this.volume);
    sound.play();
    this.playing = true;
    this.updateUI();
  }

  // Пауза.
  pause() {
    if (!this.inited) return;
    const sound = this.sounds[this.currentIndex];
    if (sound) sound.pause();
    this.playing = false;
    this.updateUI();
  }

  // Выключение/включение звука (кнопка #btn-unmute).
  // Трек не останавливается — только громкость 0. Для html5-режима Howler
  // поле muted у Howl ставит и громкость, и сам media-элемент.
  mute() {
    if (!this.inited) this.init();
    const sound = this.sounds[this.currentIndex];
    if (sound) sound.mute(true);
    this.muted = true;
    this.updateUI();
  }

  unmute() {
    if (!this.inited) this.init();
    const sound = this.sounds[this.currentIndex];
    if (sound) {
      sound.mute(false);
      sound.volume(this.volume);
    }
    this.muted = false;
    this.updateUI();
  }

  // Определяем индекс следующего трека (с учётом shuffle).
  getNextIndex() {
    // Список ещё не загружен — индекс менять не на что.
    if (this.tracks.length === 0) return this.currentIndex;

    if (this.isShuffle && this.tracks.length > 1) {
      // случайный индекс, отличный от текущего
      let next = this.currentIndex;
      while (next === this.currentIndex) {
        next = Math.floor(Math.random() * this.tracks.length);
      }
      return next;
    }
    // по порядку, с зацикливанием
    return (this.currentIndex + 1) % this.tracks.length;
  }

  // Переключаем на следующий трек.
  next() {
    if (!this.inited) this.init();

    // Манифест ещё не загружен: Howl-объектов нет, переключать нечего.
    // Иначе мы бы сдвинули currentIndex и сохранили его в localStorage
    // до того, как список треков вообще известен.
    if (this.sounds.length === 0) return;

    const prevSound = this.sounds[this.currentIndex];
    if (prevSound) prevSound.stop();

    // Снимаем мьют со СТАРОГО трека перед сменой индекса: Howler хранит
    // mute на самом Howl, и без сброса следующий трек мог унаследовать
    // или потерять состояние. Само muted-состояние живёт в this.muted.
    if (prevSound) prevSound.mute(false);

    this.currentIndex = this.getNextIndex();
    this.saveSettings();

    if (this.playing) {
      const sound = this.sounds[this.currentIndex];
      if (sound) {
        sound.volume(this.volume);
        // Флаг this.muted — источник истины: если звук выключен кнопкой,
        // новый трек тоже должен играть БЕЗ звука (иначе мьют «теряется»
        // при смене трека — в т.ч. при автопереходе через onend).
        sound.mute(this.muted);
        sound.play();
      }
    }
    this.updateUI();
  }

  // Переключаем режим «по порядку / случайно».
  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    this.saveSettings();
    this.updateUI();
  }

  // Обновляем вид кнопки звука (если DOM доступен).
  // Кнопок переключения трека и shuffle больше нет — обновляем только #btn-unmute.
  updateUI() {
    const btnUnmute = document.getElementById('btn-unmute');
    if (!btnUnmute) return;

    btnUnmute.textContent = this.muted ? '🔇' : '🔊';
    btnUnmute.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
    btnUnmute.setAttribute('aria-label',
      this.muted ? 'Включить звук' : 'Выключить звук');
  }
}

// Глобальный экземпляр — game.js вызывает window.audioManager.
window.audioManager = new AudioManager();
