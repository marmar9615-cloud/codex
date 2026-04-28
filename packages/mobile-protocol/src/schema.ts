export type JsonSchema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
};

export const mobileProtocolSchemas = {
  createSessionRequest: {
    type: "object",
    required: ["projectId", "projectName", "sourceKind"],
    properties: {
      projectId: { type: "string" },
      projectName: { type: "string" },
      sourceKind: {
        type: "string",
        enum: ["appWorkspace", "github", "documentPicker", "androidSaf", "iosSecurityScoped"],
      },
    },
  },
  uploadSnapshotRequest: {
    type: "object",
    required: ["files"],
    properties: {
      files: {
        type: "array",
        items: {
          type: "object",
          required: ["path", "contentsBase64"],
          properties: {
            path: { type: "string" },
            contentsBase64: { type: "string" },
            mode: { type: "string" },
            sha256: { type: "string" },
          },
        },
      },
    },
  },
  startJobRequest: {
    type: "object",
    required: ["kind", "command"],
    properties: {
      kind: { type: "string", enum: ["build", "test", "preview", "custom"] },
      command: { type: "array", items: { type: "string" } },
      cwd: { type: "string" },
      environmentId: { type: "string" },
    },
  },
  receivePatchRequest: {
    type: "object",
    required: ["unifiedDiff"],
    properties: {
      patchId: { type: "string" },
      unifiedDiff: { type: "string" },
      summary: { type: "string" },
    },
  },
} as const satisfies Record<string, JsonSchema>;
