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

const { execFileSync, spawnSync } = require('node:child_process')
const { basename, dirname } = require('node:path')
const { refreshUpdateMetadata } = require('./refresh-update-metadata')

const KEYCHAIN_PROFILE = process.env.NOTARYTOOL_PROFILE ?? 'notarytool'

/**
 * Why notarisation is unavailable, or null when it is ready.
 *
 * Distinguishes "no credentials configured" — which is CI, and fine to skip —
 * from "credentials exist but Apple refused", which is not. The 403 for an
 * expired Program License Agreement is the common one: it is about the account,
 * never about the build, and only the Account Holder can clear it by accepting
 * the new agreement at developer.apple.com/account.
 */
function notarizationBlockedBy() {
  const result = spawnSync('xcrun', ['notarytool', 'history', '--keychain-profile', KEYCHAIN_PROFILE], {
    encoding: 'utf8',
    timeout: 60000
  })
  if (result.status === 0) return null
  const output = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim()
  if (/required agreement is missing or has expired/i.test(output)) {
    return 'Apple refused the request: a required agreement is missing or has expired.\n' +
      '    The Account Holder must accept the current Program License Agreement at\n' +
      '    https://developer.apple.com/account — an Admin cannot. This is about the\n' +
      '    account, not this build.'
  }
  if (/no keychain profile|could not find/i.test(output)) return 'no stored notarytool credentials'
  return output.split('\n')[0] || 'notarytool could not be reached'
}

/**
 * A release build that cannot notarise must fail rather than quietly hand back
 * an installer that Gatekeeper will block. `package:mac:signed` sets this; CI,
 * which deliberately builds unsigned, does not.
 */
function notarizationRequired() {
  return process.env.TERMITE_REQUIRE_NOTARIZATION === '1'
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

  const blocked = notarizationBlockedBy()
  if (blocked) {
    const message = `dmg notarisation unavailable — ${blocked}`
    if (notarizationRequired()) throw new Error(message)
    console.log(`  • skipping ${message}`)
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

  // The manifest does not exist yet — electron-builder writes it after this
  // hook — so correcting it is a separate build step. Attempted here anyway in
  // case a future version changes that ordering.
  refreshUpdateMetadata(dirname(images[0]))
  return []
}
