import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareProfileInstall } from '../src/profile-install.mjs';
test('failed native installation can retry only the profile claimed by this state and home', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'remotedesk-profile-owner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = join(root, 'state'),
    dshHome = join(root, 'home');
  await mkdir(state);
  const options = { profile: 'fixture', dshHome, packageSha256: 'a'.repeat(64) };
  assert.equal((await prepareProfileInstall(state, options)).ownedProfile, true);
  await mkdir(join(dshHome, 'profiles', 'fixture'), { recursive: true });
  await writeFile(join(dshHome, 'profiles', 'fixture', 'package.json'), '{}');
  assert.equal((await prepareProfileInstall(state, options)).ownedProfile, true);
  const otherHome = join(root, 'other');
  await mkdir(join(otherHome, 'profiles', 'fixture'), { recursive: true });
  await assert.rejects(
    prepareProfileInstall(state, { ...options, dshHome: otherHome }),
    /DSH_EXISTING_PROFILE/,
  );
  const otherState = join(root, 'other-state');
  await mkdir(otherState);
  await assert.rejects(prepareProfileInstall(otherState, options), /DSH_EXISTING_PROFILE/);
  await mkdir(join(dshHome, 'profiles', 'web'));
  assert.equal(
    (await prepareProfileInstall(state, { ...options, profile: 'web' })).ownedProfile,
    false,
  );
});
