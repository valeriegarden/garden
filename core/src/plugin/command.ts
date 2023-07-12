/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Log } from "../logger/log-entry"
import { PluginContext, pluginContextSchema } from "../plugin-context"
import { joi, joiArray, joiIdentifier, joiIdentifierDescription, createSchema } from "../config/common"
import { moduleSchema } from "../types/module"
import { logEntrySchema } from "./base"
import { Garden } from "../garden"
import { ConfigGraph } from "../graph/config-graph"
import { BaseProviderConfig } from "../config/provider"

// TODO: parse args and opts with a schema
export interface PluginCommandParams<C extends BaseProviderConfig = any> {
  garden: Garden
  ctx: PluginContext<C>
  args: string[]
  log: Log
  graph: ConfigGraph
  cwd?: string
}

export const pluginParamsSchema = createSchema({
  name: "plugin-params",
  keys: () => ({
    ctx: pluginContextSchema(),
    args: joiArray(joi.string()).description(
      "A list of arguments from the command line. This excludes any parsed global options, as well as the command name itself."
    ),
    log: logEntrySchema(),
    modules: joiArray(moduleSchema()).description(
      "If the command defnitions has `resolveModules` set to `true`, this is set to a list of all modules in the project/environment. Otherwise this is an empty list."
    ),
  }),
})

export interface PluginCommandResult<T extends object = object> {
  result: T
  exitCode?: number
  errors?: Error[]
}

export const pluginCommandResultSchema = createSchema({
  name: "plugin-command-result",
  keys: () => ({
    result: joi.object().options({ allowUnknown: true }).required(),
    errors: joiArray(joi.any()),
  }),
})

export interface PluginCommandHandler<C extends BaseProviderConfig = any, R extends object = object> {
  (params: PluginCommandParams<C>): PluginCommandResult<R> | Promise<PluginCommandResult<R>>
}

export interface PluginCommand<C extends BaseProviderConfig = any, R extends object = object> {
  base?: PluginCommand<any>
  name: string
  description: string
  handler: PluginCommandHandler<C, R>
  resolveGraph?: boolean
  title?: string | ((params: { args: string[]; environmentName: string }) => string | Promise<string>)
}

export const pluginCommandSchema = createSchema({
  name: "plugin-command",
  keys: () => ({
    name: joiIdentifier()
      .required()
      .description("The name of the command. Must be " + joiIdentifierDescription),
    description: joi.string().required().description("A short description of the command."),
    resolveGraph: joi
      .boolean()
      .default(false)
      .description(
        "Set this to true if the command needs the graph to be resolved before calling the handler. If this is set to `true`, the `graph` object passed to the command handler will contain a full list of resolved modules and actions in the project/environment (and is otherwise left empty)."
      ),
    title: joi
      .alternatives(joi.string(), joi.func())
      .description("A heading to print ahead of calling the command handler, or a function that returns it."),
    handler: joi
      .func()
      // TODO: see if we can define/output the function schema somehow
      .description("The command handler."),
  }),
})
