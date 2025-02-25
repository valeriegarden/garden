/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi } from "../../config/common"
import { dedent } from "../../util/string"
import { runScript } from "../../util/util"
import { RuntimeError } from "../../exceptions"
import { GenericProviderConfig, Provider } from "../../config/provider"
import { ExecaError } from "execa"
import { configureExecModule, execModuleSpecSchema } from "./moduleConfig"
import { convertExecModule } from "./convert"
import { sdk } from "../../plugin/sdk"

export interface ExecProviderConfig extends GenericProviderConfig {}

export type ExecProvider = Provider<ExecProviderConfig>
export interface ExecProviderOutputs {
  initScript: {
    log: string
  }
}

const s = sdk.schema

export const execPlugin = sdk.createGardenPlugin({
  name: "exec",
  docs: dedent`
      A simple provider that allows running arbitrary scripts when initializing providers, and provides the exec
      action type.

      _Note: This provider is always loaded when running Garden. You only need to explicitly declare it in your provider
      configuration if you want to configure a script for it to run._
    `,
  createModuleTypes: [
    {
      name: "exec",
      docs: dedent`
          A general-purpose module for executing commands in your shell. This can be a useful escape hatch if no other module type fits your needs, and you just need to execute something (as opposed to deploy it, track its status etc.).

          By default, the \`exec\` module type executes the commands in the Garden build directory
          (under .garden/build/<module-name>). By setting \`local: true\`, the commands are executed in the module
          source directory instead.

          Note that Garden does not sync the source code for local exec modules into the Garden build directory.
          This means that include/exclude filters and ignore files are not applied to local exec modules, as the
          filtering is done during the sync.
        `,
      needsBuild: true,
      moduleOutputsSchema: joi.object().keys({}),
      schema: execModuleSpecSchema(),
      handlers: {
        configure: configureExecModule,
        convert: convertExecModule,
      },
    },
  ],
})

export const execProvider = execPlugin.createProvider({
  configSchema: s.object({
    initScript: s.string().optional().describe(dedent`
      An optional script to run in the project root when initializing providers. This is handy for running an arbitrary
      script when initializing. For example, another provider might declare a dependency on this provider, to ensure
      this script runs before resolving that provider.
    `),
  }),
  outputsSchema: s.object({
    initScript: s
      .object({
        log: s
          .string()
          .default("")
          .describe("The log output from the initScript specified in the provider configuration, if any."),
      })
      .optional(),
  }),
})

execProvider.addHandler("getEnvironmentStatus", async ({ ctx }) => {
  // Return ready if there is no initScript to run
  return { ready: !ctx.provider.config.initScript, outputs: {} }
})

execProvider.addHandler("prepareEnvironment", async ({ ctx, log }) => {
  const execLog = log.createLog({ name: "exec" })
  if (ctx.provider.config.initScript) {
    try {
      execLog.info("Running init script")
      const result = await runScript({
        log: execLog,
        cwd: ctx.projectRoot,
        script: ctx.provider.config.initScript,
      })
      return { status: { ready: true, outputs: { initScript: { log: result.stdout.trim() } } } }
    } catch (_err) {
      const error = _err as ExecaError

      // Unexpected error (failed to execute script, as opposed to script returning an error code)
      if (!error.exitCode) {
        throw error
      }

      throw new RuntimeError({
        message: `exec provider init script exited with code ${error.exitCode}`,
        detail: {
          exitCode: error.exitCode,
          stdout: error.stdout,
          stderr: error.stderr,
        },
      })
    }
  }
  return { status: { ready: true, outputs: {} } }
})

// Attach the action types
require("./build")
require("./deploy")
require("./run")
require("./test")

export const gardenPlugin = execPlugin
