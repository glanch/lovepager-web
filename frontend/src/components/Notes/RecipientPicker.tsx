import { useQuery } from "@tanstack/react-query"
import { Check, X } from "lucide-react"
import { useEffect, useState } from "react"

import { type UserSearchResult, UsersService } from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface RecipientPickerProps {
  value: UserSearchResult | null
  onChange: (user: UserSearchResult | null) => void
}

export function RecipientPicker({ value, onChange }: RecipientPickerProps) {
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const { data: results, isFetching } = useQuery({
    queryKey: ["userSearch", debounced],
    queryFn: async () =>
      (await UsersService.searchUsers({ query: { q: debounced } })).data.data,
    enabled: debounced.length > 0 && !value,
  })

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {value.full_name || value.email}
          </span>
          {value.full_name && (
            <span className="text-xs text-muted-foreground">{value.email}</span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => {
            onChange(null)
            setSearch("")
            setDebounced("")
          }}
        >
          <X className="size-4" />
          <span className="sr-only">Clear recipient</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        placeholder="Search by name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoComplete="off"
      />
      {debounced.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {isFetching && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Searching…
            </div>
          )}
          {!isFetching && results && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No users found
            </div>
          )}
          {!isFetching &&
            results?.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => onChange(user)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent",
                )}
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {user.full_name || user.email}
                  </span>
                  {user.full_name && (
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                </span>
                <Check className="size-4 opacity-0" />
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
