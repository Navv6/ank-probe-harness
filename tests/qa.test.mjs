import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  loadPlan,fingerprint,runPhase,recordManual,gate,addIssue,resolveIssue,createSnapshot,
  verifySnapshot,restoreSnapshot
} from '../tools/qa.mjs';
const source=fs.realpathSync(fileURLToPath(new URL('../examples/demo-app/',import.meta.url)));
function setup(t) {
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'ank-qa-'));
  for(const name of ['src','tests'])fs.cpSync(path.join(source,name),path.join(project,name),{recursive:true});
  fs.copyFileSync(path.join(source,'qa-plan.json'),path.join(project,'qa-plan.json'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  return {project,planFile:path.join(project,'qa-plan.json'),task:'T01'};
}
function runAll(x){for(const phase of ['local','impact','global']){const r=runPhase({...x,phase});assert.equal(r.pass,true,`test ${phase}: ${r.cases[0]?.stderr}`);}}
function manual(x){recordManual({...x,check:'math-review',result:'PASS',note:'로컬 사용자 확인: 결과 수동 점검 및 기대치 일치'});}
test('계획 검사 및 추적 대상 fingerprint',t=>{
  const x=setup(t),p=loadPlan(x.planFile,x.project);
  assert.equal(p.plan.suites.global.length,1);
  assert.equal(fingerprint(x.project,p.plan.trackedPaths).files,4);
});
test('검사 전 Gate는 HOLD, 실제 세 구간 통과 후에도 수동 검사 미완료면 HOLD',t=>{
  const x=setup(t);assert.equal(gate(x).status,'HOLD');runAll(x);
  const r=gate(x);assert.equal(r.status,'HOLD');assert.match(r.problems.join('\n'),/math-review/);
});
test('부분/영향/전체 검증과 실제 수동 관찰 후 PASS',t=>{
  const x=setup(t);runAll(x);manual(x);
  const r=gate(x);assert.equal(r.status,'PASS');assert.equal(r.evidence.length,4);
});
test('부분 검증 후 기능을 변경하면 과거 PASS 무효',t=>{
  const x=setup(t);runAll(x);manual(x);
  fs.appendFileSync(path.join(x.project,'src','calc.mjs'),'\n// changed');
  const r=gate(x);assert.equal(r.status,'HOLD');assert.ok(r.problems.some(s=>s.includes('변경')));
});
test('GLOBAL 실행이 실패하면 FAIL을 기록하고 Gate HOLD',t=>{
  const x=setup(t);runPhase({...x,phase:'local'});runPhase({...x,phase:'impact'});
  fs.writeFileSync(path.join(x.project,'src','calc.mjs'),`export const add=(a,b)=>a+b;\nexport const multiply=(a,b)=>a+b;\n`);
  runPhase({...x,phase:'local'});
  const impact=runPhase({...x,phase:'impact'});assert.equal(impact.pass,false);
  const g=runPhase({...x,phase:'global'});assert.equal(g.pass,false);
  const r=gate(x);assert.equal(r.status,'HOLD');assert.ok(r.problems.some(s=>s.includes('impact')));
});
test('P1 이슈 등록으로 이전 PASS 무효화 및 차단, 해결 후 재검증 요구',t=>{
  const x=setup(t);runAll(x);manual(x);
  const i=addIssue(x.project,'T01','P1','크리티컬 회귀','곱셈 결과가 합산됨');
  assert.equal(i.id,'B001');
  assert.match(gate(x).problems.join(' / '),/P0\/P1/);
  resolveIssue(x.project,i.id,'정상 로직 복구, 전체 회귀 검증 예정');
  assert.equal(gate(x).status,'HOLD');
  runAll(x);manual(x);assert.equal(gate(x).status,'PASS');
});
test('P2 미해결은 경고로 기록하되 필수 Gate를 자동 차단하지 않음',t=>{
  const x=setup(t);addIssue(x.project,'T01','P2','경미한 공백','특수 입력일 때 반응');
  runAll(x);manual(x);const r=gate(x);
  assert.equal(r.status,'PASS');assert.equal(r.openIssues[0].severity,'P2');
});
test('스냅샷 생성-검증-복원 드라이런은 원본 미변경',t=>{
  const x=setup(t);const snap=createSnapshot({...x,label:'baseline'});
  assert.equal(snap.verifiedByGate,false);
  assert.equal(verifySnapshot({project:x.project,id:snap.id}).valid,true);
  fs.writeFileSync(path.join(x.project,'src','calc.mjs'),'// broke\n');
  assert.equal(restoreSnapshot({project:x.project,id:snap.id}).status,'DRY_RUN');
  assert.equal(fs.readFileSync(path.join(x.project,'src','calc.mjs'),'utf8'),'// broke\n');
});
test('복원 시 현재 내용 구조를 rescues에 보존하고 검사 epoch 무효화',t=>{
  const x=setup(t);runAll(x);manual(x);
  const snap=createSnapshot({...x,task:'T01'});
  assert.equal(snap.verifiedByGate,true);
  fs.writeFileSync(path.join(x.project,'src','calc.mjs'),'// regression\n');
  const r=restoreSnapshot({project:x.project,id:snap.id,apply:true});
  assert.equal(r.status,'RESTORED_UNVERIFIED');
  assert.equal(fs.readFileSync(path.join(x.project,'.ank','rescues',r.rescue,'src','calc.mjs'),'utf8'),'// regression\n');
  assert.equal(verifySnapshot({project:x.project,id:snap.id}).valid,true);
  assert.equal(gate(x).status,'HOLD');
  runAll(x);manual(x);assert.equal(gate(x).status,'PASS');
});
test('검증 조건 없는 비현실적 계획 거부',t=>{
  const x=setup(t),p=JSON.parse(fs.readFileSync(x.planFile,'utf8'));
  p.suites.global=[];p.manualChecks=[];
  fs.writeFileSync(x.planFile,JSON.stringify(p));
  assert.throws(()=>loadPlan(x.planFile,x.project),/global/);
});
test('Shell, 패키지 설치, 경로 탈출은 차단',t=>{
  const x=setup(t),p=JSON.parse(fs.readFileSync(x.planFile,'utf8'));
  p.suites.local[0].argv=['bash','-c','echo test'];
  fs.writeFileSync(x.planFile,JSON.stringify(p));
  assert.throws(()=>loadPlan(x.planFile,x.project),/미허용/);
  p.suites.local[0].argv=['npm','install'];fs.writeFileSync(x.planFile,JSON.stringify(p));
  assert.throws(()=>loadPlan(x.planFile,x.project),/npm install/);
  p.suites.local[0].argv=['node','--test','tests/local.test.mjs'];p.trackedPaths=['../outside'];
  fs.writeFileSync(x.planFile,JSON.stringify(p));
  assert.throws(()=>loadPlan(x.planFile,x.project),/허용되지/);
});
test('심볼릭 링크가 범위에 있으면 거부',t=>{
  const x=setup(t);fs.symlinkSync(os.tmpdir(),path.join(x.project,'src','link-dir'));
  assert.throws(()=>fingerprint(x.project,['src','tests']),/심볼릭 링크/);
});
test('계획 변경은 이전 검증 무효',t=>{
  const x=setup(t);runAll(x);manual(x);
  const plan=JSON.parse(fs.readFileSync(x.planFile,'utf8'));
  plan.manualChecks[0].title='different expected behavior';
  fs.writeFileSync(x.planFile,JSON.stringify(plan));
  assert.equal(gate(x).status,'HOLD');
});
test('WORKSTATE 엄격 모드는 실제 QA_GATE 증거 연결을 검사', async t=>{
  const x=setup(t);runAll(x);manual(x);
  const receipt=gate({...x,save:true});
  assert.equal(receipt.status,'PASS');
  const {parseState,validateState}=await import('../tools/state.mjs');
  const record=`GOAL: 데모\nLOCKED: 기본 동작 유지\nNOW: 검증\nSAFE: NONE\nRISK: 없음\nNEXT: 마무리\n## REQUIREMENTS\n- R01 | 기본 동작 | ACCEPT: 결과 확인\n## DECISIONS\n- D01 | R01 | CHOICE: 유지 | WHY: 단순성 | ALT: 재작성\n## TASKS\n- T01 | R01 | D01 | DONE | E01 | 구현\n## EVIDENCE\n- E01 | T01 | LOCAL=PASS | IMPACT=PASS | GLOBAL=PASS | DETAILS: QA_GATE=${receipt.savedTo}; 세 단계 확인\n`;
  assert.equal(validateState(parseState(record),{qaProject:x.project}).errors.length,0);
  assert.ok(validateState(parseState(record.replace('QA_GATE=','QA_FAKE=')),{qaProject:x.project}).errors.some(s=>s.includes('QA_GATE')));
  fs.appendFileSync(path.join(x.project,'src','calc.mjs'),'// changed\n');
  assert.ok(validateState(parseState(record),{qaProject:x.project}).errors.some(s=>s.includes('증거 확인 실패')));
});
test('추적 대상 상위/하위 경로 중복은 스냅샷 무결성 위험이므로 차단',t=>{
  const x=setup(t),p=JSON.parse(fs.readFileSync(x.planFile,'utf8'));
  p.trackedPaths=['src','src/calc.mjs'];
  fs.writeFileSync(x.planFile,JSON.stringify(p));
  assert.throws(()=>loadPlan(x.planFile,x.project),/중복\/포함된 추적 경로/);
});
