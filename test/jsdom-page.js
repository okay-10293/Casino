// 테스트용: index.html을 jsdom에 올린다. 외부 스크립트는 인라인으로 바꾸고 supabase는 가짜(fake-supabase.js)로 대체.
// 사용: npm i --no-save jsdom
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const fake = fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');

function pageHtml() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<link[^>]*>/g, '');
  return html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) =>
    '<script>' + (/supabase/.test(src) ? fake : fs.readFileSync(path.join(root, src.split('?')[0]), 'utf8')) + '</script>');
}

// 새 "브라우저 탭" 하나. 같은 프로세스의 탭끼리는 BroadcastChannel로 방 메시지를 주고받는다.
function openPage(hash, errs, seed) {   // seed: 페이지가 뜨기 전에 localStorage에 미리 넣어 둘 값 { 키: 값 }
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(e.detail || e.message));
  return new JSDOM(pageHtml(), {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'http://localhost/' + (hash || ''),
    beforeParse(w) { w.BroadcastChannel = BroadcastChannel; Object.keys(seed || {}).forEach(k => w.localStorage.setItem(k, seed[k])); }
  });
}
module.exports = { openPage, sleep: ms => new Promise(r => setTimeout(r, ms)) };
