/* 랭킹: 내 잔액을 Supabase에 기록하고 상위 30명을 보여준다 */
(function () {
  'use strict';
  var C = Casino, sb = window.CasinoSB;
  var root = document.getElementById('g-ranking');
  root.innerHTML =
    '<div class="panel"><div class="bet-line"><span>잔액 랭킹</span><button type="button" data-refresh class="ghost">새로고침</button></div>' +
    '<ol class="rank" data-list></ol><p class="rule" data-note></p></div>';
  var listEl = root.querySelector('[data-list]'), noteEl = root.querySelector('[data-note]');

  if (!sb) { noteEl.textContent = '서버에 연결하지 못했어. 새로고침해봐.'; return; }

  var lastSent = null, timer = null;
  function report() {
    var money = C.money(), name = C.playerName();
    var key = name + '|' + money;
    if (key === lastSent) return;
    lastSent = key;
    sb.rpc('casino_report', { p_id: C.playerId(), p_name: name, p_money: money }).then(function (r) {
      if (r.error) lastSent = null;
    }, function () { lastSent = null; });
  }
  C.onChange(function () { clearTimeout(timer); timer = setTimeout(report, 4000); });

  async function load() {
    noteEl.textContent = '불러오는 중…';
    var r = await sb.from('casino_players').select('id,name,money,peak').order('money', { ascending: false }).limit(30);
    listEl.innerHTML = '';
    if (r.error) { noteEl.textContent = '랭킹을 불러오지 못했어.'; return; }
    noteEl.textContent = r.data.length ? '' : '아직 아무도 없어. 게임을 한 판 하면 올라가.';
    r.data.forEach(function (row) {
      var li = document.createElement('li');
      if (row.id === C.playerId()) li.className = 'me';
      var n = document.createElement('span'); n.className = 'rn'; n.textContent = row.name;
      var m = document.createElement('b'); m.textContent = C.fmt(row.money);
      var p = document.createElement('small'); p.textContent = '최고 ' + C.fmt(row.peak);
      li.appendChild(n); li.appendChild(m); li.appendChild(p);
      listEl.appendChild(li);
    });
  }
  root.querySelector('[data-refresh]').addEventListener('click', load);
  document.addEventListener('casino:tab', function (e) { if (e.detail === 'ranking') { report(); setTimeout(load, 400); } });
})();
