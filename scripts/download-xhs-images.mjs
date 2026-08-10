import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const rows = readFileSync(join(root, '.xhs-sources.tsv'), 'utf8').trim().split('\n').map((line) => {
  const [id, author, title, url] = line.split('\t')
  return { id, author, title, url }
})
const output = join(root, 'public/images/xiaohongshu')
const temp = join(root, '.xhs-downloads')
mkdirSync(output, { recursive: true })
rmSync(temp, { recursive: true, force: true })
mkdirSync(temp, { recursive: true })

for (const [index, source] of rows.entries()) {
  const noteArg = source.url.replace('https://www.xiaohongshu.com/search_result/', '')
  const placeTemp = join(temp, source.id)
  console.log(`[${index + 1}/${rows.length}] ${source.id}: ${source.title}`)
  try {
    execFileSync('opencli', ['xiaohongshu', 'download', noteArg, '--output', placeTemp, '-f', 'json'], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
      timeout: 120000,
    })
    const files = walk(placeTemp).filter((file) => /\.(?:jpe?g|png|webp)$/i.test(file)).sort()
    if (!files.length) throw new Error('no downloaded image')
    copyFileSync(files[0], join(output, `${source.id}.jpg`))
  } catch (error) {
    console.error(`FAILED ${source.id}: ${error.message}`)
  }
}

function walk(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    })
  } catch {
    return []
  }
}
