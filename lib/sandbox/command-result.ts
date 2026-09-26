export interface ProcessOutput {
  exitCode: number;
  stdout: string | (() => Promise<string>);
  stderr: string | (() => Promise<string>);
}

/** Never infer process success from a successful SDK/Python wrapper call. */
export async function readCommandResult(result: ProcessOutput) {
  if (!Number.isInteger(result.exitCode)) throw new Error('Sandbox did not provide a valid process exit code');
  const [stdout, stderr] = await Promise.all([
    typeof result.stdout === 'function' ? result.stdout() : result.stdout,
    typeof result.stderr === 'function' ? result.stderr() : result.stderr,
  ]);
  if (typeof stdout !== 'string' || typeof stderr !== 'string') throw new Error('Sandbox command output is invalid');
  return { stdout, stderr, exitCode: result.exitCode, success: result.exitCode === 0 };
}
