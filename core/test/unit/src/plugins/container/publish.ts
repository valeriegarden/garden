/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import td from "testdouble"
import { ResolvedBuildAction, BuildActionConfig } from "../../../../../src/actions/build"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { PluginContext } from "../../../../../src/plugin-context"
import { buildContainer, getContainerBuildStatus } from "../../../../../src/plugins/container/build"
import { ContainerProvider, gardenPlugin } from "../../../../../src/plugins/container/container"
import { containerHelpers } from "../../../../../src/plugins/container/helpers"
import { publishContainerBuild } from "../../../../../src/plugins/container/publish"
import { joinWithPosix } from "../../../../../src/util/fs"
import { getDataDir, TestGarden, makeTestGarden, getPropertyName, createProjectConfig } from "../../../../helpers"
import tmp from "tmp-promise"
import { ProjectConfig } from "../../../../../src/config/project"
import execa from "execa"
import { ContainerBuildActionConfig, ContainerBuildOutputs } from "../../../../../src/plugins/container/config"
import { ActionStatus } from "../../../../../src/actions/types"

context("publish.ts", () => {
  async function makeGarden(tmpDirResult: tmp.DirectoryResult): Promise<TestGarden> {
    const config: ProjectConfig = createProjectConfig({
      path: tmpDirResult.path,
      providers: [{ name: "exec" }],
    })

    return TestGarden.factory(tmpDirResult.path, { config, plugins: [gardenPlugin()] })
  }

  let tmpDir: tmp.DirectoryResult
  let garden: TestGarden
  let log: LogEntry

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    await execa("git", ["init", "--initial-branch=main"], { cwd: tmpDir.path })
    garden = await makeGarden(tmpDir)
    log = garden.log
  })

  after(async () => {
    await tmpDir.cleanup()
  })
  const getBaseCfg = (): ContainerBuildActionConfig => ({
    name: "test",
    kind: "Build",
    type: "container",
    allowPublish: true,
    internal: {
      basePath: tmpDir.path,
    },
    spec: {
      buildArgs: {},
      extraFlags: [],
      dockerfile: "Dockerfile",
    },
  })
  describe("publishModule", () => {
    it("should publish an image", async () => {
      // it("should not publish image if module doesn't container a Dockerfile", async () => {
      const config = getBaseCfg()
      config.spec.publishId = "some/image"
      garden.setActionConfigs([], [config])
      const graph = await garden.getConfigGraph({ emit: false, log })
      const resolvedAction = await garden.resolveAction({ action: graph.getBuild("test"), log, graph })
      const containerProvider = await garden.resolveProvider(garden.log, "container")
      const ctx = await garden.getPluginContext({
        provider: containerProvider,
        templateContext: undefined,
        events: undefined,
      })
      td.replace(containerHelpers, "dockerCli", async () => ({
        all: "log",
      }))
      const executedAction = await garden.executeAction({ action: resolvedAction, graph, log })
      td.replace(containerHelpers, "dockerCli", async (params) => {
        console.log(params)
        return { all: "log" }
      })
      //   containerHelpers,
      //   getPropertyName(containerHelpers, (c) => c.docker),
      //   async () => "fake image identifier string"
      // )
      const result = await publishContainerBuild({
        ctx,
        log,
        action: executedAction,
      })
      expect(result).to.eql({ published: false })
    })
    // it("should publish image if module contains a Dockerfile", async () => {
    //   const config = cloneDeep(baseConfig)
    //   config.spec.image = "some/image:1.1"
    //   const module = td.object(await getTestModule(config))
    //   td.replace(helpers, "hasDockerfile", () => true)
    //   td.replace(helpers, "getPublicImageId", () => "some/image:12345")
    //   module.outputs["local-image-id"] = "some/image:12345"
    //   td.replace(helpers, "dockerCli", async ({ cwd, args, ctx: _ctx }) => {
    //     expect(cwd).to.equal(module.buildPath)
    //     expect(args).to.eql(["push", "some/image:12345"])
    //     expect(_ctx).to.exist
    //     return { all: "log" }
    //   })
    //   const result = await publishModule({ ctx, log, module })
    //   expect(result).to.eql({ message: "Published some/image:12345", published: true })
    // })
    // it("should tag image if remote id differs from local id", async () => {
    //   const config = cloneDeep(baseConfig)
    //   config.spec.image = "some/image:1.1"
    //   const module = td.object(await getTestModule(config))
    //   td.replace(helpers, "hasDockerfile", () => true)
    //   td.replace(helpers, "getPublicImageId", () => "some/image:1.1")
    //   module.outputs["local-image-id"] = "some/image:12345"
    //   const dockerCli = td.replace(helpers, "dockerCli")
    //   const result = await publishModule({ ctx, log, module })
    //   expect(result).to.eql({ message: "Published some/image:1.1", published: true })
    //   td.verify(
    //     dockerCli({
    //       cwd: module.buildPath,
    //       args: ["tag", "some/image:12345", "some/image:1.1"],
    //       log: td.matchers.anything(),
    //       ctx: td.matchers.anything(),
    //     })
    //   )
    //   td.verify(
    //     dockerCli({
    //       cwd: module.buildPath,
    //       args: ["push", "some/image:1.1"],
    //       log: td.matchers.anything(),
    //       ctx: td.matchers.anything(),
    //     })
    //   )
    // })
    // it("should use specified tag if provided", async () => {
    //   const config = cloneDeep(baseConfig)
    //   config.spec.image = "some/image:1.1"
    //   const module = td.object(await getTestModule(config))
    //   td.replace(helpers, "hasDockerfile", () => true)
    //   module.outputs["local-image-id"] = "some/image:12345"
    //   const dockerCli = td.replace(helpers, "dockerCli")
    //   const result = await publishModule({ ctx, log, module, tag: "custom-tag" })
    //   expect(result).to.eql({ message: "Published some/image:custom-tag", published: true })
    //   td.verify(
    //     dockerCli({
    //       cwd: module.buildPath,
    //       args: ["tag", "some/image:12345", "some/image:custom-tag"],
    //       log: td.matchers.anything(),
    //       ctx: td.matchers.anything(),
    //     })
    //   )
    //   td.verify(
    //     dockerCli({
    //       cwd: module.buildPath,
    //       args: ["push", "some/image:custom-tag"],
    //       log: td.matchers.anything(),
    //       ctx: td.matchers.anything(),
    //     })
    //   )
    // })
  })
  // describe("checkDockerServerVersion", () => {
  //   it("should return if server version is equal to the minimum version", async () => {
  //     helpers.checkDockerServerVersion(minDockerVersion)
  //   })
  //   it("should return if server version is greater than the minimum version", async () => {
  //     const version = {
  //       client: "99.99",
  //       server: "99.99",
  //     }
  //     helpers.checkDockerServerVersion(version)
  //   })
  //   it("should throw if server is not reachable (version is undefined)", async () => {
  //     const version = {
  //       client: minDockerVersion.client,
  //       server: undefined,
  //     }
  //     await expectError(
  //       () => helpers.checkDockerServerVersion(version),
  //       (err) => {
  //         expect(err.message).to.equal("Docker server is not running or cannot be reached.")
  //       }
  //     )
  //   })
  //   it("should throw if server version is too old", async () => {
  //     const version = {
  //       client: minDockerVersion.client,
  //       server: "17.06",
  //     }
  //     await expectError(
  //       () => helpers.checkDockerServerVersion(version),
  //       (err) => {
  //         expect(err.message).to.equal("Docker server needs to be version 17.07.0 or newer (got 17.06)")
  //       }
  //     )
  //   })
  // })
  // describe("getDockerBuildFlags", () => {
  //   it("should include extraFlags", async () => {
  //     td.replace(helpers, "hasDockerfile", () => true)
  //     const buildAction = await getTestBuildAction({
  //       allowPublish: false,
  //       build: {
  //         dependencies: [],
  //       },
  //       disabled: false,
  //       apiVersion: DEFAULT_API_VERSION,
  //       name: "module-a",
  //       path: modulePath,
  //       type: "container",
  //       spec: {
  //         build: {
  //           dependencies: [],
  //           timeout: DEFAULT_BUILD_TIMEOUT,
  //         },
  //         buildArgs: {},
  //         extraFlags: ["--cache-from", "some-image:latest"],
  //         services: [],
  //         tasks: [],
  //         tests: [],
  //       },
  //       serviceConfigs: [],
  //       taskConfigs: [],
  //       testConfigs: [],
  //     })
  //     const resolvedBuild = await garden.resolveAction({ action: buildAction, log })
  //     const args = getDockerBuildFlags(resolvedBuild)
  //     expect(args.slice(-2)).to.eql(["--cache-from", "some-image:latest"])
  //   })
  //   it("should set GARDEN_MODULE_VERSION", async () => {
  //     td.replace(helpers, "hasDockerfile", () => true)
  //     const buildAction = await getTestBuildAction({
  //       allowPublish: false,
  //       build: {
  //         dependencies: [],
  //       },
  //       disabled: false,
  //       apiVersion: DEFAULT_API_VERSION,
  //       name: "module-a",
  //       path: modulePath,
  //       type: "container",
  //       spec: {
  //         build: {
  //           dependencies: [],
  //           timeout: DEFAULT_BUILD_TIMEOUT,
  //         },
  //         buildArgs: {},
  //         extraFlags: [],
  //         services: [],
  //         tasks: [],
  //         tests: [],
  //       },
  //       serviceConfigs: [],
  //       taskConfigs: [],
  //       testConfigs: [],
  //     })
  //     const resolvedBuild = await garden.resolveAction({ action: buildAction, log })
  //     const args = getDockerBuildFlags(resolvedBuild)
  //     expect(args.slice(0, 2)).to.eql(["--build-arg", `GARDEN_MODULE_VERSION=${buildAction.versionString()}`])
  //   })
  // })
})
