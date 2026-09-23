import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Radio } from "lucide-react"
import { Suspense } from "react"

import { DevicesService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import AddDevice from "@/components/Devices/AddDevice"
import { columns } from "@/components/Devices/columns"
import PendingItems from "@/components/Pending/PendingItems"

function getDevicesQueryOptions() {
  return {
    queryFn: async () =>
      (await DevicesService.readDevices({ query: { skip: 0, limit: 100 } }))
        .data,
    queryKey: ["devices"],
  }
}

export const Route = createFileRoute("/_layout/devices")({
  component: Devices,
  head: () => ({
    meta: [{ title: "Devices - LovePager" }],
  }),
})

function DevicesTableContent() {
  const { data: devices } = useSuspenseQuery(getDevicesQueryOptions())

  if (devices.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Radio className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">
          You don't have any devices yet
        </h3>
        <p className="text-muted-foreground">
          Add a device to start receiving notes
        </p>
      </div>
    )
  }

  return <DataTable columns={columns} data={devices.data} />
}

function DevicesTable() {
  return (
    <Suspense fallback={<PendingItems />}>
      <DevicesTableContent />
    </Suspense>
  )
}

function Devices() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Devices</h1>
          <p className="text-muted-foreground">
            Register and manage your pager devices
          </p>
        </div>
        <AddDevice />
      </div>
      <DevicesTable />
    </div>
  )
}
