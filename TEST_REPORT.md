# A.N.K. v0.9.1 — 로컬 검증 기록

- 실행 환경: Linux, Node.js v22.22.0 (COFA Probe 실환경과는 다름)
- 실행: `node --test tests/*.test.mjs`
- 결과: **29 tests PASS / 0 fail**
- 테스트 대상: 기존 v0.8 WORKSTATE 12개 + v0.9 QA 실행·증거·복구·상태 연결 15개 + v0.9.1 2개
  - `.ank/`는 과제 `.gitignore`가 아닌 `.git/info/exclude`에만 1회 추가, 하위 폴더에서 상위 `.git` 탐색, `.git` 파일(worktree)은 건너뜀
  - Gate PASS 저장 시에만 `commitHint` 출력, `npx`는 `npm run` 대안 안내와 함께 차단
- E2E 검증(v0.9): 합성 계산기 프로젝트에서 `LOCAL → IMPACT → GLOBAL → 수동 산술 확인 → Gate PASS → 스냅샷 생성 → 의도된 곱셈 회귀 → Gate HOLD → 복원 DRY_RUN → 복구 APPLY → 이전 증거 HOLD → 세 단계 재검증 → Gate PASS`를 실행함.
- 허위 PASS 탐지: Node 테스트 내부에서 자식 `node --test`가 실행되지 않고 exit 0을 반환하는 문제를 발견하고, `NODE_TEST_CONTEXT` 전파 차단 및 테스트 0개 방어를 추가함.

**범위 제한:** `manual` 상태를 기록하는 CLI 동작은 단위테스트에서 테스트용 입력으로 시뮬레이션했으며, 이는 실제 사람이 웹 화면을 검증했다는 증거가 아니다. 실제 시험 환경·Git Clone·브라우저 미리보기·AGENTS.md 로딩·로컬 커밋·서술형 평가의 효용은 사전 체험 및 모의 과제로 추가 검증해야 한다. 테스트 계획이 포괄하지 않은 회귀, 외부 서비스 상태, 수동 검증의 진실성은 이 프로그램으로 보증되지 않는다.
