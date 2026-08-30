// MIT License - Copyright (c) fintonlabs.com
//
// Rewrites latest-mac.yml so every hash matches the bytes on disk.
//
// electron-updater verifies a download against the sha512 here and refuses
// anything that does not match. Stapling the notarisation ticket rewrites the
// dmg *after* electron-builder hashed it — it grows by roughly 12 KB — so the
// recorded value is stale the moment the ticket is attached. Publishing that
// advertises a checksum no download can satisfy, and every update that picks
// the dmg fails verification.
//
// This runs as a build step rather than from an electron-builder hook because
// the manifest does not exist yet when the last hook (afterAllArtifactBuild)
// fires: electron-builder writes the update metadata after it.
//
//   node scripts/refresh-update-metadata.js dist
//
// Each listed file is re-hashed individually. Blanket-replacing every `sha512:`
// with one file's digest — the obvious shortcut — gives the zip the dmg's hash
// and breaks the very updates this exists to protect.

const { createHash } = require('node:crypto')
const { existsSync, readFileSync, statSync, writeFileSync } = require('node:fs')
const { basename, join } = require('node:path')

function refreshUpdateMetadata(outDir, manifestName = 'latest-mac.yml') {
  const manifest = join(outDir, manifestName)
  if (!existsSync(manifest)) return false

  const measured = new Map()
  const measure = (name) => {
    if (measured.has(name)) return measured.get(name)
    const file = join(outDir, name)
    let entry = null
    if (existsSync(file)) {
      entry = {
        sha512: createHash('sha512').update(readFileSync(file)).digest('base64'),
        size: statSync(file).size
      }
    }
    measured.set(name, entry)
    return entry
  }

  // Which file the current run of `sha512:`/`size:` lines belongs to: an
  // indented `- url:` entry, or the top-level `path:` near the end.
  let current = null
  let corrected = 0

  const updated = readFileSync(manifest, 'utf8')
    .split('\n')
    .map((line) => {
      const url = /^\s+- url:\s*(\S+)/.exec(line)
      if (url) {
        current = measure(url[1])
        return line
      }
      const path = /^path:\s*(\S+)/.exec(line)
      if (path) {
        current = measure(path[1])
        return line
      }
      if (!current) return line

      const sha = /^(\s*)sha512:\s*(\S*)/.exec(line)
      if (sha) {
        if (sha[2] !== current.sha512) corrected++
        return `${sha[1]}sha512: ${current.sha512}`
      }
      const size = /^(\s*)size:\s*(\d+)/.exec(line)
      if (size) {
        if (Number(size[2]) !== current.size) corrected++
        return `${size[1]}size: ${current.size}`
      }
      return line
    })
    .join('\n')

  writeFileSync(manifest, updated)
  console.log(
    `  • ${basename(manifest)}: ${corrected} value${corrected === 1 ? '' : 's'} corrected`
  )
  return true
}

module.exports = { refreshUpdateMetadata }

if (require.main === module) {
  const outDir = process.argv[2] ?? 'dist'
  const found = ['latest-mac.yml', 'latest.yml'].filter((name) =>
    refreshUpdateMetadata(outDir, name)
  )
  if (found.length === 0) {
    console.log(`  • no update metadata found in ${outDir}`)
  }
}
