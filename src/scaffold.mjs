import fs from 'node:fs'
import path from 'node:path'

export function scaffoldStructure(structure, { targetDir, dryRun = false }) {
  return structure.dirs.map((dir) => {
    const dirPath = path.join(targetDir, 'src', dir.name)
    const readme = path.join(dirPath, 'README.md')
    const exists = fs.existsSync(readme)

    if (exists) return { dir: dir.name, path: readme, status: 'skipped' }
    if (!dryRun) {
      fs.mkdirSync(dirPath, { recursive: true })
      fs.writeFileSync(readme, dirReadme(structure, dir))
    }
    return { dir: dir.name, path: readme, status: 'created' }
  })
}

function dirReadme(structure, dir) {
  return [
    `# ${dir.name}`,
    '',
    `> ${structure.title} 구조의 레이어`,
    '',
    `**역할**: ${dir.purpose}`,
    '',
    `**의존 규칙**: ${dir.note}`,
    '',
    `배치 기준·안티패턴 전문: \`.claude/rules/${structure.ruleFile}\``,
    '',
  ].join('\n')
}
