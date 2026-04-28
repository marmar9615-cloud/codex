import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { parseJsonRpcLine, sanitizeForRunnerLog, serializeJsonRpcMessage } from "./jsonRpc.js";
import type { JsonRpcMessage } from "./jsonRpc.js";

type PendingRead = {
  resolve: (message: JsonRpcMessage) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class CodexAppServerBridgeError extends Error {
  constructor(
    message: string,
    readonly code = "codex_app_server_bridge_error",
  ) {
    super(sanitizeForRunnerLog(message));
    this.name = "CodexAppServerBridgeError";
  }
}

export type AppServerProcessOptions = {
  bin: string;
  timeoutMs: number;
};

export class AppServerProcessManager {
  constructor(private readonly options: AppServerProcessOptions) {}

  startStdio(): AppServerProcessHandle {
    if (path.isAbsolute(this.options.bin) && !existsSync(this.options.bin)) {
      throw new CodexAppServerBridgeError(`CODEX_APP_SERVER_BIN does not exist: ${this.options.bin}`, "codex_app_server_missing_binary");
    }
    const child = spawn(this.options.bin, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        LOG_FORMAT: process.env.LOG_FORMAT ?? "plain",
      },
    });
    return new AppServerProcessHandle(child, this.options.timeoutMs);
  }
}

export class AppServerProcessHandle {
  private stdoutBuffer = "";
  private readonly queue: JsonRpcMessage[] = [];
  private readonly waiters: PendingRead[] = [];
  private closedError: Error | null = null;
  readonly stderrLines: string[] = [];

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly timeoutMs: number,
  ) {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.pushStdout(chunk));
    child.stderr.on("data", (chunk: string) => this.pushStderr(chunk));
    child.on("error", (error) => this.fail(new CodexAppServerBridgeError(error.message, "codex_app_server_spawn_failed")));
    child.on("exit", (code, signal) => {
      if (code !== 0 && !this.closedError) {
        this.fail(
          new CodexAppServerBridgeError(
            `codex app-server exited before completion (code ${code ?? "null"}, signal ${signal ?? "null"})`,
            "codex_app_server_exited",
          ),
        );
      }
    });
  }

  write(message: JsonRpcMessage): void {
    if (!this.child.stdin.writable) {
      throw new CodexAppServerBridgeError("codex app-server stdin is closed", "codex_app_server_stdin_closed");
    }
    this.child.stdin.write(serializeJsonRpcMessage(message));
  }

  async readMessage(timeoutMs = this.timeoutMs): Promise<JsonRpcMessage> {
    if (this.queue.length > 0) {
      return this.queue.shift() as JsonRpcMessage;
    }
    if (this.closedError) {
      throw this.closedError;
    }
    return await new Promise<JsonRpcMessage>((resolve, reject) => {
      const pending: PendingRead = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          const index = this.waiters.indexOf(pending);
          if (index >= 0) {
            this.waiters.splice(index, 1);
          }
          reject(new CodexAppServerBridgeError("timed out waiting for codex app-server response", "codex_app_server_timeout"));
        }, timeoutMs),
      };
      this.waiters.push(pending);
    });
  }

  close(): void {
    if (!this.child.killed) {
      this.child.kill("SIGTERM");
    }
  }

  private pushStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        try {
          this.enqueue(parseJsonRpcLine(line));
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown JSON parse error";
          this.fail(new CodexAppServerBridgeError(`invalid app-server JSON-RPC line: ${message}`, "codex_app_server_bad_json"));
          return;
        }
      }
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private pushStderr(chunk: string): void {
    const sanitized = sanitizeForRunnerLog(chunk);
    this.stderrLines.push(...sanitized.split(/\r?\n/).filter((line) => line.trim().length > 0));
  }

  private enqueue(message: JsonRpcMessage): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
      return;
    }
    this.queue.push(message);
  }

  private fail(error: Error): void {
    this.closedError = error;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timeout);
        waiter.reject(error);
      }
    }
  }
}
