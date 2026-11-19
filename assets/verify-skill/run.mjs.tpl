import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const VERIFY_DIR = path.join(ROOT, '.verify');
const BASE_DIR = path.join(VERIFY_DIR, 'base');
const BUILT_MARK = path.join(BASE_DIR, '.verify-built');
const PLAYWRIGHT_CONFIG = 'scripts/verify/playwright.verify.config.ts';
const ENV_FILES = ['.env', '.env.local'];
const PORTS = { base: 3701, current: 3702 };
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 500;
const SHORT_SHA_LENGTH = 8;
const INSTALL_COMMAND = {{INSTALL_COMMAND}};
const BUILD_COMMAND = {{BUILD_COMMAND}};
const SERVER_COMMAND = {{SERVER_COMMAND}};
const PORT_FLAG = {{PORT_FLAG}};
const PLAYWRIGHT_COMMAND = {{PLAYWRIGHT_COMMAND}};

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const BASE_REF = option('--base', 'HEAD');
const SKIP_BUILD = args.includes('--skip-build');

function run([command, ...commandArgs], cwd, extraEnv = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  return result.status ?? 1;
}

function must(status, step) {
  if (status !== 0) throw new Error(`${step} 실패(종료 코드 ${status})`);
}

function git(gitArgs, cwd = ROOT) {
  return spawnSync('git', gitArgs, { cwd, encoding: 'utf8' }).stdout.trim();
}

function prepareBase() {
  const sha = git(['rev-parse', BASE_REF]);
  if (!existsSync(BASE_DIR))
    must(
      run(['git', 'worktree', 'add', '--detach', BASE_DIR, sha], ROOT),
      '기준 작업 사본 만들기',
    );
  must(
    run(['git', 'checkout', '--detach', '--force', sha], BASE_DIR),
    '기준 커밋 꺼내기',
  );
  for (const file of ENV_FILES)
    if (existsSync(path.join(ROOT, file)))
      copyFileSync(path.join(ROOT, file), path.join(BASE_DIR, file));
  const isBuilt =
    existsSync(BUILT_MARK) && readFileSync(BUILT_MARK, 'utf8') === sha;
  if (isBuilt) return sha;
  must(run(INSTALL_COMMAND, BASE_DIR), '기준 의존성 설치');
  must(run(BUILD_COMMAND, BASE_DIR), '기준 빌드');
  writeFileSync(BUILT_MARK, sha);
  return sha;
}

function startServer(cwd, port) {
  const [command, ...commandArgs] = SERVER_COMMAND;
  return spawn(command, [...commandArgs, ...PORT_FLAG, String(port)], {
    cwd,
    stdio: 'ignore',
    detached: true,
  });
}

async function waitReady(port) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const isReady = await fetch(`http://localhost:${port}/`)
      .then(() => true)
      .catch(() => false);
    if (isReady) return;
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
  throw new Error(`포트 ${port} 서버가 준비되지 않았습니다`);
}

const stopServer = (server) => {
  try {
    process.kill(-server.pid);
  } catch {
    return;
  }
};

async function main() {
  const sha = prepareBase();
  if (!SKIP_BUILD) must(run(BUILD_COMMAND, ROOT), '현재 빌드');
  for (const output of ['snapshots', 'results', 'report'])
    rmSync(path.join(VERIFY_DIR, output), { recursive: true, force: true });
  const servers = [
    startServer(BASE_DIR, PORTS.base),
    startServer(ROOT, PORTS.current),
  ];
  try {
    await Promise.all([waitReady(PORTS.base), waitReady(PORTS.current)]);
    must(
      run(
        [
          ...PLAYWRIGHT_COMMAND,
          'test',
          '-c',
          PLAYWRIGHT_CONFIG,
          '--update-snapshots',
          '--reporter=dot',
        ],
        ROOT,
        { VERIFY_BASE_URL: `http://localhost:${PORTS.base}` },
      ),
      '기준 화면 찍기',
    );
    const status = run(
      [...PLAYWRIGHT_COMMAND, 'test', '-c', PLAYWRIGHT_CONFIG],
      ROOT,
      { VERIFY_BASE_URL: `http://localhost:${PORTS.current}` },
    );
    const verdict =
      status === 0
        ? '모든 화면이 기준과 같습니다'
        : '기준과 다른 화면이 있습니다 — 리포트에서 차이를 보고 의도한 변화인지 판단하세요';
    console.log(
      `\n[verify] 기준 ${BASE_REF}(${sha.slice(0, SHORT_SHA_LENGTH)}) 대비: ${verdict}`,
    );
    console.log(
      `[verify] 리포트: ${path.join(VERIFY_DIR, 'report', 'index.html')}`,
    );
    process.exitCode = status;
  } finally {
    servers.forEach(stopServer);
  }
}

main().catch((error) => {
  console.error(`[verify] ${error.message}`);
  process.exitCode = 1;
});
