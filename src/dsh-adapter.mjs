import { randomUUID } from 'node:crypto';
import { Fault, requireThat, fields, string } from '@remotedesk/bridge-core/errors';
import {workspaceTools,executeWorkspaceTool,validateWorkspaceAnswer,projectDiff} from '@remotedesk/bridge-core/workspace-tools';
import { DockerExecutor } from './docker-executor.mjs';
const PUBLIC_EVENT=/^(user\/message|assistant\/(chunk|message)|tool\/(call|result)|turn\/(start|end)|step\/(start|end))$/;
const output={schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
export class DshAdapter {
 capabilities={sessions:true,turns:true,steer:true,cancel:true,approvals:true,questions:true,diffs:true,attachments:['text/plain','image/png','image/jpeg'],execution:'docker-project-mount-no-network',outsideSandboxApproval:false};
 constructor(ctx,{executor}={}) {this.ctx=ctx;this.handles=new Map();this.loading=new Map();this.runs=new Map();this.customExecutor=executor;this.disposers=[];this.closed=false;}
 bind(core){this.core=core;this.executor=this.customExecutor??new DockerExecutor(core.storage);
  this.disposers.push(this.ctx.on('session/event',(session,event)=>{const h=this.handles.get(session.id);if(!h || h.agent.session!==session || this.ctx.agents.get(session.id)!==h.agent)return;if(PUBLIC_EVENT.test(event.type))core.emit(session.id,{type:event.type,seq:event.seq,data:event.data});}));
 }
 async prepare(){await this.executor.recover();for(const p of this.core.projects)await this.executor.check(p);}
 project(s){const p=this.core.projects.find(p=>p.id===s.project);requireThat(p,'PROJECT_NOT_FOUND');return p;}
 options(p){return {...(this.ctx.agentDefaultModel?.currentSelection()??{}),...(p.provider?{provider:p.provider}:{}),...(p.model?{model:p.model}:{})};}
 setup(s,p) {
  return agentCtx=>{
   const expected=new Map();let ready=false;
   agentCtx.tools.restrict({allow:[]});agentCtx.tools.presentAs('native');
   agentCtx.tools.guard(exec=>{
    const handle=this.handles.get(s.id),definition=agentCtx.tools.get(exec.name,exec.agent);
    return this.closed || !ready || !handle || handle.agent!==exec.agent || this.ctx.agents.get(s.id)!==exec.agent || exec.parent || !expected.has(exec.name) || definition?.execute!==expected.get(exec.name) ? 'REMOTEDESK_TOOL_SCOPE_DENIED' : undefined;
   });
   const register=(definition)=>{expected.set(definition.name,definition.execute);agentCtx.tools.register(definition);};
   for(const tool of workspaceTools)register({name:tool.name,description:tool.description,parameters:tool.inputSchema,output,execute:(args,exec)=>executeWorkspaceTool({executor:this.executor,core:this.core,session:s,project:p,name:tool.name,args,signal:exec.signal})});
   return {commit:()=>{ready=true;}};
  };
 }
 async connect(s,create=false) {
  requireThat(!this.closed,'ADAPTER_DISPOSED');const old=this.handles.get(s.id);if(old){requireThat(this.ctx.agents.get(s.id)===old.agent,'AGENT_INSTANCE_CHANGED');return old;}
  if(this.loading.has(s.id))return this.loading.get(s.id);
  const p=this.project(s);const pending=(async()=>{await this.executor.check(p);const opts={agentOptions:this.options(p),setup:this.setup(s,p)};
   const handle=await (create?this.ctx.agents.create({...opts,sessionId:s.id,meta:{cwd:p.path}}):this.ctx.agents.resume({...opts,resumeSessionId:s.id}));
   if(this.closed){await handle.dispose();throw new Fault('ADAPTER_DISPOSED');}
   this.handles.set(s.id,handle);return handle;
  })();this.loading.set(s.id,pending);try{return await pending;}finally{this.loading.delete(s.id);}
 }
 async create(s){await this.connect(s,true);return {upstream:s.id};}
 async resume(s){await this.connect(s);}
 async read(s,{cursor}={}) {const {agent}=await this.connect(s);const from=cursor===undefined?0:Number(cursor);requireThat(Number.isSafeInteger(from)&&from>=0,'CURSOR_INVALID');const rows=agent.session.snapshotEvents().filter(e=>e.seq>=from&&PUBLIC_EVENT.test(e.type));const events=rows.slice(0,200);return {status:agent.status,events,nextCursor:rows.length>events.length?String(events.at(-1).seq+1):null};}
 async start(s,text,attachments=[]) {
  requireThat(!this.runs.has(s.id),'TURN_ALREADY_RUNNING');const run={id:randomUUID(),cancelled:false};run.ready=new Promise(resolve=>{run.readyResolve=resolve;});this.runs.set(s.id,run);
  try{
   const {agent}=await this.connect(s);requireThat(agent.status==='idle','TURN_ALREADY_RUNNING');
   const images=attachments.filter(a=>a.mime!=='text/plain');let refs=[];
   if(images.length){requireThat(this.ctx.attachments,'IMAGE_STORE_UNAVAILABLE');refs=await this.ctx.attachments.saveImages(images.map(a=>({data:Buffer.from(a.data,'base64'),mediaType:a.mime})));}
   requireThat(!run.cancelled,'TURN_CANCELLED_BEFORE_DISPATCH');
   let i=0;const content=[{type:'text',text},...attachments.map(a=>a.mime==='text/plain'?{type:'text',text:Buffer.from(a.data,'base64').toString('utf8')}:{type:'image',attachment:refs[i++]})];
   agent.followup({id:run.id,role:'user',source:{kind:'user'},content});run.agent=agent;run.readyResolve();
   // Whole-agent idle is used only as activity quiescence, never as a per-message result.
   void agent.whenIdle().then(async()=>{await this.ctx.sessions.flush(agent.session);if(this.runs.get(s.id)===run)this.runs.delete(s.id);},()=>{}).catch(()=>this.core.emit(s.id,{type:'persistence.failed'}));
   await this.ctx.sessions.flush(agent.session);return {messageId:run.id,accepted:true};
  }catch(e){if(this.runs.get(s.id)===run&&!run.agent)this.runs.delete(s.id);throw e;}finally{run.readyResolve();}
 }
 async steer(s,text){const run=this.runs.get(s.id);requireThat(run?.agent&&!run.cancelled&&run.agent.status==='running','NO_ACTIVE_TURN');const id=randomUUID();run.agent.steer({id,role:'user',source:{kind:'user'},content:[{type:'text',text}]});await this.ctx.sessions.flush(run.agent.session);return {messageId:id};}
 async cancel(s){if(!s)return;const run=this.runs.get(s.id);if(run){run.cancelled=true;await run.ready;}const agent=this.handles.get(s.id)?.agent;if(agent){agent.cancel({kind:'user'},{keepInbox:false});await agent.whenIdle();await this.ctx.sessions.flush(agent.session);}if(this.runs.get(s.id)===run)this.runs.delete(s.id);}
 async diff(s){return projectDiff(this.executor,this.project(s));}
 validateAnswer(request,answer){validateWorkspaceAnswer(request,answer);}
 async deactivate(s){requireThat(!this.runs.has(s.id),'TURN_ALREADY_RUNNING');const h=this.handles.get(s.id);if(h){await h.dispose();this.handles.delete(s.id);}}
 async close(){if(this.closed)return;this.closed=true;for(const r of this.runs.values())r.cancelled=true;await Promise.allSettled([...this.loading.values()]);const results=await Promise.allSettled([...this.handles.values()].map(h=>h.dispose()));for(const d of this.disposers)d();this.handles.clear();if(results.some(r=>r.status==='rejected'))throw new Fault('DSH_CLEANUP_UNCONFIRMED');await this.executor?.recover();}
}
const shQuote=value=>"'"+value.replaceAll("'","'\\''")+"'";
