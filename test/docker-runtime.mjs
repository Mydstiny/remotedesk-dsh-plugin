import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DockerExecutor} from '../src/docker-executor.mjs';
const exec=promisify(execFile);const root=await mkdtemp(join(tmpdir(),'remotedesk-docker-test-'));await mkdir(join(root,'project'));const path=await realpath(join(root,'project')); 
const state=new Map();const store={get(k,id){return k==='meta'?{id:'fixture-owner'}:state.get(k+':'+id);},put(k,id,v){state.set(k+':'+id,v);},delete(k,id){state.delete(k+':'+id);},all(k){return [...state.entries()].filter(([key])=>key.startsWith(k+':')).map(([,v])=>v);}};
const image=(await exec('docker',['image','inspect','remotedesk-dsh-sandbox:0.2.0','--format','{{.Id}}'])).stdout.trim();const project={id:'test',path,image};const executor=new DockerExecutor(store);
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
try{
 await writeFile(join(root,'secret-canary.txt'),'PRIVATE_CANARY');await writeFile(join(path,'inside.txt'),'INSIDE');
 const program=`const fs=require('fs'),net=require('net');if(process.getuid()===0)throw Error('ROOT');fs.writeFileSync('/workspace/allowed.txt','OK');for(const p of [${JSON.stringify(join(root,'secret-canary.txt'))},'/var/run/docker.sock','/root/.ssh/id_rsa']){if(fs.existsSync(p))throw Error('HOST_VISIBLE');}try{fs.writeFileSync('/outside','BAD');throw Error('ROOT_WRITABLE');}catch(e){if(e.message==='ROOT_WRITABLE')throw e;}const sock=net.connect({host:'1.1.1.1',port:443});sock.on('connect',()=>{console.log('NETWORK_ESCAPE');process.exit(1);});sock.on('error',()=>{console.log('ISOLATION_OK');});sock.setTimeout(1000,()=>{sock.destroy();console.log('ISOLATION_OK');});`;
 const result=await executor.run(project,'node -e '+quote(program));assert.equal(result.exitCode,0);assert.match(result.stdout,/ISOLATION_OK/);assert.equal(await readFile(join(path,'allowed.txt'),'utf8'),'OK');assert.equal(store.all('container').length,0);
 // Symlink escape remains a container path, never a host filesystem read.
 const symlinkProgram=`const fs=require('fs');fs.symlinkSync(${JSON.stringify(join(root,'secret-canary.txt'))},'/workspace/link');try{fs.readFileSync('/workspace/link');process.exit(1);}catch{console.log('SYMLINK_BLOCKED');}`;
 assert.match((await executor.run(project,'node -e '+quote(symlinkProgram))).stdout,/SYMLINK_BLOCKED/);
 const controller=new AbortController();const running=executor.run(project,"node -e 'setInterval(()=>{},1000)'",{signal:controller.signal});setTimeout(()=>controller.abort(),600);await assert.rejects(running,/EXECUTION_CANCELLED|AbortError/);assert.equal(store.all('container').length,0);
 assert.equal((await exec('docker',['ps','-aq','--filter','label=org.remotedesk.owner=fixture-owner'])).stdout.trim(),'');
 console.log('PASS real Docker: non-root process, project write, outside-root/host secret/socket/symlink/network denial, cancellation and zero remaining owned containers');console.log('Tested image '+image);
}finally{await executor.recover();await rm(root,{recursive:true,force:true});}
