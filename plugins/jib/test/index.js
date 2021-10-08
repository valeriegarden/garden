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
const path_1 = require("path");
const testdouble_1 = __importDefault(require("testdouble"));
const chai_1 = require("chai");
const testing_1 = require("@garden-io/sdk/testing");
const constants_1 = require("@garden-io/sdk/constants");
const __1 = require("..");
const helpers_1 = require("@garden-io/core/build/src/plugins/container/helpers");
describe("jib-container", () => {
    const projectRoot = path_1.join(__dirname, "test-project");
    const projectConfig = {
        apiVersion: constants_1.defaultApiVersion,
        kind: "Project",
        name: "test",
        path: projectRoot,
        defaultEnvironment: "default",
        dotIgnoreFiles: [],
        environments: [{ name: "default", defaultNamespace: constants_1.defaultNamespace, variables: {} }],
        providers: [{ name: "jib" }],
        variables: {},
    };
    let garden;
    let graph;
    let actions;
    let module;
    before(() => __awaiter(void 0, void 0, void 0, function* () {
        garden = yield testing_1.makeTestGarden(projectRoot, {
            plugins: [__1.gardenPlugin],
            config: projectConfig,
        });
        graph = yield garden.getConfigGraph({ log: garden.log, emit: false });
        actions = yield garden.getActionRouter();
    }));
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        graph = yield garden.getConfigGraph({ log: garden.log, emit: false });
        module = graph.getModule("module");
    }));
    describe("configure", () => {
        it("sets relevant parameters on the buildConfig and spec fields", () => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c;
            chai_1.expect((_a = module.buildConfig) === null || _a === void 0 ? void 0 : _a.projectType).to.equal("auto");
            chai_1.expect((_b = module.buildConfig) === null || _b === void 0 ? void 0 : _b.jdkVersion).to.equal(11);
            chai_1.expect((_c = module.buildConfig) === null || _c === void 0 ? void 0 : _c.dockerfile).to.equal("_jib");
            chai_1.expect(module.spec.dockerfile).to.equal("_jib");
        }));
    });
    describe("getModuleOutputs", () => {
        it("correctly sets the module outputs", () => __awaiter(void 0, void 0, void 0, function* () {
            chai_1.expect(module.outputs).to.eql({
                "deployment-image-id": "module:" + module.version.versionString,
                "deployment-image-name": "module",
                "local-image-id": "module:" + module.version.versionString,
                "local-image-name": "module",
            });
        }));
    });
    describe("build", () => {
        context("tarOnly=true", () => {
            it("builds a maven project", () => __awaiter(void 0, void 0, void 0, function* () {
                module.spec.build.projectType = "maven";
                module.spec.build.tarOnly = true;
                const res = yield actions.build({
                    module,
                    log: garden.log,
                    graph,
                });
                const { tarPath } = res.details;
                chai_1.expect(tarPath).to.equal(path_1.join(module.path, "target", `jib-image-module-${module.version.versionString}.tar`));
            }));
            it("builds a gradle project", () => __awaiter(void 0, void 0, void 0, function* () {
                module.spec.build.projectType = "gradle";
                module.spec.build.tarOnly = true;
                const res = yield actions.build({
                    module,
                    log: garden.log,
                    graph,
                });
                const { tarPath } = res.details;
                chai_1.expect(tarPath).to.equal(path_1.join(module.path, "build", `jib-image-module-${module.version.versionString}.tar`));
            }));
        });
        context("tarOnly=false", () => {
            it("builds a maven project", () => __awaiter(void 0, void 0, void 0, function* () {
                module.spec.build.projectType = "maven";
                module.spec.build.tarOnly = false;
                const dockerCli = testdouble_1.default.replace(helpers_1.containerHelpers, "dockerCli");
                const res = yield actions.build({
                    module,
                    log: garden.log,
                    graph,
                });
                const { tarPath } = res.details;
                testdouble_1.default.verify(dockerCli({
                    cwd: module.path,
                    args: ["load", "--input", tarPath],
                    log: testdouble_1.default.matchers.anything(),
                    ctx: testdouble_1.default.matchers.anything(),
                }));
            }));
            it("builds a gradle project and pushes to the local docker daemon", () => __awaiter(void 0, void 0, void 0, function* () {
                module.spec.build.projectType = "gradle";
                module.spec.build.tarOnly = false;
                const dockerCli = testdouble_1.default.replace(helpers_1.containerHelpers, "dockerCli");
                const res = yield actions.build({
                    module,
                    log: garden.log,
                    graph,
                });
                const { tarPath } = res.details;
                testdouble_1.default.verify(dockerCli({
                    cwd: module.path,
                    args: ["load", "--input", tarPath],
                    log: testdouble_1.default.matchers.anything(),
                    ctx: testdouble_1.default.matchers.anything(),
                }));
            }));
        });
    });
});
//# sourceMappingURL=index.js.map