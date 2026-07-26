import type { OpenCodePluginContext, OpenCodeRecorderHooks, OpenCodeRecorderOptions } from "./types.js";
export declare const AGENT_BLACKBOX_OPENCODE_ADAPTER_VERSION = "0.1.0";
export declare function describeOpenCodeAdapter(): string;
export declare function createOpenCodeRecorder(context: OpenCodePluginContext, options?: OpenCodeRecorderOptions): Promise<OpenCodeRecorderHooks>;
export declare function createOpenCodePlugin(options?: OpenCodeRecorderOptions): (context: OpenCodePluginContext) => Promise<OpenCodeRecorderHooks>;
export declare const AgentBlackboxOpenCode: (context: OpenCodePluginContext) => Promise<OpenCodeRecorderHooks>;
export declare function detectOpenCodeRunPrompt(argv: string[]): string | undefined;
export type { OpenCodeHookInput, OpenCodeHookOutput, OpenCodePluginContext, OpenCodeRecorderHooks, OpenCodeRecorderOptions, TraceSink } from "./types.js";
export { normalizeOpenCodeEvent, normalizeToolAfter, normalizeToolBefore } from "./normalize.js";
export { createFileTraceSink, createHttpTraceSink, createTraceSink } from "./sink.js";
//# sourceMappingURL=index.d.ts.map