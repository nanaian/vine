import VirtualMachine from './vm/VirtualMachine.js'
import ALU, { s2t, t2s, n2t, t2n, Tryte } from './vm/ALU.js'

import assemble from './asm/assemble.js'

import * as THREE from 'three'

export const symbols = {
  MOUSE_X: s2t('---------'),
  MOUSE_Y: s2t('--------o'),
  MOUSE_BTN: s2t('--------+'),
}

export default class VineCanvas {
  stopped = true

  canvas2D: HTMLCanvasElement
  canvas3D: HTMLCanvasElement

  ctx: CanvasRenderingContext2D

  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  camera: THREE.Camera

  vm: VirtualMachine
  clock: NodeJS.Timeout | undefined

  constructor(parent: HTMLElement, vm: VirtualMachine) {
    this.vm = vm

    this.canvas2D = document.createElement('canvas') as HTMLCanvasElement
    this.canvas2D.width = 243
    this.canvas2D.height = 243

    this.canvas3D = document.createElement('canvas') as HTMLCanvasElement

    this.ctx = this.canvas2D.getContext('2d') as CanvasRenderingContext2D

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('grey')

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas3D,
      antialias: false,
    })
    this.renderer.setSize(243, 243)

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)

    this.canvas2D.style.position = this.canvas3D.style.position = 'absolute'
    this.canvas2D.style.top = this.canvas3D.style.top = '0'
    this.canvas2D.style.left = this.canvas3D.style.left = '0'
    this.canvas2D.style.width = this.canvas3D.style.width = '720px'
    this.canvas2D.style.height = this.canvas3D.style.height = '720px'
    this.canvas2D.style.imageRendering = this.canvas3D.style.imageRendering =
      'optimizespeed'

    parent.style.position = 'relative'
    parent.style.width = '720px'
    parent.style.height = '720px'

    // 2D appears above 3D
    parent.appendChild(this.canvas3D)
    parent.appendChild(this.canvas2D)

    this.vm.ram.store(s2t('oo-oo-oo-'), symbols.MOUSE_BTN)

    this.canvas2D.addEventListener('mousemove', evt => {
      const ndc = {
        // (0, 0) is middle of canvas and (1, 1) is bottom right.
        x: (evt.offsetX / 720) * 2 - 1,
        y: (evt.offsetY / 720) * 2 - 1,
      }

      const x = Math.round(ndc.x * 121.5)
      const y = Math.round(ndc.y * 121.5)
      this.vm.ram.store(x, symbols.MOUSE_X)
      this.vm.ram.store(y, symbols.MOUSE_Y)
    })

    this.canvas2D.addEventListener('mousedown', evt => {
      // The MOUSE_BTN tryte is made up of three trybbles:
      //
      //     LLL MMM RRR
      //     |   |   |
      //     |   |   +---- Right mouse button
      //     |   |
      //     |   +-------- Middle mouse button
      //     |
      //     +------------ Left mouse button
      //
      // For each trybble, the value -1 means the button is not down, and a value of 1 means the
      // button is down. Other values are reserved for later use.

      const btn = this.vm.ram.load(symbols.MOUSE_BTN)
      const alu = new ALU()

      if (evt.button === 0) {
        // Left
        alu.xor(btn, s2t('ooo------'))
        alu.max(btn, s2t('oo+------'))
      } else if (evt.button === 1) {
        // Middle
        alu.xor(btn, s2t('---ooo---'))
        alu.max(btn, s2t('---oo+---'))
      } else if (evt.button === 2) {
        // Right
        alu.xor(btn, s2t('------ooo'))
        alu.max(btn, s2t('------oo+'))
      }

      this.vm.ram.store(btn, symbols.MOUSE_BTN)
    })

    this.canvas2D.addEventListener('mouseup', evt => {
      const btn = this.vm.ram.load(symbols.MOUSE_BTN)
      const alu = new ALU()

      if (evt.button === 0) {
        // Left
        alu.xor(btn, s2t('ooo------'))
        alu.min(btn, s2t('oo-++++++'))
      } else if (evt.button === 1) {
        // Middle
        alu.xor(btn, s2t('---ooo---'))
        alu.min(btn, s2t('+++oo-+++'))
      } else if (evt.button === 2) {
        // Right
        alu.xor(btn, s2t('------ooo'))
        alu.min(btn, s2t('++++++oo-'))
      }

      this.vm.ram.store(btn, symbols.MOUSE_BTN)
    })

    this.canvas2D.addEventListener('contextmenu', evt => evt.preventDefault())

    // TEMP
    this.vm.ram.store(s2t('+++oooooo'), s2t('ooo-+----'))
  }

  draw() {
    this.renderer.render(this.scene, this.camera)
    this.drawTilemap()
  }

  drawTilemap() {
    let tx = 0
    let ty = 0
    for (let addr = -3118; addr < -202; addr++) {
      const x = tx * 9
      const y = ty * 9

      const [s0, s1, s2, s3, s4, p0, p1, flip, _unused] = this.vm.ram.load(addr)
      const sprite = t2n([0, 0, 0, 0, s0, s1, s2, s3, s4])
      const palette = t2n([0, 0, 0, 0, 0, 0, 0, p0, p1])

      if (sprite == 0) {
        const paletteAddress = t2n(s2t('ooo-+----')) + palette
        const rgb = this.vm.ram.load(paletteAddress)

        const red = t2n([0, 0, 0, 0, 0, 0, rgb[0], rgb[1], rgb[2]])
        const green = t2n([0, 0, 0, 0, 0, 0, rgb[3], rgb[4], rgb[5]])
        const blue = t2n([0, 0, 0, 0, 0, 0, rgb[6], rgb[7], rgb[8]])

        if (red >= 0 && green >= 0 && blue >= 0) {
          const redHex = Math.floor(255 * (red / 13))
            .toString(16)
            .padStart(2, '0')
          const greenHex = Math.floor(255 * (green / 13))
            .toString(16)
            .padStart(2, '0')
          const blueHex = Math.floor(255 * (blue / 13))
            .toString(16)
            .padStart(2, '0')

          this.ctx.fillStyle = `#${redHex}${greenHex}${blueHex}`
          this.ctx.fillRect(x, y, 9, 9)
        } else {
          // Transparent
        }
      } else if (sprite == 1) {
        this.ctx.fillStyle = 'blue'
        this.ctx.fillRect(x, y, 9, 9)
      }

      tx++
      if (tx == 54) {
        tx = 0
        ty++
      }
    }
  }

  start() {
    if (!this.stopped) this.stop()

    // CPU loop
    const clockIntervalSecs = 0.01
    const clockMegahertz = 5
    const instructionsPerClockCycle = clockMegahertz / clockIntervalSecs
    this.clock = setInterval(() => {
      if (document.hasFocus()) {
        for (let i = 0; i < instructionsPerClockCycle; i++) {
          this.vm.next()
        }
      }
    }, clockIntervalSecs * 1000)

    // Draw loop
    let then = Date.now()
    const fpsInterval = 1000 / 30
    const drawLoop = () => {
      const now = Date.now()
      const elapsed = now - then

      if (elapsed > fpsInterval && document.hasFocus()) {
        then = now - (elapsed % fpsInterval)

        this.draw()
      }

      if (!this.stopped) {
        requestAnimationFrame(drawLoop)
      }
    }
    drawLoop()

    this.stopped = false
    return true
  }

  stop() {
    this.stopped = true
    if (this.clock) clearInterval(this.clock)
  }
}