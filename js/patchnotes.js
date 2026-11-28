/* 패치노트: 헤더의 "패치노트" 버튼으로 열고, 새 버전이 나오면 처음 한 번 자동으로 띄운다.
   새 내용을 쓸 때는 NOTES 맨 위에 항목을 추가하면 된다(id는 날짜/버전, 바뀌면 다시 뜬다). */
(function () {
  'use strict';
  var SEEN_KEY = 'okay-casino-patch-seen';

  var NOTES = [
    { id: '2026-11-28e', date: '11월 28일 (밤)', title: '우리만의 가상 코인', items: [
      '비트코인 탭을 \"코인\" 탭으로 바꾸고 우리끼리 만든 가상 코인 10개를 추가했습니다. 은혁코인(👑), 푼돈코인, 치킨코인, 라면코인, 루나코인, 달토끼코인, 오케이코인, 거북코인, 번개코인, 다이아코인입니다.',
      '가격대가 다양합니다. 푼돈코인은 한 개에 몇십 원, 다이아코인은 한 개에 250만 원쯤입니다. 싼 코인은 많이 사서 한 방을, 비싼 코인은 묵직하게 노릴 수 있습니다.',
      '코인마다 성격이 다릅니다. 거북코인은 얌전하고, 치킨코인과 푼돈코인은 급등락이 심하고, 루나코인은 가끔 폭락합니다. 30분마다 급등이나 급락이 터질 수 있습니다(거북코인 제외).',
      '가상 코인 시세는 지금 시각으로 계산해서, 접속한 모두에게 같은 가격이 보입니다. 지난 1시간 그래프도 열자마자 나옵니다.',
      '비트코인은 그대로 실제 시세를 따라갑니다. 코인 목록에서 가격과 등락률을 한눈에 보고, 눌러서 사고팔 수 있습니다. 위쪽에 코인 전체 평가금액과 손익이 표시됩니다.',
      '예전에 산 비트코인은 그대로 이어받습니다. 리셋하면 모든 코인이 함께 초기화됩니다. 전부 가짜 게임머니이며 실제 돈과 관계없습니다.'
    ] },
    { id: '2026-11-28d', date: '11월 28일 (저녁)', title: '비트코인 탭', items: [
      '비트코인 탭을 추가했습니다. 게임머니로 비트코인을 사고팔며 시세 변동에 따른 손익을 볼 수 있습니다.',
      '시세는 실시간 비트코인 가격(Coinbase)을 10초마다 가져옵니다. 1달러는 게임머니 1,400으로 계산합니다. 연결이 안 되면 시뮬레이션 가격으로 움직이고, 화면에 표시됩니다.',
      '살 금액을 직접 입력하거나 10%, 25%, 50%, 전부 버튼으로 고를 수 있습니다. 사고팔 때 각각 수수료 0.1%가 붙습니다.',
      '보유 수량, 평가금액, 투자원금, 손익(%)과 최근 가격 그래프를 보여줍니다. 리셋하면 보유한 비트코인도 함께 초기화됩니다.',
      '전부 가짜 게임머니입니다. 실제 비트코인이나 돈과는 아무 관계가 없고 입출금도 없습니다. 보유한 비트코인은 랭킹 잔액에 포함되지 않습니다.'
    ] },
    { id: '2026-11-28c', date: '11월 28일', title: '화면 사용성 개선', items: [
      '손가락으로 누른 버튼에 테두리가 계속 남던 문제를 고쳤습니다. 누르는 순간 버튼이 살짝 눌리는 표시도 생겼습니다.',
      '탭 줄을 화면 위에 고정했습니다. 아래로 내려가도 바로 다른 게임으로 갈 수 있고, 고른 탭은 가운데로 옵니다. 탭이 더 있으면 가장자리에 표시가 보입니다.',
      '사파리 기본 모양이던 입력창(바이인, 방 제목, 방 코드), 게임 고르기, 접기 메뉴, 레이즈 슬라이더를 앱 모양으로 바꿨습니다. 슬라이더는 손가락으로 잡기 쉽게 키웠습니다.',
      '입력창을 누르면 화면이 확대되던 문제를 막았고, 엔터를 누르면 키보드가 닫힙니다. 이름 칸은 누르면 전체가 선택됩니다.',
      '폰에서 리셋 버튼이 아래 줄로 떨어지던 헤더를 한 줄로 정리했습니다. 대기실의 방 정보도 숫자가 중간에서 끊기지 않습니다.',
      '아래로 당겨서 새로고침되던 동작을 막았습니다. 게임 도중 실수로 날아가는 일이 없습니다.',
      '사파리에서 \"홈 화면에 추가\"하면 주소창 없이 전체 화면으로 쓸 수 있고, 아이콘도 생겼습니다.',
      '혼자 홀덤 안내에 남아 있던 옛 탭 이름을 고쳤습니다.'
    ] },
    { id: '2026-11-28b', date: '11월 28일 (추가)', title: '온라인 대기실', items: [
      '\"친구랑 같이\" 탭에 대기실을 추가했습니다. 열린 방 목록에서 입장 버튼만 누르면 코드 없이 바로 들어갈 수 있습니다.',
      '방을 만들 때 방 제목을 붙일 수 있습니다. 비워 두면 \"이름의 방\"으로 표시됩니다. 목록에는 방장, 게임(홀덤 또는 블랙잭), 코드, 인원, 대기 중 또는 게임 중이 보입니다.',
      '대기실에 지금 몇 명이 있는지 표시됩니다. 방장이 방을 닫으면 목록에서도 바로 사라집니다.',
      '코드로 입장하기와 초대 링크도 그대로 쓸 수 있습니다. 대기실 아래에 접어 두었습니다.'
    ] },
    { id: '2026-11-28', date: '11월 28일', title: '온라인 블랙잭', items: [
      '"친구랑 같이" 탭에서 방을 만들 때 텍사스 홀덤과 블랙잭 중에 고를 수 있도록 했습니다. 입장하는 친구는 방 코드만 넣으면 됩니다.',
      '블랙잭 방은 딜러 한 명과 친구들(최대 6명)이 겨룹니다. 베팅 시간(20초)이 지나면 한 명씩 차례로 카드 받기, 멈추기, 2배로 한 장 중에서 고릅니다.',
      '규칙은 혼자 하는 블랙잭과 같습니다. 블랙잭 1.5배, 동점은 베팅금 반환, 딜러 유리 확률 보정도 똑같이 적용됩니다.',
      '블랙잭 방은 바이인이 최소 100만입니다. 판 도중에 나가면 그 판 베팅은 돌려받지 못합니다.',
      '"친구랑 홀덤" 탭 이름을 "친구랑 같이"로 바꿨습니다.',
      '패치노트 보기를 추가했습니다.'
    ] },
    { id: '2026-11-27c', date: '11월 27일 (밤)', title: '금액 100배, 슬롯 키보드', items: [
      '모든 금액을 100배로 올렸습니다. 리셋 금액은 100만이며, 예전에 저장된 돈은 자동으로 100배가 됩니다.',
      '슬롯: 스페이스바로 스핀할 수 있고, 베팅은 100만으로 고정했습니다. 돈이 부족하면 안내가 표시됩니다. 엔터를 두 번 누르면 리셋됩니다.',
      '더블탭 확대를 막았고, 빠르게 연타하면 눌림이 씹히던 문제를 고쳤습니다.'
    ] },
    { id: '2026-11-27b', date: '11월 27일 (오후)', title: '홀덤 편의, 밸런스 조정', items: [
      '홀덤: 바이인을 직접 입력할 수 있게 했습니다(전 재산의 80%까지). 족보 표를 추가했고, 지금 내 족보를 표시합니다.',
      '온라인 홀덤: 내 패가 사라지던 문제를 고쳤습니다. 패 메시지가 유실돼도 방장에게 다시 받아옵니다.',
      '슬롯 배당을 조정했습니다. 체리 두 개 x2, 레몬 세 개 x7이며 환수율은 약 85%입니다.',
      '블랙잭: 딜러에게 유리한 확률 보정을 적용했습니다. 동점은 그대로 베팅금을 돌려줍니다.'
    ] },
    { id: '2026-11-27a', date: '11월 27일 (오전)', title: '노동 탭, 건너뛰기', items: [
      '노동 탭을 추가했습니다. 돈이 떨어지면 일해서 벌 수 있습니다.',
      '슬롯과 룰렛에서 스핀 연출을 건너뛸 수 있습니다. 항상 건너뛰기 설정도 저장됩니다.',
      '리셋 버튼은 두 번 눌러야 적용됩니다.',
      '캐시 때문에 화면이 비던 문제를 막으려고 파일 주소에 버전을 붙였습니다.'
    ] },
    { id: '2026-11-27', date: '11월 27일', title: '오케이 카지노 오픈', items: [
      '블랙잭, 텍사스 홀덤(봇), 룰렛, 슬롯 네 가지로 시작했습니다.',
      '온라인 홀덤: 방 코드나 초대 링크로 친구 2~6명이 함께 칠 수 있습니다.',
      '랭킹 탭에서 잔액 상위 30명을 볼 수 있습니다.',
      '블랙잭과 홀덤 용어를 쉬운 말로 바꾸고 설명을 넣었습니다.'
    ] }
  ];

  var latest = NOTES[0].id;
  function readSeen() { try { return localStorage.getItem(SEEN_KEY); } catch (e) { return null; } }
  function writeSeen() { try { localStorage.setItem(SEEN_KEY, latest); } catch (e) {} }

  var btn = document.getElementById('patch-btn');
  var overlay = null, lastFocus = null;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'modal'; overlay.hidden = true;
    var box = document.createElement('div');
    box.className = 'modal-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', '패치노트');
    var head = document.createElement('div'); head.className = 'modal-head';
    var h = document.createElement('h2'); h.textContent = '패치노트';
    var close = document.createElement('button'); close.type = 'button'; close.className = 'ghost'; close.textContent = '닫기'; close.setAttribute('data-close', '');
    head.appendChild(h); head.appendChild(close); box.appendChild(head);
    var body = document.createElement('div'); body.className = 'modal-body';
    NOTES.forEach(function (n, i) {
      var sec = document.createElement('section'); sec.className = 'note';
      var t = document.createElement('h3'); t.textContent = n.title;
      if (i === 0) { var tag = document.createElement('span'); tag.className = 'new'; tag.textContent = 'NEW'; t.appendChild(tag); }
      var d = document.createElement('small'); d.textContent = n.date;
      var ul = document.createElement('ul');
      n.items.forEach(function (x) { var li = document.createElement('li'); li.textContent = x; ul.appendChild(li); });
      sec.appendChild(t); sec.appendChild(d); sec.appendChild(ul); body.appendChild(sec);
    });
    box.appendChild(body); overlay.appendChild(box); document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay || e.target.closest('[data-close]')) hide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay && !overlay.hidden) hide(); });
  }
  function show() {
    if (!overlay) build();
    lastFocus = document.activeElement;
    overlay.hidden = false;
    var c = overlay.querySelector('[data-close]'); if (c) c.focus();
  }
  function hide() {
    if (!overlay) return;
    overlay.hidden = true; writeSeen(); markSeen();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function markSeen() { if (btn) btn.classList.toggle('unseen', readSeen() !== latest); }

  if (btn) btn.addEventListener('click', show);
  markSeen();
  if (readSeen() !== latest) show();     // 새 버전이면 처음 한 번 자동으로 띄운다

  window.PatchNotes = { show: show, latest: latest, notes: NOTES };
})();
