"use client"

import * as React from "react"
import { Check, ChevronsUpDown, User } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { MemberAvatar } from "@/components/ui/member-avatar"

interface Member {
  id: string
  name: string
  email?: string
  avatar?: string
  avatar_url?: string
  initials?: string
}

interface MemberComboboxProps {
  members: Member[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}

export function MemberCombobox({
  members,
  value,
  onValueChange,
  placeholder = "Select member...",
  emptyText = "No member found.",
  disabled = false,
  className,
}: MemberComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedMember = React.useMemo(
    () => members.find((member) => member.id === value),
    [members, value]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          {selectedMember ? (
            <div className="flex items-center gap-2">
              <MemberAvatar name={selectedMember.name} src={selectedMember.avatar_url || selectedMember.avatar} size="sm" />
              <span className="truncate">{selectedMember.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{placeholder}</span>
            </div>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search members..." />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {/* No selection option */}
              <CommandItem
                value="none"
                onSelect={() => {
                  onValueChange("none")
                  setOpen(false)
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center">
                    <User className="h-3 w-3 text-muted-foreground/50" />
                  </div>
                  <span className="text-muted-foreground">No assignment</span>
                </div>
                <Check
                  className={cn(
                    "ml-auto h-4 w-4",
                    value === "none" ? "opacity-100" : "opacity-0"
                  )}
                />
              </CommandItem>

              {/* Member options */}
              {members.map((member) => (
                <CommandItem
                  key={member.id}
                  value={`${member.name} ${member.email || ""}`}
                  onSelect={() => {
                    onValueChange(member.id)
                    setOpen(false)
                  }}
                >
                  <div className="flex items-center gap-2">
                    <MemberAvatar name={member.name} src={member.avatar_url || member.avatar} size="sm" />
                    <div className="flex flex-col">
                      <span className="font-medium">{member.name}</span>
                      {member.email && (
                        <span className="text-xs text-muted-foreground">
                          {member.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === member.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
