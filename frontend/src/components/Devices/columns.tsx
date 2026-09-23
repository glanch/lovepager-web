import type { ColumnDef } from "@tanstack/react-table"

import type { DevicePublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { DeviceActionsMenu } from "./DeviceActionsMenu"

function formatLastSeen(value?: string | null): string {
  if (!value) return "Never"
  return new Date(value).toLocaleString()
}

export const columns: ColumnDef<DevicePublic>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const active = row.original.status === "active"
      return (
        <Badge variant={active ? "default" : "secondary"}>
          {active ? "Active" : "Pending"}
        </Badge>
      )
    },
  },
  {
    accessorKey: "last_seen_at",
    header: "Last seen",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatLastSeen(row.original.last_seen_at)}
      </span>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DeviceActionsMenu device={row.original} />
      </div>
    ),
  },
]
