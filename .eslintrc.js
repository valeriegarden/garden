module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "prettier", "mocha", "jsdoc", "chai-friendly"],
  extends: ["standard", "eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:prettier/recommended", "plugin:mocha/recommended", "plugin:chai-friendly/recommended"],
  env: {
    mocha: true
  },
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],

    // Empty functions are just fine
    "@typescript-eslint/no-empty-function": "off",

    "@typescript-eslint/ban-ts-comment": [
      "error",
      {
        "ts-expect-error": "allow-with-description",
        "ts-ignore": "allow-with-description",
        "ts-nocheck": "allow-with-description",
        "ts-check": "allow-with-description",
      },
    ],

    // Since this is a very common error popping up,
    // disabling this rule until we have clarity whether we want or do not want to follow it
    "no-use-before-define": "off",

    // We do our own template string handling in parts so this needs to be disabled
    "no-template-curly-in-string": "off",

    // Plugins are often dynamically imported using `require`
    "@typescript-eslint/no-var-requires": "off",

    "mocha/no-skipped-tests": "warn",
    "mocha/no-exclusive-tests": "error",

    // We use lots of arrow functions with mocha
    "mocha/no-mocha-arrows": "off",

    // This really should be enabled eventually as it may introduce subtle errors
    // and prolong the time it takes to run tests in `.only` mode
    // but it's very common so for now it'll be disabled
    "mocha/no-setup-in-describe": "off",
    // Related to above rule being skipped,
    // since we do use describe blocks for setup, we also need `async` describe blocks until it's fixed
    "mocha/no-async-describe": "off",

    "mocha/max-top-level-suites": "off",

    // We have a helper function called `grouped` which the linter is not aware of.
    // The helper makes it seem to the linter as if we're putting duplicate `before` hooks
    // and tests of the same name. Disabled until we assess if that's a legitimate concern or not.
    "mocha/no-sibling-hooks": "off",
    "mocha/no-identical-title": "off",

    "jsdoc/check-alignment": "error",
    "jsdoc/check-indentation": "error",
    "jsdoc/newline-after-description": "error",
  },
}
