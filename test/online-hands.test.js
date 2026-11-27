// node test/online-hands.test.js — 방장 1 + 손님 1. 손님 화면에 "내 패"가 핸드마다 새로 보여야 한다. (npm i --no-save jsdom)
// 예전 버그: 새 핸드 상태가 도착하면서 방금 받은 손님의 패를 지워서 2번째 핸드부터 내 패가 안 보였다.
const { openPage, sleep } = require('./jsdom-page');
const errs = [];
async function join(name, hash) {
  const dom = openPage(hash, errs);
  const d = dom.window.document;
  d.querySelector('#player-name').value = name;
  d.querySelector('#player-name').dispatchEvent(new dom.window.Event('change'));
  return d;
}
(async () => {
  const H = await join('방장', '#online'), G = await join('철수', '#online');
  H.querySelector('#g-online [data-create]').click();
  for (let i = 0; i < 40 && !H.querySelector('[data-code]').textContent; i++) await sleep(100);
  G.querySelector('#on-code').value = H.querySelector('[data-code]').textContent;
  G.querySelector('#g-online [data-join]').click();
  for (let i = 0; i < 60 && G.querySelector('#g-online [data-table]').hidden; i++) await sleep(100);

  const mine = d => [...d.querySelectorAll('#g-online .seat-me .card:not(.back):not(.slot)')].map(e => e.textContent).join(' ');
  const handNo = () => { const m = /새 핸드 #(\d+)/.exec(H.querySelector('#g-online [data-msg]').textContent); return m ? Number(m[1]) : 0; };
  const clickCalls = () => [H, G].forEach(d => { const c = d.querySelector('#g-online [data-a=call]'); if (c) c.click(); });

  let ok = true; const seen = [];
  for (let target = 1; target <= 3; target++) {              // 3핸드를 이어서 본다
    const t0 = Date.now();
    while (handNo() < target && Date.now() - t0 < 60000) { clickCalls(); await sleep(150); }
    await sleep(1500);                                      // 새 상태/패 메시지가 다 도착할 시간
    const g = mine(G), h = mine(H);
    const opp = G.querySelectorAll('#g-online .seats-top .hand .card:not(.back)').length;
    console.log('핸드', target, '손님 패:', JSON.stringify(g), '방장 패:', JSON.stringify(h));
    const good = handNo() === target && g.split(' ').length === 2 && !seen.includes(g) && g !== h && (opp === 0 || /\+\d/.test(G.querySelector('#g-online [data-msg]').textContent));
    if (!good) { ok = false; console.log('  → 실패'); }
    seen.push(g);
  }
  console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs) : 'no page errors');
  console.log(ok && !errs.length ? 'online-hands OK' : 'online-hands FAIL');
  process.exit(ok && !errs.length ? 0 : 1);
})();
