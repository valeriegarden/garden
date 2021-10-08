/// <reference types="node" />
import { PluginToolSpec, PluginContext, LogEntry } from "@garden-io/sdk/types";
import { Writable } from "node:stream";
import execa from "execa";
export declare const mavenSpec: PluginToolSpec;
export declare function getMvnTool(ctx: PluginContext): import("@garden-io/core/build/src/util/ext-tools").PluginTool;
/**
 * Run maven with the specified args in the specified directory.
 */
export declare function mvn({ ctx, args, cwd, log, openJdkPath, outputStream, }: {
    ctx: PluginContext;
    args: string[];
    cwd: string;
    log: LogEntry;
    openJdkPath: string;
    outputStream?: Writable;
}): Promise<execa.ExecaReturnValue<string>>;
//# sourceMappingURL=maven.d.ts.map