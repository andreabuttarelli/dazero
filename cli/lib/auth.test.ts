import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// `os.homedir()` is cached by Bun at process start and ignores later writes to
// process.env.HOME in the same process, so the fallback/migration is exercised in a
// fresh subprocess with HOME already pointed at a throwaway directory.
function runInHome(home: string, script: string): string {
  const result = Bun.spawnSync(['bun', '-e', script], {
    cwd: import.meta.dir,
    env: { ...process.env, HOME: home },
  });
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0) throw new Error(stderr);
  return result.stdout.toString().trim();
}

const sampleSession = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'u1', email: 'a@b.com' },
};

describe('session file location — old dazero path falls back and migrates', () => {
  test('a session already stored at the old ~/.config/dazero path still loads', () => {
    const home = mkdtempSync(join(tmpdir(), 'feega-cli-home-'));
    try {
      const oldDir = join(home, '.config', 'dazero');
      mkdirSync(oldDir, { recursive: true });
      writeFileSync(join(oldDir, 'session.json'), JSON.stringify(sampleSession));

      const out = runInHome(
        home,
        `
        const { loadSession } = await import('./auth.ts');
        const s = await loadSession();
        console.log(JSON.stringify(s));
        `
      );

      expect(JSON.parse(out)?.user.email).toBe('a@b.com');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('reading an old session migrates it to the new ~/.config/feega path', () => {
    const home = mkdtempSync(join(tmpdir(), 'feega-cli-home-'));
    try {
      const oldDir = join(home, '.config', 'dazero');
      mkdirSync(oldDir, { recursive: true });
      writeFileSync(join(oldDir, 'session.json'), JSON.stringify(sampleSession));

      runInHome(
        home,
        `
        const { loadSession } = await import('./auth.ts');
        await loadSession();
        `
      );

      const newPath = join(home, '.config', 'feega', 'session.json');
      expect(existsSync(newPath)).toBe(true);
      expect(JSON.parse(readFileSync(newPath, 'utf8')).user.email).toBe('a@b.com');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('the new path wins when both old and new sessions exist', () => {
    const home = mkdtempSync(join(tmpdir(), 'feega-cli-home-'));
    try {
      const oldDir = join(home, '.config', 'dazero');
      const newDir = join(home, '.config', 'feega');
      mkdirSync(oldDir, { recursive: true });
      mkdirSync(newDir, { recursive: true });
      writeFileSync(join(oldDir, 'session.json'), JSON.stringify(sampleSession));
      writeFileSync(
        join(newDir, 'session.json'),
        JSON.stringify({ ...sampleSession, user: { id: 'u2', email: 'new@b.com' } })
      );

      const out = runInHome(
        home,
        `
        const { loadSession } = await import('./auth.ts');
        const s = await loadSession();
        console.log(JSON.stringify(s));
        `
      );

      expect(JSON.parse(out)?.user.email).toBe('new@b.com');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
