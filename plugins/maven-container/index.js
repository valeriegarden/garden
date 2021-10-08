"use strict";
/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareBuild = exports.configureMavenContainerModule = exports.gardenPlugin = exports.mavenContainerConfigSchema = void 0;
const lodash_1 = require("lodash");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const xml_js_1 = require("xml-js");
const sdk_1 = require("@garden-io/sdk");
const string_1 = require("@garden-io/sdk/util/string");
const openjdk_1 = require("@garden-io/garden-jib/openjdk");
const maven_1 = require("@garden-io/garden-jib/maven");
const common_1 = require("@garden-io/core/build/src/config/common");
const exceptions_1 = require("@garden-io/core/build/src/exceptions");
const helpers_1 = require("@garden-io/core/build/src/plugins/container/helpers");
const constants_1 = require("@garden-io/core/build/src/constants");
const config_1 = require("@garden-io/core/build/src/plugins/container/config");
const provider_1 = require("@garden-io/core/build/src/config/provider");
const common_2 = require("@garden-io/core/build/src/docs/common");
const container_1 = require("@garden-io/core/build/src/plugins/container/container");
const defaultDockerfileName = "maven-container.Dockerfile";
const defaultDockerfilePath = path_1.resolve(constants_1.STATIC_DIR, "maven-container", defaultDockerfileName);
const mavenKeys = {
    imageVersion: common_1.joi
        .string()
        .description(string_1.dedent `
      Set this to override the default OpenJDK container image version. Make sure the image version matches the
      configured \`jdkVersion\`. Ignored if you provide your own Dockerfile.
    `)
        .example("11-jdk"),
    include: common_1.joiModuleIncludeDirective(),
    jarPath: common_1.joi
        .posixPath()
        .subPathOnly()
        .required()
        .description("POSIX-style path to the packaged JAR artifact, relative to the module directory.")
        .example("target/my-module.jar"),
    jdkVersion: common_1.joi.number().integer().allow(8, 11, 13).default(8).description("The JDK version to use."),
    mvnOpts: common_1.joiSparseArray(common_1.joi.string()).description("Options to add to the `mvn package` command when building."),
    useDefaultDockerfile: common_1.joi
        .boolean()
        .default(true)
        .description(string_1.dedent `
      Use the default Dockerfile provided with this module. If set to \`false\` and no Dockerfile is found, Garden will fallback to using the \`image\` field.
      `),
};
const mavenContainerModuleSpecSchema = () => config_1.containerModuleSpecSchema().keys(mavenKeys);
const mavenContainerConfigSchema = () => provider_1.providerConfigBaseSchema().keys({
    name: common_1.joiProviderName("maven-container"),
});
exports.mavenContainerConfigSchema = mavenContainerConfigSchema;
const moduleTypeUrl = common_2.getModuleTypeUrl("maven-container");
const gardenPlugin = () => sdk_1.createGardenPlugin({
    name: "maven-container",
    dependencies: [{ name: "container" }],
    docs: string_1.dedent `
    **DEPRECATED**. Please use the [jib provider](${common_2.getProviderUrl("jib")}) instead.

    Adds the [maven-container module type](${moduleTypeUrl}), which is a specialized version of the \`container\` module type that has special semantics for building JAR files using Maven.

    To use it, simply add the provider to your provider configuration, and refer to the [maven-container module docs](${moduleTypeUrl}) for details on how to configure the modules.
  `,
    createModuleTypes: [
        {
            name: "maven-container",
            base: "container",
            docs: string_1.dedent `
      **DEPRECATED**. Please use the [jib-container module type](${common_2.getModuleTypeUrl("jib-container")}) instead.

      A specialized version of the [container](https://docs.garden.io/reference/module-types/container) module type
      that has special semantics for JAR files built with Maven.

      Rather than build the JAR inside the container (or in a multi-stage build) this plugin runs \`mvn package\`
      ahead of building the container, which tends to be much more performant, especially when building locally
      with a warm artifact cache.

      A default Dockerfile is also provided for convenience, but you may override it by including one in the module
      directory.

      To use it, make sure to add the \`maven-container\` provider to your project configuration.
      The provider will automatically fetch and cache Maven and the appropriate OpenJDK version ahead of building.
    `,
            schema: mavenContainerModuleSpecSchema(),
            moduleOutputsSchema: container_1.containerModuleOutputsSchema(),
            handlers: {
                configure: configureMavenContainerModule,
                getBuildStatus,
                build,
            },
        },
    ],
    tools: [maven_1.mavenSpec, ...openjdk_1.openJdkSpecs],
});
exports.gardenPlugin = gardenPlugin;
function configureMavenContainerModule(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { base, moduleConfig } = params;
        let containerConfig = Object.assign(Object.assign({}, moduleConfig), { type: "container" });
        containerConfig.spec = lodash_1.omit(moduleConfig.spec, Object.keys(mavenKeys));
        const jdkVersion = moduleConfig.spec.jdkVersion;
        containerConfig.spec.buildArgs = {
            IMAGE_VERSION: moduleConfig.spec.imageVersion || `${jdkVersion}-jdk`,
        };
        const configured = yield base(Object.assign(Object.assign({}, params), { moduleConfig: containerConfig }));
        const dockerfile = moduleConfig.spec.useDefaultDockerfile
            ? moduleConfig.spec.dockerfile || defaultDockerfileName
            : moduleConfig.spec.dockerfile;
        configured.moduleConfig.spec.dockerfile = dockerfile;
        configured.moduleConfig.buildConfig.dockerfile = dockerfile;
        return {
            moduleConfig: Object.assign(Object.assign({}, configured.moduleConfig), { type: "maven-container", spec: Object.assign(Object.assign({}, configured.moduleConfig.spec), { jdkVersion,
                    dockerfile, useDefaultDockerfile: moduleConfig.spec.useDefaultDockerfile, jarPath: moduleConfig.spec.jarPath, mvnOpts: moduleConfig.spec.mvnOpts }) }),
        };
    });
}
exports.configureMavenContainerModule = configureMavenContainerModule;
function getBuildStatus(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { base, module, log } = params;
        yield prepareBuild(module, log);
        return base(params);
    });
}
function build(params) {
    return __awaiter(this, void 0, void 0, function* () {
        // Run the maven build
        const { ctx, base, module, log } = params;
        let { jarPath, jdkVersion, mvnOpts, useDefaultDockerfile, image } = module.spec;
        // Fall back to using the image field
        if (!useDefaultDockerfile && !helpers_1.containerHelpers.hasDockerfile(module, module.version)) {
            if (!image) {
                throw new exceptions_1.ConfigurationError(string_1.dedent `
        The useDefaultDockerfile field is set to false, no Dockerfile was found, and the image field is empty for maven-container module ${module.name}. Please use either the default Dockerfile, your own Dockerfile, or specify an image in the image field.
      `, { spec: module.spec });
            }
            return base(params);
        }
        const pom = yield loadPom(module.path);
        const artifactId = lodash_1.get(pom, ["project", "artifactId", "_text"]);
        if (!artifactId) {
            throw new exceptions_1.ConfigurationError(`Could not read artifact ID from pom.xml in ${module.path}`, { path: module.path });
        }
        log.setState(`Creating jar artifact...`);
        const openJdk = ctx.tools["maven-container.openjdk-" + jdkVersion];
        const openJdkPath = yield openJdk.getPath(log);
        const mvnArgs = ["package", "--batch-mode", "--projects", ":" + artifactId, "--also-make", ...mvnOpts];
        const mvnCmdStr = "mvn " + mvnArgs.join(" ");
        yield maven_1.mvn({
            ctx,
            log,
            args: mvnArgs,
            openJdkPath,
            cwd: module.path,
        });
        // Copy the artifact to the module build directory
        const resolvedJarPath = path_1.resolve(module.path, jarPath);
        if (!(yield fs_extra_1.pathExists(resolvedJarPath))) {
            throw new exceptions_1.RuntimeError(`Could not find artifact at ${resolvedJarPath} after running '${mvnCmdStr}'`, {
                jarPath,
                mvnArgs,
            });
        }
        yield fs_extra_1.copy(resolvedJarPath, path_1.resolve(module.buildPath, "app.jar"));
        // Build the container
        yield prepareBuild(module, log);
        return base(params);
    });
}
/**
 * Copy the default Dockerfile to the build directory, if the module doesn't provide one.
 * Note: Doing this here so that the build status check works as expected.
 */
function prepareBuild(module, log) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!module.spec.useDefaultDockerfile) {
            return;
        }
        if (module.spec.dockerfile === defaultDockerfileName || !helpers_1.containerHelpers.hasDockerfile(module, module.version)) {
            log.debug(`Using default Dockerfile`);
            yield fs_extra_1.copy(defaultDockerfilePath, path_1.resolve(module.buildPath, defaultDockerfileName));
        }
    });
}
exports.prepareBuild = prepareBuild;
function loadPom(dir) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const pomPath = path_1.resolve(dir, "pom.xml");
            const pomData = yield fs_extra_1.readFile(pomPath);
            return JSON.parse(xml_js_1.xml2json(pomData.toString(), { compact: true }));
        }
        catch (err) {
            throw new exceptions_1.ConfigurationError(`Could not load pom.xml from directory ${dir}`, { dir });
        }
    });
}
//# sourceMappingURL=index.js.map