/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { fromPairs, omit } from "lodash"
import { deepFilter } from "../../util/objects"
import { Command, CommandResult, CommandParams } from "../base"
import { ResolvedConfigGraph } from "../../graph/config-graph"
import { createActionLog, Log } from "../../logger/log-entry"
import chalk from "chalk"
import { deline } from "../../util/string"
import { EnvironmentStatusMap } from "../../plugin/handlers/Provider/getEnvironmentStatus"
import { joi, joiIdentifierMap, joiStringMap } from "../../config/common"
import { environmentStatusSchema } from "../../config/status"
import { printHeader } from "../../logger/util"
import { BuildStatusMap, getBuildStatusSchema } from "../../plugin/handlers/Build/get-status"
import { getTestResultSchema, TestStatusMap } from "../../plugin/handlers/Test/get-result"
import { getRunResultSchema, RunStatusMap } from "../../plugin/handlers/Run/get-result"
import { DeployStatusMap, getDeployStatusSchema } from "../../plugin/handlers/Deploy/get-status"
import { ActionRouter } from "../../router/router"
import { sanitizeValue } from "../../util/logging"
import { BooleanParameter } from "../../cli/params"

// Value is "completed" if the test/task has been run for the current version.
export interface StatusCommandResult {
  providers: EnvironmentStatusMap
  actions: {
    Build: BuildStatusMap
    Deploy: DeployStatusMap
    Run: RunStatusMap
    Test: TestStatusMap
  }
}

const getStatusOpts = {
  "skip-detail": new BooleanParameter({
    help: deline`
      Skip plugin specific details. Only applicable when using the --output=json|yaml option.
      Useful for trimming down the output.
    `,
  }),
  "only-deploys": new BooleanParameter({
    hidden: true,
    help: deline`
      [INTERNAL]: Only return statuses of deploy actions. Currently only used by Cloud and Desktop apps.
      Will be replaced by a new, top level \`garden status\` command.
    `,
  }),
}

type Opts = typeof getStatusOpts

export class GetStatusCommand extends Command {
  name = "status"
  help = "Outputs the full status of your project/environment and all actions."

  streamEvents = false
  options = getStatusOpts

  outputsSchema = () =>
    joi.object().keys({
      providers: joiIdentifierMap(environmentStatusSchema()).description(
        "A map of statuses for each configured provider."
      ),
      actions: joi.object().keys({
        Build: joiIdentifierMap(getBuildStatusSchema()).description("A map of statuses for each configured Build."),
        Deploy: joiIdentifierMap(getDeployStatusSchema()).description("A map of statuses for each configured Deploy."),
        Run: joiStringMap(getRunResultSchema()).description("A map of statuses for each configured Run."),
        Test: joiStringMap(getTestResultSchema()).description("A map of statuses for each configured Test."),
      }),
    })

  printHeader({ log }) {
    printHeader(log, "Get status", "📟")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<StatusCommandResult>> {
    const router = await garden.getActionRouter()
    const graph = await garden.getResolvedConfigGraph({ log, emit: true })

    let result: StatusCommandResult
    if (opts["only-deploys"]) {
      result = {
        providers: {},
        actions: await Bluebird.props({
          Build: {},
          Deploy: getDeployStatuses(router, graph, log),
          Test: {},
          Run: {},
        }),
      }
    } else {
      const envStatus = await garden.getEnvironmentStatus(log)
      result = {
        providers: envStatus,
        actions: await Bluebird.props({
          Build: getBuildStatuses(router, graph, log),
          Deploy: getDeployStatuses(router, graph, log),
          Test: getTestStatuses(router, graph, log),
          Run: getRunStatuses(router, graph, log),
        }),
      }
    }

    const deployStatuses = result.actions.Deploy

    for (const [name, status] of Object.entries(deployStatuses)) {
      if (status.state === "unknown") {
        log.warn(
          chalk.yellow(
            deline`
            Unable to resolve status for Deploy ${chalk.white(name)}. It is likely missing or outdated.
            This can come up if the deployment has runtime dependencies that are not resolvable, i.e. not deployed or
            invalid.
            `
          )
        )
      }
    }

    // We only skip detail for Deploy actions. Note that this is mostly used internally and that this command
    // will be replaced by a top-level "garden status" command. For that one we'll probably wan to pass the
    // --skip-detail flag to the plugin handlers.
    if (opts["skip-detail"]) {
      const deployActions = Object.entries(result.actions["Deploy"]).reduce(
        (acc, val) => {
          const [name, status] = val
          const statusWithOutDetail = omit(status, "detail.detail")
          acc[name] = statusWithOutDetail

          return acc
        },
        {} as StatusCommandResult["actions"]["Deploy"]
      )
      result["actions"]["Deploy"] = deployActions
    }

    // TODO: we should change the status format because this will remove services called "detail"
    const sanitized = sanitizeValue(deepFilter(result, (_, key) => key !== "executedAction"))

    // TODO: do a nicer print of this by default
    log.info({ data: sanitized })

    return { result: sanitized }
  }
}

async function getDeployStatuses(router: ActionRouter, graph: ResolvedConfigGraph, log: Log) {
  const actions = graph.getDeploys()

  return fromPairs(
    await Bluebird.map(actions, async (action) => {
      const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
      const { result } = await router.deploy.getStatus({ action, log: actionLog, graph })
      return [action.name, result]
    })
  )
}
async function getBuildStatuses(router: ActionRouter, graph: ResolvedConfigGraph, log: Log) {
  const actions = graph.getBuilds()

  return fromPairs(
    await Bluebird.map(actions, async (action) => {
      const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
      const { result } = await router.build.getStatus({ action, log: actionLog, graph })
      return [action.name, result]
    })
  )
}

async function getTestStatuses(router: ActionRouter, graph: ResolvedConfigGraph, log: Log): Promise<TestStatusMap> {
  const actions = graph.getTests()

  return fromPairs(
    await Bluebird.map(actions, async (action) => {
      const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
      const { result } = await router.test.getResult({ action, log: actionLog, graph })
      return [action.name, result]
    })
  )
}

async function getRunStatuses(router: ActionRouter, graph: ResolvedConfigGraph, log: Log): Promise<RunStatusMap> {
  const actions = graph.getRuns()

  return fromPairs(
    await Bluebird.map(actions, async (action) => {
      const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
      const { result } = await router.run.getResult({ action, log: actionLog, graph })
      return [action.name, result]
    })
  )
}
