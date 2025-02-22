/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dotenv = require("dotenv")
import { sep, resolve, relative, basename, dirname, join } from "path"
import { load, loadAll } from "js-yaml"
import yamlLint from "yaml-lint"
import { pathExists, readFile } from "fs-extra"
import { omit, isPlainObject, isArray } from "lodash"
import { coreModuleSpecSchema, baseModuleSchemaKeys, BuildDependencyConfig, ModuleConfig } from "./module"
import { ConfigurationError, FilesystemError, ParameterError } from "../exceptions"
import { DEFAULT_BUILD_TIMEOUT_SEC, DOCS_BASE_URL, GardenApiVersion } from "../constants"
import { ProjectConfig, ProjectResource } from "../config/project"
import { validateWithPath } from "./validation"
import { defaultDotIgnoreFile, listDirectory } from "../util/fs"
import { isConfigFilename } from "../util/fs"
import { ConfigTemplateKind } from "./config-template"
import { isTruthy } from "../util/util"
import { createSchema, DeepPrimitiveMap, joi, PrimitiveMap } from "./common"
import { emitNonRepeatableWarning } from "../warnings"
import { ActionKind, actionKinds } from "../actions/types"
import { mayContainTemplateString } from "../template-string/template-string"
import { Log } from "../logger/log-entry"
import { deline } from "../util/string"

export const configTemplateKind = "ConfigTemplate"
export const renderTemplateKind = "RenderTemplate"
export const noTemplateFields = ["apiVersion", "kind", "type", "name", "internal"]

export const varfileDescription = `
The format of the files is determined by the configured file's extension:

* \`.env\` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* \`.yaml\`/\`.yml\` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type.
* \`.json\` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._
`.trim()

export interface GardenResourceInternalFields {
  basePath: string
  configFilePath?: string
  // -> set by templates
  inputs?: DeepPrimitiveMap
  parentName?: string
  templateName?: string
}

export interface BaseGardenResource {
  apiVersion?: string
  kind: string
  name: string
  internal: GardenResourceInternalFields
}

export const baseInternalFieldsSchema = createSchema({
  name: "base-internal-fields",
  keys: () => ({
    basePath: joi.string().required().meta({ internal: true }),
    configFilePath: joi.string().optional().meta({ internal: true }),
    inputs: joi.object().optional().meta({ internal: true }),
    parentName: joi.string().optional().meta({ internal: true }),
    templateName: joi.string().optional().meta({ internal: true }),
  }),
  allowUnknown: true,
  meta: { internal: true },
})

// Note: Avoiding making changes to ModuleConfig and ProjectConfig for now, because of
// the blast radius.
export type GardenResource = BaseGardenResource | ModuleConfig | ProjectConfig

export type RenderTemplateKind = typeof renderTemplateKind
export type ConfigKind = "Module" | "Workflow" | "Project" | ConfigTemplateKind | RenderTemplateKind | ActionKind

export const allConfigKinds = ["Module", "Workflow", "Project", configTemplateKind, renderTemplateKind, ...actionKinds]

/**
 * Attempts to parse content as YAML, and applies a linter to produce more informative error messages when
 * content is not valid YAML.
 *
 * @param content - The contents of the file as a string.
 * @param path - The path to the file.
 */
export async function loadAndValidateYaml(content: string, path: string): Promise<any[]> {
  try {
    return loadAll(content) || []
  } catch (err) {
    // We try to find the error using a YAML linter
    try {
      await yamlLint(content)
    } catch (linterErr) {
      throw new ConfigurationError({
        message: `Could not parse ${basename(path)} in directory ${path} as valid YAML: ${err.message}`,
        detail: linterErr,
      })
    }
    // ... but default to throwing a generic error, in case the error wasn't caught by yaml-lint.
    throw new ConfigurationError({
      message: `Could not parse ${basename(path)} in directory ${path} as valid YAML.`,
      detail: err,
    })
  }
}

export async function loadConfigResources(
  log: Log,
  projectRoot: string,
  configPath: string,
  allowInvalid = false
): Promise<GardenResource[]> {
  const fileData = await readConfigFile(configPath, projectRoot)

  const resources = await validateRawConfig({
    log,
    rawConfig: fileData.toString(),
    configPath,
    projectRoot,
    allowInvalid,
  })

  return resources
}

export async function validateRawConfig({
  log,
  rawConfig,
  configPath,
  projectRoot,
  allowInvalid = false,
}: {
  log: Log
  rawConfig: string
  configPath: string
  projectRoot: string
  allowInvalid?: boolean
}) {
  let rawSpecs = await loadAndValidateYaml(rawConfig, configPath)

  // Ignore empty resources
  rawSpecs = rawSpecs.filter(Boolean)

  const resources = <GardenResource[]>rawSpecs
    .map((s) => {
      const relPath = relative(projectRoot, configPath)
      const description = `config at ${relPath}`
      return prepareResource({ log, spec: s, configFilePath: configPath, projectRoot, description, allowInvalid })
    })
    .filter(Boolean)
  return resources
}

export async function readConfigFile(configPath: string, projectRoot: string) {
  try {
    return await readFile(configPath)
  } catch (err) {
    throw new FilesystemError({
      message: `Could not find configuration file at ${configPath}`,
      detail: { projectRoot, configPath },
    })
  }
}

/**
 * Each YAML document in a garden.yml file defines a project, a module or a workflow.
 */
export function prepareResource({
  log,
  spec,
  configFilePath,
  projectRoot,
  description,
  allowInvalid = false,
}: {
  log: Log
  spec: any
  configFilePath: string
  projectRoot: string
  description: string
  allowInvalid?: boolean
}): GardenResource | ModuleConfig | null {
  const relPath = relative(projectRoot, configFilePath)

  if (!isPlainObject(spec)) {
    throw new ConfigurationError({
      message: `Invalid configuration found in ${description}. Expected mapping object but got ${typeof spec}.`,
      detail: {
        spec,
        configPath: configFilePath,
      },
    })
  }

  let kind = spec.kind

  const basePath = dirname(configFilePath)

  if (!allowInvalid) {
    for (const field of noTemplateFields) {
      if (spec[field] && mayContainTemplateString(spec[field])) {
        throw new ConfigurationError({
          message: `Resource in ${relPath} has a template string in field '${field}', which does not allow templating.`,
          detail: { spec, configPath: configFilePath },
        })
      }
    }
    if (spec.internal) {
      throw new ConfigurationError({
        message: `Found invalid key "internal" in config at ${relPath}`,
        detail: {
          spec,
          path: relPath,
        },
      })
    }
  }

  // Allow this for backwards compatibility
  if (kind === "ModuleTemplate") {
    spec.kind = kind = configTemplateKind
  }

  if (kind === "Project") {
    spec.path = basePath
    spec.configPath = configFilePath
    delete spec.internal
    return prepareProjectResource(log, spec)
  } else if (
    actionKinds.includes(kind) ||
    kind === "Command" ||
    kind === "Workflow" ||
    kind === configTemplateKind ||
    kind === renderTemplateKind
  ) {
    spec.internal = {
      basePath,
      configFilePath,
    }
    return spec
  } else if (kind === "Module") {
    spec.path = basePath
    spec.configPath = configFilePath
    delete spec.internal
    return prepareModuleResource(spec, configFilePath, projectRoot)
  } else if (allowInvalid) {
    return spec
  } else if (!kind) {
    throw new ConfigurationError({
      message: `Missing \`kind\` field in ${description}`,
      detail: {
        kind,
        path: relPath,
      },
    })
  } else {
    throw new ConfigurationError({
      message: `Unknown kind ${kind} in ${description}`,
      detail: {
        kind,
        path: relPath,
      },
    })
  }
}

// TODO-0.14: remove these deprecation handlers in 0.14
type DeprecatedConfigHandler = (log: Log, spec: ProjectResource) => ProjectResource

function handleDotIgnoreFiles(log: Log, projectSpec: ProjectResource) {
  // If the project config has an explicitly defined `dotIgnoreFile` field,
  // it means the config has already been updated to 0.13 format.
  if (!!projectSpec.dotIgnoreFile) {
    return projectSpec
  }

  const dotIgnoreFiles = projectSpec.dotIgnoreFiles
  // If the project config has neither new `dotIgnoreFile` nor old `dotIgnoreFiles` fields
  // then there is nothing to do.
  if (!dotIgnoreFiles) {
    return projectSpec
  }

  if (dotIgnoreFiles.length === 0) {
    return { ...projectSpec, dotIgnoreFile: defaultDotIgnoreFile }
  }

  if (dotIgnoreFiles.length === 1) {
    emitNonRepeatableWarning(
      log,
      deline`Multi-valued project configuration field \`dotIgnoreFiles\` is deprecated in 0.13 and will be removed in 0.14. Please use single-valued \`dotIgnoreFile\` instead.`
    )
    return { ...projectSpec, dotIgnoreFile: dotIgnoreFiles[0] }
  }

  throw new ConfigurationError({
    message: `Cannot auto-convert array-field \`dotIgnoreFiles\` to scalar \`dotIgnoreFile\`: multiple values found in the array [${dotIgnoreFiles.join(
      ", "
    )}]`,
    detail: {
      projectSpec,
    },
  })
}

function handleProjectModules(log: Log, projectSpec: ProjectResource): ProjectResource {
  // Field 'modules' was intentionally removed from the internal interface `ProjectResource`,
  // but it still can be presented in the runtime if the old config format is used.
  if (projectSpec["modules"]) {
    emitNonRepeatableWarning(
      log,
      "Project configuration field `modules` is deprecated in 0.13 and will be removed in 0.14. Please use the `scan` field instead."
    )
  }

  return projectSpec
}

function handleMissingApiVersion(log: Log, projectSpec: ProjectResource): ProjectResource {
  // We conservatively set the apiVersion to be compatible with 0.12.
  if (projectSpec["apiVersion"] === undefined) {
    emitNonRepeatableWarning(
      log,
      `"apiVersion" is missing in the Project config. Assuming "${GardenApiVersion.v0}" for backwards compatibility with 0.12. The "apiVersion"-field is mandatory when using the new action Kind-configs. A detailed migration guide is available at ${DOCS_BASE_URL}/tutorials/migrating-to-bonsai`
    )

    return { ...projectSpec, apiVersion: GardenApiVersion.v0 }
  } else {
    if (projectSpec["apiVersion"] === GardenApiVersion.v0) {
      emitNonRepeatableWarning(
        log,
        `Project is configured with \`apiVersion: ${GardenApiVersion.v0}\`, running with backwards compatibility.`
      )
    } else if (projectSpec["apiVersion"] !== GardenApiVersion.v1) {
      throw new ConfigurationError({
        message: `Project configuration with \`apiVersion: ${projectSpec["apiVersion"]}\` is not supported. Valid values are ${GardenApiVersion.v1} or ${GardenApiVersion.v0}.`,
        detail: {
          projectSpec,
        },
      })
    }
  }

  return projectSpec
}

const bonsaiDeprecatedConfigHandlers: DeprecatedConfigHandler[] = [
  handleMissingApiVersion,
  handleDotIgnoreFiles,
  handleProjectModules,
]

export function prepareProjectResource(log: Log, spec: any): ProjectResource {
  let projectSpec = <ProjectResource>spec
  for (const handler of bonsaiDeprecatedConfigHandlers) {
    projectSpec = handler(log, projectSpec)
  }
  return projectSpec
}

export function prepareModuleResource(spec: any, configPath: string, projectRoot: string): ModuleConfig {
  // We allow specifying modules by name only as a shorthand:
  //   dependencies:
  //   - foo-module
  //   - name: foo-module // same as the above
  // Empty strings and nulls are omitted from the array.
  let dependencies: BuildDependencyConfig[] = spec.build?.dependencies || []

  if (spec.build && spec.build.dependencies && isArray(spec.build.dependencies)) {
    // We call `prepareBuildDependencies` on `spec.build.dependencies` again in `resolveModuleConfig` to ensure that
    // any dependency configs whose module names resolved to null get filtered out.
    dependencies = prepareBuildDependencies(spec.build.dependencies)
  }

  const cleanedSpec = {
    ...omit(spec, baseModuleSchemaKeys()),
    build: { ...spec.build, dependencies },
  }

  // Had a bit of a naming conflict in the terraform module type with the new module variables concept...
  if (spec.type === "terraform") {
    cleanedSpec["variables"] = spec.variables
  }

  // Built-in keys are validated here and the rest are put into the `spec` field
  const path = dirname(configPath)
  const config: ModuleConfig = {
    apiVersion: spec.apiVersion || GardenApiVersion.v0,
    kind: "Module",
    allowPublish: spec.allowPublish,
    build: {
      dependencies,
      timeout: spec.build?.timeout || DEFAULT_BUILD_TIMEOUT_SEC,
    },
    configPath,
    description: spec.description,
    disabled: spec.disabled,
    generateFiles: spec.generateFiles,
    include: spec.include,
    exclude: spec.exclude,
    name: spec.name,
    path,
    repositoryUrl: spec.repositoryUrl,
    serviceConfigs: [],
    spec: cleanedSpec,
    testConfigs: [],
    type: spec.type,
    taskConfigs: [],
    variables: spec.variables,
    varfile: spec.varfile,
  }

  validateWithPath({
    config,
    schema: coreModuleSpecSchema(),
    path: configPath,
    projectRoot,
    configType: "module",
    ErrorClass: ConfigurationError,
  })

  return config
}

/**
 * Normalizes build dependencies such that the string / module name shorthand is converted into the map form,
 * and removes any null entries (or entries with null names, which can appear after template resolution).
 */
export function prepareBuildDependencies(buildDependencies: any[]): BuildDependencyConfig[] {
  return buildDependencies
    .map((dep) => {
      if (!dep || (dep && dep.name === null)) {
        return null
      }
      return {
        name: dep.name ? dep.name : dep,
        copy: dep.copy ? dep.copy : [],
      }
    })
    .filter(isTruthy)
}

export async function findProjectConfig({
  log,
  path,
  allowInvalid = false,
  scan = true,
}: {
  log: Log
  path: string
  allowInvalid?: boolean
  scan?: boolean
}): Promise<ProjectResource | undefined> {
  let sepCount = path.split(sep).length - 1

  for (let i = 0; i < sepCount; i++) {
    const configFiles = (await listDirectory(path, { recursive: false })).filter(isConfigFilename)

    for (const configFile of configFiles) {
      const resources = await loadConfigResources(log, path, join(path, configFile), allowInvalid)

      const projectSpecs = resources.filter((s) => s.kind === "Project")

      if (projectSpecs.length > 1 && !allowInvalid) {
        throw new ConfigurationError({
          message: `Multiple project declarations found in ${path}`,
          detail: {
            projectSpecs,
          },
        })
      } else if (projectSpecs.length > 0) {
        return <ProjectResource>projectSpecs[0]
      }
    }

    if (!scan) {
      break
    }

    path = resolve(path, "..")
  }

  return
}

export async function loadVarfile({
  configRoot,
  path,
  defaultPath,
}: {
  // project root (when resolving project config) or module root (when resolving module config)
  configRoot: string
  path: string | undefined
  defaultPath: string | undefined
}): Promise<PrimitiveMap> {
  if (!path && !defaultPath) {
    throw new ParameterError({
      message: `Neither a path nor a defaultPath was provided.`,
      detail: { configRoot, path, defaultPath },
    })
  }
  const resolvedPath = resolve(configRoot, <string>(path || defaultPath))
  const exists = await pathExists(resolvedPath)

  if (!exists && path && path !== defaultPath) {
    throw new ConfigurationError({
      message: `Could not find varfile at path '${path}'`,
      detail: {
        path,
        resolvedPath,
      },
    })
  }

  if (!exists) {
    return {}
  }

  try {
    const data = await readFile(resolvedPath)
    const relPath = relative(configRoot, resolvedPath)
    const filename = basename(resolvedPath.toLowerCase())

    if (filename.endsWith(".json")) {
      const parsed = JSON.parse(data.toString())
      if (!isPlainObject(parsed)) {
        throw new ConfigurationError({
          message: `Configured variable file ${relPath} must be a valid plain JSON object`,
          detail: {
            parsed,
          },
        })
      }
      return parsed
    } else if (filename.endsWith(".yml") || filename.endsWith(".yaml")) {
      const parsed = load(data.toString())
      if (!isPlainObject(parsed)) {
        throw new ConfigurationError({
          message: `Configured variable file ${relPath} must be a single plain YAML mapping`,
          detail: {
            parsed,
          },
        })
      }
      return parsed as PrimitiveMap
    } else {
      // Note: For backwards-compatibility we fall back on using .env as a default format, and don't specifically
      // validate the extension for that.
      return dotenv.parse(await readFile(resolvedPath))
    }
  } catch (error) {
    throw new ConfigurationError({
      message: `Unable to load varfile at '${path}': ${error}`,
      detail: {
        error,
        path,
      },
    })
  }
}
