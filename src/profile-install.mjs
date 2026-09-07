import { readFile, writeFile, lstat, access } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { constants } from 'node:fs';
import { requireThat } from '@remotedesk/bridge-core/errors';
const read = async (path) =>
  JSON.parse(
    await readFile(path, 'utf8').catch((e) => {
      if (e.code === 'ENOENT') return '{}';
      throw e;
    }),
  );
export async function requirePnpm() {
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    try {
      await access(join(dir, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'), constants.X_OK);
      return;
    } catch {}
  }
  requireThat(false, 'PNPM_REQUIRED_FOR_NATIVE_INSTALL');
}
export async function prepareProfileInstall(
  state,
  { profile, packageSha256, webPort, dshHome = process.env.DSH_HOME || join(homedir(), '.dsh') },
) {
  requireThat(/^[a-zA-Z0-9_-]{1,40}$/.test(profile), 'PROFILE_INVALID');
  const profilePath = resolve(dshHome, 'profiles', profile),
    intentPath = join(state, 'profile-install.json');
  const [old, intent] = await Promise.all([read(join(state, 'launch.json')), read(intentPath)]);
  let ownedProfile = false;
  try {
    requireThat((await lstat(profilePath)).isDirectory(), 'DSH_PROFILE_DIRECTORY_REQUIRED');
    ownedProfile = [old, intent].some(
      (record) =>
        record.profile === profile &&
        record.profilePath === profilePath &&
        record.ownedProfile === true,
    );
    requireThat(profile === 'web' || ownedProfile, 'DSH_EXISTING_PROFILE_USE_NEW_NAME_OR_WEB');
  } catch (error) {
    if (error.code === 'ENOENT') ownedProfile = true;
    else throw error;
  }
  const launch = {
    profile,
    profilePath,
    ownedProfile,
    packageSha256,
    ...(webPort !== undefined ? { webPort } : {}),
  };
  // Native DSH creates the profile before running pnpm. Persist ownership first
  // so any package-manager failure can be retried by this same installation.
  await writeFile(intentPath, JSON.stringify(launch, null, 2) + '\n', { mode: 0o600 });
  return launch;
}
