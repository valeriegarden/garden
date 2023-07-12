/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginsCommand } from "../../../../src/commands/plugins"
import { withDefaultGlobalOpts, TestGarden, makeTempDir, TempDirectory } from "../../../helpers"
import { createGardenPlugin } from "../../../../src/plugin/plugin"
import { writeFile } from "fs-extra"
import { join } from "path"
import { dedent } from "../../../../src/util/string"
import { LogLevel } from "../../../../src/logger/logger"
import { expect } from "chai"
import chalk from "chalk"
import { getLogMessages } from "../../../../src/util/testing"
const _loggerUtil = require("../../../../src/logger/util")

describe("PluginsCommand", () => {
  let tmpDir: TempDirectory
  const command = new PluginsCommand()
  const chalkLevel = chalk.level

  const testPluginA = createGardenPlugin({
    name: "test-plugin-a",
    commands: [
      {
        name: "command-a",
        description: "Description for command A",
        handler: async ({ args }) => ({ result: { args } }),
      },
      {
        // Making this command name longer than the other, to test the justification
        name: "command-a-2",
        description: "Description for command A-2",
        handler: async ({ args }) => ({ result: { args } }),
      },
    ],
  })

  const testPluginB = createGardenPlugin({
    name: "test-plugin-b",
    commands: [
      {
        name: "command-b",
        description:
          "Description for command B. After quite a bit of thinking, I've decided to make it really very long and unnecessarily verbose to properly test the table justification.",
        handler: async ({ args }) => ({ result: { args } }),
      },
    ],
  })

  before(async () => {
    tmpDir = await makeTempDir({ git: true })

    await writeFile(
      join(tmpDir.path, "garden.yml"),
      dedent`
      apiVersion: garden.io/v1
      kind: Project
      name: test
      environments:
        - name: default
      providers:
        - name: test-plugin-a
        - name: test-plugin-b
      `
    )

    _loggerUtil.overrideTerminalWidth = 100
    chalk.level = 0
  })

  after(async () => {
    await tmpDir.cleanup()
    _loggerUtil.overrideTerminalWidth = undefined
    chalk.level = chalkLevel
  })

  it(`should print a nice help text`, async () => {
    const garden = await TestGarden.factory(tmpDir.path, { plugins: [testPluginA, testPluginB] })
    const log = garden.log

    await command.action({
      garden,
      log,
      args: { plugin: undefined, command: undefined },
      opts: withDefaultGlobalOpts({ cwd: undefined }),
    })

    const infoLog = getLogMessages(log, (entry) => entry.level === LogLevel.info)
      .join("\n")
      .trim()
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")

    expect(infoLog).to.equal(dedent`
    USAGE

      garden [global options] <command> -- [args ...]

    PLUGIN COMMANDS
      test-plugin-a command-a    Description for command A
      test-plugin-a command-a-2  Description for command A-2

      test-plugin-b command-b  Description for command B. After quite a bit of thinking, I've decided to
                               make it really very long and unnecessarily verbose to properly test the
                               table justification.
    `)
  })

  it(`should pass unparsed args to the plugin command`, async () => {
    const garden = await TestGarden.factory(tmpDir.path, { plugins: [testPluginA, testPluginB] })
    const log = garden.log

    const { result } = await command.action({
      garden,
      log,
      args: { "plugin": "test-plugin-a", "command": "command-a", "--": ["foo"] },
      opts: withDefaultGlobalOpts({ cwd: undefined }),
    })

    expect(result).to.eql({ args: ["foo"] })
  })

  it(`ignore the env flag when printing help text`, async () => {
    const garden = await TestGarden.factory(tmpDir.path, { plugins: [testPluginA, testPluginB] })
    const log = garden.log

    const result = await command.action({
      garden,
      log,
      args: { plugin: undefined, command: undefined },
      opts: withDefaultGlobalOpts({ env: "invalid-env", cwd: undefined }),
    })

    expect(result.errors).to.be.undefined
  })
})
