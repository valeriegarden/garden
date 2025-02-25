/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists } from "fs-extra"
import { pulumi } from "./cli"
import { ModuleActionHandlers, ProviderHandlers } from "@garden-io/sdk/types"
import { ConfigurationError } from "@garden-io/sdk/exceptions"
import {
  applyConfig,
  clearStackVersionTag,
  ensureEnv,
  getActionStackRoot,
  getPlanPath,
  getStackConfigPath,
  getStackOutputs,
  getStackStatusFromTag,
  selectStack,
  setStackVersionTag,
} from "./helpers"
import { PulumiDeploy, PulumiProvider } from "./config"
import chalk from "chalk"
import { DeployActionHandlers } from "@garden-io/core/build/src/plugin/action-types"
import { DeployState } from "@garden-io/core/build/src/types/service"
import { deployStateToActionState } from "@garden-io/core/build/src/plugin/handlers/Deploy/get-status"

export const cleanupEnvironment: ProviderHandlers["cleanupEnvironment"] = async (_params) => {
  // To properly implement this handler, we'd need access to the config graph (or at least the list of pulumi services
  // in the project), since we'd need to walk through them and delete each in turn.
  //
  // Instead, the `garden plugins pulumi destroy` command can be used.
  return {}
}

export const configurePulumiModule: ModuleActionHandlers["configure"] = async ({ ctx, moduleConfig }) => {
  // Make sure the configured root path exists
  const root = moduleConfig.spec.root
  if (root) {
    const absRoot = join(moduleConfig.path, root)
    const exists = await pathExists(absRoot)

    if (!exists) {
      throw new ConfigurationError({
        message: `Pulumi: configured working directory '${root}' does not exist`,
        detail: {
          moduleConfig,
        },
      })
    }
  }

  const provider = ctx.provider as PulumiProvider

  const backendUrl = provider.config.backendURL
  const orgName = moduleConfig.spec.orgName || provider.config.orgName

  // Check to avoid using `orgName` or `cacheStatus: true` with non-pulumi managed backends
  if (!backendUrl.startsWith("https://")) {
    if (orgName) {
      throw new ConfigurationError({
        message: "Pulumi: orgName is not supported for self-managed backends",
        detail: {
          moduleConfig,
          providerConfig: provider.config,
        },
      })
    }

    if (moduleConfig.spec.cacheStatus) {
      throw new ConfigurationError({
        message: "Pulumi: `cacheStatus: true` is not supported for self-managed backends",
        detail: {
          moduleConfig,
          providerConfig: provider.config,
        },
      })
    }
  }

  moduleConfig.serviceConfigs = [
    {
      name: moduleConfig.name,
      dependencies: moduleConfig.spec.dependencies,
      disabled: false,
      spec: moduleConfig.spec,
    },
  ]

  return { moduleConfig }
}

export const getPulumiDeployStatus: DeployActionHandlers<PulumiDeploy>["getStatus"] = async ({ ctx, log, action }) => {
  const provider = ctx.provider as PulumiProvider
  const pulumiParams = { log, ctx, provider, action }
  const { cacheStatus } = action.getSpec()

  if (!cacheStatus) {
    return {
      state: deployStateToActionState("outdated"),
      outputs: {},
      detail: {
        state: "outdated",
        detail: {},
      },
    }
  }

  await selectStack(pulumiParams)
  const stackStatus = await getStackStatusFromTag(pulumiParams)

  const deployState: DeployState = stackStatus === "up-to-date" ? "ready" : "outdated"

  return {
    state: deployStateToActionState(deployState),
    outputs: await getStackOutputs(pulumiParams),
    detail: {
      state: deployState,
      detail: {},
    },
  }
}

export const deployPulumi: DeployActionHandlers<PulumiDeploy>["deploy"] = async ({ ctx, log, action }) => {
  const provider = ctx.provider as PulumiProvider
  const pulumiParams = { log, ctx, provider, action }
  const { autoApply, deployFromPreview, cacheStatus } = action.getSpec()

  if (!autoApply && !deployFromPreview) {
    log.info(`${action.longDescription()} has autoApply = false, but no planPath was provided. Skipping deploy.`)
    return {
      state: "ready",
      outputs: await getStackOutputs(pulumiParams),
      detail: {
        state: "ready",
        detail: {},
      },
    }
  }

  const root = getActionStackRoot(action)
  const env = ensureEnv(pulumiParams)

  let planPath: string | null
  // TODO: does the plan include the backend config?
  if (deployFromPreview) {
    // A pulumi plan for this module has already been generated, so we use that.
    planPath = getPlanPath(ctx, action)
    log.verbose(`Deploying from plan at path ${planPath}`)
  } else {
    await applyConfig(pulumiParams)
    planPath = null
  }
  await selectStack(pulumiParams)
  log.verbose(`Applying pulumi stack...`)
  const upArgs = ["up", "--yes", "--color", "always", "--config-file", getStackConfigPath(action, ctx.environmentName)]
  planPath && upArgs.push("--plan", planPath)
  await pulumi(ctx, provider).spawnAndStreamLogs({
    args: upArgs,
    cwd: root,
    log,
    env,
    ctx,
    errorPrefix: "Error when applying pulumi stack",
  })
  if (cacheStatus) {
    await setStackVersionTag(pulumiParams)
  }

  return {
    state: "ready",
    outputs: await getStackOutputs(pulumiParams),
    detail: {
      state: "ready",
      detail: {},
    },
  }
}

export const deletePulumiDeploy: DeployActionHandlers<PulumiDeploy>["delete"] = async ({ ctx, log, action }) => {
  if (!action.getSpec("allowDestroy")) {
    log.warn(chalk.yellow(`${action.longDescription()} has allowDestroy = false. Skipping destroy.`))
    return {
      state: deployStateToActionState("outdated"),
      outputs: {},
      detail: {
        state: "outdated",
        detail: {},
      },
    }
  }
  const provider = ctx.provider as PulumiProvider
  const pulumiParams = { log, ctx, provider, action }
  const root = getActionStackRoot(action)
  const env = ensureEnv(pulumiParams)
  await selectStack(pulumiParams)

  const cli = pulumi(ctx, provider)
  await selectStack(pulumiParams)
  log.verbose(`Destroying pulumi stack...`)
  await cli.spawnAndStreamLogs({
    args: ["destroy", "--yes", "--config-file", getStackConfigPath(action, ctx.environmentName)],
    cwd: root,
    log,
    env,
    ctx,
    errorPrefix: "Error when destroying pulumi stack",
  })
  await clearStackVersionTag(pulumiParams)

  return {
    state: deployStateToActionState("missing"),
    outputs: {},
    detail: {
      state: "missing",
      detail: {},
    },
  }
}
