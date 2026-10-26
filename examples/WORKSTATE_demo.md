# WORKSTATE — 가상 예시 (실제 출제 과제와 무관)

GOAL: CSV 중복 데이터 처리 기능을 안전하게 개선한다.
LOCKED: 기존 조회 함수 응답 형식을 변경하지 않는다.
NOW: T02 구현 준비, T01 검증 완료
SAFE: NONE
RISK: T02 적용 시 조회 기능 회귀 가능성
NEXT: T02 중복 처리 수정 전 실패 사례 재현

## REQUIREMENTS
- R01 | CSV 데이터의 정상 업로드 | ACCEPT: 정상 파일 업로드 후 목록 조회 가능
- R02 | 기준키로 중복 제거 | ACCEPT: 중복 입력 시 1개만 반영

## DECISIONS
- D01 | R01 | CHOICE: 기존 업로드 코드 유지 | WHY: 기존 호환성 보존 | ALT: 업로드 구조 전면 교체
- D02 | R02 | CHOICE: 기존 중복 판단 로직 최소 변경 | WHY: 영향 범위 제한 | ALT: 데이터 계층 교체

## TASKS
- T01 | R01 | D01 | DONE | E01 | 정상 업로드 기능 확인
- T02 | R02 | D02 | ACTIVE | NONE | 중복 처리 최소 변경

## EVIDENCE
- E01 | T01 | LOCAL=PASS | IMPACT=PASS | GLOBAL=PASS | DETAILS: 예시상 테스트 및 목록 조회 화면 확인 (가상 데이터)
