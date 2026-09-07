import { Bridge } from '@remotedesk/bridge-core';
import { doctor } from './doctor.mjs';
import { DshAdapter } from './dsh-adapter.mjs';
export const name='remotedesk-bridge';
export const inject=['agents','sessions','agentLoop','tools','sessionPersistence'];
// Native Cordis plugin in the host's runtime. A configured state directory is
// required; merely installing the plugin never opens a listener.
export async function apply(ctx,config={}) {
 const directory=config.stateDirectory??process.env.REMOTEDESK_DSH_STATE;
 if(!directory){ctx.provide('remotedeskBridge',{status:()=>({configured:false,listening:false})});return;}
 if((await doctor()).status!=='ok')throw new Error('DSH_RUNTIME_UNVERIFIED');
 const adapter=new DshAdapter(ctx);const bridge=new Bridge(directory,adapter);
 ctx.effect(()=>()=>bridge.stop());
 await bridge.start();console.log(JSON.stringify({ready:true,engine:'dsh',protocol:1}));
 ctx.provide('remotedeskBridge',{status:()=>({configured:true,listening:!bridge.stopping,protocol:1})});
}
