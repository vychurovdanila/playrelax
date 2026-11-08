/* ============================================================
   ИГРА MATCH-3 (заглушка). Независимый модуль с тем же контрактом,
   что и Тетрис: update() — логика, draw(ctx) — отрисовка.
   Кадром управляет main.js (window.App.loop).
   ============================================================ */
window.Match3Game = {
  update: function() { /* Логика Match-3 */ },
  draw: function(ctx) {
    ctx.fillStyle = 'rgba(50, 50, 50, 0.9)';
    ctx.fillRect(0, 0, 320, 640);
    ctx.fillStyle = 'white';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Match-3', 160, 320);
  }
};
