// node test/online-smoke.js — 가짜 Realtime으로 방장 1 + 손님 2가 실제 UI로 홀덤을 치는 테스트
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0]; const f = path.join(root, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); res.end(d); } });
});
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.route('**/supabase-js@*/**', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8') }));
  await ctx.route('**/fonts.*/**', r => r.abort());
  const errs = [];
  // 페이지마다 localStorage를 분리해서(접두사) 서로 다른 플레이어처럼 동작시킨다
  const names = ['방장', '철수', '영희'];
  const pages = [];
  for (let i = 0; i < 3; i++) {
    const pg = await ctx.newPage();
    await pg.addInitScript((i) => {
      const real = Storage.prototype.getItem, set = Storage.prototype.setItem, pre = 'p' + i + ':';
      Storage.prototype.getItem = function (k) { return real.call(this, pre + k); };
      Storage.prototype.setItem = function (k, v) { return set.call(this, pre + k, v); };
    }, i);
    pg.on('pageerror', e => errs.push(names[i] + ': ' + e.message));
    await pg.goto(url + '#online'); await pg.waitForSelector('#g-online [data-create]');
    await pg.click('.modal [data-close]');
    await pg.fill('#player-name', names[i]); await pg.dispatchEvent('#player-name', 'change');
    pg.total = () => pg.evaluate(() => { const o = JSON.parse(localStorage.getItem('okay-casino-v1')); return o.money + o.table; });
    pages.push(pg);
  }
  const [host, g1, g2] = pages;
  console.log('시작 합계', await Promise.all(pages.map(p => p.total())));

  await host.click('#g-online [data-create]'); await host.waitForSelector('#g-online [data-code]:not(:empty)');
  const code = await host.textContent('#g-online [data-code]'); console.log('방 코드', code);
  for (const g of [g1, g2]) {
    await g.fill('#on-code', code); await g.click('#g-online [data-join]');
    await g.waitForSelector('#g-online [data-table]:not([hidden])', { timeout: 15000 });
  }
  console.log('입장 완료, 좌석 수:', await host.locator('#g-online .pseat').count());

  // 5핸드 진행: 각자 자기 차례에 콜/체크 (가끔 레이즈)
  const seen = new Set(); let rounds = 0, lastLog = '';
  const t0 = Date.now();
  while (seen.size < 4 && Date.now() - t0 < 120000) {
    for (const [i, pg] of pages.entries()) {
      const call = await pg.$('#g-online [data-a=call]');
      if (call) { if (Math.random() < 0.25 && await pg.$('#g-online [data-a=raise]')) await pg.click('#g-online [data-a=raise]'); else await call.click(); rounds++; }
    }
    const msg = await host.textContent('#g-online [data-msg]');
    if (/\+\d+/.test(msg)) seen.add(msg);
    await host.waitForTimeout(150);
  }
  console.log('결과 메시지 예:', [...seen].slice(0, 3));
  // 손님 화면에서 상대 패가 가려졌는지 / 내 패는 보이는지
  console.log('철수 화면 내 카드 수:', await g1.locator('#g-online .seat-me .card:not(.back)').count());
  await g1.screenshot({ path: path.join(__dirname, 'online.png') });

  // 퇴장: 손님 먼저, 그다음 방장. 모든 칩이 지갑으로 돌아와야 한다.
  for (const g of [g1, g2]) { await g.waitForSelector('#g-online [data-ctrl] button:last-child', { timeout: 60000 }); }
  async function leave(pg) {
    for (let k = 0; k < 400; k++) {
      const btn = await pg.$('#g-online [data-ctrl] .actions button:last-child');
      const txt = btn ? await btn.textContent() : '';
      if (btn && /나가기/.test(txt)) { await btn.click(); break; }
      await pg.waitForTimeout(300);
      for (const sel of ['[data-a=call]']) { const c = await pg.$('#g-online ' + sel); if (c) await c.click(); }
    }
    await pg.waitForSelector('#g-online [data-lobby]:not([hidden])', { timeout: 10000 });
  }
  await leave(g1); await leave(g2); await leave(host);
  const totals = await Promise.all(pages.map(p => p.total()));
  console.log('종료 합계', totals, '→ 총합', totals.reduce((a, b) => a + b, 0));
  console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs) : 'no page errors');
  await b.close(); srv.close();
  process.exit(totals.reduce((a, b) => a + b, 0) === 3000000 && !errs.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
