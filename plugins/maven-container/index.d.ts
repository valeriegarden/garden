import { LogEntry, GardenModule, ModuleConfig } from "@garden-io/sdk/types";
import { ContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec, ContainerTaskSpec } from "@garden-io/core/build/src/plugins/container/config";
import { ConfigureModuleParams } from "@garden-io/core/build/src/types/plugin/module/configure";
export interface MavenContainerModuleSpec extends ContainerModuleSpec {
    imageVersion?: string;
    jarPath: string;
    jdkVersion: number;
    mvnOpts: string[];
    useDefaultDockerfile: boolean;
}
export declare type MavenContainerModuleConfig = ModuleConfig<MavenContainerModuleSpec>;
export interface MavenContainerModule<M extends MavenContainerModuleSpec = MavenContainerModuleSpec, S extends ContainerServiceSpec = ContainerServiceSpec, T extends ContainerTestSpec = ContainerTestSpec, W extends ContainerTaskSpec = ContainerTaskSpec> extends GardenModule<M, S, T, W> {
}
export declare const mavenContainerConfigSchema: () => import("@garden-io/core/build/src/config/common").CustomObjectSchema;
export declare const gardenPlugin: () => import("@garden-io/sdk/types").GardenPlugin;
export declare function configureMavenContainerModule(params: ConfigureModuleParams<MavenContainerModule>): Promise<{
    moduleConfig: any;
}>;
/**
 * Copy the default Dockerfile to the build directory, if the module doesn't provide one.
 * Note: Doing this here so that the build status check works as expected.
 */
export declare function prepareBuild(module: MavenContainerModule, log: LogEntry): Promise<void>;
//# sourceMappingURL=index.d.ts.map