import { useQuery } from "@tanstack/react-query"
import { Check, Clock } from "lucide-react"
import { useState } from "react"

import { NotesService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface DeliveryStatusProps {
  noteId: string
}

export function DeliveryStatus({ noteId }: DeliveryStatusProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { data: note, isLoading } = useQuery({
    queryKey: ["note", noteId],
    queryFn: async () =>
      (await NotesService.readNote({ path: { id: noteId } })).data,
    enabled: isOpen,
  })

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delivery status</DialogTitle>
          <DialogDescription>
            Which of the recipient's devices have shown this note.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {note && (
            <p className="rounded-md bg-muted p-3 text-sm">{note.text}</p>
          )}
          {note?.deliveries && note.deliveries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              The recipient has no active devices yet.
            </p>
          )}
          {note?.deliveries?.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <span className="text-sm font-medium">{d.device_name}</span>
              {d.received ? (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <Check className="size-4" />
                  {d.received_at
                    ? new Date(d.received_at).toLocaleString()
                    : "Received"}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  Pending
                </span>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
