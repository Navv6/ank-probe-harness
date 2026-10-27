# A.N.K. v0.9.2 — COFA Probe Intent & QA Harness

> **의도 정렬 → 변경 → 버그 탐색 → LOCAL/IMPACT/GLOBAL 검증 → WORKSTATE 갱신 → 안전 복구**. 180분 과제를 위한 사람이 통제하는 범용 도구. 실제 출제 과제의 답안을 미리 준비하지 않습니다.

## 무엇이 달라졌나

- **v0.9.2 안정화:** `inspect`는 Git 설정을 변경하지 않는 조회 전용. `.ank/` 제외는 `git-setup`에서만 적용. 코드·테스트·설정·SQL·정적 자산 등이 `trackedPaths` 밖에 남으면 Gate 실행 전 차단(확인 가능한 파일 유형 기준). Gate PASS 시 과제 절대 경로를 쓰는 Git 커밋 제안과 WORKSTATE·qa-plan 포함. `git-restore`는 DRY_RUN 기본, 구조 백업 및 증거 무효화를 수행. 현재 브랜치의 원격 직접 실행 검증은 별도 필요.


- **v0.9.1 (공식 안내 PDF 대조 반영):**
  - **로컬 git 커밋을 기본 SAFE로**: git 로그·diff가 평가 자료로 수집되므로(가이드 9장) Gate PASS마다 로컬 커밋. `gate`가 PASS일 때 `commitHint` 출력.
  - **`.ank/` 자동 제외**: `qa.mjs`가 과제의 `.gitignore`는 건드리지 않고 `.git/info/exclude`에만 `.ank/`를 추가해 `git add -A`·수집 diff에 섞이지 않게 함.
  - **제출 문서 EXPORT·서술형 PRE-SUBMIT BRIEF 카드** 추가(`START.md` 8·9).
  - Browser `0.0.0.0` 바인딩, Codex `/model`·승인 대기 구분, AGENTS.md 배치 규칙, 사전 체험 15분 순서표, `npx` 대안 안내.

- **v0.8 유지:** `WORKSTATE.md` 한 장에 WHY/WHAT/WHERE/HOW/DONE, R→D→T→E, 7줄 Handoff.
- **v0.9 신규:** `tools/qa.mjs`에서 프로젝트의 **실제 테스트 명령**을 로컬 실행해 종료 코드·출력·시간·코드 해시 기록.
- **회귀 방지:** LOCAL·IMPACT·GLOBAL CORE 세 계층을 **같은 코드 해시와 같은 검사 계획**에서 통과해야 Gate PASS.
- **화면 검증:** 내장 Browser의 수동 확인은 `manualChecks`로 별도 기록. 자동 화면 조작(Computer Use)은 하지 않음.
- **버그 추적:** 심각도 P0/P1 미해결 상태에서는 Gate HOLD. 이슈 등록·해결 시 과거 테스트 증거 무효화.
- **복구:** 선택한 파일 범위를 로컬 `.ank/snapshots`에 복사하고 무결성 검사. 복구 기본값은 **미리보기(DRY_RUN)**이며 `--apply`로 명시적으로 실행. 복원 전 파일은 `.ank/rescues`에 보존. 복원 후 테스트 재실행 전 DONE/SAFE 금지.
- **WORKSTATE 엄격 검증(선택):** `DONE`의 `QA_GATE=...` 파일을 실제 현재 코드·계획·검사 기준과 비교함.

## COFA Probe 공식 가이드에 따른 제약

시험 환경에는 Web IDE, 파일 탐색기, 터미널, 제공 Codex CLI 및 내장 Browser가 안내되어 있습니다. `codex` 실행 후 `/status`에서 권한을 확인합니다. 일부 허용 명령은 승인 없이 실행될 수 있으므로 **AI의 실제 변경과 실행 로그를 사용자가 확인**합니다.

개인 PC 파일 업로드 금지, **일반 공개 GitHub 자료는 허용 범위에서 Git Clone/다운로드 가능**, Git Push/시험 파일 외부 전송 금지, 별도 외부 AI·개인 API 키·Computer Use 금지, 외부 브라우저 직접 접근 제한. 과제 README와 운영 규정이 항상 우선합니다. 후속 서술형(작업 후)에서는 AI·복사붙여넣기가 금지됩니다. 토큰 사용량은 추적될 수 있습니다.

관련 근거: 「2차 예선 시험 필수 확인 사항」(1쪽) 제한 사항·추가 안내사항, 「사전 체험 및 응시환경 상세 가이드」 3장(사전 체험)·5장(웹 IDE·Codex·Browser)·6장(파일·제출 문서)·7장(시간과 제출)·8장(후속 서술형)·9장(도구·감독 규칙·수집 기록).

**Node.js 런타임이 있는지 사전 체험에서 확인하세요.** QA CLI는 Node **18 이상**을 사용하며 설치 패키지는 없습니다. 사용할 수 없는 경우 `START.md`, `WORKSTATE.md`, `QA_CHECKCARD.md`의 수동 절차만 써도 됩니다.

## 파일 구조

```text
AGENTS.md                  Codex 작업 원칙 (자동 적용 여부 미확인)
START.md                   ALIGN·BUILD·BUG DISCOVERY·FIX·CHECK·HANDOFF 지시 카드
WORKSTATE.md               단일 작업 상태 기록 원본
QA_CHECKCARD.md            버그 탐색/회귀/수동 UI/복구 체크카드
DESIGN_v0.9.md             상세 품질 게이트 설계와 제한
DESIGN_v0.8.md             이전 설계 기록
PROBE_CHECKLIST.md         사전 체험·운영·제출 점검
qa-plan.template.json      실제 과제별로 수정할 검사 계획 예시

tools/state.mjs            WORKSTATE 정적 검사 + 7줄 Handoff + QA_GATE 엄격 검증
tools/qa.mjs               실제 로컬 테스트·Gate·이슈·스냅샷 실행
examples/demo-app/        가상 계산기 과제(실제 대회 문제 아님)
tests/*.test.mjs           하네스 자체 통합 테스트
```

## 0단계: 가져오기

사전에 **공개 저장소**에 올려두고, 사전 체험으로 Git Clone 허용 범위를 확인합니다. 실제 과제 파일은 공개 저장소로 올리지 마세요. 원래 과제의 파일 구조·제출 경로가 우선하며, 하네스 추가 파일이 과제 결과물을 대체해서는 안 됩니다.

**배치 위치:** 작업 공간 파일은 제출물로 수집되므로(가이드 9장), 가능하면 툴킷은 과제 폴더 **밖**에 clone하고 `--project`로 과제를 가리킵니다. 작업 공간 밖에 쓰기 권한이 없으면 `_ank/` 같은 하위 폴더에 두고 제출 전 남길지 판단합니다. 어느 쪽이 가능한지는 사전 체험에서 확인합니다.

```bash
cd ~ && git clone https://github.com/Navv6/ank-probe-harness.git ank   # 과제 폴더 밖 (가능한 경우)
node ~/ank/tools/qa.mjs inspect --project ~/workspace  # 조회만, Git 설정 변경 없음
node ~/ank/tools/qa.mjs git-setup --project ~/workspace  # 명시적으로 Git 제외 설정                   # 경로는 실제 작업 공간에 맞게
```

**AGENTS.md 적용:** Codex CLI는 통상 실행 위치(git 루트~현재 폴더)의 `AGENTS.md`를 읽으므로, 하위 폴더에 clone한 툴킷의 `AGENTS.md`는 과제 루트에서 실행한 Codex에 적용되지 않습니다.
1. 과제 루트에 `AGENTS.md`가 **이미 있으면 덮어쓰지 않습니다.** 과제 설정이 우선이며, 필요한 원칙은 `START.md` 카드로 입력합니다.
2. 없을 때만 과제 루트로 복사합니다. 이 파일도 제출물·"AI 도구 설정" 수집 대상이 됩니다.
3. 적용 여부는 Codex에 "현재 적용 중인 AGENTS.md 지침을 3줄로 요약해줘"로 확인하고, 확인 전에는 미적용으로 간주합니다.

## 1단계: 환경·의도 정렬 (런타임 불필요)

1. 과제 `README` / 실무자 에이전트로 요구사항을 확인합니다.
2. `START.md`의 ALIGN을 제공 Codex에 입력하되 최초 **읽기/분석 단계에선 변경 금지**를 요청합니다.
3. 사용자가 WHY/WHAT/WHERE/HOW/DONE을 확정하고, `WORKSTATE.md`에 `GOAL`, `LOCKED`, 요구 R, 결정 D, 작업 T를 최소로 입력합니다.
4. 테스트 대상이 되는 핵심 기능 목록을 정하고, 코드 변경 전 기준 동작(BASELINE)을 확인합니다.

## 2단계: QA 계획 구성 (선택 CLI)

실제 프로젝트 루트에 `qa-plan.json`을 만듭니다. `qa-plan.template.json`을 참고하되 명령과 추적 경로를 **해당 프로젝트 실제 구조에 맞게** 변경하세요.

```json
{
  "version": 1,
  "trackedPaths": ["src", "tests", "package.json"],
  "suites": {
    "local": [{"id":"unit","argv":["npm","test"],"timeoutSeconds":60}],
    "impact": [{"id":"related","argv":["npm","run","test:related"],"timeoutSeconds":60}],
    "global": [{"id":"smoke","argv":["npm","run","test:core"],"timeoutSeconds":60}]
  },
  "manualChecks": [{"id":"ui-main","phase":"global","title":"내장 Browser에서 핵심 사용자 흐름 직접 확인"}]
}
```

`qa.mjs`가 실행하는 명령은 `node`, `python(3)`, `pytest`, `npm`, `pnpm`, `yarn`, `go`, `cargo`만 허용합니다. `npx`(외부 패키지를 내려받을 수 있음)·`bash` 스크립트 기반 테스트는 `package.json`의 `scripts`에 등록한 뒤 `["npm","run","<script>"]`로 실행하세요.

위 JSON의 `test:related`, `test:core` 등은 **실제 프로젝트에 해당 스크립트가 있을 때만 사용**합니다. 자동 테스트가 없다면 빈 배열로 두되, 해당 단계에 사용자가 직접 검증할 수 있는 `manualChecks`를 하나 이상 정의하세요. CLI는 임의 명령을 자동 설치하거나 제공하지 않습니다.

**중요:** `trackedPaths`에 실제 변경 가능한 파일·테스트·설정 파일을 모두 포함해야 해시 기반 증거가 유효합니다. 누락된 파일의 변경은 감지되지 않습니다.

## 3단계: 부분 수정 → 부분 검증 → 영향 검증 → 전체 검증

프로젝트가 `./task`이고 툴킷이 현재 디렉터리라고 가정한 예시:

```bash
node tools/qa.mjs inspect --project ./task
node tools/qa.mjs run --project ./task --task T01 --phase local
node tools/qa.mjs run --project ./task --task T01 --phase impact
node tools/qa.mjs run --project ./task --task T01 --phase global
```

내장 Browser 또는 실제 터미널 화면에서 **본인이 확인한 결과만** 기록합니다.

```bash
node tools/qa.mjs manual --project ./task --task T01 --check ui-main --result PASS --note "입력, 이동, 저장 및 출력 정상 확인"
node tools/qa.mjs gate --project ./task --task T01
```

- Gate **PASS**: 정의한 검사 계획에서 현재 코드에 대한 세 단계의 실행/수동 확인이 확인됨. 작업 완료와 일반적인 무결함을 보장하지 않음.
- Gate **HOLD**: 실행/검증 누락, 실패, 파일/계획 변경, 미해결 P0/P1 발생. 변경 승인 금지.
- 실제 테스트 결과는 프로젝트 `.ank/qa/T01`에 기록되고 Gate 실행 시 통과/차단 근거 파일이 생성됩니다.
- `gate`는 Node 프로세스가 실행한 명령의 종료 코드·출력을 저장하지만, **테스트 코드 자체가 충분한지는 검증하지 못합니다.** 사람이 반드시 검토해야 합니다.

### WORKSTATE의 DONE은 실증된 Gate와 연결

`EVIDENCE`에 Gate 출력의 `savedTo` 경로를 기록합니다.

```text
- E01 | T01 | LOCAL=PASS | IMPACT=PASS | GLOBAL=PASS | DETAILS: QA_GATE=.ank/qa/T01/gate-<ID>.json; 주요 검증 동작을 본인 확인
```

검증 실행파일과 WORKSTATE가 **같은 과제 프로젝트에 위치할 경우**:

```bash
node tools/state.mjs check ./task/WORKSTATE.md --qa-project ./task
```

`--qa-project`가 없으면 v0.8과 같이 **문서 구조만** 검사합니다. 엄격 모드라도 QA 계획 밖의 결함과 허위 수동 입력은 자동 판별할 수 없습니다.

## 4단계: 버그 발견 → 수정 → 다시 세 단계 검증

```bash
node tools/qa.mjs issue-add --project ./task --task T01 --severity P1 --summary "핵심 저장 실패" --repro "항목 수정 후 저장 버튼 클릭 시 사라짐"
# 사용자가 수정 범위를 승인 → Codex 또는 에디터로 필요한 변경 적용
node tools/qa.mjs issue-resolve --project ./task --id B001 --note "원인 수정 완료, 전체 재검증 필요"
# LOCAL + IMPACT + GLOBAL + 수동 확인을 전부 재실행
```

이슈 등록/해결 시 과거 결과가 무효화되어 새 테스트가 필요합니다. `P2/P3`가 남아 있으면 Gate 출력에 위험으로 남고, 우선순위와 제출 여부는 사용자가 판단합니다.

## 5단계: 마지막 정상 상태 보존 및 복구

### 기본: 로컬 git 커밋 (권장)

git 로그·diff·테스트 결과는 평가 자료로 수집되고(가이드 9장), 금지된 것은 **Git Push**뿐입니다. 따라서 Gate PASS마다 로컬 커밋을 남기는 것이 가장 좋은 SAFE이자 작업 이력입니다. `gate`가 PASS면 `commitHint`로 명령을 제안합니다.

```bash
git add -- src tests && git commit -m "T01: LOCAL/IMPACT/GLOBAL PASS (gate-<ID>)"   # push 금지
git restore --source=<커밋> -- src        # 복구도 이력이 남는 방식으로
```

- 과제 폴더가 git 저장소가 아니면 `git init` 여부는 과제 안내를 먼저 확인합니다.
- `qa.mjs`는 `.git/info/exclude`에 `.ank/`를 추가해 증거·스냅샷이 커밋되지 않게 합니다(과제 `.gitignore`는 수정하지 않음). `inspect` 출력의 `localExclude`로 확인합니다.
- 마감 직전 대량 복원은 "결과물 통째 대체"로 오해받을 수 있으므로(필수 확인 사항, 가이드 9장) 커밋 이력으로 설명 가능하게 합니다.

### 보조: `.ank` 스냅샷 (git을 쓸 수 없을 때)

**검증을 통과한 코드에서** 스냅샷을 만들면 확인된 테스트 Gate를 함께 기록할 수 있습니다.

```bash
node tools/qa.mjs snapshot-create --project ./task --task T01 --label "T01 안정 상태"
node tools/qa.mjs snapshot-verify --project ./task --id S-<ID>
node tools/qa.mjs snapshot-restore --project ./task --id S-<ID>      # DRY_RUN
node tools/qa.mjs snapshot-restore --project ./task --id S-<ID> --apply  # 실제 복원, 신중히!
```

복원은 `trackedPaths` **전체를 교체**합니다. 현재 파일은 `.ank/rescues`에 남으며, 다른 범위의 파일은 복원하지 않습니다. 적용 전 DRY_RUN의 대상과 범위를 확인하세요. 복원 후 Gate 재실행 전엔 정상 상태로 인정하지 않습니다. `SAFE`에는 **직접 검증한 실제 복원 경로**만 기록합니다.

**제출 전:** `.ank/`는 숨김 폴더라 제출 미리보기에서 빠질 수 있지만 실제 제출물에는 포함될 수 있습니다(가이드 7장). 스냅샷은 코드 사본이므로 제출 전 남길지 판단하고, 핵심 증거(명령·결과·판정)는 WORKSTATE·제출 문서에 **평문으로 요약**합니다.

## 6단계: 제출 문서 → 서술형 브리프 → 제출

1. **EXPORT** (`START.md` 8): WORKSTATE의 R→D→T→E를 과제가 지정한 문서·파일명으로 옮깁니다. 제출 문서는 AI와 작성해도 불이익이 없으며 판단·근거·검증 결과·남은 한계가 담겨야 합니다(가이드 6장).
2. **PRE-SUBMIT BRIEF** (`START.md` 9): 후속 서술형은 6문항×5분, 제출물·작업 기록 기반, AI·복사붙여넣기 금지, 이전 문항 이동 불가입니다(가이드 8장). 확정 뒤 파일을 다시 볼 수 있다는 보장이 없으므로 **확정 전에** 브리프를 직접 읽어 둡니다. 브리프 자체는 제출물이 아니라 본인 준비용입니다.
3. 작업 종료 10분 전 "제출하고 문제풀기" → 필수 파일·저장 상태 확인 → 확정.

## 데모: 의도된 가상 프로젝트 검증

아래 명령은 완전히 독립적인 수학 연산 예제이며 대회 문제와 무관합니다.

```bash
node tools/qa.mjs inspect --project ./examples/demo-app
node tools/qa.mjs run --project ./examples/demo-app --task T01 --phase local
node tools/qa.mjs run --project ./examples/demo-app --task T01 --phase impact
node tools/qa.mjs run --project ./examples/demo-app --task T01 --phase global
# 실제로 산술 출력 및 연계 동작을 직접 확인한 경우에만 아래 실행
node tools/qa.mjs manual --project ./examples/demo-app --task T01 --check math-review --result PASS --note "2+3=5, 2x3=6, (1+2)x3=9 직접 확인"
node tools/qa.mjs gate --project ./examples/demo-app --task T01
```

자체 테스트:

```bash
node --test tests/*.test.mjs
```

## 시간관리와 검증 한계

에이전트 응답시간을 고려한 위임·시간 안배도 AI 활용 역량으로 보며, 토큰 사용량은 추적되어 간접 평가에 쓰일 수 있습니다(가이드 7·9장). 180분 기준 예시이며 과제에 맞게 조정합니다.

| 구간 | 할 일 |
|---|---|
| 0–15분 | README·실무자 에이전트로 ALIGN, WORKSTATE GOAL/LOCKED/R 확정, BASELINE 확인 |
| 15–140분 | 작업 단위 반복: BUILD → LOCAL/IMPACT/GLOBAL → Gate → 로컬 커밋. 100분 시점에 범위 재점검 |
| 140–165분 | 최종 GLOBAL 재검증, EXPORT(제출 문서), PRE-SUBMIT BRIEF 읽기 |
| 165–170분 | 제출 시작(공식 권고: 종료 10분 전), 필수 파일·저장 상태 확인 후 확정 |

- 카드는 필요한 단계만 짧게 입력하고, 같은 요청을 반복 전송하지 않습니다(실행 중이면 기다리고, 승인 대기면 한 번 승인/거절).

- 매 수정 후 LOCAL → IMPACT → GLOBAL CORE(짧은 필수 핵심 경로)는 꼭 수행합니다. 모든 비핵심 경계 검사는 주요 마일스톤과 마지막 검증에서 집중 수행합니다.
- 시험 시간 종료 약 **10분 전 제출 시작**이 공식 권장사항입니다. 후속 서술형 전에는 코드와 판단 근거를 이해해 두어야 합니다.
- 외부로 데이터를 전송하는 기능은 구현하지 않았지만, **사용자가 등록한 테스트 명령/그 하위 의존성의 네트워크 동작까지 차단하는 샌드박스는 아닙니다.** 허용된 로컬 테스트 명령만 입력하세요.
- QA 기록은 `.ank` 아래 **로컬 프로젝트 파일**로만 저장됩니다. 공개 저장소로 Push하지 마세요.

## v0.9.2 안전 복구 CLI

```bash
node ~/ank/tools/qa.mjs git-restore --project ~/workspace --commit <검증된_SHA>         # DRY_RUN
node ~/ank/tools/qa.mjs git-restore --project ~/workspace --commit <검증된_SHA> --apply # 사용자 승인 후
```

복원 후에는 이전 PASS가 무효이며 세 단계 검증과 수동 확인을 다시 수행한다. 추적 범위 밖 실행 관련 파일이 있으면 검사에서 차단되며, 이 경우 `trackedPaths`를 실제 프로젝트에 맞게 보완해야 한다. 자동 탐지는 모든 종류의 파일을 보장하지 않으므로 사람이 검토한다.
