/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { createSchema, joi, joiVariables } from "@garden-io/core/build/src/config/common"
import { dedent, deline } from "@garden-io/core/build/src/util/string"
import { supportedVersions, terraform } from "./cli"
import {
  getStackStatus,
  applyStack,
  variablesSchema,
  TerraformBaseSpec,
  getTfOutputs,
  prepareVariables,
  setWorkspace,
} from "./common"
import { TerraformProvider } from "."
import chalk = require("chalk")
import { DeployAction, DeployActionConfig } from "@garden-io/core/build/src/actions/deploy"
import { DeployActionHandler } from "@garden-io/core/build/src/plugin/action-types"
import { DeployState } from "@garden-io/core/build/src/types/service"
import { deployStateToActionState } from "@garden-io/core/build/src/plugin/handlers/Deploy/get-status"

export interface TerraformDeploySpec extends TerraformBaseSpec {
  root: string
}

export type TerraformDeployConfig = DeployActionConfig<"terraform", TerraformDeploySpec>
export type TerraformDeploy = DeployAction<TerraformDeployConfig, {}>

export const terraformDeploySchemaKeys = () => ({
  allowDestroy: joi.boolean().default(false).description(dedent`
    If set to true, Garden will run \`terraform destroy\` on the stack when calling \`garden delete namespace\` or \`garden delete deploy <deploy name>\`.
  `),
  autoApply: joi.boolean().allow(null).default(null).description(dedent`
    If set to true, Garden will automatically run \`terraform apply -auto-approve\` when the stack is not
    up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing
    entirely.

    **NOTE: This is not recommended for production, or shared environments in general!**

    Defaults to the value set in the provider config.
  `),
  root: joi.posixPath().subPathOnly().default(".").description(dedent`
    Specify the path to the working directory root—i.e. where your Terraform files are—relative to the config directory.
  `),
  variables: variablesSchema().description(dedent`
    A map of variables to use when applying the stack. You can define these here or you can place a
    \`terraform.tfvars\` file in the working directory root.

    If you specified \`variables\` in the \`terraform\` provider config, those will be included but the variables
    specified here take precedence.
  `),
  version: joi.string().allow(...supportedVersions, null).description(dedent`
    The version of Terraform to use. Defaults to the version set in the provider config.
    Set to \`null\` to use whichever version of \`terraform\` that is on your PATH.
  `),
  workspace: joi.string().allow(null).description("Use the specified Terraform workspace."),
})

export const terraformDeploySchema = createSchema({
  name: "terraform:Deploy",
  keys: terraformDeploySchemaKeys,
})

export const terraformDeployOutputsSchema = () =>
  joiVariables().description("A map of all the outputs defined in the Terraform stack.")

export const getTerraformStatus: DeployActionHandler<"getStatus", TerraformDeploy> = async ({ ctx, log, action }) => {
  const provider = ctx.provider as TerraformProvider
  const spec = action.getSpec()
  const root = getModuleStackRoot(action, spec)

  const variables = spec.variables
  const workspace = spec.workspace || null

  const status = await getStackStatus({
    ctx,
    log,
    provider,
    root,
    variables,
    workspace,
  })

  const deployState: DeployState = status === "up-to-date" ? "ready" : "outdated"

  return {
    state: deployStateToActionState(deployState),
    outputs: await getTfOutputs({ log, ctx, provider, root }),
    detail: {
      state: deployState,
      detail: {},
    },
  }
}

export const deployTerraform: DeployActionHandler<"deploy", TerraformDeploy> = async ({ ctx, log, action }) => {
  const provider = ctx.provider as TerraformProvider
  const spec = action.getSpec()
  const workspace = spec.workspace || null
  const root = getModuleStackRoot(action, spec)

  if (spec.autoApply) {
    await applyStack({ log, ctx, provider, root, variables: spec.variables, workspace })
  } else {
    const templateKey = `\${runtime.services.${action.name}.outputs.*}`
    log.warn(
      chalk.yellow(
        deline`
        Stack is out-of-date but autoApply is set to false, so it will not be applied automatically. If any newly added
        stack outputs are referenced via ${templateKey} template strings and are missing,
        you may see errors when resolving them.
        `
      )
    )
    await setWorkspace({ log, ctx, provider, root, workspace })
  }

  return {
    state: "ready",
    outputs: await getTfOutputs({ log, ctx, provider, root }),
    detail: {
      state: "ready",
      detail: {},
    },
  }
}

export const deleteTerraformModule: DeployActionHandler<"delete", TerraformDeploy> = async ({ ctx, log, action }) => {
  const provider = ctx.provider as TerraformProvider
  const spec = action.getSpec()
  const deployState: DeployState = "outdated"

  if (!spec.allowDestroy) {
    log.warn("allowDestroy is set to false. Not calling terraform destroy.")
    return {
      state: deployStateToActionState(deployState),
      detail: {
        state: deployState,
        detail: {},
      },
      outputs: {},
    }
  }

  const root = getModuleStackRoot(action, spec)
  const variables = spec.variables
  const workspace = spec.workspace || null

  await setWorkspace({ ctx, provider, root, log, workspace })

  const args = ["destroy", "-auto-approve", "-input=false", ...(await prepareVariables(root, variables))]
  await terraform(ctx, provider).exec({ log, args, cwd: root })

  return {
    state: "not-ready",
    outputs: {},
    detail: {
      state: "missing",
      detail: {},
    },
  }
}

function getModuleStackRoot(action: TerraformDeploy, spec: TerraformDeploySpec) {
  // TODO-G2: doublecheck this path
  return join(action.getBuildPath(), spec.root)
}
