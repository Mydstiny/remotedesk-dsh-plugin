#!/usr/bin/env node
import { prepareProfileInstall, requirePnpm } from '../src/profile-install.mjs';
import { withLifecycleLock } from '@remotedesk/bridge-core/lifecycle-lock';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { readFile, writeFile, stat, lstat, mkdir } from 'node:fs/promises';
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
    requireThat(
      launch.profilePath ===
        resolve(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', launch.profile),
      'DSH_PROFILE_HOME_CHANGED',
    );
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
    requireThat((await doctor()).status === 'ok', 'DSH_RUNTIME_UNVERIFIED');
    await requirePnpm();
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
    const webPort = o['web-port'] === undefined ? undefined : Number(o['web-port']);
    requireThat(
      webPort === undefined || (Number.isInteger(webPort) && webPort > 0 && webPort < 65536),
      'WEB_PORT_INVALID',
    );
    await withLifecycleLock(
      state,
      () =>
        withLifecycleLock(state, async () => {
          try {
            await stat(join(state, 'server.lock'));
            requireThat(false, 'STOP_OR_RECOVER_BEFORE_INSTALL');
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
          const launch = await prepareProfileInstall(state, { profile, packageSha256, webPort });
          const profileCache = join(launch.profilePath, 'remotedesk-packages');
          await mkdir(profileCache, { recursive: true, mode: 0o700 });
          requireThat(
            (await lstat(profileCache)).isDirectory(),
            'PROFILE_CACHE_DIRECTORY_REQUIRED',
          );
          const localArchive = join(profileCache, packageSha256 + '.tgz');
          try {
            await writeFile(localArchive, bytes, { flag: 'wx', mode: 0o600 });
          } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            requireThat((await lstat(localArchive)).isFile(), 'PROFILE_CACHE_FILE_REQUIRED');
            requireThat(
              createHash('sha256')
                .update(await readFile(localArchive))
                .digest('hex') === packageSha256,
              'CACHED_PACKAGE_CHANGED',
            );
          }
          // Upstream DSH uses shell:true on Windows. This fixed relative spec has
          // no shell syntax and is resolved by pnpm from the profile cwd. Do not
          // prefix it with ./, which upstream would expand to an absolute path.
          const nativeSpec = 'file:remotedesk-packages/' + packageSha256 + '.tgz';
          await new Promise((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [bin, 'plugin', '--profile', profile, 'add', nativeSpec],
              {
                shell: false,
                stdio: 'inherit',
                windowsHide: true,
              },
            );
            child.once('error', reject);
            child.once('exit', (code) =>
              code === 0 ? resolve() : reject(new Error('PLUGIN_INSTALL_FAILED')),
            );
          });
          await writeFile(join(state, 'launch.json'), JSON.stringify(launch, null, 2) + '\n', {
            mode: 0o600,
          });
        }),
      'installation',
    );
    console.log(JSON.stringify({ installed: true, profile, restartRequired: true }));
    return true;
  },
});
