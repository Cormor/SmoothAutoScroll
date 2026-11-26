'use strict'

const vscode = acquireVsCodeApi()
const toggle = document.getElementById('toggle')
const slower = document.getElementById('slower')
const faster = document.getElementById('faster')
const level = document.getElementById('level')
const status = document.getElementById('status')
const viewport = document.getElementById('viewport')
const content = document.getElementById('content')
const speeds = [0, 0.5, 0.75, 1, 1.3, 1.7, 2.2, 3, 4, 5.3, 7, 9.5, 13, 18, 25, 35, 48]
const maximum = speeds.length - 1

let loaded = false
let running = false
let visible = false
let speed = 1
let lineHeight = 20
let limit = 0
let position = 0
let writtenTop = 0
let frame = null
let previousTime = null

function renderControls() {
  toggle.disabled = !loaded
  slower.disabled = !loaded || speed <= -maximum
  faster.disabled = !loaded || speed >= maximum
  toggle.textContent = running ? '停止' : '开始'
  level.textContent = speed > 0 ? `+${speed}` : String(speed)
  if (!running) status.textContent = '已停止'
  else if (speed === 0) status.textContent = '已暂停'
  else if (speed < 0 && position <= 0) status.textContent = '已到开头'
  else if (speed > 0 && position >= limit) status.textContent = '已到末尾'
  else status.textContent = speed > 0 ? '向下滚动' : '向上滚动'
}

function draw(top) {
  position = Math.max(0, Math.min(limit, top))
  viewport.scrollTop = Math.floor(position)
  writtenTop = viewport.scrollTop
  // Keep the real scrollbar while rendering the remaining fractional pixel.
  content.style.transform = `translateY(${writtenTop - position}px)`
}

function updateFrame() {
  const canAdvance = running && visible && !document.hidden &&
    ((speed < 0 && position > 0) || (speed > 0 && position < limit))
  if (canAdvance) {
    if (frame === null) frame = requestAnimationFrame(tick)
    return
  }
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  previousTime = null
}

function tick(time) {
  frame = null
  // Don't jump after the renderer misses frames.
  const elapsed = previousTime === null ? 0 : Math.min(time - previousTime, 50)
  previousTime = time
  const offset = Math.sign(speed) * speeds[Math.abs(speed)] * lineHeight * elapsed / 1000
  draw(position + offset)
  updateFrame()
  if (frame === null) renderControls()
}

function setRunning(enabled) {
  if (enabled && !loaded) return
  running = enabled
  if (enabled && speed === 0) speed = 1
  previousTime = null
  updateFrame()
  renderControls()
}

function changeLevel(step) {
  if (!loaded) return
  speed = Math.max(-maximum, Math.min(maximum, speed + step))
  previousTime = null
  updateFrame()
  renderControls()
}

function measure() {
  lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight)
  limit = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
}

function setDocument(message) {
  const lines = message.text.split(/\r?\n/)
  const rows = document.createDocumentFragment()
  for (const [index, text] of lines.entries()) {
    const row = document.createElement('div')
    row.className = 'source-line'
    row.dataset.line = String(index + 1)
    if (text) row.textContent = text
    else row.append(document.createElement('br'))
    rows.append(row)
  }
  content.style.setProperty('--line-number-width', `${Math.max(3, String(lines.length).length)}ch`)
  content.style.tabSize = String(message.tabSize)
  content.replaceChildren(rows)
  measure()
  visible = message.visible

  if (message.type === 'open') {
    loaded = true
    speed = 1
    viewport.scrollLeft = 0
    draw(content.children[message.firstLine]?.offsetTop ?? 0)
    setRunning(true)
    return
  }
  draw(position)
  updateFrame()
  renderControls()
}

toggle.addEventListener('click', () => setRunning(!running))
slower.addEventListener('click', () => changeLevel(-1))
faster.addEventListener('click', () => changeLevel(1))

window.addEventListener('wheel', (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !event.deltaY) return
  const onToolbar = event.target instanceof Element && event.target.closest('.toolbar')
  if (!running && !onToolbar) return
  event.preventDefault()
  changeLevel(Math.sign(event.deltaY))
}, { passive: false })

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.isComposing) return
  if (event.key === 'Escape') setRunning(false)
  if (event.key !== 'Enter' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
  const onButton = event.target instanceof Element && event.target.closest('button')
  if (!event.repeat && onButton) return
  event.preventDefault()
  if (!event.repeat) setRunning(!running)
})

viewport.addEventListener('scroll', () => {
  if (viewport.scrollTop === writtenTop) return
  draw(viewport.scrollTop)
  updateFrame()
  renderControls()
})

new ResizeObserver(() => {
  if (!loaded) return
  measure()
  draw(position)
  updateFrame()
  renderControls()
}).observe(viewport)

document.addEventListener('visibilitychange', updateFrame)

window.addEventListener('message', ({ data }) => {
  if (data?.type === 'open' || data?.type === 'update') setDocument(data)
  else if (data?.type === 'visibility') {
    visible = data.visible
    updateFrame()
  }
})

vscode.postMessage({ type: 'ready' })
