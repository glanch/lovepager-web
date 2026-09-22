import type { ColumnDef } from "@tanstack/react-table"

import type { NotePublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { DeliveryStatus } from "./DeliveryStatus"

function formatDate(value?: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString()
}

export const columns: ColumnDef<NotePublic>[] = [
  {
    accessorKey: "recipient_name",
    header: "To",
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.recipient_name || "Unknown"}
      </span>
    ),
  },
  {
    accessorKey: "text",
    header: "Message",
    cell: ({ row }) => (
      <span className="max-w-xs truncate block text-muted-foreground">
        {row.original.text}
      </span>
    ),
  },
  {
    id: "delivery",
    header: "Received",
    cell: ({ row }) => {
      const { received_count = 0, delivered_count = 0 } = row.original
      return (
        <Badge
          variant={
            delivered_count > 0 && received_count === delivered_count
              ? "default"
              : "secondary"
          }
        >
          {received_count}/{delivered_count}
        </Badge>
      )
    },
  },
  {
    accessorKey: "created_at",
    header: "Sent",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.created_at)}
      </span>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DeliveryStatus noteId={row.original.id} />
      </div>
    ),
  },
]
