// Poweramp-grade WebAudio Engine with 10-Band Graphic Equalizer, Bass Boost & Real-Time Analyser

const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export const EQ_PRESETS = {
  'Flat / Bypass': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Extreme Bass': [9, 8, 6, 3, 0, 0, 1, 2, 4, 5],
  'Audiophile Acoustic': [3, 2, 0, 1, 3, 3, 4, 3, 2, 1],
  'Rock & Metal': [5, 4, 2, -1, -2, 1, 3, 5, 6, 6],
  'Club / Electronic': [6, 5, 2, 0, -1, 2, 4, 5, 6, 5],
  'Vocal Clarity': [-2, -2, -1, 1, 4, 5, 5, 3, 1, 0],
  'Treble Boost': [-1, -1, 0, 0, 1, 2, 4, 6, 8, 9]
}

class PowerampAudioEngine {
  constructor() {
    this.audioCtx = null
    this.sourceNode = null
    this.analyser = null
    this.filters = []
    this.bassFilter = null
    this.trebleFilter = null
    this.gainNode = null
    this.connectedElement = null
    this.isInitialized = false
    this.currentPreset = 'Flat / Bypass'
    this.gains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    this.bassBoost = 0 // dB (0 to 12)
    this.trebleBoost = 0 // dB (-6 to 6)
  }

  init(audioElement) {
    if (this.isInitialized && this.connectedElement === audioElement) return
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass()
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {})
      }

      if (this.connectedElement !== audioElement) {
        if (this.sourceNode) {
          try { this.sourceNode.disconnect() } catch {}
        }
        this.connectedElement = audioElement
        this.sourceNode = this.audioCtx.createMediaElementSource(audioElement)

        // Build 10-Band BiquadFilter chain
        this.filters = EQ_FREQUENCIES.map((freq, idx) => {
          const filter = this.audioCtx.createBiquadFilter()
          if (idx === 0) {
            filter.type = 'lowshelf'
          } else if (idx === EQ_FREQUENCIES.length - 1) {
            filter.type = 'highshelf'
          } else {
            filter.type = 'peaking'
            filter.Q.value = 1.4
          }
          filter.frequency.value = freq
          filter.gain.value = this.gains[idx] || 0
          return filter
        })

        // Bass Boost Filter (Lowshelf @ 80Hz)
        this.bassFilter = this.audioCtx.createBiquadFilter()
        this.bassFilter.type = 'lowshelf'
        this.bassFilter.frequency.value = 80
        this.bassFilter.gain.value = this.bassBoost

        // Treble Filter (Highshelf @ 12000Hz)
        this.trebleFilter = this.audioCtx.createBiquadFilter()
        this.trebleFilter.type = 'highshelf'
        this.trebleFilter.frequency.value = 12000
        this.trebleFilter.gain.value = this.trebleBoost

        // Real-Time Analyser for Dynamic Waveform & Spectrum
        this.analyser = this.audioCtx.createAnalyser()
        this.analyser.fftSize = 128
        this.analyser.smoothingTimeConstant = 0.8

        // Master Gain Node
        this.gainNode = this.audioCtx.createGain()
        this.gainNode.gain.value = 1.0

        // Chain everything: Source -> EQ0..EQ9 -> Bass -> Treble -> Analyser -> Gain -> Destination
        let prevNode = this.sourceNode
        for (const f of this.filters) {
          prevNode.connect(f)
          prevNode = f
        }
        prevNode.connect(this.bassFilter)
        this.bassFilter.connect(this.trebleFilter)
        this.trebleFilter.connect(this.analyser)
        this.analyser.connect(this.gainNode)
        this.gainNode.connect(this.audioCtx.destination)

        this.isInitialized = true
        console.log('[Poweramp AudioEngine] WebAudio 10-Band DSP pipeline initialized successfully!')
      }
    } catch (e) {
      console.warn('[Poweramp AudioEngine] DSP initialization notice (standard audio will continue):', e)
    }
  }

  ensureRunning() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }
  }

  setBandGain(index, gainDb) {
    this.ensureRunning()
    this.gains[index] = gainDb
    if (this.filters[index]) {
      this.filters[index].gain.setTargetAtTime(gainDb, this.audioCtx ? this.audioCtx.currentTime : 0, 0.05)
    }
  }

  setBassBoost(db) {
    this.ensureRunning()
    this.bassBoost = db
    if (this.bassFilter) {
      this.bassFilter.gain.setTargetAtTime(db, this.audioCtx ? this.audioCtx.currentTime : 0, 0.05)
    }
  }

  setTrebleBoost(db) {
    this.ensureRunning()
    this.trebleBoost = db
    if (this.trebleFilter) {
      this.trebleFilter.gain.setTargetAtTime(db, this.audioCtx ? this.audioCtx.currentTime : 0, 0.05)
    }
  }

  applyPreset(presetName) {
    const preset = EQ_PRESETS[presetName]
    if (!preset) return
    this.currentPreset = presetName
    preset.forEach((gain, idx) => {
      this.setBandGain(idx, gain)
    })
  }

  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(64).fill(0)
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    return data
  }

  getTimeDomainData() {
    if (!this.analyser) return new Uint8Array(64).fill(128)
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteTimeDomainData(data)
    return data
  }
}

export const audioEngine = new PowerampAudioEngine()
export { EQ_FREQUENCIES }
