import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'

function generateIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Green rounded background
  ctx.fillStyle = '#00FF85'
  const r = size * 0.22
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(size - r, 0)
  ctx.quadraticCurveTo(size, 0, size, r)
  ctx.lineTo(size, size - r)
  ctx.quadraticCurveTo(size, size, size - r, size)
  ctx.lineTo(r, size)
  ctx.quadraticCurveTo(0, size, 0, size - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.fill()

  // Bold "FL" text in black
  ctx.fillStyle = '#000000'
  ctx.font = `900 ${size * 0.38}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('FL', size / 2, size / 2 + size * 0.02)

  return canvas.toBuffer('image/png')
}

try {
  mkdirSync('public', { recursive: true })
  writeFileSync('public/icon-192.png', generateIcon(192))
  writeFileSync('public/icon-512.png', generateIcon(512))
  console.log('Icons generated: public/icon-192.png, public/icon-512.png')
} catch (e) {
  console.error('Failed to generate icons:', e.message)
  process.exit(1)
}
