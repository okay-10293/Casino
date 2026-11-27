/* 슬롯: 릴 3개, 한 줄. 환수율은 약 96% (README 참고) */
(function () {
  'use strict';
  var C = Casino;
  var root = document.getElementById('g-slots');
  // sym, 가중치, 3개 일치 배당
  var SYMS = [
    { s: '🍒', w: 30, m: 4 },
    { s: '🍋', w: 24, m: 8 },
    { s: '🔔', w: 18, m: 16 },
    { s: '⭐', w: 14, m: 30 },
    { s: '💎', w: 9, m: 80 },
    { s: '7️⃣', w: 5, m: 300 }
  ];
  var TWO_CHERRY = 2.5;
  var TOTAL_W = SYMS.reduce(function (s, x) { return s + x.w; }, 0);

  function pick() {
    var r = C.rand(TOTAL_W);
    for (var i = 0; i < SYMS.length; i++) { r -= SYMS[i].w; if (r < 0) return SYMS[i]; }
    return SYMS[0];
  }
  function payout(reels) {
    if (reels[0] === reels[1] && reels[1] === reels[2]) return reels[0].m;
    var cherries = reels.filter(function (x) { return x.s === '🍒'; }).length;
    return cherries === 2 ? TWO_CHERRY : 0;
  }

  root.innerHTML =
    '<div class="felt slot-felt">' +
    '<div class="reels"><div class="reel" data-r>🍒</div><div class="reel" data-r>🍋</div><div class="reel" data-r>🔔</div></div>' +
    '<div class="msg" data-msg>베팅하고 레버를 당겨줘</div>' +
    '</div>' +
    '<div class="panel"><div data-bar></div>' +
    '<div class="actions"><button type="button" class="primary" data-pull>스핀</button></div></div>' +
    '<table class="paytable"><caption>배당표 (베팅금 배수)</caption><tbody>' +
    SYMS.slice().reverse().map(function (x) { return '<tr><td>' + x.s + ' ' + x.s + ' ' + x.s + '</td><td>x' + x.m + '</td></tr>'; }).join('') +
    '<tr><td>🍒 두 개</td><td>x' + TWO_CHERRY + '</td></tr></tbody></table>';

  var q = function (s) { return root.querySelector(s); };
  var reelEls = root.querySelectorAll('[data-r]');
  var msgEl = q('[data-msg]'), pull = q('[data-pull]');
  var bar = C.betBar(q('[data-bar]'), { min: 100 });
  var busy = false;

  async function spin() {
    if (busy) return;
    var b = bar.value;
    if (b < bar.min) return C.toast('최소 베팅은 ' + bar.min);
    if (b > C.money()) return C.toast('게임머니가 부족해');
    busy = true; pull.disabled = true; bar.lock(true);
    msgEl.classList.remove('win'); msgEl.textContent = '돌아간다…';
    C.add(-b);
    var result = [pick(), pick(), pick()];
    var stopAt = [700, 1150, 1600], t0 = Date.now();
    await new Promise(function (resolve) {
      var timer = setInterval(function () {
        var el = Date.now() - t0, done = 0;
        reelEls.forEach(function (r, i) {
          if (el >= stopAt[i]) { r.textContent = result[i].s; r.classList.remove('spin'); done++; }
          else { r.textContent = SYMS[C.rand(SYMS.length)].s; r.classList.add('spin'); }
        });
        if (done === 3) { clearInterval(timer); resolve(); }
      }, 70);
    });
    var mult = payout(result), pay = Math.floor(b * mult);
    if (pay) C.add(pay);
    msgEl.textContent = pay ? (mult >= 30 ? '잭팟! ' : '당첨! ') + '+' + C.fmt(pay - b) + ' (x' + mult + ')' : '꽝, -' + C.fmt(b);
    msgEl.classList.toggle('win', pay > 0);
    busy = false; pull.disabled = false; bar.lock(false);
    if (C.money() < bar.min) C.toast('게임머니가 바닥났어. 노동 탭에서 벌어봐');
  }
  pull.addEventListener('click', spin);

  // 개발용: 콘솔에서 Slots.rtp(1e6) 로 환수율 확인
  window.Slots = {
    rtp: function (n) {
      var sum = 0; n = n || 1e5;
      for (var i = 0; i < n; i++) sum += payout([pick(), pick(), pick()]);
      return sum / n;
    }
  };
})();
