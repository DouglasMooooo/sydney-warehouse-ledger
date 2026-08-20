import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export class FeishuCliError extends Error {
  constructor(message: string, readonly stderr: string, readonly status: number | null) {
    super(message);
  }
}

export function runLarkCli<T>(args: string[], stdin?: string): T {
  const command = resolveCliCommand(args);
  const result = spawnSync(command.executable, command.args, {
    encoding: 'utf8',
    input: stdin,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new FeishuCliError(`lark-cli exited with ${result.status}`, result.stderr, result.status);
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new FeishuCliError(`Invalid lark-cli JSON: ${String(error)}`, result.stderr, result.status);
  }
}

function resolveCliCommand(args: string[]): { executable: string; args: string[] } {
  if (process.platform !== 'win32') return { executable: process.env.LARK_CLI_BIN ?? 'lark-cli', args };
  const configured = process.env.LARK_CLI_SCRIPT;
  const npmScript = process.env.APPDATA
    ? join(process.env.APPDATA, 'npm', 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js')
    : '';
  const script = configured || npmScript;
  if (!script || !existsSync(script)) {
    throw new Error('Cannot locate lark-cli. Set LARK_CLI_SCRIPT to the installed CLI run.js path.');
  }
  return { executable: process.execPath, args: [script, ...args] };
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
