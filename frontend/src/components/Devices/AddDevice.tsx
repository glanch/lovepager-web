import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type DeviceRegistrationInfo, DevicesService } from "@/client"
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import { DeviceQr } from "./DeviceQr"

const formSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
})

type FormData = z.infer<typeof formSchema>

const AddDevice = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [registration, setRegistration] =
    useState<DeviceRegistrationInfo | null>(null)
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: { name: "" },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      DevicesService.createDevice({ body: data }),
    onSuccess: (response) => {
      setRegistration(response.data)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] })
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate(data)
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      // Reset once the dialog is fully closed
      setRegistration(null)
      form.reset()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="my-4">
          <Plus className="mr-2" />
          Add Device
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {registration ? (
          <>
            <DialogHeader>
              <DialogTitle>Register your device</DialogTitle>
              <DialogDescription>
                Scan the code below with the gadget to complete setup.
              </DialogDescription>
            </DialogHeader>
            <DeviceQr info={registration} />
            <DialogFooter>
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add Device</DialogTitle>
              <DialogDescription>
                Give your pager a name. We'll generate a QR code to link it.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="grid gap-4 py-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Name <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Kitchen pager"
                            type="text"
                            {...field}
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" disabled={mutation.isPending}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <LoadingButton type="submit" loading={mutation.isPending}>
                    Generate QR
                  </LoadingButton>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default AddDevice
