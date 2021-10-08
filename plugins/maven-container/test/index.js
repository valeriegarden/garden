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
const chai_1 = require("chai");
const path_1 = require("path");
const lodash_1 = require("lodash");
const testdouble_1 = __importDefault(require("testdouble"));
const tmp_promise_1 = __importDefault(require("tmp-promise"));
const fs_extra_1 = require("fs-extra");
const string_1 = require("@garden-io/sdk/util/string");
const testing_1 = require("@garden-io/sdk/testing");
const __1 = require("..");
const garden_1 = require("@garden-io/core/build/src/garden");
const container_1 = require("@garden-io/core/build/src/plugins/container/container");
const module_1 = require("@garden-io/core/build/src/types/module");
const helpers_1 = require("@garden-io/core/build/src/plugins/container/helpers");
const helpers_2 = require("@garden-io/core/build/src/plugins/container/helpers");
describe("maven-container", () => {
    const projectRoot = path_1.join(__dirname, "test-project");
    const modulePath = projectRoot;
    const plugin = __1.gardenPlugin();
    const basePlugin = container_1.gardenPlugin();
    const handlers = plugin.createModuleTypes[0].handlers;
    const baseHandlers = basePlugin.createModuleTypes[0].handlers;
    const build = handlers.build;
    const configure = handlers.configure;
    const configureBase = baseHandlers.configure;
    const buildBase = baseHandlers.build;
    const baseConfig = {
        allowPublish: false,
        build: {
            dependencies: [],
        },
        disabled: false,
        apiVersion: "garden.io/v0",
        name: "test",
        path: modulePath,
        type: "maven-container",
        spec: {
            jarPath: "./sample.jar",
            jdkVersion: 8,
            useDefaultDockerfile: true,
            mvnOpts: [],
            build: {
                dependencies: [],
                timeout: helpers_1.DEFAULT_BUILD_TIMEOUT,
            },
            buildArgs: {},
            extraFlags: [],
            services: [],
            tasks: [],
            tests: [],
        },
        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
    };
    let garden;
    let ctx;
    let log;
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        garden = yield testing_1.makeTestGarden(projectRoot, { plugins: [__1.gardenPlugin] });
        log = garden.log;
        const provider = yield garden.resolveProvider(garden.log, "maven-container");
        ctx = yield garden.getPluginContext(provider);
        testdouble_1.default.replace(garden.buildStaging, "syncDependencyProducts", () => null);
        testdouble_1.default.replace(garden_1.Garden.prototype, "resolveModuleVersion", () => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                versionString: "1234",
                dependencyVersions: {},
                files: [],
            });
        }));
        testdouble_1.default.replace(helpers_2.containerHelpers, "checkDockerServerVersion", () => null);
    }));
    afterEach(() => {
        testdouble_1.default.reset();
    });
    function getTestModule(moduleConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            const parsed = yield configure({ ctx, moduleConfig, log, base: configureBase });
            return module_1.moduleFromConfig({ garden, log, config: parsed.moduleConfig, buildDependencies: [] });
        });
    }
    describe("configure", () => {
        it("should use default Dockerfile if no Dockerfile provided", () => __awaiter(void 0, void 0, void 0, function* () {
            const config = lodash_1.cloneDeep(baseConfig);
            const parsed = yield configure({ ctx, moduleConfig: config, log, base: configureBase });
            chai_1.expect(parsed.moduleConfig.spec.dockerfile).to.eql("maven-container.Dockerfile");
        }));
        it("should use user Dockerfile if provided", () => __awaiter(void 0, void 0, void 0, function* () {
            const config = lodash_1.cloneDeep(baseConfig);
            config.spec.dockerfile = "Dockerfile";
            const parsed = yield configure({ ctx, moduleConfig: config, log, base: configureBase });
            chai_1.expect(parsed.moduleConfig.spec.dockerfile).to.eql("Dockerfile");
        }));
        context("useDefaultDockerfile is false", () => {
            it("should not use default Dockerfile", () => __awaiter(void 0, void 0, void 0, function* () {
                const config = lodash_1.cloneDeep(baseConfig);
                config.spec.useDefaultDockerfile = false;
                const parsedA = yield configure({ ctx, moduleConfig: config, log, base: configureBase });
                config.spec.dockerfile = "Dockerfile";
                const parsedB = yield configure({ ctx, moduleConfig: config, log, base: configureBase });
                chai_1.expect(parsedA.moduleConfig.spec.dockerfile).to.eql(undefined);
                chai_1.expect(parsedB.moduleConfig.spec.dockerfile).to.eql("Dockerfile");
            }));
        });
    });
    describe("build", () => {
        context("useDefaultDockerfile is false", () => {
            it("should pull image if image tag is set and the module doesn't contain a Dockerfile", () => __awaiter(void 0, void 0, void 0, function* () {
                const config = lodash_1.cloneDeep(baseConfig);
                config.spec.useDefaultDockerfile = false;
                config.spec.image = "some/image";
                const module = testdouble_1.default.object(yield getTestModule(config));
                testdouble_1.default.replace(helpers_2.containerHelpers, "hasDockerfile", () => false);
                testdouble_1.default.replace(helpers_2.containerHelpers, "pullImage", () => __awaiter(void 0, void 0, void 0, function* () { return null; }));
                testdouble_1.default.replace(helpers_2.containerHelpers, "imageExistsLocally", () => __awaiter(void 0, void 0, void 0, function* () { return false; }));
                const result = yield build({ ctx, log, module, base: buildBase });
                chai_1.expect(result).to.eql({ fetched: true });
            }));
            it("should throw if image tag is not set and the module doesn't contain a Dockerfile", () => __awaiter(void 0, void 0, void 0, function* () {
                testdouble_1.default.replace(helpers_2.containerHelpers, "hasDockerfile", () => true);
                const config = lodash_1.cloneDeep(baseConfig);
                const module = yield getTestModule(config);
                module.spec.useDefaultDockerfile = false;
                testdouble_1.default.reset();
                testdouble_1.default.replace(helpers_2.containerHelpers, "hasDockerfile", () => false);
                yield testing_1.expectError(() => build({ ctx, log, module, base: buildBase }), (err) => {
                    chai_1.expect(err.message).to.eql(string_1.dedent `
            The useDefaultDockerfile field is set to false, no Dockerfile was found, and the image field is empty for maven-container module ${module.name}. Please use either the default Dockerfile, your own Dockerfile, or specify an image in the image field.
            `);
                });
            }));
        });
    });
    describe("prepareBuild", () => {
        let tmpDir;
        let tmpPath;
        beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
            tmpDir = yield tmp_promise_1.default.dir({ unsafeCleanup: true });
            tmpPath = yield fs_extra_1.realpath(tmpDir.path);
        }));
        afterEach(() => __awaiter(void 0, void 0, void 0, function* () {
            yield tmpDir.cleanup();
        }));
        it("should copy the default Dockerfile to the build dir if user Dockerfile not provided", () => __awaiter(void 0, void 0, void 0, function* () {
            const config = lodash_1.cloneDeep(baseConfig);
            const module = testdouble_1.default.object(yield getTestModule(config));
            module.buildPath = tmpPath;
            yield __1.prepareBuild(module, log);
            chai_1.expect(yield fs_extra_1.pathExists(path_1.join(module.buildPath, "maven-container.Dockerfile"))).to.be.true;
        }));
        it("should not copy the default Dockerfile to the build dir if user Docerkfile provided", () => __awaiter(void 0, void 0, void 0, function* () {
            testdouble_1.default.replace(helpers_2.containerHelpers, "hasDockerfile", () => true);
            const config = lodash_1.cloneDeep(baseConfig);
            config.spec.dockerfile = "Dockerfile";
            const module = testdouble_1.default.object(yield getTestModule(config));
            module.buildPath = tmpPath;
            yield __1.prepareBuild(module, log);
            chai_1.expect(yield fs_extra_1.pathExists(path_1.join(module.buildPath, "maven-container.Dockerfile"))).to.be.false;
        }));
        context("useDefaultDockerfile is false", () => {
            it("should not copy the default Dockerfile to the build dir", () => __awaiter(void 0, void 0, void 0, function* () {
                testdouble_1.default.replace(helpers_2.containerHelpers, "hasDockerfile", () => true);
                const config = lodash_1.cloneDeep(baseConfig);
                config.spec.useDefaultDockerfile = false;
                const module = testdouble_1.default.object(yield getTestModule(config));
                module.buildPath = tmpPath;
                yield __1.prepareBuild(module, log);
                chai_1.expect(yield fs_extra_1.pathExists(path_1.join(module.buildPath, "maven-container.Dockerfile"))).to.be.false;
            }));
        });
    });
});
//# sourceMappingURL=index.js.map