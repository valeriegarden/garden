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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gradle = exports.getGradleTool = exports.gradleSpec = void 0;
const execa_1 = __importDefault(require("execa"));
const lodash_1 = require("lodash");
const exceptions_1 = require("@garden-io/core/build/src/exceptions");
const path_1 = require("path");
const fs_extra_1 = require("fs-extra");
const spec = {
    url: "https://services.gradle.org/distributions/gradle-7.1.1-bin.zip",
    sha256: "bf8b869948901d422e9bb7d1fa61da6a6e19411baa7ad6ee929073df85d6365d",
    extract: {
        format: "zip",
        targetPath: "gradle-7.1.1/bin/gradle",
    },
};
exports.gradleSpec = {
    name: "gradle",
    description: "The gradle CLI.",
    type: "binary",
    builds: [
        Object.assign({ platform: "darwin", architecture: "amd64" }, spec),
        Object.assign({ platform: "linux", architecture: "amd64" }, spec),
        Object.assign(Object.assign({ platform: "windows", architecture: "amd64" }, spec), { extract: {
                format: "zip",
                targetPath: spec.extract.targetPath + ".bat",
            } }),
    ],
};
function getGradleTool(ctx) {
    const tool = lodash_1.find(ctx.tools, (_, k) => k.endsWith(".gradle"));
    if (!tool) {
        throw new exceptions_1.PluginError(`Could not find configured gradle tool`, { tools: ctx.tools });
    }
    return tool;
}
exports.getGradleTool = getGradleTool;
/**
 * Run gradle with the specified args in the specified directory. If that directory contains a `./gradlew` script, we
 * use that. Otherwise we download gradle and use that.
 */
function gradle({ ctx, args, cwd, log, openJdkPath, outputStream, }) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const gradlewPath = path_1.resolve(cwd, process.platform === "win32" ? "gradlew.bat" : "gradlew");
        let gradlePath = gradlewPath;
        if (!(yield fs_extra_1.pathExists(gradlePath))) {
            const tool = getGradleTool(ctx);
            gradlePath = yield tool.getPath(log);
        }
        log.debug(`Execing ${gradlePath} ${args.join(" ")}`);
        const res = execa_1.default(gradlePath, args, {
            cwd,
            env: {
                JAVA_HOME: openJdkPath,
            },
        });
        (_a = res.stdout) === null || _a === void 0 ? void 0 : _a.pipe(outputStream);
        (_b = res.stderr) === null || _b === void 0 ? void 0 : _b.pipe(outputStream);
        return res;
    });
}
exports.gradle = gradle;
//# sourceMappingURL=gradle.js.map