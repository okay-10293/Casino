# 오케이 카지노

친구들이랑 가볍게 하는 게임머니 카지노. 빌드 없이 정적 파일만 있어서 Cloudflare Pages에 그대로 올리면 돼.
전부 가짜 게임머니라 실제 돈과 아무 관련 없어.

## 게임
- 블랙잭: 블랙잭 3:2, 딜러 17 스탠드, 더블
- 텍사스 홀덤: 봇 3명, 블라인드 10/20, 노리밋, 사이드팟
- 룰렛: 유러피안(0 하나), 숫자/색/홀짝/더즌 베팅
- 슬롯: 릴 3개, 환수율 약 96%

## 실행
```
npx serve .        # 또는 아무 정적 서버
node test/poker-eval.test.js   # 핸드 평가기 테스트
node test/smoke.js             # playwright 스모크 테스트
```

## 구조
- `js/core.js` 지갑(localStorage), 난수(crypto), 카드, 베팅바
- `js/poker-eval.js` 7장 중 베스트 5장 평가
- `js/{blackjack,roulette,slots,holdem}.js` 게임별 모듈

게임머니는 브라우저(localStorage)에 저장돼서 기기마다 따로야. 멀티플레이는 아직 없음.
