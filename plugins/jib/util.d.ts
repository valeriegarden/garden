import { GardenModule } from "@garden-io/sdk/types";
import { ContainerBuildSpec, ContainerModuleSpec } from "@garden-io/core/build/src/plugins/container/config";
interface JibModuleBuildSpec extends ContainerBuildSpec {
    projectType: "gradle" | "maven" | "auto";
    jdkVersion: number;
    tarOnly?: boolean;
    tarFormat: "docker" | "oci";
}
interface JibModuleSpec extends ContainerModuleSpec {
    build: JibModuleBuildSpec;
}
export declare type JibContainerModule = GardenModule<JibModuleSpec>;
export declare type JibPluginType = "gradle" | "maven";
export declare function detectProjectType(module: GardenModule): JibPluginType;
export declare function getBuildFlags(module: JibContainerModule, projectType: JibModuleBuildSpec["projectType"]): {
    flags: string[];
    tarPath: string;
};
export {};
//# sourceMappingURL=util.d.ts.map