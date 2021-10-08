/// <reference types="node" />
import execa from "execa";
import { PluginContext, LogEntry } from "@garden-io/sdk/types";
import { Writable } from "stream";
export declare const gradleSpec: any;
export declare function getGradleTool(ctx: PluginContext): import("@garden-io/core/build/src/util/ext-tools").PluginTool;
/**
 * Run gradle with the specified args in the specified directory. If that directory contains a `./gradlew` script, we
 * use that. Otherwise we download gradle and use that.
 */
export declare function gradle({ ctx, args, cwd, log, openJdkPath, outputStream, }: {
    ctx: PluginContext;
    args: string[];
    cwd: string;
    log: LogEntry;
    openJdkPath: string;
    outputStream: Writable;
}): Promise<execa.ExecaReturnValue<string>>;
//# sourceMappingURL=gradle.d.ts.map