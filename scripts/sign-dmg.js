// MIT License - Copyright (c) fintonlabs.com
//
// Signs, notarises and staples the finished .dmg, then rewrites the update
// metadata so it still describes the files as they now stand.
//
// The afterSign hook notarises the *app*, which is what Gatekeeper checks once
// the app has been dragged to Applications. The disk image it arrives in is a
// separate artifact with its own signature and its own ticket, and it does not
// inherit the app's. An unstapled dmg still passes on a machine that can reach
// Apple to check and fails on one that cannot — the worst kind of bug, because
// it never reproduces where it was built.
//
// Order matters: sign, then notarise, then staple. Stapling attaches the ticket
// to the file, so signing afterwards destroys it.

const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { existsSync, readFileSync, statSync, writeFileSync } = require('node:fs')
const { basename, dirname, join } = require('node:path')

const KEYCHAIN_PROFILE = process.env.NOTARYTOOL_PROFILE ?? 'notarytool'

/** True when `notarytool` already has a stored credential profile. */
function hasKeychainProfile() {
  try {
    execFileSync('xcrun', ['notarytool', 'history', '--keychain-profile', KEYCHAIN_PROFILE], {
      stdio: 'ignore'
    })
    return true
  } catch {
    return false
  }
}

/** The identity codesign needs, with the prefix electron-builder strips. */
function developerIdentity(context) {
  const explicit = process.env.TERMITE_SIGN_IDENTITY
  if (explicit) return explicit
  const configured =
    context.packager?.config?.mac?.identity ??
    context.configuration?.mac?.identity ??
    process.env.CSC_NAME
  if (!configured) return null
  return configured.includes(':') ? configured : `Developer ID Application: ${configured}`
}

exports.default = async function afterAllArtifactBuild(context) {
  const images = (context.artifactPaths ?? []).filter((path) => path.endsWith('.dmg'))
  if (images.length === 0) return []

  if (!hasKeychainProfile()) {
    console.log('  • skipping dmg notarisation: no notarytool credentials')
    return []
  }

  const identity = developerIdentity(context)

  for (const image of images) {
    try {
      execFileSync('xcrun', ['stapler', 'validate', image], { stdio: 'ignore' })
      console.log(`  • ${basename(image)} is already stapled`)
      continue
    } catch {
      // Not stapled yet, which is the normal case.
    }

    if (identity) {
      execFileSync('codesign', ['--force', '--timestamp', '--sign', identity, image], {
        stdio: 'inherit'
      })
      console.log(`  • signed ${basename(image)}`)
    }

    console.log(`  • notarising ${basename(image)}`)
    execFileSync(
      'xcrun',
      ['notarytool', 'submit', image, '--keychain-profile', KEYCHAIN_PROFILE, '--wait'],
      { stdio: 'inherit' }
    )
    execFileSync('xcrun', ['stapler', 'staple', image], { stdio: 'inherit' })
    console.log(`  • ${basename(image)} notarised and stapled`)
  }

  refreshUpdateMetadata(dirname(images[0]))
  return []
}

/**
 * Rewrites latest-mac.yml so every hash matches the bytes on disk.
 *
 * electron-updater verifies a download against the sha512 here and refuses
 * anything that does not match. Stapling changes the dmg *after* electron-builder
 * hashed it, so the recorded value is stale the moment the ticket is attached —
 * publishing it advertises a checksum no download can satisfy, and every
 * auto-update fails verification.
 *
 * Each listed file is re-hashed from disk rather than only the one that changed.
 * A mac build emits a zip *and* a dmg, and both are listed; blanket-replacing
 * every `sha512:` with one file's digest — the obvious shortcut — would give the
 * zip the dmg's hash and break the very updates this exists to protect.
 */
function refreshUpdateMetadata(outDir) {
  const manifest = join(outDir, 'latest-mac.yml')
  if (!existsSync(manifest)) return

  const digests = new Map()
  const measure = (name) => {
    if (digests.has(name)) return digests.get(name)
    const file = join(outDir, name)
    if (!existsSync(file)) {
      digests.set(name, null)
      return null
    }
    const entry = {
      sha512: createHash('sha512').update(readFileSync(file)).digest('base64'),
      size: statSync(file).size
    }
    digests.set(name, entry)
    return entry
  }

  const lines = readFileSync(manifest, 'utf8').split('\n')
  // Which file the current run of `sha512:`/`size:` lines belongs to: an indented
  // `- url:` entry, or the top-level `path:` at the end of the document.
  let current = null
  let changed = 0

  const updated = lines.map((line) => {
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
      if (sha[2] !== current.sha512) changed++
      return `${sha[1]}sha512: ${current.sha512}`
    }
    const size = /^(\s*)size:\s*(\d+)/.exec(line)
    if (size) {
      if (Number(size[2]) !== current.size) changed++
      return `${size[1]}size: ${current.size}`
    }
    return line
  })

  writeFileSync(manifest, updated.join('\n'))
  console.log(`  • update metadata refreshed (${changed} value${changed === 1 ? '' : 's'} corrected)`)
}
