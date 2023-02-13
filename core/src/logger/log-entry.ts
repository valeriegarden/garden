/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import nodeEmoji from "node-emoji"
import { cloneDeep, round } from "lodash"

import { LogLevel, logLevelMap, LogNode } from "./logger"
import { Omit } from "../util/util"
import { getChildEntries, findParentEntry, getAllSections } from "./util"
import { GardenError } from "../exceptions"
import { CreateLogEntryParams, Logger, PlaceholderOpts } from "./logger"
import uniqid from "uniqid"
import { ActionKind } from "../plugin/action-types"

export type EmojiName = keyof typeof nodeEmoji.emoji
export type LogSymbol = keyof typeof logSymbols | "empty"
// TODO: Do we keep this?
export type EntryStatus = "done" | "error" | "success" | "warn"
export type TaskLogStatus = "active" | "success" | "error"

export interface LogEntryMetadata {
  task?: TaskMetadata
  workflowStep?: WorkflowStepMetadata
}

export interface ActionMetadata {
  actionKind: ActionKind
  actionName: string
  // TODO: Literal type?
  actionType: string
}

export interface PluginMetadata {
  // TODO: Literal type?
  pluginName: string
}

export interface TaskMetadata {
  type: string
  key: string
  status: TaskLogStatus
  uid: string
  versionString: string
  durationMs?: number
}

export interface WorkflowStepMetadata {
  index: number
}

interface MessageBase {
  msg?: string
  emoji?: EmojiName
  status?: EntryStatus
  section?: string
  symbol?: LogSymbol
  append?: boolean
  data?: any
  dataFormat?: "json" | "yaml"
}

export interface LogEntryMessage extends MessageBase {
  timestamp: Date
}

export interface UpdateLogEntryParams extends MessageBase {
  metadata?: LogEntryMetadata
}

export interface LogEntryParams extends UpdateLogEntryParams {
  error?: GardenError
  indent?: number
  childEntriesInheritLevel?: boolean
  fromStdStream?: boolean
  id?: string
}

export interface LogEntryConstructor extends LogEntryParams {
  level: LogLevel
  root: Logger
  parent?: LogEntry
  isPlaceholder?: boolean
}

export interface ActionLogEntryConstructor extends LogEntryConstructor {
  actionMetadata: ActionMetadata
}

export interface PluginLogEntryConstructor extends ActionLogEntryConstructor {
  pluginMetadata: PluginMetadata
}

function resolveCreateParams(level: LogLevel, params: string | LogEntryParams): CreateLogEntryParams {
  if (typeof params === "string") {
    return { msg: params, level }
  }
  return { ...params, level }
}

function resolveUpdateParams(params?: string | UpdateLogEntryParams): UpdateLogEntryParams {
  if (typeof params === "string") {
    return { msg: params }
  } else if (!params) {
    return {}
  } else {
    return params
  }
}

export class LogEntry implements LogNode {
  private messages: LogEntryMessage[]
  private metadata?: LogEntryMetadata
  public readonly parent?: LogEntry
  public readonly timestamp: Date
  public readonly key: string
  public readonly level: LogLevel
  public readonly root: Logger
  public readonly fromStdStream?: boolean
  public readonly indent?: number
  public readonly errorData?: GardenError
  public readonly childEntriesInheritLevel?: boolean
  public readonly id?: string
  public type: "logEntry"
  public children: LogEntry[]
  public isPlaceholder: boolean
  public revision: number

  constructor(params: LogEntryConstructor) {
    this.key = uniqid()
    this.children = []
    this.timestamp = new Date()
    this.level = params.level
    this.parent = params.parent
    this.id = params.id
    this.root = params.root
    this.fromStdStream = params.fromStdStream
    this.indent = params.indent
    this.errorData = params.error
    this.childEntriesInheritLevel = params.childEntriesInheritLevel
    this.metadata = params.metadata
    this.id = params.id
    this.isPlaceholder = params.isPlaceholder || false
    this.revision = -1

    // TODO
    // if (!params.isPlaceholder) {
    //   this.update({
    //     msg: params.msg,
    //     emoji: params.emoji,
    //     section: params.section,
    //     symbol: params.symbol,
    //     status: params.level === LogLevel.error ? "error" : params.status,
    //     data: params.data,
    //     dataFormat: params.dataFormat,
    //     append: params.append,
    //   })
    // } else {
    //   this.messages = [{ timestamp: new Date() }]
    // }
    this.messages = [{ timestamp: new Date() }]
  }

  /**
   * Updates the log entry with a few invariants:
   * 1. msg, emoji, section, status, and symbol can only be replaced with a value of same type, not removed
   * 2. append is always set explicitly (the next message does not inherit the previous value)
   * 3. next metadata is merged with the previous metadata
   */
  // private update(updateParams: UpdateLogEntryParams): void {
  //   this.revision = this.revision + 1
  //   const latestMessage = this.getLatestMessage()

  //   // Explicitly set all the fields so the shape stays consistent
  //   const nextMessage: LogEntryMessage = {
  //     // Ensure empty string gets set
  //     msg: typeof updateParams.msg === "string" ? updateParams.msg : latestMessage.msg,
  //     emoji: updateParams.emoji || latestMessage.emoji,
  //     section: updateParams.section || latestMessage.section,
  //     status: updateParams.status || latestMessage.status,
  //     symbol: updateParams.symbol || latestMessage.symbol,
  //     data: updateParams.data || latestMessage.data,
  //     dataFormat: updateParams.dataFormat || latestMessage.dataFormat,
  //     // Next message does not inherit the append field
  //     append: updateParams.append,
  //     timestamp: new Date(),
  //   }

  //   // Hack to preserve section alignment if spinner disappears
  //   const hadSpinner = latestMessage.status === "active"
  //   const hasSymbolOrSpinner = nextMessage.symbol || nextMessage.status === "active"
  //   if (nextMessage.section && hadSpinner && !hasSymbolOrSpinner) {
  //     nextMessage.symbol = "empty"
  //   }

  //   if (this.isPlaceholder) {
  //     // If it's a placeholder, this will be the first message...
  //     this.messages = [nextMessage]
  //     this.isPlaceholder = false
  //   } else {
  //     // ...otherwise we push it
  //     this.messages = [...(this.messages || []), nextMessage]
  //   }

  //   if (updateParams.metadata) {
  //     this.metadata = { ...(this.metadata || {}), ...updateParams.metadata }
  //   }
  // }

  // Update node and child nodes
  // private deepUpdate(updateParams: UpdateLogEntryParams): void {
  //   const wasActive = this.getLatestMessage().status === "active"

  //   this.update(updateParams)

  //   // Stop active child nodes if no longer active
  //   if (wasActive && updateParams.status !== "active") {
  //     getChildEntries(this).forEach((entry) => {
  //       if (entry.getLatestMessage().status === "active") {
  //         entry.update({ status: "done" })
  //       }
  //     })
  //   }
  // }

  private createLogEntry(params: CreateLogEntryParams) {
    const indent = params.indent !== undefined ? params.indent : (this.indent || 0) + 1

    // If childEntriesInheritLevel is set to true, all children must have a level geq to the level
    // of the parent entry that set the flag.
    const parentWithPreserveFlag = findParentEntry(this, (entry) => !!entry.childEntriesInheritLevel)
    const level = parentWithPreserveFlag ? Math.max(parentWithPreserveFlag.level, params.level) : params.level

    let metadata: LogEntryMetadata | undefined = undefined
    if (this.metadata || params.metadata) {
      metadata = { ...cloneDeep(this.metadata || {}), ...(params.metadata || {}) }
    }

    return new LogEntry({
      ...params,
      indent,
      level,
      metadata,
      root: this.root,
      parent: this,
    })
  }

  private log(params: CreateLogEntryParams): void {
    const entry = this.createLogEntry(params)
    if (this.root.storeEntries) {
      this.children.push(entry)
    }
    this.root.onGraphChange(entry)
  }

  /**
   * Create a new logger with same context, optionally overwriting some fields.
   *
   * TODO: Overwrite with params
   */
  makeNewLogContext(params: Partial<LogEntryConstructor>) {
    return new LogEntry({
      level: params.level || this.level,
      parent: this,
      root: this.root,
      fromStdStream:  params.fromStdStream || this.fromStdStream,
      error: this.errorData || params.error,
      childEntriesInheritLevel: params.childEntriesInheritLevel || this.childEntriesInheritLevel,
      metadata:  params.metadata || this.metadata,
    })
  }

  /**
   * Create a new logger with same context, optionally overwriting some fields.
   *
   * TODO: Overwrite with params
   */
  makeNewLogContextWithMessage(params: Partial<LogEntryConstructor>) {
    const newLog = new LogEntry({
      level: params.level || this.level,
      parent: this,
      root: this.root,
      fromStdStream:  params.fromStdStream || this.fromStdStream,
      error: this.errorData || params.error,
      childEntriesInheritLevel: params.childEntriesInheritLevel || this.childEntriesInheritLevel,
      metadata:  params.metadata || this.metadata,
    })
    if (params.msg) {
      newLog.info(params.msg)
    }
    return newLog
  }

  silly(params: string | LogEntryParams): void {
    this.log(resolveCreateParams(LogLevel.silly, params))
  }

  debug(params: string | LogEntryParams): void {
    this.log(resolveCreateParams(LogLevel.debug, params))
  }

  verbose(params: string | LogEntryParams): void {
    this.log(resolveCreateParams(LogLevel.verbose, params))
  }

  info(params: string | LogEntryParams): void {
    this.log(resolveCreateParams(LogLevel.info, params))
  }

  warn(params: string | LogEntryParams): void {
    this.log(resolveCreateParams(LogLevel.warn, params))
  }

  error(params: string | LogEntryParams): void {
    this.log(resolveCreateParams(LogLevel.error, params))
  }

  getMetadata() {
    return this.metadata
  }

  getMessages() {
    return this.messages
  }

  /**
   * Returns a deep copy of the latest message, if availble.
   * Otherwise returns an empty object of type LogEntryMessage for convenience.
   */
  getLatestMessage() {
    if (!this.messages) {
      return <LogEntryMessage>{}
    }

    // Use spread operator to clone the array
    const message = [...this.messages][this.messages.length - 1]
    // ...and the object itself
    return { ...message }
  }

  placeholder({
    level = LogLevel.info,
    childEntriesInheritLevel = false,
    indent = 0,
    metadata,
  }: PlaceholderOpts = {}): LogEntry {
    // Ensure placeholder child entries align with parent context
    const currentIndentation = Math.max((indent || this.indent || 0) - 1, -1)
    return new LogEntry({
      indent: currentIndentation,
      level,
      metadata,
      childEntriesInheritLevel,
      root: this.root,
      parent: this,
    })
    // return this.log({
    //   level,
    //   indent: indentForNode,
    //   childEntriesInheritLevel,
    //   isPlaceholder: true,
    //   metadata,
    // })
  }

  // TODO: Keeping this for now, will update in a follow up PR
  setSuccess(params?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): void {
    this.info({
      ...resolveUpdateParams(params),
      symbol: "success",
      status: "success",
    })
  }

  // TODO: Keeping this for now, will update in a follow up PR
  setError(params?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): void {
    this.error({
      ...resolveUpdateParams(params),
      symbol: "error",
      status: "error",
    })
  }

  // TODO: Keeping this for now, will update in a follow up PR
  setWarn(param?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): void {
    this.warn({
      ...resolveUpdateParams(param),
      symbol: "warning",
      status: "warn",
    })
  }

  stopAll() {
    return this.root.stop()
  }

  // TODO: Remove
  stop() {}

  getChildEntries() {
    return getChildEntries(this)
  }

  /**
   * Get the log level of the entry as a string.
   */
  getStringLevel(): string {
    return logLevelMap[this.level]
  }

  /**
   * Get the full list of sections including all parent entries.
   */
  getAllSections(): string[] {
    const msg = this.getLatestMessage()
    return msg ? getAllSections(this, msg) : []
  }

  /**
   * Dumps the log entry and all child entries as a string, optionally filtering the entries with `filter`.
   * For example, to dump all the logs of level info or higher:
   *
   *   log.toString((entry) => entry.level <= LogLevel.info)
   */
  toString(filter?: (log: LogEntry) => boolean) {
    return this.getChildEntries()
      .filter((entry) => (filter ? filter(entry) : true))
      .flatMap((entry) => entry.getMessages()?.map((message) => message.msg))
      .join("\n")
  }

  /**
   * Returns the duration in seconds, defaults to 2 decimal precision
   */
  getDuration(precision: number = 2): number {
    return round((new Date().getTime() - this.timestamp.getTime()) / 1000, precision)
  }
}

