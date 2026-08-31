// MIT License - Copyright (c) fintonlabs.com
//
// Submits the signed .app to Apple for notarisation, if credentials are
// available.
//
// Notarisation is what removes the Gatekeeper warning on other people's
// machines. Signing alone is not enough: a signed but un-notarised app still
// gets "cannot be opened because Apple cannot check it for malicious software".
//
// Deliberately opt-in rather than required, so a build without credentials
// still succeeds and produces a signed app — it just carries the prompt. That
// is what CI does today.
//
// Provide credentials either way:
//
//   xcrun notarytool store-credentials "notarytool" \
//     --apple-id <apple-id> --team-id <team-id>
//
// or by exporting APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID.

const { notarize } = require('@electron/notarize')
const { execFileSync, spawnSync } = require('node:child_process')
const { join } = require('node:path')

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

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  // Nothing to notarise if the bundle was only ad-hoc signed — Apple rejects a
  // submission with no Developer ID, and the app is unusable for updates anyway.
  const identity = context.packager.platformSpecificBuildOptions.identity ?? process.env.CSC_NAME
  if (!identity) {
    console.log('  • skipping notarisation: the app is not signed with a Developer ID')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  const appBundleId = context.packager.appInfo.id

  const env = process.env
  const useEnv = Boolean(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID)
  const blocked = useEnv ? null : notarizationBlockedBy()

  if (blocked) {
    const message = `notarisation unavailable — ${blocked}`
    if (notarizationRequired()) throw new Error(message)
    console.log(`  • skipping ${message}`)
    return
  }

  console.log(`  • notarising ${appName}.app — this takes a few minutes`)
  await notarize({
    appPath,
    appBundleId,
    ...(useEnv
      ? {
          appleId: env.APPLE_ID,
          appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD,
          teamId: env.APPLE_TEAM_ID
        }
      : { keychainProfile: KEYCHAIN_PROFILE })
  })
  console.log('  • app notarised and stapled')
}
