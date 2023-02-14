/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { basicRender } from "../renderers"
import { LogEntry } from "../log-entry"
import { LogWriter } from "../logger"
import { Writer } from "./base"

export class BasicTerminalWriter extends Writer {
  type = "basic"

  render(entry: LogEntry, logger: LogWriter): string | null {
    return basicRender(entry, logger)
  }

  onGraphChange(entry: LogEntry, logger: LogWriter) {
    const out = this.render(entry, logger)
    if (out) {
      this.output.write(out)
    }
  }

  stop() {}
}
