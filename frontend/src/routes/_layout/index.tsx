import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Heart, RotateCcw, Send, Settings } from "lucide-react"
import { useState } from "react"

import { type NoteCreate, NotesService, UsersService } from "@/client"
import { AudioPlayer } from "@/components/Notes/AudioPlayer"
import {
  AudioRecorder,
  type AudioRecorderValue,
} from "@/components/Notes/AudioRecorder"
import { sendAudioNote } from "@/components/Notes/ComposeNote"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LoadingButton } from "@/components/ui/loading-button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [{ title: "LovePager" }],
  }),
})

function formatRelativeTime(value?: string | null): string {
  if (!value) return ""
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function NoPartnerCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900">
          <Heart className="h-7 w-7 text-pink-400" />
        </div>
        <div>
          <p className="font-semibold text-lg">No partner set</p>
          <p className="text-muted-foreground text-sm mt-1">
            Connect with your partner to start sending them love notes.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/settings">
            <Settings className="mr-2 h-4 w-4" />
            Go to Settings
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

interface QuickSendProps {
  partnerId: string
  partnerName: string
  text: string
  setText: (t: string) => void
}

function QuickSend({ partnerId, partnerName, text, setText }: QuickSendProps) {
  const [mode, setMode] = useState<"text" | "voice">("text")
  const [audioValue, setAudioValue] = useState<AudioRecorderValue | null>(null)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const onSuccess = () => {
    showSuccessToast(`Note sent to ${partnerName}`)
    setText("")
    setAudioValue(null)
  }
  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: ["notes"] })
  }

  const textMutation = useMutation({
    mutationFn: (body: NoteCreate) => NotesService.createNote({ body }),
    onSuccess,
    onError: handleError.bind(showErrorToast),
    onSettled,
  })

  const audioMutation = useMutation({
    mutationFn: sendAudioNote,
    onSuccess,
    onError: handleError.bind(showErrorToast),
    onSettled,
  })

  const isPending = textMutation.isPending || audioMutation.isPending

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "text" | "voice")}>
        <TabsList className="w-full">
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === "text" ? (
        <Textarea
          placeholder={`Write a note to ${partnerName}…`}
          value={text}
          maxLength={1000}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          className="resize-none"
        />
      ) : (
        <AudioRecorder onChange={setAudioValue} />
      )}
      <div className="flex items-center justify-between">
        {mode === "text" ? (
          <span className="text-xs text-muted-foreground">
            {text.length}/1000
          </span>
        ) : (
          <span />
        )}
        <LoadingButton
          type="button"
          loading={isPending}
          disabled={mode === "text" ? !text.trim() : !audioValue}
          onClick={() =>
            mode === "text"
              ? textMutation.mutate({
                  recipient_id: partnerId,
                  text: text.trim(),
                  min_retention: "PT3600S",
                  max_retention: null,
                })
              : audioValue &&
                audioMutation.mutate({
                  recipientId: partnerId,
                  audio: audioValue,
                  minRetention: "PT3600S",
                  maxRetention: null,
                })
          }
        >
          <Send className="mr-2 h-4 w-4" />
          Send
        </LoadingButton>
      </div>
    </div>
  )
}

interface RecentNote {
  id: string
  text?: string
  created_at?: string | null
  received_count?: number
  delivered_count?: number
  media_type?: string
  audio_duration_ms?: number | null
}

function RecentNoteItem({
  note,
  onRetrigger,
}: {
  note: RecentNote
  onRetrigger: (text: string) => void
}) {
  const allReceived =
    (note.delivered_count ?? 0) > 0 &&
    note.received_count === note.delivered_count
  const isAudio = note.media_type === "audio"

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0">
        {isAudio ? (
          <AudioPlayer noteId={note.id} durationMs={note.audio_duration_ms} />
        ) : (
          <p className="text-sm truncate">{note.text}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(note.created_at)}
          </span>
          <Badge
            variant={allReceived ? "default" : "secondary"}
            className="text-xs h-4 px-1"
          >
            {note.received_count ?? 0}/{note.delivered_count ?? 0}
          </Badge>
        </div>
      </div>
      {!isAudio && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          title="Resend"
          onClick={() => onRetrigger(note.text ?? "")}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="sr-only">Resend</span>
        </Button>
      )}
    </div>
  )
}

function PartnerDashboard({ partnerId }: { partnerId: string }) {
  const [text, setText] = useState("")

  const { data: partner } = useQuery({
    queryKey: ["partner", partnerId],
    queryFn: async () =>
      (await UsersService.readUserById({ path: { user_id: partnerId } })).data,
  })

  const { data: notesData } = useQuery({
    queryKey: ["notes"],
    queryFn: async () =>
      (await NotesService.readNotes({ query: { skip: 0, limit: 10 } })).data,
    refetchInterval: 30_000,
  })

  const partnerName = partner?.full_name || partner?.email || "your partner"

  const recentNotes = (notesData?.data ?? [])
    .filter((n) => n.recipient_id === partnerId)
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-pink-500" />
            <CardTitle className="text-base">{partnerName}</CardTitle>
          </div>
          <CardDescription>Send them a note</CardDescription>
        </CardHeader>
        <CardContent>
          <QuickSend
            partnerId={partnerId}
            partnerName={partnerName}
            text={text}
            setText={setText}
          />
        </CardContent>
      </Card>

      {recentNotes.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Recent notes
          </h2>
          <Card>
            <CardContent className="px-4 py-0">
              {recentNotes.map((note) => (
                <RecentNoteItem
                  key={note.id}
                  note={note}
                  onRetrigger={(t) => setText(t)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function Dashboard() {
  const { user: currentUser } = useAuth()

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hi, {currentUser?.full_name || currentUser?.email}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {currentUser?.partner_id
            ? "Ready to send a note?"
            : "Welcome to LovePager"}
        </p>
      </div>

      {currentUser?.partner_id ? (
        <PartnerDashboard partnerId={currentUser.partner_id} />
      ) : (
        <NoPartnerCard />
      )}
    </div>
  )
}
