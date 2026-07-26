export type ReadCacheEntry = {
    hash: string;
    content: string;
    gen: number;
};
export type ServeMode = "full" | "noop" | "diff";
export type ServeDecision = {
    mode: ServeMode;
    output?: string;
    saved: number;
};
export declare const hashContent: (content: string) => string;
export declare const isReadTool: (tool: unknown) => boolean;
export declare function readArgPath(args: unknown): string | undefined;
export declare function computeReadDelta(prior: string, current: string, path: string): string | null;
export declare function decideReadServe(prior: ReadCacheEntry | undefined, current: {
    hash: string;
    content: string;
}, gen: number, path: string): ServeDecision;
export type WorkingSetFile = {
    path: string;
    reads: number;
    edits: number;
    hash?: string;
};
export declare const READ_CACHE_MAX_ENTRIES = 64;
export declare const READ_CACHE_MAX_CONTENT_BYTES: number;
export declare const WORKING_SET_MAX_FILES = 200;
export declare const WORKING_SET_MAX_COMMANDS = 20;
/**
 * Record the bytes last served for a read, keeping the cache bounded. A Map
 * iterates in insertion order, so deleting before setting makes the oldest key the
 * least-recently-served one — a plain LRU. Contents past
 * READ_CACHE_MAX_CONTENT_BYTES aren't cached at all: one huge file could otherwise
 * outweigh the whole rest of the budget.
 */
export declare function rememberRead(cache: Map<string, ReadCacheEntry>, key: string, entry: ReadCacheEntry): void;
/** Drop the least-touched file once the working set is full, so it stays bounded. */
export declare function evictColdestFile(files: Map<string, WorkingSetFile>): void;
export declare const WORKING_SET_START = "\u27E8agent-blackbox:working-set\u27E9";
export declare const WORKING_SET_END = "\u27E8/agent-blackbox:working-set\u27E9";
export declare function buildWorkingSetBlock(files: WorkingSetFile[], commands: string[]): string | null;
export declare const isReusableCommand: (command: string) => boolean;
//# sourceMappingURL=optimize.d.ts.map