import { generateKeyPairSync, randomBytes } from 'crypto'
import { utils as sshUtils } from 'ssh2'

export interface GeneratedKey {
  type: 'ed25519' | 'rsa'
  privateKey: string
  publicKey: string
}

/** Serialize an ed25519 keypair into OpenSSH private key format (openssh-key-v1, unencrypted). */
function ed25519ToOpenSSH(pub: Buffer, priv: Buffer, comment: string): string {
  const magic = Buffer.from('openssh-key-v1\0', 'utf8')

  const str = (b: Buffer): Buffer => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(b.length)
    return Buffer.concat([len, b])
  }
  const s = (t: string): Buffer => str(Buffer.from(t, 'utf8'))

  const keyType = s('ssh-ed25519')
  const pubBlob = Buffer.concat([keyType, str(pub)])

  const check = randomBytes(4)
  const privBlob = Buffer.concat([
    check,
    check,
    keyType,
    str(pub),
    str(Buffer.concat([priv, pub])), // scalar || public
    s(comment)
  ])
  // pad to cipher block size (8 for 'none')
  const padLen = (8 - (privBlob.length % 8)) % 8
  const padding = Buffer.from(Array.from({ length: padLen }, (_, i) => i + 1))
  const padded = Buffer.concat([privBlob, padding])

  const body = Buffer.concat([
    magic,
    s('none'), // ciphername
    s('none'), // kdfname
    str(Buffer.alloc(0)), // kdfoptions
    Buffer.from([0, 0, 0, 1]), // number of keys
    str(pubBlob),
    str(padded)
  ])

  const b64 = body.toString('base64')
  const lines = b64.match(/.{1,70}/g) ?? []
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines.join('\n')}\n-----END OPENSSH PRIVATE KEY-----\n`
}

export function generateSSHKey(type: 'ed25519' | 'rsa', comment: string): GeneratedKey {
  if (type === 'ed25519') {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    // raw public key = last 32 bytes of SPKI DER
    const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
    const rawPub = spki.subarray(spki.length - 32)
    // raw private scalar = last 32 bytes of PKCS8 DER
    const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer
    const rawPriv = pkcs8.subarray(pkcs8.length - 32)

    const privOpenSSH = ed25519ToOpenSSH(rawPub, rawPriv, comment)
    const pubBlob = Buffer.concat([
      Buffer.from([0, 0, 0, 11]),
      Buffer.from('ssh-ed25519', 'utf8'),
      Buffer.from([0, 0, 0, 32]),
      rawPub
    ])
    const pubLine = `ssh-ed25519 ${pubBlob.toString('base64')} ${comment}`
    return { type, privateKey: privOpenSSH, publicKey: pubLine }
  }

  // RSA 4096 — PKCS1 PEM private (accepted by OpenSSH), public line derived via ssh2
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  })
  const parsed = sshUtils.parseKey(privateKey)
  if (parsed instanceof Error) throw parsed
  const pubLine = `${parsed.type} ${parsed.getPublicSSH().toString('base64')} ${comment}`
  return { type, privateKey, publicKey: pubLine }
}
