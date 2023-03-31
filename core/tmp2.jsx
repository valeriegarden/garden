{
  kind: "Build",
  name: "backend",
  description: "Backend service container image",
  type: "container",
  apiVersion: "garden.io/v0",
  internal: {
    basePath: "/Users/orz/work/garden/examples/demo-project/backend",
    configFilePath: "/Users/orz/work/garden/examples/demo-project/backend/backend.garden.yml",
    inputs: {
    },
  },
  variables: {
  },
  spec: {
    buildArgs: {
    },
    dockerfile: "Dockerfile",
  },
  dependencies: [
  ],
  disabled: false,
  varfiles: [
  ],
  allowPublish: true,
  buildAtSource: false,
  copyFrom: [
  ],
}