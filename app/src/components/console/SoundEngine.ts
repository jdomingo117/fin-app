export type ConsoleCue = 'move' | 'hover' | 'select' | 'back' | 'tab' | 'open' | 'close' | 'toggleOn' | 'toggleOff' | 'start'

const silence = .0001
const reverb = { duration: 2.8, decay: 2.6, send: .32 }
const music = {
  chords: [
    [110, 164.81, 220, 261.63], [98, 146.83, 196, 233.08],
    [87.31, 130.81, 174.61, 220], [103.83, 155.56, 207.65, 246.94],
  ],
  cycle: 8000,
  duration: 11,
  fade: 3.5,
}
const startChord = [146.83, 220, 293.66, 329.63, 440]
const startBells = [659.25, 880, 1108.73, 1318.51]

type Config = { enabled: boolean; muted: boolean; volume: number; music: boolean; visible: boolean }
type Voice = { source: AudioScheduledSourceNode; bus: GainNode; cleanup: () => void }

export class SoundEngine {
  private ac?: AudioContext
  private master?: GainNode
  private cues?: GainNode
  private musicBus?: GainNode
  private wet?: GainNode
  private convolver?: ConvolverNode
  private impulse?: AudioBuffer
  private noiseBuffer?: AudioBuffer
  private voices = new Set<Voice>()
  private unlock?: Promise<boolean>
  private musicTimer?: number
  private chord = 0
  private lastHover = -Infinity
  private config: Config = { enabled: false, muted: false, volume: .55, music: false, visible: true }

  private get audible() {
    return this.config.enabled && !this.config.muted && this.config.visible && this.config.volume > 0
  }

  setConfig(config: Config) {
    const wasAudible = this.audible
    this.config = config
    if (wasAudible && !this.audible) this.cut()
    this.applyVolume()
    this.refreshMusic()
  }

  private connectGraph(ac: AudioContext) {
    const master = ac.createGain()
    const compressor = ac.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.ratio.value = 3
    master.gain.value = 0
    master.connect(compressor)
    compressor.connect(ac.destination)

    this.master = master
    this.wet = ac.createGain()
    this.wet.gain.value = reverb.send
    this.wet.connect(master)
    this.impulse = ac.createBuffer(2, Math.floor(ac.sampleRate * reverb.duration), ac.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const samples = this.impulse.getChannelData(channel)
      for (let i = 0; i < samples.length; i++) {
        samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** reverb.decay
      }
    }
    this.noiseBuffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * .45), ac.sampleRate)
    const noise = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1
    this.cues = ac.createGain()
    this.musicBus = ac.createGain()
    this.cues.connect(master)
    this.musicBus.connect(master)
    this.connectReverb()
  }

  private connectReverb() {
    if (!this.ac || !this.wet || !this.impulse) return
    const convolver = this.ac.createConvolver()
    convolver.buffer = this.impulse
    this.cues?.connect(convolver)
    this.musicBus?.connect(convolver)
    convolver.connect(this.wet)
    this.convolver = convolver
  }

  /** Call only during a real activation. Muted or disabled preferences never allocate a context. */
  unlockFromGesture(): Promise<boolean> {
    if (!this.audible || typeof AudioContext !== 'function') return Promise.resolve(false)
    if (this.ac?.state === 'running') return Promise.resolve(true)
    if (this.unlock) return this.unlock
    try {
      if (!this.ac) {
        this.ac = new AudioContext()
        this.connectGraph(this.ac)
      }
      const ac = this.ac
      this.unlock = ac.resume().then(() => {
        if (this.ac !== ac || !this.audible) return false
        this.applyVolume()
        this.refreshMusic()
        return ac.state === 'running'
      }).catch(() => false).finally(() => {
        if (this.ac === ac) this.unlock = undefined
      })
      return this.unlock
    } catch {
      this.dispose()
      return Promise.resolve(false)
    }
  }

  private applyVolume() {
    const { ac, master } = this
    if (!ac || !master) return
    const at = ac.currentTime
    master.gain.cancelScheduledValues(at)
    if (this.audible) master.gain.setTargetAtTime(this.config.volume, at, .015)
    else master.gain.setValueAtTime(0, at)
  }

  play(cue: ConsoleCue, position = 0) {
    const ac = this.ac
    const bus = this.cues
    if (!this.audible || !bus || ac?.state !== 'running') return
    const t = ac.currentTime + .005
    switch (cue) {
      case 'move': {
        const pitch = 2093 * 2 ** ((Math.max(0, position) % 5) / 24)
        this.tone(bus, pitch, t, .055, .13, .0015)
        this.tone(bus, pitch * 2, t, .025, .13 * .25, .001)
        this.noise(bus, t, .02, 6000, 9000, .02, 3)
        break
      }
      case 'hover':
        if (performance.now() - this.lastHover < 55) break
        this.lastHover = performance.now()
        this.tone(bus, 3136, t, .03, .04, .001)
        break
      case 'select':
        this.bell(bus, 1318.5, t, .5, .14)
        this.bell(bus, 1975.5, t + .05, .7, .11)
        break
      case 'back':
        this.bell(bus, 1174.7, t, .28, .10)
        this.bell(bus, 880, t + .06, .4, .08)
        break
      case 'tab':
        this.tone(bus, 1568, t, .09, .08, .002, 'triangle')
        this.tone(bus, 2349, t + .03, .12, .05, .002)
        break
      case 'open':
        this.noise(bus, t, .45, 260, 3200, .09, .9)
        this.bell(bus, 988, t + .16, .52, .09)
        this.bell(bus, 1480, t + .22, .66, .08)
        break
      case 'close':
        this.noise(bus, t, .45, 3200, 260, .07, .9)
        break
      case 'toggleOn':
        this.bell(bus, 1760, t, .25, .09)
        this.bell(bus, 2637, t + .06, .35, .07)
        break
      case 'toggleOff':
        this.bell(bus, 2093, t, .22, .08)
        this.bell(bus, 1396.9, t + .06, .3, .06)
        break
      case 'start':
        this.startup(bus, t)
        break
    }
  }

  private voice(bus: GainNode, source: AudioScheduledSourceNode, stop: number, nodes: AudioNode[], start: number) {
    const voice: Voice = { source, bus, cleanup: () => {
      this.voices.delete(voice)
      source.disconnect()
      nodes.forEach(node => node.disconnect())
    } }
    this.voices.add(voice)
    source.onended = voice.cleanup
    source.start(start)
    source.stop(stop)
  }

  private envelope(param: AudioParam, when: number, duration: number, amplitude: number, attack: number) {
    param.setValueAtTime(silence, when)
    param.exponentialRampToValueAtTime(amplitude, when + attack)
    param.exponentialRampToValueAtTime(silence, when + duration)
  }

  private tone(bus: GainNode, hz: number, when: number, duration: number, amplitude: number, attack: number, type: OscillatorType = 'sine') {
    const ac = bus.context
    const source = ac.createOscillator()
    const gain = ac.createGain()
    source.type = type
    source.frequency.value = hz
    this.envelope(gain.gain, when, duration, amplitude, attack)
    source.connect(gain).connect(bus)
    this.voice(bus, source, when + duration, [gain], when)
  }

  private bell(bus: GainNode, hz: number, when: number, duration: number, amplitude: number) {
    this.tone(bus, hz, when, duration, amplitude, .002)
    this.tone(bus, hz * 2.76, when, duration * .45, amplitude * .32, .001)
    this.tone(bus, hz * 5.4, when, duration * .18, amplitude * .12, .001)
  }

  private noise(bus: GainNode, when: number, duration: number, from: number, to: number, amplitude: number, q: number) {
    const ac = bus.context
    if (!this.noiseBuffer) return
    const source = ac.createBufferSource()
    const filter = ac.createBiquadFilter()
    const gain = ac.createGain()
    source.buffer = this.noiseBuffer
    filter.type = 'bandpass'
    filter.Q.value = q
    filter.frequency.setValueAtTime(from, when)
    filter.frequency.exponentialRampToValueAtTime(to, when + duration)
    this.envelope(gain.gain, when, duration, amplitude, duration * .35)
    source.connect(filter).connect(gain).connect(bus)
    this.voice(bus, source, when + duration, [filter, gain], when)
  }

  private sustain(bus: GainNode, voices: readonly number[], when: number, duration: number, filter: BiquadFilterNode,
    envelope: GainNode, detune: (index: number) => number, lfo?: OscillatorNode, lfoGain?: GainNode) {
    const end = when + duration
    filter.connect(envelope).connect(bus)
    for (const [index, frequency] of voices.entries()) {
      for (const direction of [-1, 1]) {
        const osc = bus.context.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = frequency
        osc.detune.value = direction * detune(index)
        osc.connect(filter)
        // One voice owns the shared chord nodes. All oscillators end together.
        const shared = index === voices.length - 1 && direction === 1 ? [filter, envelope] : []
        this.voice(bus, osc, end, shared, when)
      }
    }
    if (lfo && lfoGain) this.voice(bus, lfo, end, [lfoGain], when)
  }

  private startup(bus: GainNode, when: number) {
    const filter = bus.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 2
    filter.frequency.setValueAtTime(250, when)
    filter.frequency.exponentialRampToValueAtTime(3200, when + 2.2)
    filter.frequency.exponentialRampToValueAtTime(900, when + 4.5)
    const gain = bus.context.createGain()
    this.envelope(gain.gain, when, 4.5, .11, 1.8)
    this.sustain(bus, startChord, when, 4.5, filter, gain, index => 6 + index)
    startBells.forEach((frequency, index) => this.bell(bus, frequency, when + 1.75 + index * .17, 1.55, .09))
  }

  private refreshMusic() {
    const bus = this.musicBus
    if (!this.audible || !this.config.music || this.ac?.state !== 'running' || !bus) {
      this.stopMusic()
      return
    }
    if (this.musicTimer !== undefined) return
    const chord = () => {
      const ac = bus.context
      const when = ac.currentTime + .05
      const filter = ac.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 520
      filter.Q.value = .8
      const lfo = ac.createOscillator()
      const depth = ac.createGain()
      lfo.frequency.value = .08
      depth.gain.value = 260
      lfo.connect(depth).connect(filter.frequency)
      const gain = ac.createGain()
      gain.gain.setValueAtTime(silence, when)
      gain.gain.exponentialRampToValueAtTime(.05, when + music.fade)
      gain.gain.setValueAtTime(.05, when + music.duration - music.fade)
      gain.gain.exponentialRampToValueAtTime(silence, when + music.duration)
      this.sustain(bus, music.chords[this.chord % music.chords.length], when, music.duration, filter, gain, () => 7, lfo, depth)
      if (this.chord % 2 === 0) [880, 1318.5, 1174.7].forEach((hz, i) => this.bell(bus, hz, when + 2 + i * 2.4, 3, .018))
      this.chord++
    }
    bus.gain.cancelScheduledValues(bus.context.currentTime)
    bus.gain.setTargetAtTime(1, bus.context.currentTime, .12)
    chord()
    this.musicTimer = window.setInterval(chord, music.cycle)
  }

  private stopMusic() {
    if (this.musicTimer === undefined || !this.musicBus) return
    window.clearInterval(this.musicTimer)
    this.musicTimer = undefined
    const bus = this.musicBus
    const when = bus.context.currentTime
    bus.gain.cancelScheduledValues(when)
    bus.gain.setTargetAtTime(0, when, .06)
    for (const voice of this.voices) if (voice.bus === bus) voice.source.stop(when + .3)
  }

  private cut() {
    this.stopMusic()
    for (const voice of this.voices) voice.source.stop()
    if (this.convolver) {
      this.cues?.disconnect(this.convolver)
      this.musicBus?.disconnect(this.convolver)
      this.convolver.disconnect()
      this.connectReverb()
    }
  }

  dispose() {
    this.cut()
    if (this.ac && this.ac.state !== 'closed') void this.ac.close().catch(() => {})
    this.ac = undefined
    this.unlock = undefined
    this.master = this.cues = this.musicBus = this.wet = this.convolver = undefined
    this.impulse = this.noiseBuffer = undefined
  }
}
