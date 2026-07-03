#!/usr/bin/env node
import path from 'node:path'
import { parseArgs } from 'node:util'
import { runInit, runAdd, runScaffold, runGuard, runUninstall, runStatus, runUpdate, printList, printHelp } from '../src/commands.mjs'
import { PACKAGE_VERSION } from '../src/version.mjs'

function printVersion() {
  console.log(`my-fe-harness ${PACKAGE_VERSION}`)
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      all: { type: 'boolean', default: false },
      structure: { type: 'string' },
      fsd: { type: 'boolean', default: false },
      target: { type: 'string', short: 't', default: '.' },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      global: { type: 'boolean', short: 'g', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  })

  const [command = 'init', ...rest] = positionals

  if (values.version || command === 'version') return printVersion()
  const options = {
    all: values.all,
    structure: values.structure ?? null,
    fsd: values.fsd,
    force: values.force,
    dryRun: values['dry-run'],
    global: values.global,
    targetDir: path.resolve(values.target),
  }

  if (values.help || command === 'help') return printHelp()

  switch (command) {
    case 'init':
      return runInit(options)
    case 'add':
      return runAdd(rest, options)
    case 'scaffold':
      return runScaffold(rest, options)
    case 'fsd':
      return runScaffold(['fsd'], options)
    case 'guard':
      return runGuard(options)
    case 'uninstall':
    case 'unsync':
      return runUninstall(options)
    case 'status':
      return runStatus(options)
    case 'update':
      return runUpdate(options)
    case 'list':
      return printList()
    default:
      throw new Error(`알 수 없는 명령: "${command}" — my-fe-harness help 참고`)
  }
}

main().catch((error) => {
  console.error(`✖ ${error.message}`)
  process.exitCode = 1
})
