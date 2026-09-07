#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { main } from '@remotedesk/bridge-core/cli';
import { requireThat } from '@remotedesk/bridge-core/errors';
import { doctor, locateRuntime } from '../src/doctor.mjs';
const executable = async () => join(await locateRuntime(), 'lib', 'bin.js');
await main({
  engine: 'dsh',
  entry: fileURLToPath(import.meta.url),
  doctor,
  serve: async (state) => {
    requireThat((await doctor()).status === 'ok', 'DSH_RUNTIME_UNVERIFIED');
    const launch = JSON.parse(await readFile(join(state, 'launch.json'), 'utf8'));
    requireThat(/^[a-zA-Z0-9_-]{1,40}$/.test(launch.profile), 'PROFILE_INVALID');
    const bin = await executable();
    process.env.REMOTEDESK_DSH_STATE = state;
    requireThat(launch.ownedProfile === true || launch.profile === 'web', 'DSH_PROFILE_NOT_OWNED');
    process.argv = [process.execPath, bin, '--profile', launch.profile];
    if (launch.ownedProfile)
      process.argv.push(
        '--patch',
        fileURLToPath(new URL('../profiles/remote-only.patch.yml', import.meta.url)),
      );
    if (launch.webPort !== undefined) {
      requireThat(
        Number.isInteger(launch.webPort) && launch.webPort > 0 && launch.webPort < 65536,
        'WEB_PORT_INVALID',
      );
      process.argv.push('--host', '127.0.0.1', '--port', String(launch.webPort), '--no-open');
    }
    // Boot the installed native DSH profile in this process. Its Cordis runtime
    // owns the adapter and all lifecycle/dispose handlers; no CLI-output scraping.
    await import(pathToFileURL(bin).href);
  },
  extra: async (command, state, config, o) => {
    if (command !== 'plugin-install') return false;
    const profile = o.profile ?? 'remotedesk';
    requireThat(/^[a-zA-Z0-9_-]{1,40}$/.test(profile), 'PROFILE_INVALID');
    requireThat(o.package, 'PACKAGE_REQUIRED');
    const archive = resolve(o.package);
    requireThat(
      archive.endsWith('.tgz') && (await stat(archive)).isFile(),
      'LOCAL_PACKAGE_REQUIRED',
    );
    let ownedProfile = false;
    const profilePath = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', profile);
    try {
      await stat(profilePath);
      const old = JSON.parse(
        await readFile(join(state, 'launch.json'), 'utf8').catch((e) => {
          if (e.code === 'ENOENT') return '{}';
          throw e;
        }),
      );
      ownedProfile = old.profile === profile && old.ownedProfile === true;
      requireThat(profile === 'web' || ownedProfile, 'DSH_EXISTING_PROFILE_USE_NEW_NAME_OR_WEB');
    } catch (e) {
      if (e.code === 'ENOENT') ownedProfile = true;
      else throw e;
    }
    requireThat((await doctor()).status === 'ok', 'DSH_RUNTIME_UNVERIFIED');
    const bin = await executable();
    const bytes = await readFile(archive);
    requireThat(bytes.length <= 16000000, 'PACKAGE_TOO_LARGE');
    const packageSha256 = createHash('sha256').update(bytes).digest('hex'),
      packages = join(state, 'packages'),
      cached = join(packages, packageSha256 + '.tgz');
    await mkdir(packages, { recursive: true, mode: 0o700 });
    try {
      await writeFile(cached, bytes, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      requireThat(
        createHash('sha256')
          .update(await readFile(cached))
          .digest('hex') === packageSha256,
        'CACHED_PACKAGE_CHANGED',
      );
    }
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bin, 'plugin', '--profile', profile, 'add', cached], {
        shell: false,
        stdio: 'inherit',
        windowsHide: true,
      });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error('PLUGIN_INSTALL_FAILED')),
      );
    });
    const webPort = o['web-port'] === undefined ? undefined : Number(o['web-port']);
    requireThat(
      webPort === undefined || (Number.isInteger(webPort) && webPort > 0 && webPort < 65536),
      'WEB_PORT_INVALID',
    );
    await writeFile(
      join(state, 'launch.json'),
      JSON.stringify(
        { profile, ownedProfile, packageSha256, ...(webPort !== undefined ? { webPort } : {}) },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    console.log(JSON.stringify({ installed: true, profile, restartRequired: true }));
    return true;
  },
});
