import type { RunnerJobStatus, RunnerLogEvent, RunnerLogLevel, RunnerLogStream } from "@codex/mobile-protocol";
import { sanitizeForRunnerLog } from "./jsonRpc.js";
import type { JsonRpcNotification } from "./jsonRpc.js";

export type AppServerEventMappingContext = {
  sessionId: string;
  jobId: string;
  sequence: number;
  now: () => string;
};

export type AppServerEventMapping = {
  log?: RunnerLogEvent;
  appServerThreadId?: string;
  appServerTurnId?: string;
  diffUpdate?: {
    threadId: string;
    turnId: string;
    unifiedDiff: string;
  };
  completed?: boolean;
  status?: RunnerJobStatus;
};

export function mapAppServerNotification(
  notification: JsonRpcNotification,
  context: AppServerEventMappingContext,
): AppServerEventMapping {
  const params = isRecord(notification.params) ? notification.params : {};
  switch (notification.method) {
    case "thread/started": {
      const threadId = nestedString(params, ["thread", "id"]);
      return {
        appServerThreadId: threadId,
        log: createLog(context, "system", "info", `Codex app-server thread started${threadId ? `: ${threadId}` : ""}`, "system"),
      };
    }
    case "turn/started": {
      const turnId = nestedString(params, ["turn", "id"]);
      const threadId = stringField(params, "threadId");
      return {
        appServerThreadId: threadId,
        appServerTurnId: turnId,
        log: createLog(context, "system", "info", `Codex app-server turn started${turnId ? `: ${turnId}` : ""}`, "system"),
      };
    }
    case "item/agentMessage/delta":
      return { log: createLog(context, "stdout", "info", stringField(params, "delta") ?? "", "agentText") };
    case "item/commandExecution/outputDelta":
    case "command/exec/outputDelta":
      return { log: createLog(context, "stdout", "info", stringField(params, "delta") ?? "", "tool") };
    case "item/fileChange/outputDelta":
      return { log: createLog(context, "system", "info", stringField(params, "delta") ?? "Codex reported file-change output.", "tool") };
    case "turn/diff/updated": {
      const unifiedDiff = stringField(params, "diff") ?? "";
      const threadId = stringField(params, "threadId") ?? "";
      const turnId = stringField(params, "turnId") ?? "";
      return {
        appServerThreadId: threadId,
        appServerTurnId: turnId,
        diffUpdate: { threadId, turnId, unifiedDiff },
        log: createLog(context, "system", "info", "Codex app-server emitted a diff update.", "diff"),
      };
    }
    case "turn/plan/updated":
      return { log: createLog(context, "system", "info", "Codex app-server updated its plan.", "plan") };
    case "error": {
      const message = nestedString(params, ["error", "message"]) ?? "Codex app-server emitted an error.";
      return { log: createLog(context, "stderr", "error", message, "error"), status: "failed" };
    }
    case "turn/completed": {
      const turnId = nestedString(params, ["turn", "id"]);
      const turnStatus = nestedString(params, ["turn", "status"]);
      const errorMessage = nestedString(params, ["turn", "error", "message"]);
      const status: RunnerJobStatus = turnStatus === "failed" ? "failed" : turnStatus === "interrupted" ? "canceled" : "succeeded";
      return {
        appServerTurnId: turnId,
        completed: true,
        status,
        log: createLog(
          context,
          status === "succeeded" ? "system" : "stderr",
          status === "succeeded" ? "info" : "error",
          errorMessage ?? `Codex app-server turn completed with status: ${turnStatus ?? "completed"}`,
          "completion",
        ),
      };
    }
    default:
      return {
        log: createLog(context, "system", "debug", `Codex app-server notification: ${notification.method}`, "system"),
      };
  }
}

function createLog(
  context: AppServerEventMappingContext,
  stream: RunnerLogStream,
  level: RunnerLogLevel,
  message: string,
  category: RunnerLogEvent["category"],
): RunnerLogEvent {
  return {
    type: "runner.log",
    sessionId: context.sessionId,
    jobId: context.jobId,
    sequence: context.sequence,
    stream,
    level,
    category,
    message: sanitizeForRunnerLog(message),
    createdAt: context.now(),
  };
}

function nestedString(record: Record<string, unknown>, path: string[]): string | undefined {
  let cursor: unknown = record;
  for (const segment of path) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return typeof cursor === "string" && cursor.length > 0 ? cursor : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
