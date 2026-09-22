import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { type ReactNode, useState } from "react"

import {
  type NoteCreate,
  NotesService,
  type UserSearchResult,
} from "@/client"
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
import { Textarea } from "@/components/ui/textarea"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import { RecipientPicker } from "./RecipientPicker"

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
  const [recipient, setRecipient] = useState<UserSearchResult | null>(
    fixedRecipient ?? null,
  )
  const [text, setText] = useState(defaultText)
  const [minRetention, setMinRetention] = useState("3600")
  const [maxRetention, setMaxRetention] = useState("0")
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const reset = () => {
    setRecipient(fixedRecipient ?? null)
    setText(defaultText)
    setMinRetention("3600")
    setMaxRetention("0")
    setError(null)
  }

  const mutation = useMutation({
    mutationFn: (body: NoteCreate) => NotesService.createNote({ body }),
    onSuccess: () => {
      showSuccessToast("Note sent")
      reset()
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] })
    },
  })

  const onSubmit = () => {
    setError(null)
    if (!recipient) {
      setError("Please pick a recipient")
      return
    }
    if (!text.trim()) {
      setError("Please enter a message")
      return
    }
    const maxSeconds = Number(maxRetention)
    mutation.mutate({
      recipient_id: recipient.id,
      text: text.trim(),
      min_retention: secondsToIso(Number(minRetention)),
      max_retention: maxSeconds === 0 ? null : secondsToIso(maxSeconds),
    })
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
            <Button variant="outline" disabled={mutation.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <LoadingButton
            type="button"
            loading={mutation.isPending}
            onClick={onSubmit}
          >
            Send
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ComposeNote
