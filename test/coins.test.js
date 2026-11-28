// node test/coins.test.js — 코인 탭: 가상 코인 시세(결정성/성격), 매수/매도/손익/수수료, 비트코인 실시간, 이전 저장값 이어받기, 리셋. (npm i --no-save jsdom)
const { openPage } = require('./jsdom-page');
const errs = [];
const dom = openPage('#coins', errs);
const w = dom.window, d = w.document, sleep = ms => new Promise(r => setTimeout(r, ms));
const bal = () => Number(d.querySelector('#balance').textContent.replace(/,/g, ''));
const q = s => d.querySelector(s);
const msg = () => q('#g-coins [data-msg]').textContent;
const type = v => { q('#g-coins [data-amount]').value = String(v); q('#g-coins [data-amount]').dispatchEvent(new w.Event('input', { bubbles: true })); };
const pick = id => q('#g-coins [data-coin=' + id + ']').click();
let fails = 0; const check = (n, c) => { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) fails++; };
const FEE = 0.001, SAT = 1e8, T0 = Date.UTC(2026, 10, 28, 12, 0, 0);
const CC = () => w.CasinoCoins;
(async () => {
  await sleep(50);   // 비트코인 실시간 연결 실패 → 시뮬레이션으로 시작하는 걸 먼저 지나간다
  check('코인 탭 보임', !q('#g-coins').hidden && q('#tabs [data-tab=coins]').classList.contains('on'));
  check('코인 5개 목록(비트코인+가상 4개)', d.querySelectorAll('#g-coins .coin-row').length === 5);

  // ---- 가상 코인 시세: 같은 시각이면 항상 같은 값 (그래서 모두에게 같은 가격) ----
  const dom2 = openPage('#coins', []);
  let same = true, pos = true;
  for (const id of ['OKC', 'LUN', 'CHK', 'TTL']) for (let i = 0; i < 200; i++) {
    const t = T0 + i * 977000;
    const a = CC().priceAt(id, t), b = dom2.window.CasinoCoins.priceAt(id, t);
    if (a !== b) same = false; if (!(a >= 1 && Number.isInteger(a))) pos = false;
  }
  check('다른 브라우저 탭에서도 같은 시각이면 같은 가격', same);
  check('가격은 항상 1 이상의 정수', pos);
  const vol = id => { let s = 0, n = 0; for (let i = 0; i < 336; i++) { const t = T0 + i * 3600000; s += Math.abs(CC().priceAt(id, t + 3600000) / CC().priceAt(id, t) - 1); n++; } return s / n; };
  const vTTL = vol('TTL'), vOKC = vol('OKC'), vCHK = vol('CHK');
  check('거북 < 오케이 < 치킨 순으로 출렁임 (' + [vTTL, vOKC, vCHK].map(x => (x * 100).toFixed(1) + '%').join(' / ') + ')', vTTL < vOKC && vOKC < vCHK);

  // ---- 시각 고정 후 오케이코인 거래 ----
  CC().setTime(T0);
  CC().setBtcUsd(100000);
  const pO = CC().priceAt('OKC', T0);
  const start = bal(); check('시작 잔액 1,000,000', start === 1000000);
  check('목록에 비트코인 가격(1달러=1,400)', q('#g-coins [data-coin=BTC] [data-p]').textContent === (100000 * 1400).toLocaleString('ko-KR'));
  check('목록에 오케이코인 가격', q('#g-coins [data-coin=OKC] [data-p]').textContent === pO.toLocaleString('ko-KR'));
  const hist = q('#g-coins [data-chart] polyline').getAttribute('points');
  pick('OKC');
  check('오케이코인 선택: 제목/배지', /오케이코인/.test(q('#g-coins [data-name]').textContent) && /가상 코인/.test(q('#g-coins [data-badge]').textContent));
  check('가상 코인 그래프(지난 1시간) 바로 표시', q('#g-coins [data-chart] polyline').getAttribute('points').split(' ').length === 60);
  check('코인 바꾸면 그래프도 바뀜', q('#g-coins [data-chart] polyline').getAttribute('points') !== hist);

  type(500); q('#g-coins [data-go]').click();
  check('최소 금액 미만은 거절', bal() === start && /최소/.test(msg()));
  type(start + 1); q('#g-coins [data-go]').click();
  check('잔액 초과는 거절', bal() === start && /부족/.test(msg()));
  type(''); q('#g-coins [data-go]').click();
  check('빈 입력은 거절', bal() === start);

  type(500000); q('#g-coins [data-go]').click();
  const got = Math.floor(500000 * (1 - FEE) / pO * SAT);
  check('50만 매수: 잔액 -500,000', bal() === start - 500000);
  check('보유 단위 계산(수수료 0.1%)', CC().state('OKC').sats === got && CC().state('OKC').cost === 500000);
  check('다른 코인엔 영향 없음', CC().state('BTC').sats === 0 && CC().state('LUN').sats === 0);
  check('보유 표시', q('#g-coins [data-sats]').textContent === (got / SAT).toFixed(8) + ' OKC');
  check('목록 줄에 보유 표시', /보유/.test(q('#g-coins [data-coin=OKC] [data-sub]').textContent));

  // 코인을 바꿔도 오케이코인 보유는 유지, 루나코인도 따로 산다
  pick('LUN'); type(200000); q('#g-coins [data-go]').click();
  const pL = CC().priceAt('LUN', T0), gotL = Math.floor(200000 * (1 - FEE) / pL * SAT);
  check('루나코인 20만 매수(코인별로 따로 보유)', CC().state('LUN').sats === gotL && CC().state('OKC').sats === got && bal() === start - 700000);

  // 시간이 흘러 가격이 변하면 평가금액/손익도 변한다 (가장 많이 오른 시각 찾기)
  let bt = T0, bp = pO; for (let i = 1; i <= 300; i++) { const t = T0 + i * 600000, p = CC().priceAt('OKC', t); if (p > bp) { bp = p; bt = t; } }
  CC().setTime(bt); pick('OKC');
  const val = Math.floor(got / SAT * bp);
  check('시간이 지나 오른 가격(' + pO + '→' + bp + ')으로 평가', q('#g-coins [data-val]').textContent === val.toLocaleString('ko-KR') && bp > pO);
  check('이익이면 초록(up)', q('#g-coins [data-pl]').classList.contains('up') && q('#g-coins [data-pl]').textContent.startsWith('+'));
  check('위쪽 총 평가금액 = 두 코인 합', q('#g-coins [data-t-val]').textContent === (val + Math.floor(gotL / SAT * CC().priceAt('LUN', bt))).toLocaleString('ko-KR'));

  // 팔기: 절반 → 전부
  q('#g-coins .seg [data-v=sell]').click();
  check('팔기 모드', q('#g-coins [data-go]').textContent === '팔기');
  q('#g-coins [data-p="50"]').click(); q('#g-coins [data-go]').click();
  const sold = Math.round(Math.floor(val * 0.5) / bp * SAT);
  check('절반 매도: 보유 감소', CC().state('OKC').sats === got - sold);
  check('절반 매도: 투자원금도 비례 감소', Math.abs(CC().state('OKC').cost - Math.round(500000 * (got - sold) / got)) <= 1);
  q('#g-coins [data-p="100"]').click(); q('#g-coins [data-go]').click();
  check('전부 매도: 보유 0, 원금 0', CC().state('OKC').sats === 0 && CC().state('OKC').cost === 0);
  q('#g-coins [data-go]').click();
  check('보유 없이 팔기는 거절', /없어/.test(msg()));
  check('루나코인 보유는 그대로', CC().state('LUN').sats === gotL);

  // ---- 비트코인 (실시간 시세) ----
  q('#g-coins .seg [data-v=buy]').click(); pick('BTC');
  check('비트코인 배지: 실시간', /실시간/.test(q('#g-coins [data-badge]').textContent));
  type(300000); q('#g-coins [data-go]').click();
  const gotB = Math.floor(300000 * (1 - FEE) / 140000000 * SAT);
  check('비트코인 30만 매수', CC().state('BTC').sats === gotB);
  CC().setBtcUsd(110000);
  check('비트코인 가격 상승 → 이익', q('#g-coins [data-pl]').classList.contains('up'));

  // ---- 올인 → 리셋하면 모든 코인 초기화 ----
  q('#g-coins [data-p="100"]').click(); q('#g-coins [data-go]').click();
  check('올인 매수: 잔액 0', bal() === 0);
  q('#reset-btn').click(); q('#reset-btn').click();
  check('리셋: 게임머니 1,000,000 + 모든 코인 0', bal() === 1000000 && ['BTC', 'OKC', 'LUN', 'CHK', 'TTL'].every(id => CC().state(id).sats === 0));
  const saved = JSON.parse(w.localStorage.getItem('okay-casino-coins-v1'));
  check('저장 확인(localStorage)', saved.BTC.sats === 0 && saved.LUN.sats === 0);

  // ---- 예전 비트코인 탭 저장값 이어받기 + 옛 주소(#bitcoin) ----
  const mig = openPage('#bitcoin', errs, { 'okay-casino-btc-v1': JSON.stringify({ sats: 123456, cost: 777000 }) });
  await sleep(50);
  check('옛 주소 #bitcoin → 코인 탭으로 연결', !mig.window.document.querySelector('#g-coins').hidden);
  check('예전에 산 비트코인을 이어받음', mig.window.CasinoCoins.state('BTC').sats === 123456 && mig.window.CasinoCoins.state('BTC').cost === 777000);
  check('이어받은 비트코인을 팔면 새 저장소에 반영됨', (() => { mig.window.document.querySelector('#g-coins [data-coin=BTC]').click(); mig.window.CasinoCoins.setBtcUsd(100000); mig.window.document.querySelector('#g-coins .seg [data-v=sell]').click(); mig.window.document.querySelector('#g-coins [data-p="100"]').click(); mig.window.document.querySelector('#g-coins [data-go]').click(); return JSON.parse(mig.window.localStorage.getItem('okay-casino-coins-v1')).BTC.sats === 0; })());
  const bad = openPage('#coins', errs, { 'okay-casino-coins-v1': '{"OKC":{"sats":-5,"cost":"x"},"LUN":{"sats":1000,"cost":500}}' });
  await sleep(50);
  check('망가진 저장값은 무시(음수/문자), 정상 값은 유지', bad.window.CasinoCoins.state('OKC').sats === 0 && bad.window.CasinoCoins.state('LUN').sats === 1000);
  check('페이지 오류 없음', !errs.length); if (errs.length) console.log(errs);
  process.exit(fails ? 1 : 0);
})();
