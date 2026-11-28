// node test/online-blackjack-ui.test.js — 방장 1 + 손님 1이 실제 화면으로 블랙잭 방을 만들고 두 판을 치른다. (npm i --no-save jsdom)
const { openPage, sleep } = require('./jsdom-page');
const errs = [];
const fails = [];
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };

async function join(name) {
  const dom = openPage('#online', errs);
  const d = dom.window.document;
  d.querySelector('#player-name').value = name;
  d.querySelector('#player-name').dispatchEvent(new dom.window.Event('change'));
  return { d, w: dom.window, bal: () => Number(d.querySelector('#balance').textContent.replace(/,/g, '')) };
}
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(100); } return false; }

(async () => {
  const H = await join('방장'), G = await join('철수');
  const start = [H.bal(), G.bal()];

  // 패치노트: 처음 열면 자동으로 뜨고, 닫으면 다시 안 뜬다
  const modal = H.d.querySelector('.modal');
  check(modal && !modal.hidden, '패치노트가 처음 한 번 자동으로 뜬다');
  check(/온라인 블랙잭/.test(modal.textContent), '패치노트에 이번 업데이트(온라인 블랙잭)가 있다');
  modal.querySelector('[data-close]').click();
  check(modal.hidden && !H.d.querySelector('#patch-btn').classList.contains('unseen'), '닫으면 숨겨지고 새 글 표시가 사라진다');
  H.d.querySelector('#patch-btn').click();
  check(!modal.hidden, '헤더 버튼으로 다시 열 수 있다');
  modal.querySelector('[data-close]').click();
  G.d.querySelector('.modal [data-close]').click();

  // 블랙잭 방은 최소 바이인 미만이면 만들 수 없다
  H.d.querySelector('#on-game').value = 'blackjack';
  const buyin = H.d.querySelector('.buyin-pick input');
  buyin.value = 5000; buyin.dispatchEvent(new H.w.Event('input'));
  H.d.querySelector('#g-online [data-create]').click();
  await sleep(300);
  check(H.d.querySelector('#g-online [data-table]').hidden, '최소 바이인 미만이면 방이 만들어지지 않는다');
  buyin.value = 300000;

  // 방 만들기 → 입장
  H.d.querySelector('#g-online [data-create]').click();
  await waitFor(() => H.d.querySelector('[data-code]').textContent);
  const code = H.d.querySelector('[data-code]').textContent;
  G.d.querySelector('#on-code').value = code;
  G.d.querySelector('.buyin-pick input').value = 300000;
  G.d.querySelector('#g-online [data-join]').click();
  check(await waitFor(() => !G.d.querySelector('#g-online [data-table]').hidden), '손님이 코드로 입장했다');
  check(/블랙잭/.test(G.d.querySelector('[data-gamename]').textContent), '손님 화면에 방 종류(블랙잭)가 표시된다');
  check(G.d.querySelector('#g-online [data-ranks]').hidden, '블랙잭 방에는 홀덤 족보 표가 숨겨진다');

  const msgOf = d => d.querySelector('#g-online [data-msg]').textContent;
  for (let round = 1; round <= 2; round++) {
    console.log('— 판', round);
    // 베팅
    for (const P of [H, G]) {
      check(await waitFor(() => P.d.querySelector('#g-online [data-ok]')), '베팅 UI가 뜬다 (' + (P === H ? '방장' : '손님') + ')');
      if (round === 1 && P === G) P.d.querySelector('#g-online [data-add]').click();     // 칩 하나 더 얹어 본다
      P.d.querySelector('#g-online [data-ok]').click();
    }
    // 진행: 각자 자기 차례에 멈추기(가끔 카드 받기)
    const t0 = Date.now(); let moves = 0;
    while (Date.now() - t0 < 60000 && !([H, G].every(P => P.d.querySelector('#g-online .pnote.res')))) {
      for (const P of [H, G]) {
        const hit = P.d.querySelector('#g-online [data-a=hit]'), stand = P.d.querySelector('#g-online [data-a=stand]');
        if (stand) { (moves++ % 3 === 0 && hit ? hit : stand).click(); }
      }
      await sleep(150);
    }
    const resH = [...H.d.querySelectorAll('#g-online .pnote.res')].map(e => e.textContent);
    const resG = [...G.d.querySelectorAll('#g-online .pnote.res')].map(e => e.textContent);
    console.log('  결과(방장 화면):', resH.join(' | '), '/ 딜러:', msgOf(H.d).slice(0, 40));
    check(resH.length === 2 && resG.length === 2, '두 사람 결과가 양쪽 화면에 모두 보인다');
    check([...resH].sort().join() === [...resG].sort().join(), '방장과 손님 화면의 결과가 같다 (내 자리 위치만 다름)');
    check(resH.every(t => /승리|패배|무승부|블랙잭|21 넘음/.test(t)), '결과 문구가 정상이다');
    const dealerShown = G.d.querySelectorAll('#g-online .board .card:not(.back):not(.slot)').length;
    check(dealerShown >= 2, '정산 때 딜러 카드가 모두 공개된다 (' + dealerShown + '장)');
  }

  // 퇴장: 손님 → 방장. 지갑에 칩이 돌아와야 한다 (딜러한테 잃은 만큼만 줄어듦)
  check(await waitFor(() => G.d.querySelector('#g-online [data-ctrl] .actions button:last-child')), '나가기 버튼이 있다');
  G.d.querySelector('#g-online [data-ctrl] .actions button:last-child').click();
  check(await waitFor(() => !G.d.querySelector('#g-online [data-lobby]').hidden), '손님이 로비로 돌아간다');
  const hostLeave = () => { const b = H.d.querySelector('#g-online [data-ctrl] .actions button:last-child'); if (b && /나가기/.test(b.textContent)) { b.click(); return true; } return false; };
  await waitFor(() => { hostLeave(); return !H.d.querySelector('#g-online [data-lobby]').hidden; });
  check(!H.d.querySelector('#g-online [data-lobby]').hidden, '방장도 로비로 돌아간다');
  const end = [H.bal(), G.bal()];
  console.log('  지갑 시작', start, '→ 종료', end);
  check(end.every(v => v > 0 && Number.isInteger(v)) && end[0] + end[1] <= start[0] + start[1] + 2 * 1000000, '지갑이 정상 정수이고 칩이 새로 생기지 않았다');

  console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs) : 'no page errors');
  const ok = !fails.length && !errs.length;
  console.log(ok ? 'online-blackjack-ui OK' : 'online-blackjack-ui FAIL: ' + fails.join(' / '));
  process.exit(ok ? 0 : 1);
})();
