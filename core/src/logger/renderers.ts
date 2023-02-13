/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import chalk from "chalk"
import stripAnsi from "strip-ansi"
import { isArray, repeat } from "lodash"
import stringWidth = require("string-width")
import hasAnsi = require("has-ansi")

import { LogEntryMessage, LogEntryNew, LogSymbol } from "./log-entry"
import { JsonLogEntry } from "./writers/json-terminal-writer"
import { highlightYaml, PickFromUnion, safeDumpYaml } from "../util/util"
import { printEmoji, getAllSections, findSection } from "./util"
import { LoggerType, Logger, logLevelMap, LogLevel, formatGardenErrorWithDetail } from "./logger"

type RenderFn = (entry: LogEntryNew) => string

/*** STYLE HELPERS ***/

export const SECTION_PADDING = 25

export function padSection(section: string, width: number = SECTION_PADDING) {
  const diff = width - stringWidth(section)
  return diff <= 0 ? section : section + repeat(" ", diff)
}

export const msgStyle = (s: string) => (hasAnsi(s) ? s : chalk.gray(s))
export const errorStyle = (s: string) => (hasAnsi(s) ? s : chalk.red(s))

/*** RENDER HELPERS ***/

/**
 * Combines the render functions and returns a string with the output value
 */
export function combineRenders(entry: LogEntryNew, renderers: RenderFn[]): string {
  return renderers.map((renderer) => renderer(entry)).join("")
}

/**
 * Returns a log entries' left margin/offset. Used for determining the spinner's x coordinate.
 */
export function getLeftOffset(entry: LogEntryNew) {
  return leftPad(entry).length
}

/**
 * Returns longest chain of messages with `append: true` (starting from the most recent message).
 */
export function chainMessages(messages: LogEntryMessage[], chain: string[] = []): string[] {
  const latestState = messages[messages.length - 1]
  if (!latestState) {
    return chain.reverse()
  }

  chain = latestState.msg !== undefined ? [...chain, latestState.msg] : chain

  if (latestState.append) {
    return chainMessages(messages.slice(0, -1), chain)
  }
  return chain.reverse()
}

/*** RENDERERS ***/
export function leftPad(entry: LogEntryNew): string {
  return "".padStart((entry.indent || 0) * 3)
}

export function renderEmoji(entry: LogEntryNew): string {
  if (entry.emoji) {
    return printEmoji(entry.emoji) + " "
  }
  return ""
}

export function renderError(entry: LogEntryNew): string {
  const { errorData: error } = entry
  if (error) {
    return formatGardenErrorWithDetail(error)
  }

  return entry.msg || ""
}

export function renderSymbolBasic(entry: LogEntryNew): string {
  // let { symbol } = entry.getLatestMessage()
  // const section = findSection(entry)
  let symbol = entry.symbol

  if (symbol === "empty") {
    return "  "
  }

  // Always show symbol with sections
  if (symbol && entry.section) {
    symbol = "info"
  }

  return symbol ? `${logSymbols[symbol]} ` : ""
}

export function renderSymbol(entry: LogEntryNew): string {
  if (entry.symbol === "empty") {
    return "  "
  }
  return entry.symbol ? `${logSymbols[entry.symbol]} ` : ""
}

export function renderTimestamp(entry: LogEntryNew): string {
  if (!entry.root.showTimestamps) {
    return ""
  }
  return `[${getTimestamp(entry)}] `
}

export function getTimestamp(entry: LogEntryNew): string {
  return entry.timestamp
}

export function renderMsg(entry: LogEntryNew): string {
  const { fromStdStream, status, msg } = entry

  if (!msg) {
    return ""
  }

  if (fromStdStream) {
    return msg
  }

  const styleFn = status === "error" ? errorStyle : msgStyle

  return styleFn(msg)
}

export function renderData(entry: LogEntryNew): string {
  const { data, dataFormat } = entry
  if (!data) {
    return ""
  }
  if (!dataFormat || dataFormat === "yaml") {
    const asYaml = safeDumpYaml(data, { noRefs: true })
    return highlightYaml(asYaml)
  }
  return JSON.stringify(data, null, 2)
}

export function renderSectionBasic(entry: LogEntryNew): string {
  const style = chalk.cyan.italic
  const { msg } = entry
  let { section } = entry

  // For log levels higher than "info" we print the log level name.
  // This should technically happen when we render the symbol but it's harder
  // to deal with the padding that way and we'll be re-doing most of this anyway
  // with: https://github.com/garden-io/garden/issues/3254
  const logLevelName = chalk.gray(`[${logLevelMap[entry.level]}]`)

  // Just print the log level name directly without padding. E.g:
  // ℹ api                       → Deploying version v-37d6c44559...
  // [verbose] Some verbose level stuff that doesn't have a section
  if (!section && entry.level > LogLevel.info) {
    return logLevelName + " "
  }

  // Print the log level name after the section name to preserve alignment. E.g.:
  // ℹ api                       → Deploying version v-37d6c44559...
  // ℹ api [verbose]             → Some verbose level stuff that has a section
  if (entry.level > LogLevel.info) {
    section = section ? `${section} ${logLevelName}` : logLevelName
  }

  if (section && msg) {
    return `${style(padSection(section))} → `
  } else if (section) {
    return style(padSection(section))
  }
  return ""
}

export function renderSection(entry: LogEntryNew): string {
  const style = chalk.cyan.italic
  const { msg, section } = entry
  if (section && msg) {
    return `${style(padSection(section))} → `
  } else if (section) {
    return style(padSection(section))
  }
  return ""
}

/**
 * Formats entries for both fancy writer and basic terminal writer.
 */
export function formatForTerminal(entry: LogEntryNew, type: PickFromUnion<LoggerType, "fancy" | "basic">): string {
  const { msg: msg, emoji, section, symbol, data } = entry
  const empty = [msg, section, emoji, symbol, data].every((val) => val === undefined)

  if (empty) {
    return ""
  }

  if (type === "basic") {
    return combineRenders(entry, [
      renderTimestamp,
      renderSymbolBasic,
      renderSectionBasic,
      renderEmoji,
      renderMsg,
      renderData,
      () => "\n",
    ])
  }

  return combineRenders(entry, [leftPad, renderSymbol, renderSection, renderEmoji, renderMsg, renderData, () => "\n"])
}

export function cleanForJSON(input?: string | string[]): string {
  if (!input) {
    return ""
  }

  const inputStr = isArray(input) ? input.join(" - ") : input
  return stripAnsi(inputStr).trim()
}

export function cleanWhitespace(str: string) {
  return str.replace(/\s+/g, " ")
}

export function basicRender(entry: LogEntryNew, logger: Logger): string | null {
  if (logger.level >= entry.level) {
    return formatForTerminal(entry, "basic")
  }
  return null
}

// TODO: Include individual message states with timestamp
export function formatForJson(entry: LogEntryNew): JsonLogEntry {
  const { msg, metadata, section } = entry
  const errorDetail = entry.errorData && entry ? formatGardenErrorWithDetail(entry.errorData) : undefined
  const jsonLogEntry: JsonLogEntry = {
    msg: cleanForJSON(msg),
    data: entry.data,
    metadata,
    section: cleanForJSON(section),
    timestamp: getTimestamp(entry),
    level: logLevelMap[entry.level],
    // TODO: @eysi
    // allSections: getAllSections(entry, msg).map(cleanForJSON),
    allSections: [section].map(cleanForJSON),
  }
  if (errorDetail) {
    jsonLogEntry.errorDetail = errorDetail
  }
  return jsonLogEntry
}
