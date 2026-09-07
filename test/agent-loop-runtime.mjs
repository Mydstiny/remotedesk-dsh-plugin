import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {locateRuntime} from '../src/doctor.mjs';
import {DshAdapter} from '../src/dsh-adapter.mjs';
const root=await mkdtemp(join(tmpdir(),'remotedesk-dsh-loop-'));const workspace=join(root,'workspace');await mkdir(workspace);
const runtime=process.argv[2]??await locateRuntime();const require=createRequire(join(runtime,'package.json'));const load=async name=>import(pathToFileURL(require.resolve(name)).href);
const {Context}=await load('@deepseek-ai/cordis');const {LlmAdapter}=await load('@deepseek-ai/dsh-llm');const ctx=new Context();
let selected='text',toolCalls=0,hostCalls=0,questionCalls=0;const schemas=[];const events=[];let approved=true;
class Fixture extends LlmAdapter {
 async *stream(options){
  schemas.push((options.tools??[]).map(t=>t.name));
  if(selected==='hang'){await new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true}));return;}
  const mode=selected;selected='text';
  if(mode!=='text'){
   const name=mode==='exec'?'remotedesk_workspace_exec':mode==='question'?'remotedesk_question':mode;
   const args=name==='remotedesk_workspace_exec'?{command:'printf fixture'}:name==='remotedesk_question'?{question:'Fixture question?'}:{};
   const block={type:'tool-call',id:'fixture-call-'+schemas.length,name,arguments:JSON.stringify(args)};
   yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id:block.id,name,argumentsDelta:block.arguments};yield {type:'block-end',index:0,block};yield {type:'finish',reason:{kind:'tool-calls'}};return;
  }
  yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'DSH_FIXTURE_OK'};yield {type:'block-end',index:0,block:{type:'text',text:'DSH_FIXTURE_OK'}};yield {type:'finish',reason:{kind:'stop'}};
 }
}
const executor={async recover(){},async check(){},async run(){toolCalls++;return {exitCode:0,stdout:'fixture',stderr:''};}};
let adapter;
try{
 for(const [name,config]of [
 ['dsh-llm',{}],['dsh-system-prompt',{}],['dsh-session',{}],['dsh-session-projection',{}],['dsh-agent',{}],['dsh-tools',{mode:'native'}],['dsh-session-persistence-jsonl',{root:join(root,'sessions'),compression:'none'}],['dsh-user-questions',{}],['dsh-agent-loop',{agents:[]}]
 ]){const module=await load('@deepseek-ai/'+name);await ctx.plugin(module.default,config);}
 ctx.llm.registerAdapter(['fixture'],new Fixture());
 const originalQuestions=ctx.on('user-questions/request',async()=>{questionCalls++;return {answers:[{id:'unchanged',selected:[],custom:'existing UI'}]};});
 const output={schema:{type:'object'},render:()=>[{type:'text',text:'host'}]};
 ctx.tools.register({name:'host_danger',description:'must be hidden',parameters:{type:'object'},output,execute:async()=>{hostCalls++;return {};}});
 ctx.on('agent/created',({agent})=>{if(agent.id.startsWith('remote')){agent.ctx.tools.register({name:'late_host_tool',description:'must be denied',parameters:{type:'object'},output,execute:async()=>{hostCalls++;return {};}});agent.ctx.on('tools/pre-execute',async()=>({kind:'allow'}));}});
 adapter=new DshAdapter(ctx,{executor});adapter.bind({projects:[{id:'p',path:workspace,provider:'fixture',model:'fixture'}],emit:(id,e)=>events.push(e),ask:async(id,r)=>r.kind==='question'?{text:'remote answer'}:{decision:approved?'accept':'decline'}});
 const s={id:'remote-fixture',project:'p'};await adapter.create(s);
 const turn=async mode=>{selected=mode;await adapter.start(s,'Fixture.');const a=ctx.agents.get(s.id);await a.whenIdle();await ctx.sessions.flush(a.session);await new Promise(r=>setImmediate(r));};
 await turn('exec');assert.equal(toolCalls,1);assert.equal(hostCalls,0);assert.ok(schemas.every(s=>!s.includes('host_danger')&&!s.includes('run_code')));
 approved=false;await turn('exec');assert.equal(toolCalls,1);
 await turn('late_host_tool');assert.equal(hostCalls,0);assert.ok(events.some(e=>JSON.stringify(e).includes('REMOTEDESK_TOOL_SCOPE_DENIED')));
 await turn('run_code');assert.equal(hostCalls,0);
 await turn('question');assert.equal(questionCalls,0);assert.ok(events.some(e=>JSON.stringify(e).includes('remote answer')));
 await ctx.userQuestions.ask({questions:[{id:'unchanged',question:'Existing UI?',options:[]}]});assert.equal(questionCalls,1);
 selected='hang';await adapter.start(s,'Cancel this.');await new Promise(r=>setTimeout(r,50));await adapter.cancel(s);assert.equal(ctx.agents.get(s.id).status,'idle');
 const before=await adapter.read(s);assert.ok(before.events.length>0);
 await adapter.close();adapter=new DshAdapter(ctx,{executor});adapter.bind({projects:[{id:'p',path:workspace,provider:'fixture',model:'fixture'}],emit:(id,e)=>events.push(e),ask:async()=>({decision:'decline'})});await adapter.resume(s);const after=await adapter.read(s);assert.ok(after.events.length>=before.events.length);
 await adapter.close();originalQuestions();console.log('PASS real DSH AgentLoop: model and tools, approve/deny, scoped late-tool/PTC rejection, existing questions UI, cancel, persistence, dispose/resume. Executor is a deterministic fixture; Docker has a separate test.');
}finally{await adapter?.close();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
