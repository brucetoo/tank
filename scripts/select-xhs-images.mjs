import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const sources = readFileSync(join(root, '.xhs-sources.tsv'), 'utf8').trim().split('\n').map((line) => {
  const [id, author, title, url] = line.split('\t')
  return { id, author, title, url }
})
const downloads = join(root, '.xhs-selection')
const output = join(root, 'public/images/xiaohongshu')
rmSync(downloads, { recursive: true, force: true })
mkdirSync(downloads, { recursive: true })

for (const [index, source] of sources.entries()) {
  const noteArg = source.url.replace('https://www.xiaohongshu.com/search_result/', '')
  const destination = join(downloads, source.id)
  console.log(`[${index + 1}/${sources.length}] ${source.id}`)
  try {
    execFileSync('opencli', ['xiaohongshu', 'download', noteArg, '--output', destination, '-f', 'json'], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 240000,
    })
    const candidates = walk(destination).filter((file) => /\.(?:jpe?g|png|webp)$/i.test(file))
    const ranked = candidates.map((file) => ({ file, ...dimensions(file), bytes: statSync(file).size })).filter((item) => item.width >= 900 && item.height >= 700).sort(compare)
    const selected = ranked[0]
    if (!selected) throw new Error('没有合格图片')
    copyFileSync(selected.file, join(output, `${source.id}.jpg`))
    console.log(`  ${selected.width}×${selected.height} ratio=${(selected.width / selected.height).toFixed(2)}`)
  } catch (error) {
    console.error(`  保留现有图片：${error.message}`)
  }
}

function compare(a, b) {
  const score = (item) => {
    const ratio = item.width / item.height
    const landscape = ratio >= 1.2 && ratio <= 2 ? 100 : ratio >= 0.72 && ratio < 1.2 ? 45 : 0
    const target = Math.abs(ratio - 1.5) * 20
    const quality = Math.min(item.bytes / 100000, 8)
    return landscape - target + quality
  }
  return score(b) - score(a)
}

function dimensions(file) {
  const output = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' })
  return {
    width: Number(output.match(/pixelWidth: (\d+)/)?.[1] ?? 0),
    height: Number(output.match(/pixelHeight: (\d+)/)?.[1] ?? 0),
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
