// node test/smoke.js  — 정적 서버 + playwright로 네 게임을 한 번씩 돌려본다
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); res.end(d); } });
});
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 420, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  const bal = async () => Number((await pg.textContent('#balance')).replace(/,/g, ''));
  console.log('start', await bal());

  // 블랙잭
  await pg.click('[data-tab=blackjack]');
  await pg.click('#g-blackjack [data-add="1000"]'); await pg.click('#g-blackjack [data-deal]');
  await pg.waitForTimeout(200);
  if (await pg.isEnabled('#g-blackjack [data-stand]')) { await pg.click('#g-blackjack [data-stand]'); await pg.waitForFunction(() => !/골라줘/.test(document.querySelector('#g-blackjack [data-msg]').textContent), null, { timeout: 15000 }); }
  console.log('blackjack:', await pg.textContent('#g-blackjack [data-msg]'), await bal());

  // 룰렛
  await pg.click('[data-tab=roulette]');
  await pg.click('#g-roulette [data-key=red]'); await pg.click('#g-roulette [data-key=n17]');
  await pg.click('#g-roulette [data-spin]'); await pg.waitForFunction(() => !document.querySelector('#g-roulette [data-spin]').disabled || document.querySelector('#g-roulette [data-total]').textContent === '0', null, { timeout: 15000 });
  console.log('roulette:', await pg.textContent('#g-roulette [data-msg]'), await bal());

  // 슬롯
  await pg.click('[data-tab=slots]');
  await pg.click('#g-slots [data-add="500"]'); await pg.click('#g-slots [data-pull]');
  await pg.waitForFunction(() => !document.querySelector('#g-slots [data-pull]').disabled, null, { timeout: 10000 });
  console.log('slots:', await pg.textContent('#g-slots [data-msg]'), await bal());

  // 홀덤: 3핸드, 사람 차례엔 콜/체크 (가끔 레이즈)
  await pg.click('[data-tab=holdem]');
  await pg.click('#g-holdem .buyins button >> nth=1');
  console.log('holdem buy-in →', await bal());
  for (let hand = 0; hand < 3; hand++) {
    for (let guard = 0; guard < 300; guard++) {
      const next = await pg.$('#g-holdem [data-end=next]');
      if (next) break;
      const call = await pg.$('#g-holdem [data-a=call]');
      if (call) {
        if (hand === 1 && guard < 3 && await pg.$('#g-holdem [data-a=raise]')) await pg.click('#g-holdem [data-a=raise]'); else await call.click();
      }
      await pg.waitForTimeout(250);
    }
    console.log('hand', hand + 1, '→', (await pg.textContent('#g-holdem [data-msg]')).slice(0, 90));
    if (hand < 2) await pg.click('#g-holdem [data-end=next]');
  }
  await pg.screenshot({ path: path.join(__dirname, 'holdem.png') });
  await pg.click('#g-holdem [data-end=leave]');
  console.log('after leave', await bal());
  console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs) : 'no page errors');
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
