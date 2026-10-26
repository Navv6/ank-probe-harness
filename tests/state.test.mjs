import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseState, validateState, handoff } from '../tools/state.mjs';

const sample = fs.readFileSync(new URL('../examples/WORKSTATE_demo.md', import.meta.url), 'utf8');
const check = text => validateState(parseState(text));

test('예제 WORKSTATE 구조 검증 통과', () => {
  const r = check(sample);
  assert.deepEqual(r.errors, []);
  assert.equal(r.stats.tasks, 2);
});
test('Handoff는 7줄이며 완료 증거와 다음 작업을 표시', () => {
  const out = handoff(parseState(sample));
  assert.equal(out.split('\n').length, 7);
  assert.match(out, /T01\(E01\)/);
  assert.match(out, /NEXT: T02/);
});
test('검증 없는 DONE 차단', () => {
  const text = sample.replace('DONE | E01 |', 'DONE | NONE |');
  assert.ok(check(text).errors.some(s => s.includes('증거 ID')));
});
test('LOCAL 미통과면 DONE 차단', () => {
  const text = sample.replace('LOCAL=PASS', 'LOCAL=NOT_TESTED');
  assert.ok(check(text).errors.some(s => s.includes('LOCAL')));
});
test('IMPACT 실패면 DONE 차단', () => {
  const text = sample.replace('IMPACT=PASS', 'IMPACT=FAIL');
  assert.ok(check(text).errors.some(s => s.includes('IMPACT')));
});
test('GLOBAL 핵심 회귀 미검증이면 DONE 차단', () => {
  const text = sample.replace('GLOBAL=PASS', 'GLOBAL=NOT_TESTED');
  assert.ok(check(text).errors.some(s => s.includes('GLOBAL')));
});
test('동시에 ACTIVE 두 개 불허', () => {
  const text = sample.replace('T01 | R01 | D01 | DONE | E01', 'T01 | R01 | D01 | ACTIVE | E01');
  assert.ok(check(text).errors.some(s => s.includes('동시 진행')));
});
test('설계 결정 연결 불일치 검출', () => {
  const text = sample.replace('T02 | R02 | D02', 'T02 | R02 | D01');
  assert.ok(check(text).errors.some(s => s.includes('연결되지')));
});
test('없는 요구사항 참조 검출', () => {
  const text = sample.replace('T02 | R02 | D02', 'T02 | R99 | D02');
  assert.ok(check(text).errors.some(s => s.includes('R99')));
});
test('중복 증거 ID 검출', () => {
  const text = sample + '\n- E01 | T01 | LOCAL=PASS | IMPACT=PASS | GLOBAL=PASS | DETAILS: 중복\n';
  assert.ok(check(text).errors.some(s => s.includes('중복 ID')));
});
test('미확인 증거의 상태값 오류 검출', () => {
  const text = sample.replace('LOCAL=PASS', 'LOCAL=UNKNOWN');
  assert.ok(check(text).errors.some(s => s.includes('LOCAL=PASS/FAIL/NOT_TESTED')));
});
test('SAFE 복구 지점은 실체 검증을 요구하는 경고', () => {
  const text = sample.replace('SAFE: NONE', 'SAFE: git:abcdef123');
  assert.ok(check(text).warnings.some(s => s.includes('복원 가능')));
});
