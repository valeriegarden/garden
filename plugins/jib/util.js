"use strict";
/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBuildFlags = exports.detectProjectType = void 0;
const path_1 = require("path");
const exceptions_1 = require("@garden-io/core/build/src/exceptions");
const build_1 = require("@garden-io/core/build/src/plugins/container/build");
const gradlePaths = [
    "build.gradle",
    "build.gradle.kts",
    "gradle.properties",
    "settings.gradle",
    "gradlew",
    "gradlew.bat",
    "gradlew.cmd",
];
const mavenPaths = ["pom.xml", ".mvn"];
function detectProjectType(module) {
    const moduleFiles = module.version.files;
    // TODO: support the Jib CLI
    for (const filename of gradlePaths) {
        const path = path_1.resolve(module.path, filename);
        if (moduleFiles.includes(path)) {
            return "gradle";
        }
    }
    for (const filename of mavenPaths) {
        const path = path_1.resolve(module.path, filename);
        if (moduleFiles.includes(path)) {
            return "maven";
        }
    }
    throw new exceptions_1.ConfigurationError(`Could not detect a gradle or maven project to build module ${module.name}`, {});
}
exports.detectProjectType = detectProjectType;
function getBuildFlags(module, projectType) {
    const targetDir = projectType === "maven" ? "target" : "build";
    // Make sure the target directory is scoped by module name, in case there are multiple modules in a project
    const basenameSuffix = `-${module.name}-${module.version.versionString}`;
    const tarFilename = `jib-image${basenameSuffix}.tar`;
    // TODO: don't assume module path is the project root
    const tarPath = path_1.resolve(module.path, targetDir, tarFilename);
    const dockerBuildArgs = build_1.getDockerBuildArgs(module);
    const imageId = module.outputs["local-image-id"];
    const { tarOnly, tarFormat } = module.spec.build;
    const flags = [
        "-Djib.to.image=" + imageId,
        `-Djib.outputPaths.tar=${targetDir}/${tarFilename}`,
        `-Djib.outputPaths.digest=${targetDir}/jib-image${basenameSuffix}.digest`,
        `-Djib.outputPaths.imageId=${targetDir}/jib-image${basenameSuffix}.id`,
        `-Djib.outputPaths.imageJson=${targetDir}/jib-image${basenameSuffix}.json`,
        "-Djib.container.args=" + dockerBuildArgs.join(","),
        "-Dstyle.color=always",
        "-Djansi.passthrough=true",
        "-Djib.console=plain",
        ...(module.spec.extraFlags || []),
    ];
    if (tarOnly && tarFormat === "oci") {
        flags.push("-Djib.container.format=OCI");
    }
    return { flags, tarPath };
}
exports.getBuildFlags = getBuildFlags;
//# sourceMappingURL=util.js.map