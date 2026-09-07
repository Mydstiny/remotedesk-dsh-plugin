#!/usr/bin/env node
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {main} from '@remotedesk/bridge-core/cli';
import {requireThat} from '@remotedesk/bridge-core/errors';
import {doctor,locateRuntime} from '../src/doctor.mjs';
const executable=async()=>join(await locateRuntime(),'lib','bin.js');
await main({engine:'dsh',entry:fileURLToPath(import.meta.url),doctor,
 serve:async state=>{
  requireThat((await doctor()).status==='ok','DSH_RUNTIME_UNVERIFIED');
  const launch=JSON.parse(await readFile(join(state,'launch.json'),'utf8'));requireThat(/^[a-zA-Z0-9_-]{1,40}$/.test(launch.profile),'PROFILE_INVALID');
  const bin=await executable();process.env.REMOTEDESK_DSH_STATE=state;process.argv=[process.execPath,bin,'--profile',launch.profile];
  // Boot the installed native DSH profile in this process. Its Cordis runtime
  // owns the adapter and all lifecycle/dispose handlers; no CLI-output scraping.
  await import(pathToFileURL(bin).href);
 },
 extra:async(command,state,config,o)=>{
  if(command!=='plugin-install')return false;
  const profile=o.profile??'remotedesk';requireThat(/^[a-zA-Z0-9_-]{1,40}$/.test(profile),'PROFILE_INVALID');requireThat(o.package,'PACKAGE_REQUIRED');const archive=resolve(o.package);requireThat(archive.endsWith('.tgz')&&(await stat(archive)).isFile(),'LOCAL_PACKAGE_REQUIRED');
  requireThat((await doctor()).status==='ok','DSH_RUNTIME_UNVERIFIED');const bin=await executable();
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[bin,'plugin','--profile',profile,'add',archive],{shell:false,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('PLUGIN_INSTALL_FAILED')));});
  await writeFile(join(state,'launch.json'),JSON.stringify({profile},null,2)+'\n',{mode:0o600});console.log(JSON.stringify({installed:true,profile,restartRequired:true}));return true;
 }
});
