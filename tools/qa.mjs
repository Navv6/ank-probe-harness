#!/usr/bin/env node
/**
 * A.N.K. v0.9.1 QA harness — Node builtins, offline orchestration.
 * Runs ONLY explicitly reviewed local commands (shell:false); it does not establish
 * a network sandbox. The commands and dependencies themselves must be trusted.
 * Does not run Computer Use, push Git, or contact an external service.
 * Only local git touch: appends `.ank/` to .git/info/exclude (never the task's .gitignore).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PHASES = ['local', 'impact', 'global'];
const SKIP_DIRS = new Set(['.git','.ank','node_modules','.next','dist','build','coverage','.venv','__pycache__']);
const MAX_FILES = 3000, MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const ALLOWED_CMDS = new Set(['node', 'python', 'python3', 'pytest', 'npm', 'pnpm', 'yarn', 'go', 'cargo']);
const BANNED_ARGS = new Set(['--eval','-e','-c','--execute']);
const json = (obj) => JSON.stringify(obj, null, 2) + '\n';
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const now = () => new Date().toISOString();
const uniq = () => `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const requireArg = (val, name) => { if (!val) throw Error(`필수 인수 누락: ${name}`); return val; };
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, data) => { fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, json(data), {flag:'wx'}); };
const writeReplace = (p, data) => { fs.mkdirSync(path.dirname(p),{recursive:true}); const tmp = p+'.tmp-'+uniq(); fs.writeFileSync(tmp,json(data)); fs.renameSync(tmp,p); };
function insideRel(s) {
  if (typeof s !== 'string' || !s || path.isAbsolute(s) || s.includes('\\') || s.includes('\0')) throw Error(`잘못된 상대 경로: ${s}`);
  const bits = s.split('/');
  if (bits.some(b=>!b || b==='.' || b==='..' || SKIP_DIRS.has(b))) throw Error(`허용되지 않은 경로: ${s}`);
  return s;
}
function ensureInProject(project, rel, mayMissing=false) {
  insideRel(rel);
  const absolute = path.resolve(project, rel);
  if (!absolute.startsWith(project+path.sep)) throw Error(`프로젝트 밖 경로 금지: ${rel}`);
  // reject symlinks anywhere in the path, avoiding indirect escape via directories
  let cur=project;
  for (const segment of rel.split('/')) {
    cur=path.join(cur,segment);
    if (!fs.existsSync(cur)) { if (mayMissing) break; throw Error(`경로 없음: ${rel}`); }
    if (fs.lstatSync(cur).isSymbolicLink()) throw Error(`심볼릭 링크 지원 안 함: ${rel}`);
  }
  return absolute;
}
export function loadPlan(planFile, project) {
  const raw=fs.readFileSync(planFile);
  const plan=JSON.parse(raw.toString('utf8'));
  if (plan.version!==1) throw Error('qa-plan.json version은 1이어야 합니다.');
  if (!Array.isArray(plan.trackedPaths)||!plan.trackedPaths.length) throw Error('trackedPaths 1개 이상 필요');
  for (const rel of plan.trackedPaths) ensureInProject(project,rel);
  for (const [i,a] of plan.trackedPaths.entries()) {
    if (plan.trackedPaths.some((b,j)=>i!==j && (a===b || a.startsWith(b+'/') || b.startsWith(a+'/'))))
      throw Error(`중복/포함된 추적 경로 금지: ${a}`);
  }
  if (!plan.suites || typeof plan.suites!=='object') throw Error('suites 필요');
  const seen=new Set();
  for (const phase of PHASES) {
    const suites=plan.suites[phase];
    if (!Array.isArray(suites)) throw Error(`suites.${phase} 배열 필요`);
    for (const c of suites) {
      if (!c.id || !/^[a-zA-Z0-9_-]+$/.test(c.id) || seen.has(c.id)) throw Error(`중복 또는 잘못된 검사 ID: ${c.id}`);
      seen.add(c.id);
      if (!Array.isArray(c.argv)||c.argv.length<1||c.argv.some(a=>typeof a!=='string'||!a||a.includes('\0'))) throw Error(`${c.id}: argv 배열 필요`);
      if (!ALLOWED_CMDS.has(c.argv[0]) || c.argv.slice(1).some(a=>BANNED_ARGS.has(a))) throw Error(`${c.id}: 미허용 실행 명령/옵션 (npx·셸 스크립트 등은 package.json scripts에 등록 후 ["npm","run","<script>"]로 실행)`);
      if (c.argv[0]==='npm' && c.argv[1]==='install') throw Error(`${c.id}: npm install은 QA 실행 대상 아님`);
      if (c.argv[0]==='pnpm' && c.argv[1]==='install') throw Error(`${c.id}: pnpm install은 QA 실행 대상 아님`);
      if (c.argv[0]==='yarn' && c.argv[1]==='add') throw Error(`${c.id}: 패키지 설치 명령은 QA 실행 대상 아님`);
      if (c.timeoutSeconds!==undefined && (!Number.isInteger(c.timeoutSeconds)||c.timeoutSeconds<1||c.timeoutSeconds>300)) throw Error(`${c.id}: 1~300초 타임아웃만 허용`);
    }
  }
  const man=plan.manualChecks||[];
  if (!Array.isArray(man)) throw Error('manualChecks 배열 필요');
  for (const m of man) {
    if (!m.id||!/^[a-zA-Z0-9_-]+$/.test(m.id)||seen.has(m.id)||!PHASES.includes(m.phase)||!m.title) throw Error('잘못된 manualCheck ID/phase/title');
    seen.add(m.id);
  }
  for (const phase of PHASES) if (!(plan.suites[phase].length+man.filter(m=>m.phase===phase).length)) throw Error(`${phase}: 자동/수동 검사 1개 이상 필요`);
  return {plan,planHash:sha(raw)};
}
export function fingerprint(project, paths) {
  const files=[];
  const visit=(rel)=>{
    const full=ensureInProject(project,rel);
    const st=fs.lstatSync(full);
    if (st.isDirectory()) {
      for (const item of fs.readdirSync(full).sort()) {
        if (SKIP_DIRS.has(item)) continue;
        visit(`${rel}/${item}`);
      }
    } else if(st.isFile()) files.push({rel,bytes:st.size});
    else throw Error(`지원하지 않는 파일 유형: ${rel}`);
    if(files.length>MAX_FILES) throw Error(`파일 ${MAX_FILES}개 초과`);
  };
  for (const rel of paths) visit(rel);
  files.sort((a,b)=>a.rel.localeCompare(b.rel,'en'));
  if (files.reduce((x,f)=>x+f.bytes,0)>MAX_TOTAL_BYTES) throw Error('총 파일 크기 128MB 초과');
  const dig=crypto.createHash('sha256');
  for (const {rel} of files) {
    const buf=fs.readFileSync(ensureInProject(project,rel));
    dig.update(rel+'\0'+sha(buf)+'\0');
  }
  return {digest:dig.digest('hex'),files:files.length};
}
// Keep QA evidence/snapshots out of `git add -A` and the collected git diff, without editing
// the task's own .gitignore. Only a real .git directory is touched; worktree/submodule .git files are skipped.
export function ensureLocalExclude(project) {
  let dir=project;
  while (!fs.existsSync(path.join(dir,'.git'))) { const up=path.dirname(dir); if (up===dir) return 'NO_GIT'; dir=up; }
  const gitDir=path.join(dir,'.git');
  if (!fs.lstatSync(gitDir).isDirectory()) return 'SKIPPED_GIT_FILE';
  const file=path.join(gitDir,'info','exclude');
  const cur=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  if (cur.split(/\r?\n/).some(l=>['.ank','.ank/','/.ank','/.ank/'].includes(l.trim()))) return 'PRESENT';
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.appendFileSync(file,(cur&&!cur.endsWith('\n')?'\n':'')+'# A.N.K. local QA evidence (not part of the task)\n.ank/\n');
  return 'ADDED';
}
const runFolder=(project,task)=>path.join(project,'.ank','qa',task);
function epochFile(project){return path.join(project,'.ank','qa-epoch.txt');}
function getEpoch(project){return fs.existsSync(epochFile(project))?fs.readFileSync(epochFile(project),'utf8').trim():'initial';}
function rotateEpoch(project){fs.mkdirSync(path.dirname(epochFile(project)),{recursive:true});fs.writeFileSync(epochFile(project),uniq());}

const ensureTask=task=>{if(!/^T\d{2,}$/.test(task||''))throw Error('작업 ID는 T01 형식이어야 합니다');return task;};
function listRecords(project,task,kind){
  const dir=runFolder(project,task);
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f=>f.startsWith(kind+'-')&&f.endsWith('.json')).sort().map(f=>read(path.join(dir,f)));
}
function newest(arr) {
  // On equal millisecond timestamps, conservatively prefer failing records,
  // preventing a PASS from concealing a same-time FAIL.
  return arr.sort((a,b)=>a.when.localeCompare(b.when) || Number(Boolean(a.pass===false || a.result==='FAIL'))-Number(Boolean(b.pass===false || b.result==='FAIL'))).at(-1);
}
function runOne(project,item) {
  const t=Date.now();
  const env={...process.env,CI:'true'};
  // Node's own test harness sets NODE_TEST_CONTEXT. Inheriting it makes child
  // `node --test` silently skip execution while returning exit 0 (!).
  delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(item.argv[0],item.argv.slice(1),{cwd:project,encoding:'utf8',timeout:(item.timeoutSeconds||60)*1000,maxBuffer:1024*1024,shell:false,env});
  const output=String(r.stdout||'');
  const nodeTests=item.argv[0]==='node' && item.argv.includes('--test');
  const testsRun=nodeTests?(/# tests\s+[1-9]\d*/.test(output)||/1\.\.[1-9]\d*/.test(output)):null;
  const pass=r.status===0&&!r.error&&(!nodeTests||testsRun);
  return {id:item.id,argv:item.argv,exitCode:r.status,signal:r.signal||null,error:r.error?.message||null,durationMs:Date.now()-t,stdout:output.slice(-5000),stderr:String(r.stderr||'').slice(-5000),testsRun,pass:!!pass};
}
export function runPhase({project,planFile,task,phase}) {
  ensureTask(task);
  if (!PHASES.includes(phase)) throw Error('phase는 local / impact / global');
  const {plan,planHash}=loadPlan(planFile,project);
  const fp=fingerprint(project,plan.trackedPaths);
  const cases=plan.suites[phase].map(item=>runOne(project,item));
  const entry={kind:'auto',task,phase,when:now(),id:uniq(),planHash,epoch:getEpoch(project),fingerprint:fp.digest,files:fp.files,cases,pass:cases.every(c=>c.pass)};
  write(path.join(runFolder(project,task),`auto-${entry.id}.json`),entry);
  return entry;
}
export function recordManual({project,planFile,task,check,result,note}) {
  ensureTask(task);
  if(!['PASS','FAIL'].includes(result)) throw Error('결과는 PASS 또는 FAIL만 허용');
  if(!note || note.trim().length<8) throw Error('관찰한 동작과 결과를 8자 이상 남기세요');
  const {plan,planHash}=loadPlan(planFile,project);
  const m=plan.manualChecks?.find(x=>x.id===check);
  if(!m) throw Error('manualChecks에 없는 항목');
  const fp=fingerprint(project,plan.trackedPaths);
  const entry={kind:'manual',task,phase:m.phase,check,result,note,when:now(),id:uniq(),planHash,epoch:getEpoch(project),fingerprint:fp.digest};
  write(path.join(runFolder(project,task),`manual-${entry.id}.json`),entry);
  return entry;
}
function issueFile(project){return path.join(project,'.ank','issues.json');}
export function issues(project){return fs.existsSync(issueFile(project))?read(issueFile(project)):[];}
export function addIssue(project,task,severity,summary,repro) {
  ensureTask(task);
  if(!['P0','P1','P2','P3'].includes(severity))throw Error('심각도 P0~P3');
  if(!summary||!repro) throw Error('요약과 재현 단계가 필요');
  const items=issues(project);
  const id=`B${String(items.length+1).padStart(3,'0')}`;
  const issue={id,task,severity,summary,repro,status:'OPEN',createdAt:now()};
  items.push(issue);writeReplace(issueFile(project),items);rotateEpoch(project);
  return issue;
}
export function resolveIssue(project,id,note){
  if(!note||note.length<8)throw Error('수정/검증 근거 8자 이상 필요');
  const items=issues(project),issue=items.find(x=>x.id===id);
  if(!issue)throw Error(`없는 버그 ID: ${id}`);
  issue.status='RESOLVED';issue.resolution=note;issue.resolvedAt=now();
  writeReplace(issueFile(project),items);rotateEpoch(project);return issue;
}
export function gate({project,planFile,task,save=false}) {
  ensureTask(task);
  const {plan,planHash}=loadPlan(planFile,project);
  const fp=fingerprint(project,plan.trackedPaths);
  const auto=listRecords(project,task,'auto'),manual=listRecords(project,task,'manual');
  const problems=[],evidence=[];
  for(const phase of PHASES) {
    const entries=auto.filter(x=>x.phase===phase);
    const latest=newest(entries);
    if(plan.suites[phase].length) {
      if(!latest) problems.push(`${phase}: 실제 자동 검증 기록 없음`);
      else if(latest.fingerprint!==fp.digest||latest.planHash!==planHash||latest.epoch!==getEpoch(project)) problems.push(`${phase}: 검사 후 코드 또는 계획 변경. 다시 테스트 필요`);
      else if(!latest.pass || latest.cases.length!==plan.suites[phase].length) problems.push(`${phase}: 자동 검사 실패`);
      else if(latest.cases.some(c=>!plan.suites[phase].some(s=>s.id===c.id))) problems.push(`${phase}: 검사 계획과 실행 ID 불일치`);
      else evidence.push({phase,kind:'auto',id:latest.id,when:latest.when,cases:latest.cases.map(c=>({id:c.id,exitCode:c.exitCode,durationMs:c.durationMs}))});
    }
    for(const m of (plan.manualChecks||[]).filter(x=>x.phase===phase)) {
      const latestMan=newest(manual.filter(x=>x.check===m.id));
      if(!latestMan) problems.push(`${phase}/${m.id}: 직접 확인 기록 없음`);
      else if(latestMan.planHash!==planHash||latestMan.fingerprint!==fp.digest||latestMan.epoch!==getEpoch(project)) problems.push(`${phase}/${m.id}: 검사 후 코드 또는 계획 변경`);
      else if(latestMan.result!=='PASS') problems.push(`${phase}/${m.id}: 직접 확인 실패`);
      else evidence.push({phase,kind:'manual',id:latestMan.id,check:m.id,when:latestMan.when,note:latestMan.note});
    }
  }
  const blockers=issues(project).filter(x=>x.status==='OPEN'&&['P0','P1'].includes(x.severity));
  if(blockers.length)problems.push(`미해결 P0/P1 결함: ${blockers.map(x=>x.id).join(', ')}`);
  const report={kind:'gate',task,when:now(),planHash,epoch:getEpoch(project),fingerprint:fp.digest,files:fp.files,status:problems.length?'HOLD':'PASS',problems,evidence,openIssues:issues(project).filter(x=>x.status==='OPEN').map(x=>({id:x.id,severity:x.severity,summary:x.summary}))};
  if(save){
    const f=path.join(runFolder(project,task),`gate-${uniq()}.json`);
    write(f,report);
    report.savedTo=path.relative(project,f);
    // A verified state is best kept as a local commit: git log/diff are collected for evaluation, and Push is not allowed.
    if(report.status==='PASS')report.commitHint=`git add -- ${plan.trackedPaths.join(' ')} && git commit -m "${task}: LOCAL/IMPACT/GLOBAL PASS (${path.basename(f,'.json')})"`;
  }
  return report;
}
function snapshotDirs(project){return path.join(project,'.ank','snapshots');}
function copyScopes(fromRoot,toRoot,scopes){
  for(const rel of scopes){
    const from=path.join(fromRoot,rel),dest=path.join(toRoot,rel);
    if(fs.existsSync(from)) {fs.mkdirSync(path.dirname(dest),{recursive:true});fs.cpSync(from,dest,{recursive:true,force:true,errorOnExist:false});}
  }
}
export function createSnapshot({project,planFile,label='baseline',task=null}) {
  const {plan,planHash}=loadPlan(planFile,project);
  const before=fingerprint(project,plan.trackedPaths);
  const id=`S-${uniq()}`;
  const root=path.join(snapshotDirs(project),id),data=path.join(root,'files');
  fs.mkdirSync(data,{recursive:true});
  copyScopes(project,data,plan.trackedPaths);
  let checked=null;
  if(task){checked=gate({project,planFile,task,save:false});}
  const meta={id,when:now(),label,planHash,digest:before.digest,trackedPaths:plan.trackedPaths,files:before.files,verifiedByGate:checked?.status==='PASS',gateTask:checked?.status==='PASS'?task:null,remark:'QA 검사 통과는 테스트 범위 내의 증거이며, 사용자 확인을 대체하지 않습니다.'};
  write(path.join(root,'manifest.json'),meta);
  if(fingerprint(data,plan.trackedPaths).digest!==before.digest)throw Error('스냅샷 복제 확인 실패');
  return meta;
}
export function verifySnapshot({project,id}) {
  if(!/^S-\d+-[a-f0-9]{8}$/.test(id||''))throw Error('잘못된 스냅샷 ID');
  const root=path.join(snapshotDirs(project),id);
  const meta=read(path.join(root,'manifest.json'));
  const actual=fingerprint(path.join(root,'files'),meta.trackedPaths);
  return {meta,valid:actual.digest===meta.digest,actual:actual.digest};
}
export function restoreSnapshot({project,id,apply=false}) {
  const {meta,valid}=verifySnapshot({project,id});
  if(!valid)throw Error('스냅샷 데이터 무결성 오류 — 복원 중단');
  // Before restoring, existing scopes are saved to rescue and never discarded.
  if(!apply)return {status:'DRY_RUN',snapshot:id,scope:meta.trackedPaths,wouldReplace:true,warning:'실제 복원은 --apply 시 수행. 현재 스코프의 파일이 교체될 수 있습니다.'};
  const rescue=`R-${uniq()}`;
  const rescueRoot=path.join(project,'.ank','rescues',rescue);
  fs.mkdirSync(rescueRoot,{recursive:true});
  const currentExisting=meta.trackedPaths.filter(rel=>fs.existsSync(path.join(project,rel)));
  for(const rel of currentExisting)ensureInProject(project,rel);
  copyScopes(project,rescueRoot,currentExisting);
  write(path.join(rescueRoot,'manifest.json'),{when:now(),snapshot:id,scopes:meta.trackedPaths});
  for(const rel of meta.trackedPaths) {
    const target=path.join(project,rel);
    if(fs.existsSync(target))fs.rmSync(target,{recursive:true,force:true});
  }
  copyScopes(path.join(snapshotDirs(project),id,'files'),project,meta.trackedPaths);
  rotateEpoch(project);
  const result=fingerprint(project,meta.trackedPaths);
  if(result.digest!==meta.digest)throw Error(`복원 후 해시 불일치. 복구 백업 .ank/rescues/${rescue} 확인 필요`);
  return {status:'RESTORED_UNVERIFIED',snapshot:id,rescue,scope:meta.trackedPaths,warning:'코드 복원 완료. LOCAL/IMPACT/GLOBAL 테스트 재실행 전 SAFE 선언 금지.'};
}
function options(args){
  const out={_ : []};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg.startsWith('--')){out[arg.slice(2)]=args[i+1]?.startsWith('--')?true:(args[++i]??true);}
    else out._.push(arg);
  }
  return out;
}
function help() {
  return `A.N.K. v0.9.1 QA (로컬 전용 / Node 18+)\n\n`+
    `node tools/qa.mjs inspect --project ./project --plan ./project/qa-plan.json\n`+
    `node tools/qa.mjs run --project ./project --plan ./project/qa-plan.json --task T01 --phase local|impact|global\n`+
    `node tools/qa.mjs manual --project ... --plan ... --task T01 --check ui-core --result PASS|FAIL --note "실제 관찰"\n`+
    `node tools/qa.mjs issue-add --project ... --task T01 --severity P1 --summary "오류" --repro "재현 순서"\n`+
    `node tools/qa.mjs issue-resolve --project ... --id B001 --note "수정 및 재검증 결과"\n`+
    `node tools/qa.mjs gate --project ... --plan ... --task T01\n`+
    `node tools/qa.mjs snapshot-create --project ... --plan ... --task T01 --label "검증된 기준선"\n`+
    `node tools/qa.mjs snapshot-verify --project ... --id S-...\n`+
    `node tools/qa.mjs snapshot-restore --project ... --id S-... [--apply]\n`;
}
function main(){
 try {
  const [verb,...args]=process.argv.slice(2),o=options(args);
  if(!verb||verb==='help'){process.stdout.write(help());return;}
  const project=fs.realpathSync(requireArg(o.project,'--project'));
  const planFile=o.plan?path.resolve(o.plan):path.join(project,'qa-plan.json');
  let result;
  const localExclude=ensureLocalExclude(project);
  switch(verb){
    case 'inspect': {const {plan,planHash}=loadPlan(planFile,project);result={version:plan.version,planHash,localExclude,trackedPaths:plan.trackedPaths,suites:Object.fromEntries(PHASES.map(p=>[p,plan.suites[p].map(c=>c.id)])),manualChecks:plan.manualChecks||[],fingerprint:fingerprint(project,plan.trackedPaths)};break;}
    case 'run': result=runPhase({project,planFile,task:o.task,phase:o.phase});break;
    case 'manual':result=recordManual({project,planFile,task:o.task,check:o.check,result:o.result,note:o.note});break;
    case 'gate':result=gate({project,planFile,task:o.task,save:true});break;
    case 'issue-add':result=addIssue(project,o.task,o.severity,o.summary,o.repro);break;
    case 'issue-resolve':result=resolveIssue(project,o.id,o.note);break;
    case 'snapshot-create':result=createSnapshot({project,planFile,label:o.label||'baseline',task:o.task||null});break;
    case 'snapshot-verify':result=verifySnapshot({project,id:o.id});break;
    case 'snapshot-restore':result=restoreSnapshot({project,id:o.id,apply:o.apply===true});break;
    default: throw Error('알 수 없는 명령\n'+help());
  }
  process.stdout.write(json(result));
  if (result.status==='HOLD'||result.pass===false||result.valid===false)process.exitCode=1;
 } catch(e){process.stderr.write(`ERROR: ${e.message}\n`);process.exitCode=2;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))main();
