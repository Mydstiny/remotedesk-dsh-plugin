import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { configuration, addProject, invite, revoke, status } from "@remotedesk/bridge-core/admin";
import { Store } from "@remotedesk/bridge-core/store";
import { privateDirectory } from "@remotedesk/bridge-core/privacy";

const MAX_BODY = 100 * 1024;
const DEFAULT_PORTS = { codex: 9543, dsh: 9544 };
const QR_GENERATOR = readFileSync(new URL("../vendor/qrcode-generator-2.0.4.js", import.meta.url), "utf8");

const PAGE = [
  "<!doctype html>",
  "<html lang='zh-CN'>",
  "<head>",
  "<meta charset='utf-8'>",
  "<meta name='viewport' content='width=device-width, initial-scale=1'>",
  "<title>RemoteDesk 控制面板</title>",
  "<style>",
  ":root{color-scheme:light dark;--panel-bg:#f4f6f8;--panel-surface:#fff;--panel-border:#dbe1e6;--panel-text:#17202a;--panel-muted:#52606d;--panel-input:#fff;--panel-input-border:#c7d0d8;--panel-row-border:#dbe1e6;--panel-badge:#e8edf1;--panel-badge-text:#17202a;--panel-notice:#e8f1ff;--panel-notice-text:#174b86;--panel-ok-bg:#d7f4df;--panel-ok-text:#145c2a;--panel-warn-bg:#fff0c2;--panel-warn-text:#765100;--panel-bad-bg:#ffdede;--panel-bad-text:#8b1e1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.45}",
  "@media(prefers-color-scheme:dark){:root{--panel-bg:#15191e;--panel-surface:#20262d;--panel-border:#3a4652;--panel-text:#eef2f5;--panel-muted:#b8c3ce;--panel-input:#15191e;--panel-input-border:#586777;--panel-row-border:#3a4652;--panel-badge:#36414c;--panel-badge-text:#eef2f5;--panel-notice:#293f5c;--panel-notice-text:#dbeafe;--panel-ok-bg:#214c32;--panel-ok-text:#b8f1c9;--panel-warn-bg:#5a481c;--panel-warn-text:#ffe39a;--panel-bad-bg:#5d2b2b;--panel-bad-text:#ffd1d1}}",
  "body{margin:0;background:var(--panel-bg);color:var(--panel-text)}",
  "[hidden]{display:none!important}",
  "main{max-width:1100px;margin:0 auto;padding:24px}",
  "header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}",
  "h1{font-size:1.45rem;margin:0}.subtitle{margin:.25rem 0 0;color:var(--panel-muted)}",
  ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:16px}",
  ".card{background:var(--panel-surface);border:1px solid var(--panel-border);border-radius:12px;padding:16px;box-shadow:0 2px 8px #12203312}",
  ".card h2{font-size:1rem;margin:0 0 12px}.row{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:7px 0}",
  ".muted{color:var(--panel-muted)}.badge{border-radius:999px;padding:2px 9px;font-size:.78rem;font-weight:600;background:var(--panel-badge);color:var(--panel-badge-text)}.ok{background:var(--panel-ok-bg);color:var(--panel-ok-text)}.warn{background:var(--panel-warn-bg);color:var(--panel-warn-text)}.bad{background:var(--panel-bad-bg);color:var(--panel-bad-text)}",
  "button{border:0;border-radius:7px;background:#1769d1;color:#fff;padding:8px 12px;font:inherit;cursor:pointer}button.secondary{background:#687582}button.danger{background:#b72b2b}button:disabled{opacity:.55;cursor:wait}",
  "input,select,textarea{box-sizing:border-box;border:1px solid var(--panel-input-border);border-radius:7px;padding:8px;font:inherit;width:100%;background:var(--panel-input);color:var(--panel-text)}textarea{min-height:145px;font-family:ui-monospace,monospace;font-size:.82rem}",
  "label{display:block;font-size:.86rem;margin:9px 0 4px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.project-check{display:flex;gap:8px;align-items:center;margin:6px 0}.project-check input{width:auto}",
  "table{width:100%;border-collapse:collapse;font-size:.88rem}th,td{text-align:left;padding:7px;border-bottom:1px solid var(--panel-row-border);vertical-align:top}th{font-weight:600}.empty{padding:12px 0}.notice{border-radius:8px;padding:10px 12px;margin-top:16px;background:var(--panel-notice);color:var(--panel-notice-text)}.notice.error{background:var(--panel-bad-bg);color:var(--panel-bad-text)}",
  ".invite-result{margin-top:14px;padding-top:12px;border-top:1px solid var(--panel-border)}.pair-method{margin-top:10px}.qr-box{display:flex;justify-content:center;align-items:center;min-height:220px;margin-top:10px;padding:12px;border:1px solid var(--panel-border);border-radius:10px;background:#fff;color:#17202a}.qr-box svg{display:block;max-width:100%;height:auto}.pair-link{margin-top:10px;padding:10px;border:1px solid var(--panel-border);border-radius:8px;background:var(--panel-input);overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:.78rem}.pair-link code{white-space:pre-wrap}.hint{margin:.55rem 0 0;color:var(--panel-muted);font-size:.84rem}details{margin-top:10px}summary{cursor:pointer;color:var(--panel-muted)}",
  "button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #8ab4f8;outline-offset:2px}",
  "</style>",
  "</head>",
  "<body>",
  "<main>",
  "<header><div><h1>RemoteDesk 控制面板</h1><div class='subtitle' id='subtitle'>正在加载状态…</div></div><div class='actions'><button id='refresh'>刷新状态</button></div></header>",
  "<div id='notice' class='notice' role='status' aria-live='polite' hidden></div>",
  "<section class='grid'>",
  "<article class='card'><h2>服务状态</h2><div id='service'>加载中…</div></article>",
  "<article class='card'><h2>连接摘要</h2><div id='summary'>加载中…</div></article>",
  "</section>",
  "<section class='grid'>",
  "<article class='card'><h2>配对设备</h2><div id='devices'>加载中…</div></article>",
  "<article class='card'><h2>项目</h2><div id='projects'>加载中…</div><form id='project-form'><label for='project-id'>项目 ID</label><input id='project-id' required pattern='[A-Za-z0-9_-]+' maxlength='100'><label for='project-path'>本机项目目录</label><input id='project-path' required placeholder='/absolute/project/path'><label for='project-title'>显示名称</label><input id='project-title' maxlength='200'><div class='actions'><button type='submit'>添加项目</button></div></form></article>",
  "</section>",
  "<section class='grid'>",
  "<article class='card'><h2>创建配对邀请</h2><p class='hint'>默认使用二维码；二维码不可用时切换到链接配对。完整 JSON 只作为手动导入备用方式。</p><form id='invite-form'><div id='project-checks'></div><label for='invite-role'>权限</label><select id='invite-role'><option value='operator'>operator（可操作）</option><option value='viewer'>viewer（只读）</option></select><div class='actions'><button type='submit'>生成 120 秒邀请</button></div></form><div id='invite-result' class='invite-result' hidden><label for='pair-method'>配对方式</label><select id='pair-method' class='pair-method'><option value='qr'>二维码（默认）</option><option value='link'>链接配对</option></select><div id='pair-qr' class='qr-box' role='img' aria-label='配对二维码'></div><div id='pair-link' class='pair-link' hidden><code id='pair-link-value'></code><div class='actions'><button id='copy-link' type='button'>复制配对链接</button></div></div><p class='hint'>扫码或复制链接完成配对；二维码不可用时选择“链接配对”。</p><div class='actions'><button id='copy-payload' type='button'>复制邀请 JSON</button></div><details><summary>显示完整邀请 JSON（手动导入）</summary><textarea id='invite-output' readonly aria-label='完整邀请 JSON'></textarea></details></div></article>",
  "<article class='card'><h2>使用说明</h2><p class='muted'>面板只绑定 127.0.0.1。它显示服务锁、已配对设备和项目配置；协议目前没有客户端在线心跳，所以“已配对”不等于客户端当前在线。</p><p class='muted'>邀请包含设备证书材料，只通过可信渠道传给要配对的设备；完成配对后删除传输副本。</p></article>",
  "</section>",
  "</main>",
  "<script>",
  QR_GENERATOR,
  "const initialToken=new URLSearchParams(location.search).get('token');",
  "if(initialToken){sessionStorage.setItem('remotedesk.panel.token',initialToken);history.replaceState(null,'','/');}",
  "const token=sessionStorage.getItem('remotedesk.panel.token')||'';",
  "const $=id=>document.getElementById(id);",
  "const esc=value=>String(value??'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[ch]));",
  "function notice(message,error=false){const el=$('notice');el.textContent=message;el.className=error?'notice error':'notice';el.hidden=!message;}",
  "async function api(path,options={}){const headers=Object.assign({'Authorization':'Bearer '+token},options.headers||{});if(options.body)headers['Content-Type']='application/json';const response=await fetch(path,Object.assign({},options,{headers}));let data;try{data=await response.json()}catch{data={}}if(!response.ok)throw new Error(data.error||('HTTP_'+response.status));return data;}",
  "function serviceText(service){const label=service.running?'运行中':service.lock==='stale'?'锁文件陈旧':'未运行';const cls=service.running?'ok':service.lock==='stale'?'warn':'bad';return '<div class=\"row\"><span>状态</span><span class=\"badge '+cls+'\">'+label+'</span></div><div class=\"row\"><span>监听</span><span>'+esc(service.host)+':'+esc(service.port)+'</span></div><div class=\"row\"><span>进程</span><span>'+esc(service.pid||'—')+'</span></div>';}",
  "let currentData=null;let currentInvite=null;let currentPairingLink='';",
  "function base64Url(value){const bytes=new TextEncoder().encode(value);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/g,'');}",
  "function pairingLink(invite,data){const service=data?.service;const host=typeof service?.host==='string'?service.host.trim():'';const port=Number(service?.port);let url='';if(host!==''&&Number.isInteger(port)&&port>0&&port<65536){const authority=host.includes(':')&&!host.startsWith('[')?'['+host+']':host;url='https://'+authority+':'+String(port)}const payload={type:'remotedesk-pair',version:1,engine:data?.engine||'dsh',...(url===''?{}:{url}),invite:{code:invite.code,expires:invite.expires,ca:invite.ca,serverInstance:invite.serverInstance}};return 'remotedesk://pair?data='+base64Url(JSON.stringify(payload));}",
  "function renderPairingMethod(){if(!currentInvite)return;const method=$('pair-method').value;const qr=$('pair-qr');const link=$('pair-link');if(method==='link'){qr.hidden=true;link.hidden=false;$('pair-link-value').textContent=currentPairingLink;return}link.hidden=true;qr.hidden=false;try{const generator=qrcode(0,'M');generator.addData(JSON.stringify(currentInvite),'Byte');generator.make();qr.innerHTML=generator.createSvgTag(4,4,'RemoteDesk pairing QR','RemoteDesk')}catch{qr.textContent='二维码暂时不可用，请切换到链接配对。'}}",
  "function renderInvite(invite){currentInvite=invite;currentPairingLink=pairingLink(invite,currentData);$('invite-output').value=JSON.stringify(invite,null,2);$('invite-result').hidden=false;$('pair-method').value='qr';renderPairingMethod();}",
  "async function copyText(value,message){try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else{const helper=document.createElement('textarea');helper.value=value;helper.style.position='fixed';helper.style.opacity='0';document.body.appendChild(helper);helper.select();const copied=document.execCommand('copy');helper.remove();if(!copied)throw new Error('COPY_UNAVAILABLE')}notice(message)}catch{notice('复制失败，请展开完整 JSON 后手动复制。',true)}}",
  "function render(data){currentData=data;$('subtitle').textContent=esc(data.engine.toUpperCase())+' · 控制面板仅限本机 · '+new Date().toLocaleTimeString();$('service').innerHTML=serviceText(data.service);$('summary').innerHTML='<div class=\"row\"><span>项目</span><b>'+data.projects.length+'</b></div><div class=\"row\"><span>已配对设备</span><b>'+data.devices.filter(d=>d.status==='paired').length+'</b></div><div class=\"row\"><span>会话</span><b>'+data.sessions.length+'</b></div><div class=\"row\"><span>操作记录</span><b>'+Object.values(data.operations).reduce((a,b)=>a+b,0)+'</b></div>';",
  "const projects=data.projects.map(p=>'<div class=\"row\"><span><b>'+esc(p.title)+'</b><br><small class=\"muted\">'+esc(p.id)+' · '+esc(p.path)+'</small></span><span class=\"badge\">'+esc(p.provider||'default')+'</span></div>').join('')||'<div class=\"empty muted\">尚未配置项目</div>';$('projects').innerHTML=projects;",
  "const checks=data.projects.map(p=>'<label class=\"project-check\"><input type=\"checkbox\" name=\"project\" value=\"'+esc(p.id)+'\"> <span>'+esc(p.title)+'（'+esc(p.id)+'）</span></label>').join('')||'<div class=\"muted\">先添加项目</div>';$('project-checks').innerHTML=checks;",
  "const devices=data.devices.map(d=>{const cls=d.status==='paired'?'ok':d.status==='revoked'?'bad':'warn';const label=d.status==='paired'?'已配对':d.status==='revoked'?'已撤销':'已过期';return '<tr><td><b>'+esc(d.name||'未命名设备')+'</b><br><small>'+esc(d.id)+'</small></td><td>'+esc(d.role)+'<br><span class=\"badge '+cls+'\">'+label+'</span></td><td>'+esc((d.projects||[]).join(', '))+'</td><td>'+(d.revoked?'—':'<button class=\"danger revoke\" data-device=\"'+esc(d.id)+'\">撤销</button>')+'</td></tr>'}).join('');$('devices').innerHTML=devices?'<table><thead><tr><th>设备</th><th>角色</th><th>项目</th><th>操作</th></tr></thead><tbody>'+devices+'</tbody></table>':'<div class=\"empty muted\">尚未配对设备</div>';document.querySelectorAll('.revoke').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('撤销此设备的远程访问？'))return;button.disabled=true;try{await api('/api/revoke',{method:'POST',body:JSON.stringify({device:button.dataset.device})});notice('设备已撤销');await refresh()}catch(error){notice(error.message,true)}finally{button.disabled=false}}));}",
  "async function refresh(){if(!token){notice('控制令牌缺失。请使用插件启动时输出的本机面板 URL 打开。',true);return}try{notice('');render(await api('/api/status'))}catch(error){notice(error.message,true)}}",
  "$('refresh').addEventListener('click',refresh);",
  "$('project-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await api('/api/project',{method:'POST',body:JSON.stringify({id:$('project-id').value,path:$('project-path').value,title:$('project-title').value||undefined})});event.target.reset();notice('项目已添加；服务重启后会加载新的项目配置');await refresh()}catch(error){notice(error.message,true)}finally{button.disabled=false}});",
  "$('pair-method').addEventListener('change',renderPairingMethod);$('copy-link').addEventListener('click',()=>copyText(currentPairingLink,'配对链接已复制'));$('copy-payload').addEventListener('click',()=>copyText(JSON.stringify(currentInvite,null,2),'邀请 JSON 已复制'));",
  "$('invite-form').addEventListener('submit',async event=>{event.preventDefault();const projects=[...document.querySelectorAll('input[name=project]:checked')].map(input=>input.value);if(!projects.length){notice('至少选择一个项目',true);return}const button=event.target.querySelector('button');button.disabled=true;try{const result=await api('/api/invite',{method:'POST',body:JSON.stringify({projects,role:$('invite-role').value})});renderInvite(result.invite);notice('邀请已生成，120 秒后过期')}catch(error){notice(error.message,true)}finally{button.disabled=false}});",
  "refresh();",
  "</script>",
  "</body>",
  "</html>"
].join("\n");

function httpError(statusCode, error) {
  const candidate = error && typeof error === "object" ? error.code || error.message : undefined;
  const response = typeof candidate === "string" && /^[A-Z][A-Z0-9_]{1,80}$/.test(candidate) ? candidate : undefined;
  return { statusCode, error: response || "PANEL_REQUEST_FAILED" };
}

function json(res, statusCode, value) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function page(res) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(PAGE);
}

function sameToken(expected, supplied) {
  if (typeof supplied !== "string" || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function requestToken(req) {
  const authorization = req.headers.authorization;
  return typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;
}

function validOrigin(req, origin) {
  return !req.headers.origin || req.headers.origin === origin;
}

async function body(req) {
  const declared = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) throw new Error("REQUEST_TOO_LARGE");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("JSON_OBJECT_REQUIRED");
    return parsed;
  } catch (error) {
    if (error.message === "JSON_OBJECT_REQUIRED") throw error;
    throw new Error("JSON_INVALID");
  }
}

export async function serviceState(state) {
  let lock;
  try {
    lock = JSON.parse(await readFile(join(state, "server.lock"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { running: false, lock: "missing" };
    return { running: false, lock: "stale" };
  }
  const pid = lock && lock.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0) return { running: false, lock: "stale", pid };
  try {
    process.kill(pid, 0);
    return { running: true, lock: "active", pid };
  } catch (error) {
    return { running: false, lock: "stale", pid };
  }
}

/**
 * Project the paired-device rows the panel and the Web settings page share.
 * @param state - plugin state directory.
 * @returns device summaries, oldest first, with derived expiry status.
 */
export async function deviceSummaries(state) {
  const store = new Store(state);
  try {
    return store.all("device").map((device) => {
      const expires = Number.isSafeInteger(device.expires) ? device.expires : null;
      return {
        id: device.id,
        name: device.name || "",
        projects: Array.isArray(device.projects) ? device.projects : [],
        role: device.role || "viewer",
        revoked: device.revoked === true,
        expires,
        status: device.revoked === true ? "revoked" : expires && expires <= Date.now() ? "expired" : "paired",
      };
    });
  } finally {
    store.close();
  }
}

async function snapshot(state, engine, panelPort) {
  const config = await configuration(state);
  const current = status(state);
  const devices = await deviceSummaries(state);
  return {
    engine,
    panel: { host: "127.0.0.1", port: panelPort },
    service: { host: config.host, port: config.port, ...(await serviceState(state)) },
    projects: (config.projects || []).map((project) => ({
      id: project.id,
      path: project.path,
      title: project.title || project.id,
      provider: project.provider || "",
      model: project.model || "",
      vision: project.vision === true,
    })),
    devices,
    sessions: current.sessions,
    operations: current.operations,
  };
}

function validatePort(port) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PANEL_PORT_INVALID");
}

export async function startControlPanel(state, { engine, port } = {}) {
  if (!["codex", "dsh"].includes(engine)) throw new Error("ENGINE_INVALID");
  await privateDirectory(state);
  const expectedPort = port === undefined ? DEFAULT_PORTS[engine] : Number(port);
  validatePort(expectedPort);
  const token = randomBytes(32).toString("base64url");
  let panelOrigin = "";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", panelOrigin || "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/") {
      page(res);
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      json(res, 404, { error: "PANEL_ROUTE_NOT_FOUND" });
      return;
    }
    if (!sameToken(token, requestToken(req)) || !validOrigin(req, panelOrigin)) {
      json(res, 401, { error: "PANEL_UNAUTHORIZED" });
      return;
    }
    try {
      if (req.method === "GET" && url.pathname === "/api/status") {
        json(res, 200, await snapshot(state, engine, server.address().port));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/project") {
        const input = await body(req);
        if (typeof input.id !== "string" || typeof input.path !== "string")
          throw new Error("PROJECT_ARGUMENTS_REQUIRED");
        const project = { id: input.id, path: input.path };
        for (const key of ["title", "provider", "model"])
          if (input[key] !== undefined) project[key] = input[key];
        if (input.vision !== undefined) {
          if (typeof input.vision !== "boolean") throw new Error("VISION_VALUE_INVALID");
          project.vision = input.vision;
        }
        json(res, 200, { project: await addProject(state, project) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/invite") {
        const input = await body(req);
        if (!Array.isArray(input.projects) || !input.projects.length)
          throw new Error("PROJECTS_REQUIRED");
        const role = input.role === undefined ? "operator" : input.role;
        if (!["viewer", "operator"].includes(role)) throw new Error("ROLE_INVALID");
        json(res, 200, { invite: await invite(state, { projects: input.projects, role }) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/revoke") {
        const input = await body(req);
        if (typeof input.device !== "string" || !input.device)
          throw new Error("DEVICE_REQUIRED");
        json(res, 200, { result: revoke(state, input.device) });
        return;
      }
      json(res, 404, { error: "PANEL_ROUTE_NOT_FOUND" });
    } catch (error) {
      const response = httpError(error && (error.code || error.message) ? 400 : 500, error);
      json(res, response.statusCode, response);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(expectedPort, "127.0.0.1", resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : expectedPort;
  panelOrigin = "http://127.0.0.1:" + actualPort;
  return {
    server,
    token,
    port: actualPort,
    url: panelOrigin + "/?token=" + encodeURIComponent(token),
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

export async function runControlPanel(state, { engine, port } = {}) {
  const panel = await startControlPanel(state, { engine, port });
  console.log(
    JSON.stringify({
      ready: true,
      engine,
      bind: "127.0.0.1",
      port: panel.port,
      url: panel.url,
    }),
  );
  await new Promise((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await panel.close();
}

/**
 * The single control panel this process keeps alive for the Web settings page.
 * The panel command owns its own process; this manager serves the embedded
 * case, where one page asks to open the panel without a terminal.
 */
let activePanel;

/**
 * Start the loopback panel, or reuse the one already serving this state.
 * @param state - plugin state directory.
 * @param options - engine and optional loopback port (0 picks a free port).
 * @returns the panel URL plus whether an existing instance was reused.
 */
export async function ensureControlPanel(state, { engine, port } = {}) {
  const key = resolve(state);
  if (activePanel !== undefined && activePanel.key === key && activePanel.engine === engine)
    return { url: activePanel.panel.url, port: activePanel.panel.port, reused: true };
  await stopControlPanel();
  let panel;
  try {
    panel = await startControlPanel(state, { engine, port });
  } catch (error) {
    // The operator may already run `panel` on this engine's default port. Fall
    // back to an OS-assigned loopback port instead of failing the request; an
    // explicitly requested port still fails loudly.
    if (port !== undefined || error?.code !== "EADDRINUSE") throw error;
    panel = await startControlPanel(state, { engine, port: 0 });
  }
  activePanel = { key, engine, panel };
  return { url: panel.url, port: panel.port, reused: false };
}

/** Close the process-owned panel, if one is running. */
export async function stopControlPanel() {
  if (activePanel === undefined) return;
  const { panel } = activePanel;
  activePanel = undefined;
  await panel.close();
}

/**
 * Report the process-owned panel without revealing its token.
 * @returns running flag and loopback port.
 */
export function controlPanelState() {
  return activePanel === undefined
    ? { running: false, port: null }
    : { running: true, port: activePanel.panel.port };
}
