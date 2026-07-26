import { type TraceEvent } from "@agent-blackbox/core";
import type { OpenCodeHookInput, OpenCodeHookOutput } from "./types.js";
export type OpenCodeNormalizerContext = {
    runId: string;
    seq: number;
    defaultSessionId: string;
    homeDir?: string;
    projectDir?: string;
    rawStored?: boolean;
};
export declare function shouldRecordOpenCodeEvent(rawEvent: unknown): boolean;
export declare function subagentSessionFromEvent(rawEvent: unknown): {
    sessionId: string;
    agent: string;
    parentId: string;
} | null;
export declare function agentFromSubagentTitle(title: string | undefined): string | undefined;
export declare function normalizeOpenCodeEvent(rawEvent: unknown, context: OpenCodeNormalizerContext): TraceEvent;
export declare function normalizeSyntheticUserPrompt(prompt: string, sourceEvent: TraceEvent, context: OpenCodeNormalizerContext): TraceEvent;
export declare function normalizeToolBefore(input: OpenCodeHookInput, output: OpenCodeHookOutput, context: OpenCodeNormalizerContext): TraceEvent;
export declare function normalizeToolAfter(input: OpenCodeHookInput, output: OpenCodeHookOutput, context: OpenCodeNormalizerContext): TraceEvent;
//# sourceMappingURL=normalize.d.ts.map