import { GenericProviderConfig, Provider } from "@garden-io/core/build/src/config/provider";
export interface JibProviderConfig extends GenericProviderConfig {
}
export interface JibProvider extends Provider<JibProviderConfig> {
}
export declare const configSchema: () => import("@garden-io/core/build/src/config/common").CustomObjectSchema;
export declare const gardenPlugin: () => import("@garden-io/sdk/types").GardenPlugin;
//# sourceMappingURL=index.d.ts.map