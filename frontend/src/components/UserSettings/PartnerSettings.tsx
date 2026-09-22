import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Heart, X } from "lucide-react"

import { UsersService } from "@/client"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { RecipientPicker } from "@/components/Notes/RecipientPicker"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import { useState } from "react"
import type { UserSearchResult } from "@/client"

const PartnerSettings = () => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { user: currentUser } = useAuth()
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<UserSearchResult | null>(null)

  const { data: partner } = useQuery({
    queryKey: ["partner", currentUser?.partner_id],
    queryFn: async () =>
      (await UsersService.readUserById({ path: { user_id: currentUser!.partner_id! } })).data,
    enabled: !!currentUser?.partner_id,
  })

  const mutation = useMutation({
    mutationFn: (partner_id: string | null) =>
      UsersService.updateUserMe({ body: { partner_id } }),
    onSuccess: (_data, partner_id) => {
      showSuccessToast(partner_id !== null ? "Partner updated" : "Partner removed")
      setPicking(false)
      setSelected(null)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      queryClient.invalidateQueries({ queryKey: ["partner"] })
    },
  })

  const partnerName = partner?.full_name || partner?.email

  return (
    <div className="max-w-md">
      <h3 className="text-lg font-semibold py-4">Your Partner</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Your partner is the person who receives your notes. They need to have a
        LovePager account.
      </p>

      {currentUser?.partner_id && partner ? (
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900">
              <Heart className="h-4 w-4 text-pink-500" />
            </div>
            <div>
              <p className="font-medium">{partnerName}</p>
              {partner.full_name && (
                <p className="text-xs text-muted-foreground">{partner.email}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPicking(true)
                setSelected(null)
              }}
            >
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => mutation.mutate(null)}
              disabled={mutation.isPending}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remove partner</span>
            </Button>
          </div>
        </div>
      ) : (
        !picking && (
          <Button type="button" onClick={() => setPicking(true)}>
            <Heart className="mr-2 h-4 w-4" />
            Set partner
          </Button>
        )
      )}

      {picking && (
        <div className="mt-4 flex flex-col gap-3">
          <RecipientPicker value={selected} onChange={setSelected} />
          <div className="flex gap-2">
            <LoadingButton
              type="button"
              loading={mutation.isPending}
              disabled={!selected}
              onClick={() => selected && mutation.mutate(selected.id)}
            >
              Confirm
            </LoadingButton>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPicking(false)
                setSelected(null)
              }}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PartnerSettings
