import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { type ReactNode, useState } from "react"
import {
  type NoteCreate,
  type NotePublic,
  NotesService,
  type UserSearchResult,
} from "@/client"
import { client } from "@/client/client.gen"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import { AudioRecorder, type AudioRecorderValue } from "./AudioRecorder"
import { RecipientPicker } from "./RecipientPicker"

export async function sendAudioNote(params: {
  recipientId: string
  audio: AudioRecorderValue
  minRetention: string
  maxRetention: string | null
}): Promise<NotePublic> {
  const form = new FormData()
  form.append("recipient_id", params.recipientId)
  form.append("audio", params.audio.blob, "note.wav")
  form.append("duration_ms", String(Math.round(params.audio.durationMs)))
  form.append("min_retention", params.minRetention)
  if (params.maxRetention) form.append("max_retention", params.maxRetention)
  const response = await client.post<{ 200: NotePublic }, unknown, true>({
    url: "/api/v1/notes/audio",
    body: form,
    security: [{ scheme: "bearer", type: "http" }],
  })
  return response.data
}

// Retention presets, in seconds. "0" for max means "Never" (infinite).
const MIN_OPTIONS = [
  { label: "15 minutes", value: "900" },
  { label: "1 hour", value: "3600" },
  { label: "6 hours", value: "21600" },
  { label: "24 hours", value: "86400" },
]

const MAX_OPTIONS = [
  { label: "Never", value: "0" },
  { label: "1 hour", value: "3600" },
  { label: "6 hours", value: "21600" },
  { label: "24 hours", value: "86400" },
  { label: "7 days", value: "604800" },
]

const secondsToIso = (seconds: number) => `PT${seconds}S`

interface ComposeNoteProps {
  /** Pre-set recipient — hides the picker and sends directly to this user */
  fixedRecipient?: UserSearchResult | null
  /** Pre-fill the message text, e.g. when retriggering a previous note */
  defaultText?: string
  /** Label shown on the trigger button */
  triggerLabel?: ReactNode
}

const ComposeNote = ({
  fixedRecipient,
  defaultText = "",
  triggerLabel,
}: ComposeNoteProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<"text" | "voice">("text")
  const [recipient, setRecipient] = useState<UserSearchResult | null>(
    fixedRecipient ?? null,
  )
  const [text, setText] = useState(defaultText)
  const [audioValue, setAudioValue] = useState<AudioRecorderValue | null>(null)
  const [minRetention, setMinRetention] = useState("3600")
  const [maxRetention, setMaxRetention] = useState("0")
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const reset = () => {
    setMode("text")
    setRecipient(fixedRecipient ?? null)
    setText(defaultText)
    setAudioValue(null)
    setMinRetention("3600")
    setMaxRetention("0")
    setError(null)
  }

  const onSuccess = () => {
    showSuccessToast("Note sent")
    reset()
    setIsOpen(false)
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

  const onSubmit = () => {
    setError(null)
    if (!recipient) {
      setError("Please pick a recipient")
      return
    }
    const maxSeconds = Number(maxRetention)
    const maxRetentionIso = maxSeconds === 0 ? null : secondsToIso(maxSeconds)
    if (mode === "text") {
      if (!text.trim()) {
        setError("Please enter a message")
        return
      }
      textMutation.mutate({
        recipient_id: recipient.id,
        text: text.trim(),
        min_retention: secondsToIso(Number(minRetention)),
        max_retention: maxRetentionIso,
      })
    } else {
      if (!audioValue) {
        setError("Please record a voice note")
        return
      }
      audioMutation.mutate({
        recipientId: recipient.id,
        audio: audioValue,
        minRetention: secondsToIso(Number(minRetention)),
        maxRetention: maxRetentionIso,
      })
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) reset()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="my-4">
          <Send className="mr-2" />
          {triggerLabel ?? "New Note"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a Note</DialogTitle>
          <DialogDescription>
            {fixedRecipient
              ? `Sending to ${fixedRecipient.full_name || fixedRecipient.email}`
              : "Your note is delivered to the recipient's active devices."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {!fixedRecipient && (
            <div className="grid gap-2">
              <Label>
                Recipient <span className="text-destructive">*</span>
              </Label>
              <RecipientPicker value={recipient} onChange={setRecipient} />
            </div>
          )}
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "text" | "voice")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="voice">Voice</TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === "text" ? (
            <div className="grid gap-2">
              <Label htmlFor="note-text">
                Message <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="note-text"
                placeholder="What's the page?"
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>
                Voice note <span className="text-destructive">*</span>
              </Label>
              <AudioRecorder onChange={setAudioValue} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Min retention</Label>
              <Select value={minRetention} onValueChange={setMinRetention}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MIN_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Max retention</Label>
              <Select value={maxRetention} onValueChange={setMaxRetention}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <LoadingButton type="button" loading={isPending} onClick={onSubmit}>
            Send
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ComposeNote
