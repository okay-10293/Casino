// node test/lobby.test.js — 온라인 대기실: 열린 방 목록 → 클릭해서 입장, 인원/진행 갱신, 방장이 나가면 사라짐. (npm i --no-save jsdom)
const { openPage, sleep } = require('./jsdom-page');
const errs = [];
let fails = 0; const check = (n, c) => { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) fails++; };
async function page(name) {
  const dom = openPage('#online', errs), d = dom.window.document;
  d.querySelector('#player-name').value = name;
  d.querySelector('#player-name').dispatchEvent(new dom.window.Event('change'));
  return d;
}
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(100); } return false; };
const rooms = d => [...d.querySelectorAll('#g-online [data-rooms] .room')];

(async () => {
  const H = await page('방장'), G = await page('철수'), V = await page('구경꾼');
  check('처음엔 열린 방이 없다고 보임', await until(() => /열린 방이 없어/.test(V.querySelector('#g-online [data-rooms]').textContent)));
  check('대기실 인원 표시', await until(() => /지금 3명/.test(V.querySelector('#g-online [data-who]').textContent)));
  check('코드 입장은 접혀 있음', V.querySelector('#g-online .code-join') && !V.querySelector('#g-online .code-join').open);

  // 방 만들기 (제목에 HTML을 넣어 본다: 글자로만 보여야 하고 14자로 잘린다)
  H.querySelector('#g-online [data-title]').value = '<img src=x onerror=alert(1)> 초보환영방';
  H.querySelector('#g-online [data-create]').click();
  check('구경꾼 대기실에 방이 뜸', await until(() => rooms(V).length === 1));
  const row = rooms(V)[0], txt = row.textContent;
  check('방 정보: 방장/1명/대기 중', /방장 방장/.test(txt) && /1\/6명/.test(txt) && /대기 중/.test(txt) && /코드 [A-Z0-9]{4}/.test(txt));
  check('제목은 14자로 잘림', row.querySelector('b').textContent.length <= 14);
  check('제목의 HTML은 실행되지 않음(태그 안 생김)', !V.querySelector('#g-online [data-rooms] img') && row.querySelector('b').textContent.startsWith('<img'));
  check('철수 화면에도 같은 방이 보임', await until(() => rooms(G).length === 1));

  // 목록에서 클릭해서 입장
  rooms(G)[0].querySelector('button').click();
  check('철수가 클릭 한 번으로 입장', await until(() => !G.querySelector('#g-online [data-table]').hidden));
  check('입장하면 대기실 목록이 비워짐(연결 종료)', G.querySelector('#g-online [data-rooms]').children.length === 0);
  check('구경꾼 목록: 2/6명으로 갱신', await until(() => rooms(V).length === 1 && /2\/6명/.test(rooms(V)[0].textContent)));
  check('구경꾼 목록: 게임 중으로 갱신', await until(() => rooms(V).length === 1 && /게임 중/.test(rooms(V)[0].textContent), 15000));

  // 방장이 방을 닫으면 목록에서 사라지고, 방장은 대기실로 돌아옴
  const leave = () => [...H.querySelectorAll('#g-online [data-ctrl] button')].find(b => /방 닫고 나가기/.test(b.textContent));
  let ok = false;
  for (let i = 0; i < 400 && !ok; i++) {
    const call = H.querySelector('#g-online [data-a=call]'); if (call) call.click();
    const g = G.querySelector('#g-online [data-a=call]'); if (g) g.click();
    if (leave()) { leave().click(); ok = true; }
    await sleep(100);
  }
  check('방장이 "방 닫고 나가기"를 누를 수 있었음', ok);
  check('구경꾼 목록에서 방이 사라짐', await until(() => rooms(V).length === 0 && /열린 방이 없어/.test(V.querySelector('#g-online [data-rooms]').textContent), 10000));
  check('방장은 대기실로 돌아옴', !H.querySelector('#g-online [data-lobby]').hidden);
  check('철수도 대기실로 돌아옴', await until(() => !G.querySelector('#g-online [data-lobby]').hidden, 10000));

  // 코드로 입장(초대 링크 방식)도 그대로 동작
  H.querySelector('#g-online [data-title]').value = '';
  H.querySelector('#g-online [data-create]').click();
  await until(() => !H.querySelector('#g-online [data-table]').hidden);
  const code = H.querySelector('#g-online [data-code]').textContent;
  G.querySelector('#on-code').value = code; G.querySelector('#g-online [data-join]').click();
  check('코드 입장도 됨', await until(() => !G.querySelector('#g-online [data-table]').hidden));
  check('기본 제목은 "방장의 방"', await until(() => rooms(V).length === 1 && rooms(V)[0].querySelector('b').textContent === '방장의 방'));

  check('페이지 오류 없음', !errs.length); if (errs.length) console.log(errs);
  process.exit(fails ? 1 : 0);
})();
