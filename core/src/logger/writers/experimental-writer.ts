/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { formatExperimental } from "../renderers"
import { LogEntry } from "../log-entry"
import { Logger } from "../logger"
import { Writer } from "./base"


export class ExperimentalWriter extends Writer {
  type = "experimental"

  onGraphChange(entry: LogEntry, logger: Logger) {
    if (logger.level >= entry.level) {
      const out = formatExperimental(entry)
      out && this.output.write(out)
    }
  }

  stop() {}
}
