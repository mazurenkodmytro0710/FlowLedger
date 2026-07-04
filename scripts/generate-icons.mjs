import { createCanvas } from "canvas"
import { mkdirSync, writeFileSync } from "fs"

function generateIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const radius = size * 0.22

  // Dark background with rounded corners
  ctx.fillStyle = "#0a0a0a"
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(size - radius, 0)
  ctx.quadraticCurveTo(size, 0, size, radius)
  ctx.lineTo(size, size - radius)
  ctx.quadraticCurveTo(size, size, size - radius, size)
  ctx.lineTo(radius, size)
  ctx.quadraticCurveTo(0, size, 0, size - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
  ctx.fill()

  // Green accent circle
  ctx.fillStyle = "#00FF85"
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2)
  ctx.fill()

  // Bold "FL" text in black
  ctx.fillStyle = "#000000"
  ctx.font = `900 ${size * 0.34}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText("FL", size / 2, size / 2)

  return canvas.toBuffer("image/png")
}

try {
  mkdirSync("public", { recursive: true })
  writeFileSync("public/icon-192.png", generateIcon(192))
  writeFileSync("public/icon-512.png", generateIcon(512))
  writeFileSync("public/apple-touch-icon.png", generateIcon(180))
  console.log("Icons generated ✓")
} catch (e) {
  console.error("Failed to generate icons:", e.message)
  process.exit(1)
}
