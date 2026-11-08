import { spawn } from 'node:child_process';

const DEFAULT_CAPTURE_LIMIT = 1_000_000;

// Spawn without blocking the parent event loop. A timeout first sends AbortSignal,
// then escalates to SIGKILL so a wedged child cannot hang verification forever.
export function spawnBounded(command, args, {
  cwd,
  env = process.env,
  timeoutMs = 30_000,
  killGraceMs = 1_000,
  maxCaptureBytes = DEFAULT_CAPTURE_LIMIT
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be positive');
  if (!Number.isFinite(killGraceMs) || killGraceMs < 0) throw new RangeError('killGraceMs must be non-negative');
  const controller = new AbortController();
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: controller.signal,
    windowsHide: true
  });
  let stdout = '', stderr = '', timedOut = false, settled = false, killTimer, childError;
  let resolveResult, rejectResult;
  const resultPromise = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const appendBounded = (current, chunk) => {
    const value = current + chunk.toString('utf8');
    return value.length > maxCaptureBytes ? value.slice(-maxCaptureBytes) : value;
  };
  const finish = result => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutTimer);
    clearTimeout(killTimer);
    resolveResult({ ...result, stdout, stderr, timedOut });
  };
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
    killTimer.unref?.();
  }, timeoutMs);
  timeoutTimer.unref?.();
  child.stdout?.on('data', chunk => { stdout = appendBounded(stdout, chunk); });
  child.stderr?.on('data', chunk => { stderr = appendBounded(stderr, chunk); });
  child.once('error', error => {
    if (timedOut) {
      // AbortSignal emits AbortError before the child necessarily exits. Do not
      // settle here: keep the SIGKILL escalation armed and wait for `close`.
      childError = error.message;
    } else if (!settled) {
      settled = true;
      clearTimeout(timeoutTimer);
      rejectResult(error);
    }
  });
  child.once('close', (code, signal) => finish({ code, signal, ...(childError ? { error: childError } : {}) }));
  return resultPromise;
}
