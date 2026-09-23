import { Mic, RotateCcw, Square } from "lucide-react"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { MAX_RECORDING_MS, useAudioRecorder } from "@/hooks/useAudioRecorder"

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export interface AudioRecorderValue {
  blob: Blob
  durationMs: number
}

interface AudioRecorderProps {
  onChange: (value: AudioRecorderValue | null) => void
}

export function AudioRecorder({ onChange }: AudioRecorderProps) {
  const recorder = useAudioRecorder()

  const handleStart = async () => {
    await recorder.start()
  }

  const handleStop = () => {
    recorder.stop()
  }

  const handleReset = () => {
    recorder.reset()
    onChange(null)
  }

  // Report the recorded clip to the parent once recording stops.
  useEffect(() => {
    if (recorder.audioBlob) {
      onChange({ blob: recorder.audioBlob, durationMs: recorder.durationMs })
    }
  }, [recorder.audioBlob, recorder.durationMs, onChange])

  if (recorder.error) {
    return <p className="text-sm text-destructive">{recorder.error}</p>
  }

  if (recorder.audioUrl) {
    return (
      <div className="flex flex-col gap-2">
        <audio src={recorder.audioUrl} controls className="w-full" />
        <Button type="button" variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Re-record
        </Button>
      </div>
    )
  }

  if (recorder.isRecording) {
    return (
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleStop}
        >
          <Square className="mr-2 h-3.5 w-3.5" />
          Stop
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatDuration(recorder.elapsedMs)} /{" "}
          {formatDuration(MAX_RECORDING_MS)}
        </span>
      </div>
    )
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleStart}>
      <Mic className="mr-2 h-3.5 w-3.5" />
      Record voice note
    </Button>
  )
}
