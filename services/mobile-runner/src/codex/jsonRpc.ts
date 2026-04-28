export type JsonRpcId = number | string;

export type JsonRpcRequest = {
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export function createJsonRpcRequest(id: JsonRpcId, method: string, params?: unknown): JsonRpcRequest {
  return params === undefined ? { id, method } : { id, method, params };
}

export function createJsonRpcNotification(method: string, params?: unknown): JsonRpcNotification {
  return params === undefined ? { method } : { method, params };
}

export function serializeJsonRpcMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function parseJsonRpcLine(line: string): JsonRpcMessage {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("JSON-RPC message must be an object");
  }
  if ("id" in parsed && ("result" in parsed || "error" in parsed)) {
    return parsed as JsonRpcResponse;
  }
  if ("method" in parsed && typeof parsed.method === "string") {
    if ("id" in parsed) {
      return parsed as JsonRpcRequest;
    }
    return parsed as JsonRpcNotification;
  }
  throw new Error("unrecognized JSON-RPC message");
}

export function isJsonRpcResponseFor(message: JsonRpcMessage, id: JsonRpcId): message is JsonRpcResponse {
  return "id" in message && message.id === id && ("result" in message || "error" in message);
}

export function isJsonRpcNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return "method" in message && !("id" in message);
}

export function isJsonRpcRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return "method" in message && "id" in message;
}

export function sanitizeForRunnerLog(message: string): string {
  return message
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-openai-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted-token]")
    .replace(/\b(OPENAI_API_KEY|CODEX_AUTH_TOKEN|CHATGPT_SESSION|SESSION_TOKEN)=\S+/gi, "$1=[redacted]")
    .replace(/\b(access_token|refresh_token|id_token)["']?\s*[:=]\s*["'][^"',\s]+["']/gi, "$1: [redacted]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
