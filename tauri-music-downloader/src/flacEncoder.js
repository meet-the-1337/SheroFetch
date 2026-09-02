// SheroFetch On-Device FLAC Lossless Encoder
// Uses official reference libFLAC compiled to JavaScript
import FlacModule from 'libflacjs/dist/libflac.min.js'

let flacInstance = null

async function getFlac() {
  if (flacInstance) return flacInstance
  return new Promise((resolve) => {
    try {
      const inst = typeof FlacModule === 'function' ? FlacModule('min') : (FlacModule.default || FlacModule)
      if (inst && typeof inst.isReady === 'function' && inst.isReady()) {
        flacInstance = inst
        return resolve(inst)
      }
      if (inst) {
        inst.onready = function () {
          flacInstance = inst
          resolve(inst)
        }
        // Timeout safeguard
        setTimeout(() => {
          if (!flacInstance && inst) {
            flacInstance = inst
            resolve(inst)
          }
        }, 1000)
      } else {
        resolve(null)
      }
    } catch (e) {
      console.warn('[FLAC] libflac initialization warning:', e)
      resolve(null)
    }
  })
}

/**
 * Encodes decoded PCM Float32 audio channels into a standard FLAC Uint8Array
 */
export async function encodePcmToFlac(audioBuffer, compressionLevel = 5) {
  const Flac = await getFlac()
  if (!Flac || typeof Flac.create_libflac_encoder !== 'function') {
    throw new Error('FLAC engine not available')
  }

  const sampleRate = audioBuffer.sampleRate || 44100
  const channels = audioBuffer.numberOfChannels || 2
  const totalSamples = audioBuffer.length
  const bps = 16

  const chunks = []
  function writeCallback(buffer, bytes) {
    chunks.push(new Uint8Array(buffer.buffer, buffer.byteOffset, bytes))
  }

  const encoder = Flac.create_libflac_encoder(sampleRate, channels, bps, compressionLevel, totalSamples, false)
  if (!encoder) throw new Error('Failed to create FLAC stream encoder')

  try {
    const initStatus = Flac.init_encoder_stream(encoder, writeCallback, () => {}, false, 0)
    if (initStatus !== 0) throw new Error(`FLAC stream init failed (status ${initStatus})`)

    const left = audioBuffer.getChannelData(0)
    const right = channels > 1 ? audioBuffer.getChannelData(1) : left
    const BLOCK_SIZE = 65536
    const blockI32 = new Int32Array(BLOCK_SIZE * channels)

    for (let offset = 0; offset < totalSamples; offset += BLOCK_SIZE) {
      const currentBlock = Math.min(BLOCK_SIZE, totalSamples - offset)
      for (let i = 0; i < currentBlock; i++) {
        const idx = offset + i
        let sL = Math.max(-1, Math.min(1, left[idx]))
        blockI32[i * channels] = sL < 0 ? Math.round(sL * 0x8000) : Math.round(sL * 0x7FFF)
        if (channels > 1) {
          let sR = Math.max(-1, Math.min(1, right[idx]))
          blockI32[i * channels + 1] = sR < 0 ? Math.round(sR * 0x8000) : Math.round(sR * 0x7FFF)
        }
      }
      const ok = Flac.FLAC__stream_encoder_process_interleaved(encoder, blockI32, currentBlock)
      if (!ok) console.warn('[FLAC] Incomplete frame processing reported at offset', offset)
    }

    Flac.FLAC__stream_encoder_finish(encoder)
  } finally {
    Flac.FLAC__stream_encoder_delete(encoder)
  }

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/**
 * Decodes input audio ArrayBuffer and encodes into standard lossless .flac bytes
 */
export async function transcodeStreamToFlac(arrayBuffer) {
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext
  if (!AudioCtxClass) {
    throw new Error('AudioContext unavailable')
  }
  const ctx = new AudioCtxClass()
  try {
    if (ctx.state === 'suspended') {
      try { await ctx.resume() } catch {}
    }
    const audioBuffer = await new Promise((resolve, reject) => {
      let settled = false
      const promiseRes = ctx.decodeAudioData(
        arrayBuffer.slice(0),
        (decoded) => {
          if (!settled) { settled = true; resolve(decoded) }
        },
        (err) => {
          if (!settled) { settled = true; reject(err || new Error('decodeAudioData failed')) }
        }
      )
      if (promiseRes && typeof promiseRes.then === 'function') {
        promiseRes.then((decoded) => {
          if (!settled) { settled = true; resolve(decoded) }
        }).catch((err) => {
          if (!settled) { settled = true; reject(err) }
        })
      }
    })

    const flacBytes = await encodePcmToFlac(audioBuffer)
    return {
      flacBytes,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels
    }
  } finally {
    try { ctx.close().catch(() => {}) } catch {}
  }
}
