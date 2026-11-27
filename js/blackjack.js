/* 블랙잭: 딜러 17에서 스탠드, 블랙잭 3:2, 더블 가능 */
(function () {
  'use strict';
  var C = Casino;
  var root = document.getElementById('g-blackjack');
  root.innerHTML =
    '<div class="felt">' +
    '<div class="hand-zone"><div class="zone-label">딜러 <b data-ds></b></div><div class="hand" data-dealer></div></div>' +
    '<div class="msg" data-msg>베팅하고 딜을 눌러줘</div>' +
    '<div class="hand-zone"><div class="zone-label">나 <b data-ps></b></div><div class="hand" data-player></div></div>' +
    '</div>' +
    '<div class="panel"><div data-bar></div>' +
    '<div class="actions">' +
    '<button type="button" class="primary" data-deal>딜</button>' +
    '<button type="button" data-hit disabled>히트</button>' +
    '<button type="button" data-stand disabled>스탠드</button>' +
    '<button type="button" data-double disabled>더블</button>' +
    '</div></div>' +
    '<p class="rule">블랙잭 3:2 · 딜러는 17에서 멈춤 · 더블은 첫 두 장에서만</p>';

  var q = function (s) { return root.querySelector(s); };
  var dealerEl = q('[data-dealer]'), playerEl = q('[data-player]');
  var dsEl = q('[data-ds]'), psEl = q('[data-ps]'), msgEl = q('[data-msg]');
  var btn = { deal: q('[data-deal]'), hit: q('[data-hit]'), stand: q('[data-stand]'), dbl: q('[data-double]') };
  var bar = C.betBar(q('[data-bar]'), { min: 100 });

  var deck = [], player = [], dealer = [], bet = 0, phase = 'bet';

  function draw() { if (deck.length < 15) deck = C.Cards.shuffled(); return deck.pop(); }
  function score(h) {
    var t = 0, a = 0;
    h.forEach(function (c) { if (c.r === 14) { a++; t += 11; } else t += Math.min(c.r, 10); });
    while (t > 21 && a) { t -= 10; a--; }
    return t;
  }
  function isBJ(h) { return h.length === 2 && score(h) === 21; }

  function render(hideHole) {
    dealerEl.innerHTML = ''; playerEl.innerHTML = '';
    dealer.forEach(function (c, i) { dealerEl.appendChild(C.Cards.el(c, hideHole && i === 1)); });
    player.forEach(function (c) { playerEl.appendChild(C.Cards.el(c)); });
    dsEl.textContent = dealer.length ? (hideHole ? score([dealer[0]]) : score(dealer)) : '';
    psEl.textContent = player.length ? score(player) : '';
  }
  function setButtons() {
    var playing = phase === 'play';
    btn.deal.disabled = playing;
    btn.hit.disabled = !playing;
    btn.stand.disabled = !playing;
    btn.dbl.disabled = !(playing && player.length === 2 && C.money() >= bet);
    bar.lock(playing);
  }

  function deal() {
    if (phase !== 'bet') return;
    var b = bar.value;
    if (b < bar.min) return C.toast('최소 베팅은 ' + bar.min);
    if (b > C.money()) return C.toast('게임머니가 부족해');
    C.add(-b); bet = b; phase = 'play';
    player = [draw(), draw()]; dealer = [draw(), draw()];
    msgEl.textContent = '히트, 스탠드, 더블 중 골라줘';
    render(true); setButtons();
    if (isBJ(player) || isBJ(dealer)) finish();
  }

  function hit() {
    if (phase !== 'play') return;
    player.push(draw()); render(true);
    var s = score(player);
    if (s > 21) finish();
    else if (s === 21) stand();
    else setButtons();
  }

  function dbl() {
    if (phase !== 'play' || player.length !== 2 || C.money() < bet) return;
    C.add(-bet); bet *= 2;
    player.push(draw()); render(true);
    stand();
  }

  async function stand() {
    if (phase !== 'play') return;
    phase = 'dealer'; setButtons(); render(false);
    if (score(player) <= 21) {
      while (score(dealer) < 17) {
        await C.sleep(650);
        dealer.push(draw()); render(false);
      }
      await C.sleep(350);
    }
    finish();
  }

  function finish() {
    render(false);
    var p = score(player), d = score(dealer), pay = 0, text;
    if (isBJ(player) && isBJ(dealer)) { pay = bet; text = '둘 다 블랙잭, 무승부'; }
    else if (isBJ(player)) { pay = Math.floor(bet * 2.5); text = '블랙잭! +' + C.fmt(pay - bet); }
    else if (isBJ(dealer)) { text = '딜러 블랙잭, -' + C.fmt(bet); }
    else if (p > 21) { text = '버스트, -' + C.fmt(bet); }
    else if (d > 21) { pay = bet * 2; text = '딜러 버스트! +' + C.fmt(bet); }
    else if (p > d) { pay = bet * 2; text = '승리! +' + C.fmt(bet); }
    else if (p < d) { text = '패배, -' + C.fmt(bet); }
    else { pay = bet; text = '푸시, 베팅금 반환'; }
    if (pay > 0) C.add(pay);
    msgEl.textContent = text;
    msgEl.classList.toggle('win', pay > bet);
    phase = 'bet'; setButtons();
    if (C.money() < bar.min) C.toast('게임머니가 바닥났어. 위의 리셋을 눌러줘');
  }

  btn.deal.addEventListener('click', function () { msgEl.classList.remove('win'); deal(); });
  btn.hit.addEventListener('click', hit);
  btn.stand.addEventListener('click', stand);
  btn.dbl.addEventListener('click', dbl);
  C.onChange(setButtons);
  setButtons();
})();
