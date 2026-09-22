import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Send } from "lucide-react"
import { Suspense } from "react"

import { NotesService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import ComposeNote from "@/components/Notes/ComposeNote"
import { columns } from "@/components/Notes/columns"
import PendingItems from "@/components/Pending/PendingItems"

function getNotesQueryOptions() {
  return {
    queryFn: async () =>
      (await NotesService.readNotes({ query: { skip: 0, limit: 100 } })).data,
    queryKey: ["notes"],
    refetchInterval: 30_000,
  }
}

export const Route = createFileRoute("/_layout/notes")({
  component: Notes,
  head: () => ({
    meta: [{ title: "Notes - LovePager" }],
  }),
})

function NotesTableContent() {
  const { data: notes } = useSuspenseQuery(getNotesQueryOptions())

  if (notes.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Send className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">You haven't sent any notes yet</h3>
        <p className="text-muted-foreground">
          Send a note to page someone's device
        </p>
      </div>
    )
  }

  return <DataTable columns={columns} data={notes.data} />
}

function NotesTable() {
  return (
    <Suspense fallback={<PendingItems />}>
      <NotesTableContent />
    </Suspense>
  )
}

function Notes() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
          <p className="text-muted-foreground">Send and track paging notes</p>
        </div>
        <ComposeNote />
      </div>
      <NotesTable />
    </div>
  )
}
