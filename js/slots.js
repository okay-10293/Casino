/* 슬롯: 릴 3개, 한 줄. 환수율은 약 85% (README 참고) */
(function () {
  'use strict';
  var C = Casino;
  var root = document.getElementById('g-slots');
  // sym, 가중치, 3개 일치 배당
  var SYMS = [
    { s: '🍒', w: 30, m: 4 },
    { s: '🍋', w: 24, m: 7 },
    { s: '🔔', w: 18, m: 16 },
    { s: '⭐', w: 14, m: 30 },
    { s: '💎', w: 9, m: 80 },
    { s: '7️⃣', w: 5, m: 300 }
  ];
  var TWO_CHERRY = 2;
  var SLOT_BET = 1000000;   // 슬롯 베팅은 고정 100만
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
    '<div class="msg" data-msg>스페이스바(또는 스핀 버튼)로 돌려줘</div>' +
    '</div>' +
    '<div class="panel"><div class="bet-line"><span>베팅</span><b>' + C.fmt(SLOT_BET) + '</b></div>' +
    '<div class="actions"><button type="button" class="primary" data-pull>스핀</button></div>' +
    '<p class="rule">키보드: 스페이스 = 스핀 · 엔터 두 번 = 리셋</p></div>' +
    '<table class="paytable"><caption>배당표 (베팅금 배수)</caption><tbody>' +
    SYMS.slice().reverse().map(function (x) { return '<tr><td>' + x.s + ' ' + x.s + ' ' + x.s + '</td><td>x' + x.m + '</td></tr>'; }).join('') +
    '<tr><td>🍒 두 개</td><td>x' + TWO_CHERRY + '</td></tr></tbody></table>';

  var q = function (s) { return root.querySelector(s); };
  var reelEls = root.querySelectorAll('[data-r]');
  var msgEl = q('[data-msg]'), pull = q('[data-pull]');
  var busy = false, stopNow = null;
  pull.parentNode.parentNode.insertBefore(C.skipBox(), pull.parentNode.nextSibling);
  function showResult(result) {
    reelEls.forEach(function (r, i) { r.textContent = result[i].s; r.classList.remove('spin'); });
  }

  async function spin() {
    if (busy) { if (stopNow) stopNow(); return; }   // 도는 중에 다시 누르면 건너뛰기
    var b = SLOT_BET;
    if (C.money() < b) {
      msgEl.classList.remove('win'); msgEl.textContent = '돈이 부족해요';
      return C.toast('돈이 부족해요');
    }
    busy = true; pull.textContent = '건너뛰기';
    msgEl.classList.remove('win'); msgEl.textContent = '돌아간다…';
    C.add(-b);
    var result = [pick(), pick(), pick()];
    if (C.skipMotion()) showResult(result);
    else {
      var stopAt = [700, 1150, 1600], t0 = Date.now();
      await new Promise(function (resolve) {
        var timer = setInterval(function () {
          var el = Date.now() - t0, done = 0;
          reelEls.forEach(function (r, i) {
            if (el >= stopAt[i]) { r.textContent = result[i].s; r.classList.remove('spin'); done++; }
            else { r.textContent = SYMS[C.rand(SYMS.length)].s; r.classList.add('spin'); }
          });
          if (done === 3) { clearInterval(timer); stopNow = null; resolve(); }
        }, 70);
        stopNow = function () { clearInterval(timer); stopNow = null; showResult(result); resolve(); };
      });
    }
    var mult = payout(result), pay = Math.floor(b * mult);
    if (pay) C.add(pay);
    msgEl.textContent = pay ? (mult >= 30 ? '잭팟! ' : '당첨! ') + '+' + C.fmt(pay - b) + ' (x' + mult + ')' : '꽝, -' + C.fmt(b);
    msgEl.classList.toggle('win', pay > 0);
    busy = false; pull.textContent = '스핀';
    if (C.money() < SLOT_BET) C.toast('게임머니가 바닥났어. 노동 탭에서 벌거나 위의 리셋을 눌러줘');
  }
  pull.addEventListener('click', spin);

  /* ---------- 키보드: 스페이스 = 스핀, 엔터 두 번 = 리셋 (슬롯 탭이 열려 있을 때만) ---------- */
  var lastEnter = 0;
  function typing(e) {
    var t = e.target, tag = t && t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
  }
  document.addEventListener('keydown', function (e) {
    if (root.hidden || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();               // 페이지 스크롤, 포커스된 버튼의 중복 클릭 방지
      if (!e.repeat) spin();
    } else if (e.key === 'Enter') {
      e.preventDefault();               // 포커스된 버튼이 눌리는 것 방지
      if (e.repeat) return;
      var now = Date.now();
      if (now - lastEnter <= 600) {
        lastEnter = 0;
        if (busy) C.toast('돌아가는 중에는 리셋할 수 없어요');
        else { msgEl.classList.remove('win'); C.reset(); }
      } else { lastEnter = now; C.toast('엔터를 한 번 더 누르면 리셋돼요'); }
    }
  });
  document.addEventListener('keyup', function (e) {   // Firefox: 스페이스 keyup이 버튼 클릭을 일으키는 것 방지
    if (!root.hidden && !typing(e) && (e.code === 'Space' || e.key === ' ')) e.preventDefault();
  });

  // 개발용: 콘솔에서 Slots.rtp(1e6) 로 환수율 확인
  window.Slots = {
    rtp: function (n) {
      var sum = 0; n = n || 1e5;
      for (var i = 0; i < n; i++) sum += payout([pick(), pick(), pick()]);
      return sum / n;
    }
  };
})();
