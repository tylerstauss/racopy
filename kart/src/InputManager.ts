import { InputState } from './types'

export class InputManager {
  private keys = new Set<string>()

  constructor() {
    window.addEventListener('keydown', e => {
      this.keys.add(e.code)
      // Prevent space from scrolling
      if (e.code === 'Space') e.preventDefault()
    })
    window.addEventListener('keyup', e => this.keys.delete(e.code))
  }

  getState(): InputState {
    return {
      forward:   (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    ? 1 : 0,
      backward:  (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  ? 1 : 0,
      turnLeft:   this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      turnRight:  this.keys.has('KeyD') || this.keys.has('ArrowRight'),
      drift:      this.keys.has('Space') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    }
  }
}
