/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { printEmoji, printHeader } from "../logger/util"
import dedent = require("dedent")
import { resolveWorkflowConfig } from "../config/workflow"
import chalk = require("chalk")

export class TestLoggerCommand extends Command {
  name = "test-logger"
  help = "Test command for testing new logger"
  emoji: "heavy_check_mark"

  description = dedent`
    Test new logger.
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Test Logger", "heavy_check_mark")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    log.info("")
    log.info(chalk.green("Hello new logger") + " " + printEmoji("heavy_check_mark", log))

    log.info("Hello 1")

    log.info({ msg: "hello section b", section: "section-b" })

    const withSection = log.info({ section: "section-a", msg: "hello section a" })

    const childLog = log.info("Hello 2")

    childLog.info("Child hello 1")

    childLog.setState("Updated 'hello2'")

    withSection.info("Section child")

    withSection.info({ section: "section-c", msg: "hello section c" })

    const sections = withSection.getAllSections()

    return {}
  }
}
