import { useMemo, useState } from "react"
import { ChevronsUpDown } from "lucide-react"

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** Every IANA zone this browser knows, or an empty list on an older browser. */
function supportedTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  try {
    return intl.supportedValuesOf?.("timeZone") ?? []
  } catch {
    return []
  }
}

/** The zone this device is set to, if the browser reports one. */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/** "America/Argentina/Buenos_Aires" reads as "America / Argentina / Buenos Aires". */
function zoneLabel(zone: string): string {
  return zone.replace(/_/g, " ").replace(/\//g, " / ")
}

interface TimeZonePickerProps {
  id?: string
  /** The saved zone, if the church has chosen one. */
  value?: string
  onChange: (zone: string) => void
  disabled?: boolean
}

/**
 * A searchable list of time zones. Nothing is saved until a zone is chosen;
 * when none is saved, this device's zone is offered first as a suggestion.
 */
export function TimeZonePicker({ id, value, onChange, disabled }: TimeZonePickerProps) {
  const [open, setOpen] = useState(false)
  const suggested = value ? undefined : browserTimeZone()

  const zones = useMemo(() => {
    const list = supportedTimeZones()
    // Keep the saved zone selectable even if this browser doesn't list it.
    if (value && !list.includes(value)) return [value, ...list]
    return list
  }, [value])

  const choose = (zone: string) => {
    setOpen(false)
    if (zone !== value) onChange(zone)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-background h-11 font-normal"
          disabled={disabled}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? zoneLabel(value) : "Not set (UTC)"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search time zones…" />
          <CommandList>
            <CommandEmpty>No time zone matches that.</CommandEmpty>
            {suggested && (
              <CommandGroup heading="This device">
                <CommandItem value={`suggested ${suggested} ${zoneLabel(suggested)}`} onSelect={() => choose(suggested)}>
                  {zoneLabel(suggested)}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="All time zones">
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={`${zone} ${zoneLabel(zone)}`}
                  data-checked={value === zone}
                  onSelect={() => choose(zone)}
                >
                  <span className="truncate">{zoneLabel(zone)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
