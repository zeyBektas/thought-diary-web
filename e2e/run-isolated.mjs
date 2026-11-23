import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { runSharingSuite } from './sharing-suite.mjs';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(frontend, '../thought-diary');
const requireBackend = createRequire(join(backend, 'package.json'));
const { Client } = requireBackend('pg');
const bcrypt = requireBackend('bcrypt');
const marker = randomBytes(24).toString('hex');
const name = `thought-diary-browser-${randomUUID()}`;
const user = `test_${randomBytes(8).toString('hex')}`;
const database = `browser_${randomBytes(8).toString('hex')}`;
const password = randomBytes(32).toString('hex');
const accountPassword = randomBytes(18).toString('hex');
const temp = mkdtempSync(join(tmpdir(), 'thought-diary-browser-'));
const safeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, DOCKER_HOST: process.env.DOCKER_HOST, DOCKER_CONTEXT: process.env.DOCKER_CONTEXT };
const children = [];
let containerId = '';
let browser;
let interrupted = false;
let stage = 'startup';
let backendPort;
let frontendPort;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; for (const child of children) child.kill('SIGTERM'); });

function command(executable, args, env = safeEnv, cwd = temp) {
  const result = spawnSync(executable, args, { env, cwd, encoding: 'utf8' });
  if (result.status !== 0 || result.error) throw new Error(`${executable} failed (exit ${result.status ?? 'unknown'}).`);
  return result.stdout.trim();
}
async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}
function start(executable, args, env, cwd) {
  const child = spawn(executable, args, { cwd, env, stdio: 'ignore' });
  children.push(child);
  child.on('error', () => {});
  return child;
}
async function waitReady(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (interrupted || child.exitCode !== null || child.signalCode || child.spawnfile === undefined) throw new Error('Test server exited before readiness.');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok) return; } catch { /* wait for startup */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('Test server readiness timed out.');
}
function verifyListener(port, child) {
  const listeners = command('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN']).split('\n');
  if (listeners.length !== 1 || !/^\d+$/.test(listeners[0])) throw new Error('Test port ownership verification failed.');
  let pid = Number(listeners[0]);
  for (let depth = 0; depth < 10 && pid > 1; depth++) {
    if (pid === child.pid) return;
    const parent = command('ps', ['-o', 'ppid=', '-p', String(pid)]);
    if (!/^\d+$/.test(parent)) break;
    pid = Number(parent);
  }
  throw new Error('Test port is owned by an unrelated process.');
}
function verifyContainer(requirePort = true) {
  const inspected = JSON.parse(command('docker', ['inspect', containerId]))[0];
  const ports = inspected?.NetworkSettings?.Ports?.['5432/tcp'];
  if (inspected?.Id !== containerId || inspected?.Name !== `/${name}` || inspected?.Config?.Labels?.['thought-diary.browser'] !== marker || !inspected?.Config?.Env?.includes(`POSTGRES_USER=${user}`) || !inspected?.Config?.Env?.includes(`POSTGRES_PASSWORD=${password}`) || !inspected?.Config?.Env?.includes(`POSTGRES_DB=${database}`)) throw new Error('Disposable container identity verification failed.');
  if (!requirePort) return;
  if (ports?.length !== 1 || ports[0].HostIp !== '127.0.0.1' || !/^\d+$/.test(ports[0].HostPort) || ports[0].HostPort === '15434') throw new Error('Disposable container endpoint verification failed.');
  return ports[0].HostPort;
}

try {
  if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') throw new Error('Unset DATABASE_URL and production NODE_ENV before running.');
  containerId = command('docker', ['create', '--name', name, '--label', `thought-diary.browser=${marker}`, '-e', 'POSTGRES_USER', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB', '-p', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data', 'postgres:16'], { ...safeEnv, POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: database });
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('Invalid created container ID.');
  command('docker', ['start', containerId]);
  const dbPort = verifyContainer();
  for (let attempt = 0; ; attempt++) {
    if (interrupted || attempt >= 60) throw new Error('Disposable database readiness failed.');
    if (spawnSync('docker', ['exec', containerId, 'pg_isready', '-U', user, '-d', database], { env: safeEnv, stdio: 'ignore' }).status === 0) break;
    await new Promise((done) => setTimeout(done, 500));
  }
  if (verifyContainer() !== dbPort) throw new Error('Disposable database endpoint changed.');
  const dbUrl = `postgresql://${user}:${password}@127.0.0.1:${dbPort}/${database}?schema=public`;
  const testEnv = { ...safeEnv, NODE_ENV: 'test', DATABASE_URL: dbUrl, JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex') };
  stage = 'migration replay';
  command(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', join(backend, 'prisma.config.ts')], testEnv);
  if (verifyContainer() !== dbPort) throw new Error('Disposable database endpoint changed.');
  stage = 'synthetic fixtures';
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const hash = await bcrypt.hash(accountPassword, 10);
    for (const code of ['CLIENT', 'COUNSELOR']) await client.query('INSERT INTO roles (id, code, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW())', [randomUUID(), code]);
    for (const [email, role, firstName] of [['client@example.test', 'CLIENT', 'Synthetic'], ['counselor@example.test', 'COUNSELOR', 'CounselorA'], ['other-counselor@example.test', 'COUNSELOR', 'CounselorB']]) {
      await client.query('INSERT INTO users (id, email, "firstName", "lastName", "passwordHash", "roleId", status, "createdAt", "updatedAt") SELECT $1, $2, $3, $4, $5, id, \'ACTIVE\', NOW(), NOW() FROM roles WHERE code = $6', [randomUUID(), email, firstName, 'User', hash, role]);
    }
  } finally { await client.end(); }
  backendPort = await freePort();
  frontendPort = await freePort();
  while (frontendPort === backendPort) frontendPort = await freePort();
  const origin = `http://localhost:${frontendPort}`;
  const backendUrl = `http://localhost:${backendPort}`;
  const copy = join(temp, 'frontend');
  cpSync(frontend, copy, { recursive: true, filter: (src) => { const rel = src.slice(frontend.length + 1); return !rel || (!['node_modules', '.next', '.git', 'test-results', 'playwright-report'].includes(rel.split('/')[0]) && !rel.split('/').some((part) => part.startsWith('.env'))); } });
  symlinkSync(join(frontend, 'node_modules'), join(copy, 'node_modules'), 'dir');
  stage = 'backend startup';
  const backendProcess = start(process.execPath, ['-r', join(backend, 'node_modules/tsconfig-paths/register'), join(backend, 'dist/src/main.js')], { ...testEnv, PORT: String(backendPort), CORS_ORIGIN: origin, TS_NODE_BASEURL: join(backend, 'dist'), TS_NODE_PROJECT: join(backend, 'tsconfig.json') }, temp);
  await waitReady(backendUrl, backendProcess);
  verifyListener(backendPort, backendProcess);
  stage = 'frontend startup';
  const frontendProcess = start(process.execPath, [join(frontend, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '-p', String(frontendPort), '-H', '127.0.0.1'], { ...safeEnv, NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: backendUrl, NEXT_TELEMETRY_DISABLED: '1' }, copy);
  await waitReady(`${origin}/login`, frontendProcess);
  verifyListener(frontendPort, frontendProcess);
  verifyListener(backendPort, backendProcess);
  stage = 'browser login';
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email').fill('client@example.test');
  await page.getByLabel('Password').fill(accountPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.getByRole('heading', { name: 'Welcome back, Synthetic.' }).waitFor();
  await context.close();
  if (interrupted) throw new Error('Interrupted.');
  console.log('Isolated browser login smoke test passed.');
  stage = 'browser sharing suite';
  await runSharingSuite({ browser, origin, backendUrl, accountPassword });
} catch {
  console.error(`Isolated browser smoke test failed during ${stage}.`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await Promise.all(children.map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((done) => { child.once('exit', done); setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 3000).unref(); })));
  if (/^[a-f0-9]{64}$/.test(containerId)) {
    try { verifyContainer(false); const removed = command('docker', ['rm', '-f', containerId]); if (removed !== containerId) throw new Error(); console.log('Disposable container removed.'); } catch { console.error(`Disposable container cleanup failed: ${name} (${containerId}).`); process.exitCode = 1; }
  }
  rmSync(temp, { recursive: true, force: true });
  const portsClear = [backendPort, frontendPort].filter(Boolean).every((port) => spawnSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { env: safeEnv, stdio: 'ignore' }).status === 1);
  if (!portsClear) { console.error('Test port cleanup could not be verified.'); process.exitCode = 1; }
  else console.log('Owned processes and temporary files cleaned up; test ports are clear.');
}
