import fs from 'node:fs'
import path from 'node:path'

export function writeOne(dest, content, { force, dryRun }) {
  const exists = fs.existsSync(dest)
  const shouldKeep = exists && !force
  if (shouldKeep) return 'kept'
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, content)
  }
  return exists ? 'overwritten' : 'created'
}
