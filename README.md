# 오케이 카지노

친구들이랑 가볍게 하는 게임머니 카지노. 빌드 없이 정적 파일만 있어서 Cloudflare Pages에 그대로 올리면 돼.
전부 가짜 게임머니라 실제 돈과 아무 관련 없어.

## 게임
- 블랙잭: 블랙잭 3:2, 딜러 17 스탠드, 더블
- 홀덤 (봇): 봇 3명, 블라인드 10/20, 노리밋, 사이드팟
- **온라인 홀덤**: 방 코드로 친구 2~6명이 같이 침. 초대 링크(`?room=코드`) 지원
- 룰렛: 유러피안(0 하나), 숫자/색/홀짝/더즌 베팅
- 슬롯: 릴 3개, 환수율 약 85%, 베팅 100만 고정. 키보드: **스페이스 = 스핀**, **엔터 두 번 = 리셋**. 돈이 100만보다 적으면 "돈이 부족해요"
- 룰렛·슬롯은 도는 중에 버튼(건너뛰기)을 누르거나, "스핀 연출 건너뛰기"를 켜 두면 결과가 바로 나와 (설정 저장)
- **노동**: 게임머니가 바닥나면 여기서 일해서 벌어. 전단지 돌리기(연타), 택배 분류(반응속도), 청소(기다리기). 리셋 버튼(두 번 눌러야 함)은 게임머니를 100만으로 되돌려. 모든 금액은 v2부터 100배 스케일(시작 100만, 블라인드 1,000/2,000).
- 랭킹: 잔액 상위 30명 (Supabase)

## 온라인 구조
- Supabase Realtime(Broadcast + Presence)만 사용. 방 하나가 채널 하나(`casino-room-코드`).
- 방장 브라우저가 게임을 진행하고(`js/online-engine.js`), 손님은 행동을 보내고 상태를 받아 그린다.
- 방장이 나가면 방이 닫히고 각자 남은 칩이 지갑으로 돌아온다.
- 랭킹 테이블 `casino_players`는 읽기만 열려 있고, 기록은 검증 함수 `casino_report`로만 한다.

### 알아둘 점 (친구용이라 이렇게 뒀어)
- 로그인이 없어서 누구든 코드만 알면 입장하고, 개발자도구를 열면 방 메시지에서 남의 패를 볼 수 있어.
- 잔액은 각자 브라우저에 저장돼서 조작이 가능하고, 랭킹도 자기 신고 값이야.
- 진짜 공정하게 하려면 서버(Edge Function)에서 카드를 섞고 나눠야 해.

## 실행/테스트
```
npx serve .
node test/poker-eval.test.js     # 족보 판정
node test/online-engine.test.js  # 엔진 시뮬레이션 (칩 보존)
node test/smoke.js               # 혼자 하는 4게임 UI
node test/online-smoke.js        # 가짜 Realtime으로 3인 온라인 UI
# 아래 둘은 jsdom이 필요해: npm i --no-save jsdom
node test/online-hands.test.js   # 온라인에서 손님도 핸드마다 자기 패가 보이는지
node test/work.test.js           # 노동 탭 (약 35초)
node test/skip.test.js           # 슬롯/룰렛 연출 건너뛰기
```

## 구조
- `js/core.js` 지갑(localStorage), 난수(crypto), 카드, 베팅바
- `js/poker-eval.js` 7장 중 베스트 5장 평가
- `js/{blackjack,roulette,slots,holdem}.js` 혼자 하는 게임
- `js/online-engine.js`, `js/online.js` 온라인 홀덤
- `js/work.js` 노동 (일해서 게임머니 벌기)
- `js/config.js` Supabase 공개 URL/anon 키, `js/leaderboard.js` 랭킹
