#!/usr/bin/env node
/**
 * A.N.K. v0.8: OFFLINE, READ-ONLY WORKSTATE check and 7-line handoff.
 * Uses only built-in Node modules. Never runs tests, edits source, or opens the network.
 * Structural checks do not prove the truth of tests or the restorability of SAFE.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlan, fingerprint } from './qa.mjs';

const GROUPS = ['REQUIREMENTS', 'DECISIONS', 'TASKS', 'EVIDENCE'];
const STATES = new Set(['TODO', 'ACTIVE', 'VERIFYING', 'BLOCKED', 'DONE', 'PARKED']);
const RESULT = new Set(['PASS', 'FAIL', 'NOT_TESTED']);
const POINT = new Set(['ACTIVE', 'VERIFYING', 'BLOCKED']);
const FIELDS = ['GOAL', 'LOCKED', 'NOW', 'SAFE', 'RISK', 'NEXT'];

export function parseState(input) {
  const obj = { values: {}, REQUIREMENTS: [], DECISIONS: [], TASKS: [], EVIDENCE: [] };
  let group = null;
  for (const raw of String(input).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('<!--') || line.startsWith('>')) continue;
    const heading = line.match(/^##\s+([A-Z_]+)\b/);
    if (heading) {
      group = GROUPS.includes(heading[1]) ? heading[1] : null;
      continue;
    }
    if (group) {
      if (line.startsWith('- ')) obj[group].push(line.slice(2).split('|').map(v => v.trim()));
      continue;
    }
    const kv = line.match(/^([A-Z]+):\s*(.*)$/);
    if (kv && FIELDS.includes(kv[1])) obj.values[kv[1]] = kv[2].trim();
  }
  return obj;
}

const isId = (s, prefix) => new RegExp(`^${prefix}\\d{2,}$`).test(s ?? '');
function kvField(value, key) {
  const match = String(value ?? '').match(new RegExp(`^${key}=(.*)$`));
  return match ? match[1].trim().toUpperCase() : null;
}

export function validateState(p, opts = {}) {
  const errors = [], warnings = [];
  for (const key of FIELDS) {
    if (!p.values[key]) warnings.push(`${key}: 값이 없습니다.`);
    if (/^(미정|\[.*\])$/.test(p.values[key] || '')) warnings.push(`${key}: 템플릿 값을 실제 사실로 바꾸세요.`);
  }
  if (!p.REQUIREMENTS.length) warnings.push('공식 요구사항(REQUIREMENTS)이 비어 있습니다.');
  if (!p.TASKS.length) warnings.push('로드맵(TASKS)이 비어 있습니다.');

  const cache = {};
  for (const [group, prefix, min] of [
    ['REQUIREMENTS', 'R', 3], ['DECISIONS', 'D', 5],
    ['TASKS', 'T', 6], ['EVIDENCE', 'E', 6],
  ]) {
    cache[group] = new Map();
    for (const record of p[group]) {
      const id = record[0];
      if (!isId(id, prefix)) errors.push(`${group}: ID ${id || '(없음)'}는 ${prefix}01 같은 형식이어야 합니다.`);
      if (record.length < min) errors.push(`${group} ${id || '(없음)'}: 필드가 부족합니다 (${record.length}/${min}).`);
      if (cache[group].has(id)) errors.push(`${group}: 중복 ID ${id}`);
      cache[group].set(id, record);
    }
  }
  const [R, D, T, E] = GROUPS.map(g => cache[g]);
  for (const d of p.DECISIONS) {
    if (!R.has(d[1])) errors.push(`${d[0]}: 존재하지 않는 요구사항 ${d[1]}`);
    if (!/^CHOICE:/i.test(d[2] ?? '') || !/^WHY:/i.test(d[3] ?? '') || !/^ALT:/i.test(d[4] ?? '')) {
      errors.push(`${d[0]}: CHOICE/WHY/ALT 선택 근거가 필요합니다.`);
    }
  }
  let current = 0;
  for (const t of p.TASKS) {
    const [tid, rid, did, state, evidence] = t;
    if (!R.has(rid)) errors.push(`${tid}: 존재하지 않는 요구사항 ${rid}`);
    if (!D.has(did)) errors.push(`${tid}: 존재하지 않는 설계 결정 ${did}`);
    else if (D.get(did)?.[1] !== rid) errors.push(`${tid}: ${did}가 ${rid} 요구사항과 연결되지 않습니다.`);
    if (!STATES.has(state)) errors.push(`${tid}: 알 수 없는 상태 ${state}`);
    if (POINT.has(state)) current += 1;
    if (state === 'DONE') {
      if (!evidence || evidence === 'NONE') errors.push(`${tid}: DONE이지만 증거 ID가 없습니다.`);
      else if (!E.has(evidence)) errors.push(`${tid}: DONE 근거 ${evidence}가 존재하지 않습니다.`);
      else {
        const e = E.get(evidence);
        if (e[1] !== tid) errors.push(`${tid}: ${evidence}가 다른 작업(${e[1]})을 가리킵니다.`);
        for (const [idx, name] of [[2, 'LOCAL'], [3, 'IMPACT'], [4, 'GLOBAL']]) {
          if (kvField(e[idx], name) !== 'PASS') errors.push(`${tid}: ${evidence}의 ${name}이 PASS가 아닙니다.`);
        }
        if (opts.qaProject) {
          const details=String(e[5]||'');
          const m=details.match(/\bQA_GATE=(\.ank\/qa\/T\d{2,}\/gate-[a-z0-9-]+\.json)\b/i);
          if(!m)errors.push(`${tid}: 엄격 모드에서 E에는 실제 QA_GATE=... 파일 연결이 필요합니다.`);
          else {
            try {
              const project=fs.realpathSync(opts.qaProject);
              if(!m[1].startsWith(`.ank/qa/${tid}/`))throw Error('다른 작업의 게이트 파일');
              const receipt=JSON.parse(fs.readFileSync(path.join(project,m[1]),'utf8'));
              const planFile=opts.planFile||path.join(project,'qa-plan.json');
              const {plan,planHash}=loadPlan(planFile,project);
              const fp=fingerprint(project,plan.trackedPaths);
              const epoch=fs.existsSync(path.join(project,'.ank','qa-epoch.txt'))?fs.readFileSync(path.join(project,'.ank','qa-epoch.txt'),'utf8').trim():'initial';
              if(receipt.status!=='PASS'||receipt.task!==tid||receipt.planHash!==planHash||receipt.fingerprint!==fp.digest||receipt.epoch!==epoch)
                throw Error('증거가 현재 코드/계획/검사 기준과 일치하지 않습니다');
            } catch(err) {errors.push(`${tid}: QA_GATE 증거 확인 실패 (${err.message})`);}
          }
        }
      }
    } else if (evidence && evidence !== 'NONE' && !E.has(evidence)) {
      errors.push(`${tid}: 존재하지 않는 증거 ${evidence}`);
    }
  }
  if (current > 1) errors.push(`동시 진행 작업이 ${current}개입니다. ACTIVE/VERIFYING/BLOCKED는 합계 1개 이하로 관리하세요.`);
  for (const e of p.EVIDENCE) {
    if (!T.has(e[1])) errors.push(`${e[0]}: 없는 작업 ${e[1]}을 참조합니다.`);
    for (const [idx, name] of [[2, 'LOCAL'], [3, 'IMPACT'], [4, 'GLOBAL']]) {
      if (!RESULT.has(kvField(e[idx], name))) errors.push(`${e[0]}: ${name}=PASS/FAIL/NOT_TESTED 중 하나로 기록하세요.`);
    }
    if (!/^DETAILS:/i.test(e[5] ?? '')) errors.push(`${e[0]}: 실제 검사 방법/관찰을 DETAILS에 기록하세요.`);
    if (e.slice(2, 5).some(x => /FAIL|NOT_TESTED/.test(x)) && p.TASKS.some(t => t[0] === e[1] && t[3] === 'DONE')) {
      errors.push(`${e[0]}: 미통과 검증에 연결된 DONE 작업이 있습니다.`);
    }
  }
  const safe = p.values.SAFE || '';
  if (safe && safe.toUpperCase() !== 'NONE' && !/^(git:|snapshot:)/i.test(safe)) {
    warnings.push('SAFE: 실제 복구 방법을 검증하고 git: 또는 snapshot: 기준점으로 기록하세요.');
  }
  if (safe && safe.toUpperCase() !== 'NONE') warnings.push('SAFE 복원 가능 여부는 이 정적 검사로 확인할 수 없습니다. 직접 확인해야 합니다.');
  if (p.TASKS.some(t => t[3] === 'BLOCKED') && !/오류|회귀|실패|blocked|막힘/i.test(p.values.RISK || '')) {
    warnings.push('BLOCKED 작업이 있으므로 RISK에 실제 차단 사유를 기록하세요.');
  }
  return { errors, warnings, stats: { requirements: R.size, decisions: D.size, tasks: T.size, evidence: E.size } };
}

export function handoff(p) {
  const done = p.TASKS.filter(t => t[3] === 'DONE').map(t => `${t[0]}(${t[4]})`).join(', ') || '없음';
  const pending = p.TASKS.filter(t => POINT.has(t[3])).map(t => `${t[0]}[${t[3]}]`).join(', ') || '없음';
  const decisions = p.DECISIONS.map(d => `${d[0]}: ${String(d[2] || '').replace(/^CHOICE:\s*/i, '')} (${String(d[3] || '').replace(/^WHY:\s*/i, '')})`).join('; ') || '미확정';
  const s = p.values;
  return [
    `GOAL: ${s.GOAL || '미정'}`,
    `LOCKED: ${s.LOCKED || '미정'}`,
    `DONE: ${done}`,
    `NOW: ${pending} / ${s.NOW || '미정'}`,
    `DECISION: ${decisions}`,
    `SAFE-RISK: ${s.SAFE || 'NONE'} / ${s.RISK || '미확인'}`,
    `NEXT: ${s.NEXT || '미정'}`,
  ].join('\n');
}

function main() {
  const [command = 'help', arg = 'WORKSTATE.md'] = process.argv.slice(2);
  if (!['check', 'handoff'].includes(command)) {
    process.stdout.write('사용: node tools/state.mjs check|handoff [WORKSTATE.md]\n');
    process.exitCode = 2;
    return;
  }
  let raw;
  const input = path.resolve(arg);
  try { raw = fs.readFileSync(input, 'utf8'); }
  catch (err) { process.stderr.write(`읽기 실패: ${input} (${err.message})\n`); process.exitCode = 2; return; }
  const p = parseState(raw);
  if (command === 'handoff') { process.stdout.write(handoff(p) + '\n'); return; }
  const qaPos=process.argv.indexOf('--qa-project');
  const planPos=process.argv.indexOf('--plan');
  const opts={qaProject:qaPos===-1?null:process.argv[qaPos+1],planFile:planPos===-1?null:process.argv[planPos+1]};
  const r = validateState(p, opts);
  process.stdout.write(`WORKSTATE 검사: ${r.errors.length} 오류 / ${r.warnings.length} 주의\n`);
  process.stdout.write(`R ${r.stats.requirements} · D ${r.stats.decisions} · T ${r.stats.tasks} · E ${r.stats.evidence}\n`);
  for (const e of r.errors) process.stdout.write(`ERROR: ${e}\n`);
  for (const w of r.warnings) process.stdout.write(`WARN : ${w}\n`);
  process.stdout.write(opts.qaProject?'검사: QA_GATE 파일과 현재 코드/계획/검사 기준 일치 확인 (테스트 내용의 적절성은 사람 검토 필요).\n':'주의: 구조 검사만 수행하며 테스트를 실행하거나 PASS의 진위를 검증하지 않습니다.\n');
  if (r.errors.length) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
