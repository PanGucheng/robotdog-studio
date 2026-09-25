// Uses the project's Electron image codec; no additional image dependency.
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

const { app, nativeImage } = require('electron')
const root = join(__dirname, '..', 'resources', 'brand')
const sizes = [16, 24, 32, 48, 64, 128, 256, 512]

function trim(image) {
  const { width, height } = image.getSize()
  const pixels = image.toBitmap()
  let left = width, top = height, right = 0, bottom = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Ignore nearly invisible clipboard edge noise when finding the bounds.
    if (pixels[(y * width + x) * 4 + 3] <= 8) continue
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  return image.crop({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 })
}

function square(image) {
  const { width, height } = image.getSize()
  const side = Math.max(width, height) + 8
  const bitmap = Buffer.alloc(side * side * 4)
  const source = image.toBitmap()
  const x = Math.floor((side - width) / 2), y = Math.floor((side - height) / 2)
  for (let row = 0; row < height; row++) source.copy(bitmap, ((row + y) * side + x) * 4, row * width * 4, (row + 1) * width * 4)
  return nativeImage.createFromBitmap(bitmap, { width: side, height: side })
}

app.whenReady().then(() => {
  const icon = square(trim(nativeImage.createFromPath(join(root, 'sources', 'robohorse-app.png'))))
  const mark = square(trim(nativeImage.createFromPath(join(root, 'sources', 'robohorse-horizontal.png')).crop({ x: 0, y: 0, width: 560, height: 724 })))
  const markPng = mark.resize({ width: 512, height: 512, quality: 'best' }).toPNG()
  writeFileSync(join(root, 'robohorse-mark.png'), markPng)
  const frames = sizes.map(size => {
    const png = icon.resize({ width: size, height: size, quality: 'best' }).toPNG()
    writeFileSync(join(root, `robohorse-${size}.png`), png)
    return { size, png }
  }).filter(({ size }) => size <= 256)
  const header = Buffer.alloc(6 + 16 * frames.length)
  header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4)
  let offset = header.length
  frames.forEach(({ size, png }, i) => {
    const entry = 6 + i * 16
    header[entry] = header[entry + 1] = size === 256 ? 0 : size
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  writeFileSync(join(root, 'robohorse.ico'), Buffer.concat([header, ...frames.map(frame => frame.png)]))
  // SVG text stays text. The UI uses its own HTML wordmark, never this image.
  writeFileSync(join(root, 'robohorse-logo.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="128" viewBox="0 0 740 128" role="img" aria-label="RoboHorse Studio"><image width="120" height="120" x="4" y="4" href="data:image/png;base64,${markPng.toString('base64')}"/><text x="144" y="82" fill="#10243A" font-family="Bahnschrift,Segoe UI,sans-serif" font-size="58" font-weight="600">RoboHorse <tspan fill="#00A8C6" font-weight="500">Studio</tspan></text></svg>\n`)
  console.log('Generated transparent mark, text-based SVG lockup, 8 PNG sizes and 7-frame Windows ICO from supplied PNGs.')
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
