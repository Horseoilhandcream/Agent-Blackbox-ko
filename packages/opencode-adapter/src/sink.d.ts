import type { OpenCodeRecorderOptions, TraceSink } from "./types.js";
export declare function createTraceSink(options: {
    directory: string;
    daemonUrl?: string;
    eventsFile?: string;
    sink?: TraceSink;
}): TraceSink;
export declare function createFileTraceSink(eventsFile: string): TraceSink;
export type HttpTraceSinkOptions = {
    retries?: number;
    timeoutMs?: number;
    retryDelayMs?: number;
    onWarn?: (message: string) => void;
};
export declare function createHttpTraceSink(daemonUrl: string, options?: HttpTraceSinkOptions): TraceSink;
export declare function resolveRecorderOptions(options: OpenCodeRecorderOptions): OpenCodeRecorderOptions;
//# sourceMappingURL=sink.d.ts.map