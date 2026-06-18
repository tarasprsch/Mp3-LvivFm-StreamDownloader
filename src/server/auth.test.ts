import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthService, passwordMatches } from './auth.js';
import { ConfigStore } from './config.js';

describe('authentication', () => {
  it('uses password-only authentication', async () => {
    const directory = await tempDirectory();
    const store = new ConfigStore(directory);
    await store.load();
    await store.updatePublicSettings({ auth: { password: 'top-secret' } });
    const auth = new AuthService(store);

    expect(passwordMatches('top-secret', 'top-secret')).toBe(true);
    expect(auth.login('wrong')).toBeUndefined();
    expect(auth.isAuthenticated(auth.login('top-secret'))).toBe(true);
  });
});

async function tempDirectory(): Promise<string> {
  const directory = path.join(os.tmpdir(), `lfm-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(directory, { recursive: true });
  return directory;
}
