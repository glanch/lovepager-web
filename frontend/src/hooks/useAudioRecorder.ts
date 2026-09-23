import { useCallback, useRef, useState } from "react"

// The gadget has no Opus/MP3 decoder, so every audio note — browser or
// gadget-recorded — must be raw 16 kHz mono PCM/WAV.
const TARGET_SAMPLE_RATE = 16000
export const MAX_RECORDING_MS = 30_000

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return output
}

function downsampleTo16k(
  input: Float32Array,
  inputSampleRate: number,
): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return input
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE
  const outputLength = Math.floor(input.length / ratio)
  const output = new Float32Array(outputLength)
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio
    const i0 = Math.floor(srcIndex)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = srcIndex - i0
    output[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return output
}

function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate (mono, 16-bit)
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    view.setInt16(offset, samples[i], true)
  }

  return new Blob([buffer], { type: "audio/wav" })
}

interface RecorderState {
  isRecording: boolean
  elapsedMs: number
  audioBlob: Blob | null
  audioUrl: string | null
  durationMs: number
  error: string | null
}

const initialState: RecorderState = {
  isRecording: false,
  elapsedMs: 0,
  audioBlob: null,
  audioUrl: null,
  durationMs: 0,
  error: null,
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>(initialState)

  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const muteNodeRef = useRef<GainNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const startTimeRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect()
    muteNodeRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    audioContextRef.current?.close()
    processorRef.current = null
    muteNodeRef.current = null
    sourceRef.current = null
    streamRef.current = null
    audioContextRef.current = null
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    const audioContext = audioContextRef.current
    if (!audioContext) return

    const sampleRate = audioContext.sampleRate
    const totalLength = chunksRef.current.reduce((sum, c) => sum + c.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    chunksRef.current = []

    const downsampled = downsampleTo16k(merged, sampleRate)
    const pcm = floatTo16BitPCM(downsampled)
    const blob = encodeWav(pcm, TARGET_SAMPLE_RATE)
    const durationMs = Math.round(
      (downsampled.length / TARGET_SAMPLE_RATE) * 1000,
    )

    cleanup()
    setState((s) => ({
      ...s,
      isRecording: false,
      audioBlob: blob,
      audioUrl: URL.createObjectURL(blob),
      durationMs,
    }))
  }, [cleanup])

  const start = useCallback(async () => {
    setState((s) => {
      if (s.audioUrl) URL.revokeObjectURL(s.audioUrl)
      return { ...s, error: null, audioBlob: null, audioUrl: null }
    })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      sourceRef.current = source
      // ScriptProcessorNode only runs while connected to a destination; route
      // through a silent gain node so recording doesn't play the mic live.
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      const muteNode = audioContext.createGain()
      muteNode.gain.value = 0
      muteNodeRef.current = muteNode
      chunksRef.current = []

      processor.onaudioprocess = (event) => {
        chunksRef.current.push(
          new Float32Array(event.inputBuffer.getChannelData(0)),
        )
      }

      source.connect(processor)
      processor.connect(muteNode)
      muteNode.connect(audioContext.destination)

      startTimeRef.current = Date.now()
      setState((s) => ({ ...s, isRecording: true, elapsedMs: 0 }))
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current
        if (elapsed >= MAX_RECORDING_MS) {
          stop()
          return
        }
        setState((s) => ({ ...s, elapsedMs: elapsed }))
      }, 200)
    } catch {
      setState((s) => ({ ...s, error: "Microphone access denied" }))
    }
  }, [stop])

  const reset = useCallback(() => {
    setState((s) => {
      if (s.audioUrl) URL.revokeObjectURL(s.audioUrl)
      return initialState
    })
  }, [])

  return { ...state, start, stop, reset }
}
