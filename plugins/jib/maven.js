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
exports.mvn = exports.getMvnTool = exports.mavenSpec = void 0;
const async_lock_1 = __importDefault(require("async-lock"));
const lodash_1 = require("lodash");
const exceptions_1 = require("@garden-io/core/build/src/exceptions");
const execa_1 = __importDefault(require("execa"));
const buildLock = new async_lock_1.default();
const spec = {
    url: "https://archive.apache.org/dist/maven/maven-3/3.6.3/binaries/apache-maven-3.6.3-bin.tar.gz",
    sha256: "26ad91d751b3a9a53087aefa743f4e16a17741d3915b219cf74112bf87a438c5",
    extract: {
        format: "tar",
        targetPath: "apache-maven-3.6.3/bin/mvn",
    },
};
exports.mavenSpec = {
    name: "maven",
    description: "The Maven CLI.",
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
function getMvnTool(ctx) {
    const tool = lodash_1.find(ctx.tools, (_, k) => k.endsWith(".maven"));
    if (!tool) {
        throw new exceptions_1.PluginError(`Could not find configured maven tool`, { tools: ctx.tools });
    }
    return tool;
}
exports.getMvnTool = getMvnTool;
/**
 * Run maven with the specified args in the specified directory.
 */
function mvn({ ctx, args, cwd, log, openJdkPath, outputStream, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const tool = getMvnTool(ctx);
        const mvnPath = yield tool.getPath(log);
        // Maven has issues when running concurrent processes, so we're working around that with a lock.
        // TODO: http://takari.io/book/30-team-maven.html would be a more robust solution.
        return buildLock.acquire("mvn", () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            log.debug(`Execing ${mvnPath} ${args.join(" ")}`);
            const res = execa_1.default(mvnPath, args, {
                cwd,
                env: {
                    JAVA_HOME: openJdkPath,
                },
            });
            if (outputStream) {
                (_a = res.stdout) === null || _a === void 0 ? void 0 : _a.pipe(outputStream);
                (_b = res.stderr) === null || _b === void 0 ? void 0 : _b.pipe(outputStream);
            }
            return res;
        }));
    });
}
exports.mvn = mvn;
//# sourceMappingURL=maven.js.map