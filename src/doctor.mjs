import { access, readFile, realpath } from 'node:fs/promises';
import { delimiter, dirname, join } from 'node:path';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';

const compatibility = JSON.parse(await readFile(new URL('../compatibility.json', import.meta.url)));
const metadata = async path => JSON.parse(await readFile(path, 'utf8'));

export async function locateRuntime() {
  // Only inspect the executable installation, never user profiles or sessions.
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const executable = join(directory, process.platform === 'win32' ? 'dsh.cmd' : 'dsh');
    try {
      await access(executable, constants.X_OK);
      if(process.platform==='win32'){const root=join(directory,'node_modules','@deepseek-ai','dsh');try{if((await metadata(join(root,'package.json'))).name==='@deepseek-ai/dsh')return root;}catch{}}
      let candidate = dirname(await realpath(executable));
      for (let i = 0; i < 4; i++) {
        try { if ((await metadata(join(candidate, 'package.json'))).name === '@deepseek-ai/dsh') return candidate; } catch { /* keep walking */ }
        candidate = dirname(candidate);
      }
    } catch { /* try next PATH entry */ }
  }
  throw new Error('DSH_RUNTIME_NOT_FOUND_USE_RUNTIME_ROOT');
}

export async function inspectRuntime(root) {
  const pkgPath = join(root, 'package.json');
  const pkg = await metadata(pkgPath);
  if (pkg.name !== '@deepseek-ai/dsh') throw new Error('NOT_DSH_INSTALLATION');
  const require = createRequire(pkgPath);
  const versions = { '@deepseek-ai/dsh': pkg.version };
  for (const name of Object.keys(compatibility.components)) {
    const pkg = await metadata(require.resolve(`${name}/package.json`));
    if (pkg.name !== name) throw new Error('COMPONENT_IDENTITY_MISMATCH');
    versions[name] = pkg.version;
  }
  return versions;
}

export async function doctor({ runtimeRoot } = {}) {
  const report = {
    schemaVersion: 1, status: 'blocked', changed: false,
    componentVersions: { adapter: compatibility.adapterVersion, node: process.versions.node },
    checks: [], actions: [], requiresUserAction: [],
    warnings: ['DOCKER_PROJECT_CHECK_REQUIRED_BEFORE_SERVE', 'PROVIDER_AUTHENTICATION_STAYS_ON_HOST'],
    capabilities: { remoteAccess: false, remoteProtocol: 1, proEntitlement: 'pro.lifetime' }
  };
  try {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('NODE_VERSION_UNSUPPORTED');
    const versions = await inspectRuntime(runtimeRoot ?? await locateRuntime());
    Object.assign(report.componentVersions, versions);
    for (const [name, version] of Object.entries(versions)) {
      const expected = name === '@deepseek-ai/dsh' ? compatibility.cliVersions.includes(version) : compatibility.components[name] === version;
      report.checks.push({ id: name, status: expected ? 'pass' : 'fail', code: expected ? 'PINNED_VERSION' : 'UNVERIFIED_COMPONENT_VERSION' });
    }
    report.status = report.checks.every(c => c.status === 'pass') ? 'ok' : 'blocked';
  } catch (error) {
    const safeCodes = ['DSH_RUNTIME_NOT_FOUND_USE_RUNTIME_ROOT','NOT_DSH_INSTALLATION','NODE_VERSION_UNSUPPORTED','COMPONENT_IDENTITY_MISMATCH'];
    report.checks.push({ id: 'runtime', status: 'fail', code: safeCodes.includes(error.message) ? error.message : 'RUNTIME_METADATA_UNAVAILABLE' });
  }
  if (report.status !== 'ok') report.requiresUserAction.push('CHECK_EXACT_COMPONENT_VERSIONS');
  return report;
}
