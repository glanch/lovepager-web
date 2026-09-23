import { Loader2, Play } from "lucide-react"
import { useState } from "react"

import { client } from "@/client/client.gen"
import { Button } from "@/components/ui/button"

function formatDuration(ms?: number | null): string {
  if (!ms) return ""
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

interface AudioPlayerProps {
  noteId: string
  durationMs?: number | null
}

// The audio stream endpoint is JWT-protected, so a plain <audio src="..."> tag
// can't be used directly (the browser sends no Authorization header for media
// elements). Instead, fetch the clip as an authenticated blob on first play.
export function AudioPlayer({ noteId, durationMs }: AudioPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const handlePlay = async () => {
    if (audioUrl || loading) return
    setLoading(true)
    setError(false)
    try {
      const response = await client.get<{ 200: Blob }, unknown, true>({
        url: "/api/v1/notes/{id}/audio",
        path: { id: noteId },
        security: [{ scheme: "bearer", type: "http" }],
        responseType: "blob",
      })
      setAudioUrl(URL.createObjectURL(response.data))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return <span className="text-sm text-destructive">Couldn't load audio</span>
  }

  if (audioUrl) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: voice notes have no captions
      <audio src={audioUrl} controls autoPlay className="h-8 max-w-full" />
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handlePlay}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Play className="mr-2 h-3.5 w-3.5" />
      )}
      Voice note {formatDuration(durationMs)}
    </Button>
  )
}
