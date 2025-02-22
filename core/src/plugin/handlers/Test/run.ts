/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { PluginTestActionParamsBase } from "../../../plugin/base"
import { TestAction } from "../../../actions/test"
import { joi } from "../../../config/common"
import { ActionTypeHandlerSpec } from "../base/base"
import { runBaseParams } from "../../base"
import { GetTestResult, getTestResultSchema } from "./get-result"
import { CommonRunParams } from "../Run/run"
import { Resolved } from "../../../actions/types"
import { actionParamsSchema } from "../../plugin"

type TestActionParams<T extends TestAction> = PluginTestActionParamsBase<T> &
  CommonRunParams & {
    silent: boolean
  }

export class RunTestAction<T extends TestAction = TestAction> extends ActionTypeHandlerSpec<
  "Test",
  TestActionParams<Resolved<T>>,
  GetTestResult<T>
> {
  description = dedent`
    Run the Test action.

    This should complete the test run and return the logs from the test run, and signal whether the tests completed successfully.

    It should also store the test results and provide the accompanying \`getTestResult\` handler, so that the same version does not need to be tested multiple times.
  `

  paramsSchema = () =>
    actionParamsSchema().keys({
      ...runBaseParams(),
      silent: joi.boolean().description("Set to true if no log output should be emitted during execution"),
    })
  resultSchema = () => getTestResultSchema()
}
