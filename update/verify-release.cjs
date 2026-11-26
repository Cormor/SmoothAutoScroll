'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { verifyManifest, verifyArtifact, MANIFEST, SIGNATURE } = require('./lixing-update.cjs')

try {
  const [tag, vsix, ...extra] = process.argv.slice(2)
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '') || extra.length) {
    throw new Error('用法：node update/verify-release.cjs v版本 [VSIX 路径]')
  }
  const version = tag.slice(1)
  const manifest = verifyManifest(
    fs.readFileSync(MANIFEST),
    fs.readFileSync(SIGNATURE),
    fs.readFileSync(path.join(__dirname, 'release-certificate.cer')),
    { appId: 'smooth-auto-scroll', repo: 'Cormor/SmoothAutoScroll', channel: 'stable', version, platform: 'win32', arch: 'any' },
  )
  const asset = manifest.artifacts.find(({ kind }) => kind === 'vsix')
  if (!asset || asset.name !== `smooth-auto-scroll-${version}.vsix`) {
    throw new Error('签名清单中没有与版本匹配的 VSIX')
  }
  if (vsix) console.log('VSIX 已校验：' + verifyArtifact(vsix, asset))
  else console.log('签名清单已校验，可下载：' + asset.name)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
