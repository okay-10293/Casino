// node test/ui.test.js — 터치(아이패드 사파리) 사용성: 선택 버튼, 키보드, 홈 화면 설정, 터치 hover 방지. (npm i --no-save jsdom)
const fs = require('fs'), path = require('path');
const { openPage, sleep } = require('./jsdom-page');
const root = path.join(__dirname, '..');
const errs = [];
let fails = 0; const check = (n, c) => { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) fails++; };
const dom = openPage('#online', errs), w = dom.window, d = w.document;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

(async () => {
  await sleep(100);
  // 게임 고르기: select 대신 선택 버튼. 기존처럼 .value 로 읽고 쓸 수 있어야 한다
  const seg = d.querySelector('#on-game'), btns = [...seg.querySelectorAll('button')];
  check('게임 고르기는 select가 아니라 선택 버튼', seg.tagName === 'DIV' && seg.getAttribute('role') === 'radiogroup' && btns.length === 2 && !d.querySelector('#g-online select'));
  check('기본값은 홀덤', seg.value === 'holdem' && btns[0].classList.contains('on') && btns[0].getAttribute('aria-checked') === 'true');
  let fired = 0; seg.addEventListener('change', () => fired++);
  btns[1].click();
  check('누르면 블랙잭으로 바뀌고 change 발생', seg.value === 'blackjack' && btns[1].classList.contains('on') && !btns[0].classList.contains('on') && fired === 1);
  seg.value = 'holdem';
  check('코드에서 value를 넣어도 표시가 맞춰짐(이벤트는 없음)', btns[0].classList.contains('on') && btns[0].getAttribute('aria-checked') === 'true' && btns[1].getAttribute('aria-checked') === 'false' && fired === 1);
  seg.value = '엉뚱한값';
  check('없는 값은 무시', seg.value === 'holdem');

  // 키보드
  const name = d.querySelector('#player-name'), code = d.querySelector('#on-code');
  check('이름 입력: 자동수정/대문자 끔, 엔터=완료', name.getAttribute('autocorrect') === 'off' && name.getAttribute('autocapitalize') === 'off' && name.getAttribute('enterkeyhint') === 'done');
  check('방 코드 입력: 대문자, 자동수정 끔, 엔터=이동', code.getAttribute('autocapitalize') === 'characters' && code.getAttribute('autocorrect') === 'off' && code.getAttribute('enterkeyhint') === 'go');
  name.focus(); check('이름칸에 포커스', d.activeElement === name);
  name.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('엔터를 누르면 키보드가 닫힘(포커스 해제)', d.activeElement !== name);

  // 홈 화면에 추가 (사파리 주소창 없이 전체 화면)
  const meta = n => (html.match(new RegExp('<meta name="' + n + '" content="([^"]*)"')) || [])[1];
  check('홈 화면 앱 메타', meta('apple-mobile-web-app-capable') === 'yes' && meta('theme-color') === '#0a1511' && !!meta('apple-mobile-web-app-title'));
  const icon = (html.match(/rel="apple-touch-icon" href="([^"]+)"/) || [])[1];
  check('홈 화면 아이콘 파일이 있음', !!icon && fs.existsSync(path.join(root, icon)));
  const mf = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  check('manifest: 전체 화면 + 아이콘 파일 존재', mf.display === 'standalone' && mf.icons.length >= 2 && mf.icons.every(i => fs.existsSync(path.join(root, i.src))));

  // 터치 hover 고착 방지: hover 규칙은 전부 (hover: hover) 안에 있어야 한다
  const hoverLines = css.split('\n').filter(l => /:hover/.test(l));
  check('모든 :hover 규칙이 (hover: hover) 안에 있음', hoverLines.length > 0 && hoverLines.every(l => /@media \(hover: hover\)/.test(l)));
  // 입력창 글자는 16px 이상이어야 사파리가 확대하지 않는다
  check('입력창 글자 16px', /:where\(input[^}]*font-size: 16px/.test(css.replace(/\n/g, ' ')) && /\.wallet input \{[^}]*font-size: 16px/.test(css));
  check('당겨서 새로고침 방지', /overscroll-behavior-y: none/.test(css));

  // 옛 이름이 남아 있지 않음 (패치노트 옛 항목은 제외)
  const stale = fs.readdirSync(path.join(root, 'js')).filter(f => f !== 'patchnotes.js' && /친구랑 홀덤/.test(fs.readFileSync(path.join(root, 'js', f), 'utf8')));
  check('옛 탭 이름("친구랑 홀덤")이 남아 있지 않음', stale.length === 0);

  // 탭 전환이 오류 없이 되고 고른 탭이 표시됨
  d.querySelector('#tabs [data-tab=work]').click(); await sleep(50);
  check('탭 전환', d.querySelector('#tabs .on').dataset.tab === 'work' && !d.querySelector('#g-work').hidden);
  check('페이지 오류 없음', !errs.length); if (errs.length) console.log(errs);
  process.exit(fails ? 1 : 0);
})();
