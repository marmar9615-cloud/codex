import type { RunnerApprovalRequestEvent, RunnerJobStatus, RunnerLogEvent } from "@codex/mobile-protocol";
import type { AppServerTransport } from "@codex/mobile-protocol";
import { AppServerProcessManager, CodexAppServerBridgeError } from "./AppServerProcessManager.js";
import { mapAppServerNotification } from "./appServerEventMapper.js";
import {
  createJsonRpcNotification,
  createJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponseFor,
  sanitizeForRunnerLog,
} from "./jsonRpc.js";
import type { JsonRpcMessage, JsonRpcRequest, JsonRpcResponse } from "./jsonRpc.js";

export type CodexAppServerBridgeOptions = {
  bin: string;
  transport: AppServerTransport;
  timeoutMs: number;
  now: () => string;
};

export type CodexRunTurnOptions = {
  sessionId: string;
  jobId: string;
  cwd: string;
  prompt: string;
  onLogEvent?: (event: RunnerLogEvent) => void;
  onDiffUpdate?: (diff: { threadId: string; turnId: string; unifiedDiff: string }) => void;
  onApprovalRequest?: (event: RunnerApprovalRequestEvent) => void;
};

export type CodexRunTurnResult = {
  events: RunnerLogEvent[];
  status: RunnerJobStatus;
  appServerThreadId?: string;
  appServerTurnId?: string;
};

export class CodexAppServerBridge {
  private nextRequestId = 1;

  constructor(private readonly options: CodexAppServerBridgeOptions) {}

  async runTurn(run: CodexRunTurnOptions): Promise<CodexRunTurnResult> {
    if (this.options.transport !== "stdio") {
      throw new CodexAppServerBridgeError(
        `mobile-runner supports only stdio app-server transport today, received: ${this.options.transport}`,
        "codex_app_server_transport_unsupported",
      );
    }

    const process = new AppServerProcessManager({
      bin: this.options.bin,
      timeoutMs: this.options.timeoutMs,
    }).startStdio();

    const events: RunnerLogEvent[] = [];
    let sequence = 1;
    let appServerThreadId: string | undefined;
    let appServerTurnId: string | undefined;
    let terminalStatus: RunnerJobStatus = "failed";
    let completed = false;

    const emit = (event: RunnerLogEvent) => {
      events.push(event);
      run.onLogEvent?.(event);
    };
    const emitSystem = (message: string) => {
      emit({
        type: "runner.log",
        sessionId: run.sessionId,
        jobId: run.jobId,
        sequence: sequence++,
        stream: "system",
        level: "info",
        message: sanitizeForRunnerLog(message),
        createdAt: this.options.now(),
      });
    };
    const handleMessage = (message: JsonRpcMessage) => {
      if (isJsonRpcNotification(message)) {
        const mapped = mapAppServerNotification(message, {
          sessionId: run.sessionId,
          jobId: run.jobId,
          sequence: sequence++,
          now: this.options.now,
        });
        if (mapped.appServerThreadId) {
          appServerThreadId = mapped.appServerThreadId;
        }
        if (mapped.appServerTurnId) {
          appServerTurnId = mapped.appServerTurnId;
        }
        if (mapped.status) {
          terminalStatus = mapped.status;
        }
        if (mapped.diffUpdate) {
          run.onDiffUpdate?.(mapped.diffUpdate);
        }
        if (mapped.completed) {
          completed = true;
        }
        if (mapped.log) {
          emit(mapped.log);
        }
        return;
      }
      if (isJsonRpcRequest(message)) {
        const approval = createFailClosedApprovalEvent(message, run.sessionId, run.jobId, this.options.now());
        if (approval) {
          run.onApprovalRequest?.(approval);
          process.write({ id: message.id, result: failClosedApprovalResponse(message.method) });
          terminalStatus = "failed";
          completed = true;
        } else {
          process.write({
            id: message.id,
            error: {
              code: -32601,
              message: "mobile-runner does not support this app-server client request",
            },
          });
        }
        emit({
          type: "runner.log",
          sessionId: run.sessionId,
          jobId: run.jobId,
          sequence: sequence++,
          stream: "stderr",
          level: "warn",
          category: "approval",
          message: approval
            ? `Approval required; mobile approval UI not implemented yet. Denied ${sanitizeForRunnerLog(message.method)}.`
            : `Codex app-server requested unsupported client method: ${sanitizeForRunnerLog(message.method)}`,
          createdAt: this.options.now(),
        });
      }
    };

    try {
      emitSystem("Starting Codex app-server bridge over stdio.");
      await this.sendRequestAndWait(process, "initialize", {
        clientInfo: {
          name: "codex_mobile_runner",
          title: "Codex Mobile Runner",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: false,
          optOutNotificationMethods: [],
        },
      }, handleMessage);
      process.write(createJsonRpcNotification("initialized"));

      const threadResponse = await this.sendRequestAndWait(
        process,
        "thread/start",
        {
          cwd: run.cwd,
          approvalPolicy: "never",
          sandbox: "workspace-write",
          personality: "pragmatic",
          serviceName: "codex_mobile_runner",
          sessionStartSource: "startup",
          ephemeral: true,
        },
        handleMessage,
      );
      appServerThreadId = extractNestedString(threadResponse.result, ["thread", "id"]) ?? appServerThreadId;
      if (!appServerThreadId) {
        throw new CodexAppServerBridgeError("thread/start response did not include a thread id", "codex_app_server_bad_response");
      }

      const turnResponse = await this.sendRequestAndWait(
        process,
        "turn/start",
        {
          threadId: appServerThreadId,
          input: [{ type: "text", text: run.prompt, text_elements: [] }],
          cwd: run.cwd,
          approvalPolicy: "never",
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: [run.cwd],
            networkAccess: true,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false,
          },
          personality: "pragmatic",
        },
        handleMessage,
      );
      appServerTurnId = extractNestedString(turnResponse.result, ["turn", "id"]) ?? appServerTurnId;
      if (!appServerTurnId) {
        throw new CodexAppServerBridgeError("turn/start response did not include a turn id", "codex_app_server_bad_response");
      }

      while (!completed) {
        handleMessage(await process.readMessage());
      }

      return {
        events,
        status: terminalStatus,
        appServerThreadId,
        appServerTurnId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown Codex app-server bridge error";
      throw new CodexAppServerBridgeError(message, error instanceof CodexAppServerBridgeError ? error.code : "codex_app_server_bridge_error");
    } finally {
      process.close();
    }
  }

  private async sendRequestAndWait(
    process: { write(message: JsonRpcMessage): void; readMessage(): Promise<JsonRpcMessage> },
    method: string,
    params: unknown,
    handleMessage: (message: JsonRpcMessage) => void,
  ): Promise<JsonRpcResponse> {
    const id = this.nextRequestId++;
    process.write(createJsonRpcRequest(id, method, params));
    while (true) {
      const message = await process.readMessage();
      if (isJsonRpcResponseFor(message, id)) {
        if (message.error) {
          throw new CodexAppServerBridgeError(
            `codex app-server ${method} failed: ${message.error.message}`,
            "codex_app_server_request_failed",
          );
        }
        return message;
      }
      handleMessage(message);
    }
  }
}

function createFailClosedApprovalEvent(
  message: JsonRpcRequest,
  sessionId: string,
  jobId: string,
  createdAt: string,
): RunnerApprovalRequestEvent | null {
  const kind = approvalKindForMethod(message.method);
  if (!kind) {
    return null;
  }
  const params = typeof message.params === "object" && message.params !== null ? (message.params as Record<string, unknown>) : {};
  const approvalId = typeof params.approvalId === "string" ? params.approvalId : undefined;
  const reason = typeof params.reason === "string" && params.reason.length > 0 ? params.reason : undefined;
  return {
    type: "runner.approvalRequest",
    sessionId,
    jobId,
    requestId: message.id,
    approvalId,
    approvalKind: kind,
    summary: reason ?? `Codex app-server requested ${message.method}; denied by fail-closed mobile runner policy.`,
    createdAt,
  };
}

export function approvalKindForMethod(method: string): RunnerApprovalRequestEvent["approvalKind"] | null {
  if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
    return method === "execCommandApproval" ? "legacy" : "command";
  }
  if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
    return method === "applyPatchApproval" ? "legacy" : "fileChange";
  }
  if (method === "item/permissions/requestApproval") {
    return "permissions";
  }
  if (method === "item/tool/requestUserInput" || method === "item/tool/call") {
    return "tool";
  }
  if (method === "mcpServer/elicitation/request") {
    return "mcp";
  }
  if (method === "account/chatgptAuthTokens/refresh") {
    return "auth";
  }
  return null;
}

export function failClosedApprovalResponse(method: string): unknown {
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: "denied" };
  }
  if (method === "mcpServer/elicitation/request") {
    return { action: "decline", content: null };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      permissions: { type: "none" },
      scope: "turn",
      strictAutoReview: true,
    };
  }
  return { decision: "decline" };
}

function extractNestedString(value: unknown, path: string[]): string | undefined {
  let cursor: unknown = value;
  for (const segment of path) {
    if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === "string" && cursor.length > 0 ? cursor : undefined;
}
