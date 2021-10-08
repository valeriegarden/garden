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
exports.gardenPlugin = exports.configSchema = void 0;
const split2 = require("split2");
const sdk_1 = require("@garden-io/sdk");
const string_1 = require("@garden-io/sdk/util/string");
const openjdk_1 = require("./openjdk");
const maven_1 = require("./maven");
const gradle_1 = require("./gradle");
// TODO: gradually get rid of these core dependencies, move some to SDK etc.
const provider_1 = require("@garden-io/core/build/src/config/provider");
const common_1 = require("@garden-io/core/build/src/docs/common");
const config_1 = require("@garden-io/core/build/src/plugins/container/config");
const common_2 = require("@garden-io/core/build/src/config/common");
const util_1 = require("@garden-io/core/build/src/util/util");
const module_1 = require("@garden-io/core/build/src/config/module");
const helpers_1 = require("@garden-io/core/build/src/plugins/container/helpers");
const lodash_1 = require("lodash");
const logger_1 = require("@garden-io/core/build/src/logger/logger");
const util_2 = require("./util");
const configSchema = () => provider_1.providerConfigBaseSchema().unknown(false);
exports.configSchema = configSchema;
const moduleTypeUrl = common_1.getModuleTypeUrl("jib-container");
const containerModuleTypeUrl = common_1.getModuleTypeUrl("container");
const exampleUrl = common_1.getGitHubUrl("examples/jib-container");
const jibModuleSchema = () => config_1.containerModuleSpecSchema().keys({
    build: module_1.baseBuildSpecSchema().keys({
        projectType: common_2.joi
            .string()
            .allow("gradle", "maven", "jib", "auto")
            .default("auto")
            .description(string_1.dedent `
          The type of project to build. Defaults to auto-detect between gradle and maven (based on which files/directories are found in the module root), but in some cases you may need to specify it.
          `),
        jdkVersion: common_2.joi.number().integer().allow(8, 11).default(11).description("The JDK version to use."),
        tarOnly: common_2.joi
            .boolean()
            .default(false)
            .description("Don't load or push the resulting image to a Docker daemon or registry, only build it as a tar file."),
        tarFormat: common_2.joi
            .string()
            .allow("docker", "oci")
            .default("docker")
            .description("Specify the image format in the resulting tar file. Only used if `tarOnly: true`."),
        extraFlags: common_2.joi
            .sparseArray()
            .items(common_2.joi.string())
            .description(`Specify extra flags to pass to maven/gradle when building the container image.`),
    }),
});
const gardenPlugin = () => sdk_1.createGardenPlugin({
    name: "jib",
    docs: string_1.dedent `
      **EXPERIMENTAL**: Please provide feedback via GitHub issues or our community forum!

      Provides support for [Jib](https://github.com/GoogleContainerTools/jib) via the [jib module type](${moduleTypeUrl}).

      Use this to efficiently build container images for Java services. Check out the [jib example](${exampleUrl}) to see it in action.
    `,
    dependencies: [{ name: "container" }],
    configSchema: exports.configSchema(),
    createModuleTypes: [
        {
            name: "jib-container",
            base: "container",
            docs: string_1.dedent `
        Extends the [container module type](${containerModuleTypeUrl}) to build the image with [Jib](https://github.com/GoogleContainerTools/jib). Use this to efficiently build container images for Java services. Check out the [jib example](${exampleUrl}) to see it in action.

        The image is always built locally, directly from the module source directory (see the note on that below), before shipping the container image to the right place. You can set \`build.tarOnly: true\` to only build the image as a tarball.

        By default (and when not using remote building), the image is pushed to the local Docker daemon, to match the behavior of and stay compatible with normal \`container\` modules.

        When using remote building with the \`kubernetes\` provider, the image is synced to the cluster (where individual layers are cached) and then pushed to the deployment registry from there. This is to make sure any registry auth works seamlessly and exactly like for normal Docker image builds.

        Please consult the [Jib documentation](https://github.com/GoogleContainerTools/jib) for how to configure Jib in your Gradle or Maven project.

        To provide additional arguments to Gradle/Maven when building, you can set the \`extraFlags\` field.

        **Important note:** Unlike many other module types, \`jib\` modules are built from the module _source_ directory instead of the build staging directory, because of how Java projects are often laid out across a repository. This means \`build.dependencies[].copy\` directives are effectively ignored, and any include/exclude statements and .gardenignore files will not impact the build result. _Note that you should still configure includes, excludes and/or a .gardenignore to tell Garden which files to consider as part of the module version hash, to correctly detect whether a new build is required._
      `,
            schema: jibModuleSchema(),
            handlers: {
                configure(params) {
                    return __awaiter(this, void 0, void 0, function* () {
                        let { base, moduleConfig } = params;
                        // The base handler will either auto-detect or set include if there's no Dockerfile, so we need to
                        // override that behavior.
                        const include = moduleConfig.include;
                        moduleConfig.include = [];
                        const configured = yield base(Object.assign(Object.assign({}, params), { moduleConfig: lodash_1.cloneDeep(moduleConfig) }));
                        moduleConfig = configured.moduleConfig;
                        moduleConfig.include = include;
                        moduleConfig.buildConfig.projectType = moduleConfig.spec.build.projectType;
                        moduleConfig.buildConfig.jdkVersion = moduleConfig.spec.build.jdkVersion;
                        // FIXME: for now we need to set this value because various code paths decide if the module is built (as
                        // opposed to just fetched) by checking if a Dockerfile is found or specified.
                        moduleConfig.buildConfig.dockerfile = moduleConfig.spec.dockerfile = "_jib";
                        return { moduleConfig };
                    });
                },
                getModuleOutputs({ moduleConfig, version }) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const deploymentImageName = helpers_1.containerHelpers.getDeploymentImageName(moduleConfig, undefined);
                        const localImageId = helpers_1.containerHelpers.getLocalImageId(moduleConfig, version);
                        const deploymentImageId = helpers_1.containerHelpers.unparseImageId({
                            repository: moduleConfig.spec.image || deploymentImageName,
                            tag: version.versionString,
                        });
                        return {
                            outputs: {
                                "local-image-name": helpers_1.containerHelpers.getLocalImageName(moduleConfig),
                                "local-image-id": localImageId,
                                "deployment-image-name": deploymentImageName,
                                "deployment-image-id": deploymentImageId,
                            },
                        };
                    });
                },
                build(params) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const { ctx, log, module } = params;
                        const { tarOnly, jdkVersion } = module.spec.build;
                        const openJdk = ctx.tools["jib.openjdk-" + jdkVersion];
                        const openJdkPath = yield openJdk.getPath(log);
                        const statusLine = log.placeholder({ level: logger_1.LogLevel.verbose, childEntriesInheritLevel: true });
                        let projectType = module.spec.build.projectType;
                        if (!projectType) {
                            projectType = util_2.detectProjectType(module);
                            statusLine.setState(util_1.renderOutputStream(`Detected project type ${projectType}`));
                        }
                        const outputStream = split2();
                        let buildLog = "";
                        outputStream.on("error", () => { });
                        outputStream.on("data", (line) => {
                            const str = line.toString();
                            statusLine.setState({ section: module.name, msg: str });
                            buildLog += str;
                        });
                        statusLine.setState({ section: module.name, msg: `Using JAVA_HOME=${openJdkPath}` });
                        const { flags, tarPath } = util_2.getBuildFlags(module, projectType);
                        if (projectType === "maven") {
                            yield maven_1.mvn({
                                ctx,
                                log,
                                cwd: module.path,
                                args: ["compile", "jib:buildTar", ...flags],
                                openJdkPath,
                                outputStream,
                            });
                        }
                        else {
                            yield gradle_1.gradle({
                                ctx,
                                log,
                                cwd: module.path,
                                args: ["jibBuildTar", ...flags],
                                openJdkPath,
                                outputStream,
                            });
                        }
                        if (!tarOnly) {
                            statusLine.setState({ section: module.name, msg: "Loading image to Docker daemon" });
                            yield helpers_1.containerHelpers.dockerCli({
                                ctx,
                                cwd: module.path,
                                args: ["load", "--input", tarPath],
                                log,
                            });
                        }
                        return {
                            fetched: false,
                            buildLog,
                            details: {
                                tarPath,
                            },
                        };
                    });
                },
            },
        },
    ],
    tools: [maven_1.mavenSpec, gradle_1.gradleSpec, ...openjdk_1.openJdkSpecs],
});
exports.gardenPlugin = gardenPlugin;
//# sourceMappingURL=index.js.map