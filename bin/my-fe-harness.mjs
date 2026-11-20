#!/usr/bin/env node
import path from 'node:path'
import { parseArgs } from 'node:util'
import { runInit, runAdd, runScaffold, runGuard, runLintGuard, runVerifyGate, runVerifySkill, runUninstall, runStatus, runCheck, runUpdate, printList, printHelp } from '../src/commands.mjs'
import { PACKAGE_VERSION } from '../src/version.mjs'

function printVersion() {
  console.log(`my-fe-harness ${PACKAGE_VERSION}`)
}

const PARSE_OPTIONS = {
  all: { type: 'boolean', default: false },
  structure: { type: 'string' },
  fsd: { type: 'boolean', default: false },
  target: { type: 'string', short: 't', default: '.' },
  force: { type: 'boolean', default: false },
  'dry-run': { type: 'boolean', default: false },
  global: { type: 'boolean', short: 'g', default: false },
  'no-agents': { type: 'boolean', default: false },
  yes: { type: 'boolean', short: 'y', default: false },
  'no-install': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
}

const COMMANDS = {
  init: (rest, options) => runInit(options),
  add: (rest, options) => runAdd(rest, options),
  scaffold: (rest, options) => runScaffold(rest, options),
  fsd: (rest, options) => runScaffold(['fsd'], options),
  guard: (rest, options) => runGuard(options),
  'lint-guard': (rest, options) => runLintGuard(options),
  'verify-gate': (rest, options) => runVerifyGate(options),
  'verify-skill': (rest, options) => runVerifySkill(options),
  uninstall: (rest, options) => runUninstall(options),
  unsync: (rest, options) => runUninstall(options),
  status: (rest, options) => runStatus(options),
  check: (rest, options) => runCheck(options),
  update: (rest, options) => runUpdate(options),
  list: () => printList(),
}

function buildOptions(values) {
  return {
    all: values.all,
    structure: values.structure ?? null,
    fsd: values.fsd,
    force: values.force,
    dryRun: values['dry-run'],
    global: values.global,
    agents: !values['no-agents'],
    yes: values.yes,
    install: !values['no-install'],
    targetDir: path.resolve(values.target),
  }
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: PARSE_OPTIONS })
  const [command = 'init', ...rest] = positionals

  const isVersionRequest = values.version || command === 'version'
  if (isVersionRequest) return printVersion()
  const options = buildOptions(values)

  const isHelpRequest = values.help || command === 'help'
  if (isHelpRequest) return printHelp()

  if (!Object.hasOwn(COMMANDS, command)) throw new Error(`알 수 없는 명령: "${command}" — my-fe-harness help 참고`)
  return COMMANDS[command](rest, options)
}

main().catch((error) => {
  console.error(`✖ ${error.message}`)
  process.exitCode = 1
})
