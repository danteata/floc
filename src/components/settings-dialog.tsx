'use client'

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { Save, RotateCcw } from "lucide-react"
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/money"
import { cn } from "@/lib/utils"
import { BrandingPanel } from "@/components/branding-panel"
import { TimeZonePicker } from "@/components/time-zone-picker"
import { AiCredentialsPanel } from "@/components/ai-credentials-panel"
import { useSubscription } from "@/providers/SubscriptionProvider"
import { useFlag } from "@/hooks/use-flags"

// The generic default for every level is "Unit Level N" (`unit_level`), listed
// first so it's the top preset. The named presets below are optional
// vocabularies an org can opt into; none is the default.
const LEVEL_TYPE_TERMINOLOGY: Record<string, Record<string, { singular: string; plural: string }>> = {
  '1': {
    unit_level: { singular: 'Unit Level 1', plural: 'Unit Level 1s' },
    denomination: { singular: 'Denomination', plural: 'Denominations' },
    network: { singular: 'Network', plural: 'Networks' },
    organization: { singular: 'Organization', plural: 'Organizations' },
    franchise: { singular: 'Franchise', plural: 'Franchises' },
    chain: { singular: 'Chain', plural: 'Chains' },
    federation: { singular: 'Federation', plural: 'Federations' },
    custom: { singular: '', plural: '' },
  },
  '2': {
    unit_level: { singular: 'Unit Level 2', plural: 'Unit Level 2s' },
    ministry: { singular: 'Ministry', plural: 'Ministries' },
    department: { singular: 'Department', plural: 'Departments' },
    division: { singular: 'Division', plural: 'Divisions' },
    branch: { singular: 'Branch', plural: 'Branches' },
    region: { singular: 'Region', plural: 'Regions' },
    district: { singular: 'District', plural: 'Districts' },
    chapter: { singular: 'Chapter', plural: 'Chapters' },
    custom: { singular: '', plural: '' },
  },
  '3': {
    unit_level: { singular: 'Unit Level 3', plural: 'Unit Level 3s' },
    group: { singular: 'Group', plural: 'Groups' },
    team: { singular: 'Team', plural: 'Teams' },
    unit: { singular: 'Unit', plural: 'Units' },
    squad: { singular: 'Squad', plural: 'Squads' },
    cell: { singular: 'Cell', plural: 'Cells' },
    class: { singular: 'Class', plural: 'Classes' },
    section: { singular: 'Section', plural: 'Sections' },
    custom: { singular: '', plural: '' },
  },
  '4': {
    unit_level: { singular: 'Unit Level 4', plural: 'Unit Level 4s' },
    subgroup: { singular: 'Sub-group', plural: 'Sub-groups' },
    subunit: { singular: 'Sub-unit', plural: 'Sub-units' },
    team: { singular: 'Team', plural: 'Teams' },
    pair: { singular: 'Pair', plural: 'Pairs' },
    cohort: { singular: 'Cohort', plural: 'Cohorts' },
    custom: { singular: '', plural: '' },
  },
}

type LevelType = 'unit_level' | 'denomination' | 'network' | 'organization' | 'franchise' | 'chain' | 'federation' | 'ministry' | 'department' | 'division' | 'branch' | 'region' | 'district' | 'chapter' | 'group' | 'team' | 'unit' | 'squad' | 'cell' | 'class' | 'section' | 'subgroup' | 'subunit' | 'pair' | 'cohort' | 'custom'

// Generic defaults for an org that hasn't customized its structure: every
// level is just "Unit Level N". Named vocabularies (Division, Unit, …) are
// opt-in via the presets above, never the default.
const DEFAULT_ORG_TERMS = {
  level1_singular: 'Unit Level 1', level1_plural: 'Unit Level 1s',
  level2_singular: 'Unit Level 2', level2_plural: 'Unit Level 2s',
  level3_singular: 'Unit Level 3', level3_plural: 'Unit Level 3s',
  level4_singular: 'Unit Level 4', level4_plural: 'Unit Level 4s',
}

const DEFAULT_LEVEL_TYPES: Record<'level1' | 'level2' | 'level3' | 'level4', LevelType> = {
  level1: 'unit_level', level2: 'unit_level', level3: 'unit_level', level4: 'unit_level',
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function SettingsDialog({ open, onOpenChange, onSuccess }: SettingsDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { trackEvent } = useAnalytics()

  const currentOrg = useQuery(api.organizations.current)
  const updateOrgMutation = useMutation(api.organizations.update)
  const brandingEnabled = useFlag("release.org_branding")
  // Storing a provider key is only useful to an org whose plan can use it; the
  // backend refuses regardless (ai/internal:forCredentialChange).
  const { isPro } = useSubscription()

  // Organization structure local state
  const [orgTerms, setOrgTerms] = useState({ ...DEFAULT_ORG_TERMS })

  // Level type selections (used to derive terminology)
  const [levelTypes, setLevelTypes] = useState({ ...DEFAULT_LEVEL_TYPES })

  // Which level's edit card is shown; driven by the Hierarchy Preview pills.
  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3 | 4>(1)

  // The organization's canonical name (organizations.name). Shown in the org
  // switcher, page headers, and the public giving page.
  const [orgName, setOrgName] = useState('')

  // The currency every amount in Floc is shown in (organizations.currency).
  const currentCurrency = (currentOrg?.currency as string | undefined) || DEFAULT_CURRENCY
  const [isSavingCurrency, setIsSavingCurrency] = useState(false)

  // The church's time zone (organizations.timezone). Unset means UTC.
  const currentTimeZone = (currentOrg?.timezone as string | undefined) || undefined
  const [isSavingTimeZone, setIsSavingTimeZone] = useState(false)

  const handleLevelTypeChange = (level: '1' | '2' | '3' | '4', type: LevelType) => {
    const levelKey = `level${level}` as keyof typeof levelTypes
    setLevelTypes(prev => ({ ...prev, [levelKey]: type }))
    
    if (type !== 'custom' && LEVEL_TYPE_TERMINOLOGY[level]?.[type]) {
      const terminology = LEVEL_TYPE_TERMINOLOGY[level][type]
      const singularKey = `level${level}_singular` as keyof typeof orgTerms
      const pluralKey = `level${level}_plural` as keyof typeof orgTerms
      setOrgTerms(prev => ({
        ...prev,
        [singularKey]: terminology.singular,
        [pluralKey]: terminology.plural,
      }))
    }
  }

  const detectLevelTypeFromTerm = (singular: string, level: '1' | '2' | '3' | '4'): LevelType => {
    const types = LEVEL_TYPE_TERMINOLOGY[level]
    if (!types) return 'custom'
    for (const [type, terms] of Object.entries(types)) {
      if (terms.singular.toLowerCase() === singular.toLowerCase()) {
        return type as LevelType
      }
    }
    return 'custom'
  }

  // Sync org data into local state when the dialog opens.
  useEffect(() => {
    if (!open) return

    trackEvent(AnalyticsEventType.SETTINGS_OPENED, {})

  if (currentOrg) {
    setOrgName(currentOrg.name || '')
    setOrgTerms({
      level1_singular: currentOrg.level1_singular || DEFAULT_ORG_TERMS.level1_singular,
      level1_plural: currentOrg.level1_plural || DEFAULT_ORG_TERMS.level1_plural,
      level2_singular: currentOrg.level2_singular || DEFAULT_ORG_TERMS.level2_singular,
      level2_plural: currentOrg.level2_plural || DEFAULT_ORG_TERMS.level2_plural,
      level3_singular: currentOrg.level3_singular || DEFAULT_ORG_TERMS.level3_singular,
      level3_plural: currentOrg.level3_plural || DEFAULT_ORG_TERMS.level3_plural,
      level4_singular: currentOrg.level4_singular || DEFAULT_ORG_TERMS.level4_singular,
      level4_plural: currentOrg.level4_plural || DEFAULT_ORG_TERMS.level4_plural,
    })
    // Detect level types from existing terminology
    setLevelTypes({
      level1: detectLevelTypeFromTerm(currentOrg.level1_singular || DEFAULT_ORG_TERMS.level1_singular, '1'),
      level2: detectLevelTypeFromTerm(currentOrg.level2_singular || DEFAULT_ORG_TERMS.level2_singular, '2'),
      level3: detectLevelTypeFromTerm(currentOrg.level3_singular || DEFAULT_ORG_TERMS.level3_singular, '3'),
      level4: detectLevelTypeFromTerm(currentOrg.level4_singular || DEFAULT_ORG_TERMS.level4_singular, '4'),
    })
  }
  }, [open, currentOrg])

  const handleSaveOrgTerminology = async () => {
    if (!currentOrg) return
    setIsLoading(true)
    try {
      await updateOrgMutation({
        id: currentOrg._id as Id<"organizations">,
        updates: {
          ...orgTerms
        }
      })
      toast({ title: "Structure updated" })
    } catch (error: any) {
      toast({ title: "Couldn't save the structure", description: error.message, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetOrgTerminology = () => {
    setOrgTerms({ ...DEFAULT_ORG_TERMS })
    setLevelTypes({ ...DEFAULT_LEVEL_TYPES })
  }

  const handleSaveOrgName = async () => {
    if (!currentOrg) return
    const trimmed = orgName.trim()
    if (!trimmed) {
      toast({ title: "Couldn't save the name", description: "The church name can't be empty.", variant: "destructive" })
      return
    }
    setIsLoading(true)
    try {
      if (trimmed !== currentOrg.name) {
        await updateOrgMutation({
          id: currentOrg._id as Id<"organizations">,
          updates: { name: trimmed },
        })
      }
      toast({ title: "Church name updated" })
      onSuccess?.()
    } catch (error: any) {
      toast({ title: "Couldn't save the name", description: error.message, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCurrencyChange = async (currency: string) => {
    if (!currentOrg || currency === currentCurrency) return
    setIsSavingCurrency(true)
    try {
      await updateOrgMutation({
        id: currentOrg._id as Id<"organizations">,
        updates: { currency },
      })
      toast({ title: "Currency updated" })
    } catch (error) {
      toast({ title: "Couldn't change the currency", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setIsSavingCurrency(false)
    }
  }

  const handleTimeZoneChange = async (timezone: string) => {
    if (!currentOrg || timezone === currentTimeZone) return
    setIsSavingTimeZone(true)
    try {
      await updateOrgMutation({
        id: currentOrg._id as Id<"organizations">,
        updates: { timezone },
      })
      toast({ title: "Time zone updated" })
    } catch (error) {
      toast({ title: "Couldn't change the time zone", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setIsSavingTimeZone(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col overflow-hidden p-0 rounded-2xl">
        <DialogHeader className="shrink-0 p-6 bg-muted/20 border-b border-border/50">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Church settings
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Your church's name, structure, branding and preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
          <Tabs defaultValue="terminology" className="space-y-6">
            <TabsList className="bg-muted/50 p-1 rounded-xl w-full flex justify-start overflow-x-auto">
              <TabsTrigger value="terminology" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Name, currency and time zone</TabsTrigger>
              <TabsTrigger value="organization" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Structure</TabsTrigger>
              {brandingEnabled && (
                <TabsTrigger value="branding" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Branding</TabsTrigger>
              )}
              {isPro && (
                <TabsTrigger value="ai" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">AI</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="terminology" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Church name: per-org, editable by org admins */}
              <Card className="overflow-hidden">
                <CardHeader className="bg-muted/20 border-b border-border/50 px-6 py-4">
                  <CardTitle className="text-base font-semibold">Name</CardTitle>
                  <CardDescription>How your church appears across Floc</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="church-name" className="text-sm">Church name</Label>
                    <Input
                      id="church-name"
                      placeholder="For example, Grace Chapel"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="bg-background h-11"
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown in the church switcher, page headers and the public giving page.
                    </p>
                  </div>
                  <Button onClick={handleSaveOrgName} disabled={isLoading} className="w-full sm:w-auto">
                    {isLoading ? "Saving…" : "Save name"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="bg-muted/20 border-b border-border/50 px-6 py-4">
                  <CardTitle className="text-base font-semibold">Currency</CardTitle>
                  <CardDescription>The currency your church keeps its books in</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-2">
                  <Label htmlFor="church-currency" className="text-sm">Currency</Label>
                  <Select
                    value={currentCurrency}
                    onValueChange={handleCurrencyChange}
                    disabled={!currentOrg || isSavingCurrency}
                  >
                    <SelectTrigger id="church-currency" className="bg-background h-11">
                      <SelectValue placeholder="Choose a currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Used for every amount in Floc. Online giving is always taken in cedis.
                  </p>
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="bg-muted/20 border-b border-border/50 px-6 py-4">
                  <CardTitle className="text-base font-semibold">Time zone</CardTitle>
                  <CardDescription>Where your church keeps its clock</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-2">
                  <Label htmlFor="church-time-zone" className="text-sm">Time zone</Label>
                  <TimeZonePicker
                    id="church-time-zone"
                    value={currentTimeZone}
                    onChange={handleTimeZoneChange}
                    disabled={!currentOrg || isSavingTimeZone}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used for lateness at check-in, birthdays and what counts as today.
                    {!currentTimeZone && " Until you choose one, Floc uses UTC."}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

        <TabsContent value="organization" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="border border-border/50 shadow-sm bg-accent/5">
            <CardHeader className="border-b border-border/50 px-6 py-4">
              <CardTitle className="text-base font-semibold">Levels</CardTitle>
              <CardDescription>Choose a level to rename it</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-wrap gap-3">
                {([1, 2, 3, 4] as const).map((level) => {
                  const singularKey = `level${level}_singular` as keyof typeof orgTerms
                  const isActive = selectedLevel === level
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setSelectedLevel(level)}
                      className={cn(
                        "px-3 py-1 text-sm rounded-full border transition-all",
                        isActive
                          ? "bg-primary/10 border-primary/40 text-primary shadow-sm"
                          : "bg-background border-muted-foreground/20 text-foreground hover:border-primary/30"
                      )}
                    >
                      {level}. {orgTerms[singularKey]}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {[1, 2, 3, 4].filter((level) => level === selectedLevel).map((level) => {
            const levelKey = `level${level}` as keyof typeof levelTypes
            const types = LEVEL_TYPE_TERMINOLOGY[String(level) as '1' | '2' | '3' | '4']
            const singularKey = `level${level}_singular` as keyof typeof orgTerms
            const pluralKey = `level${level}_plural` as keyof typeof orgTerms
            const isCustom = levelTypes[levelKey] === 'custom'

            return (
              <Card key={level} className="border border-border/50 shadow-sm overflow-hidden bg-card/50">
                <CardHeader className="bg-muted/20 border-b border-border/50 px-6 py-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    Level {level}: {orgTerms[singularKey]}
                  </CardTitle>
                  <CardDescription>What your church calls this level</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Preset</Label>
                      <Select
                        value={levelTypes[levelKey]}
                        onValueChange={(value) => handleLevelTypeChange(String(level) as '1' | '2' | '3' | '4', value as LevelType)}
                      >
                        <SelectTrigger className="bg-background/50 h-11">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(types).map(([type, terms]) => (
                            <SelectItem key={type} value={type}>
                              {type === 'custom' ? 'Custom (manual entry)' : terms.singular}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">&nbsp;</Label>
                      <p className="text-xs text-muted-foreground pt-2">
                        {isCustom 
                          ? "Type your own names below" 
                          : `Fills in ${types[levelTypes[levelKey] as keyof typeof types]?.singular} and ${types[levelTypes[levelKey] as keyof typeof types]?.plural}`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Singular</Label>
                      <Input 
                        value={orgTerms[singularKey]} 
                        onChange={(e) => {
                          setOrgTerms({ ...orgTerms, [singularKey]: e.target.value })
                          setLevelTypes({ ...levelTypes, [levelKey]: 'custom' })
                        }} 
                        className="bg-background/50 h-11" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Plural</Label>
                      <Input 
                        value={orgTerms[pluralKey]} 
                        onChange={(e) => {
                          setOrgTerms({ ...orgTerms, [pluralKey]: e.target.value })
                          setLevelTypes({ ...levelTypes, [levelKey]: 'custom' })
                        }} 
                        className="bg-background/50 h-11" 
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          <div className="flex gap-4 pt-4 border-t">
            <Button onClick={handleSaveOrgTerminology} disabled={isLoading} className="flex-1 h-12 shadow-soft hover:shadow-lg transition-all">
              <Save className="mr-2 h-4 w-4" /> Save structure
            </Button>
            <Button variant="outline" onClick={handleResetOrgTerminology} className="shadow-sm h-12">
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
          </div>
        </TabsContent>

            {brandingEnabled && (
              <TabsContent value="branding" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="border border-border/50 shadow-sm overflow-hidden bg-card/50">
                  <CardContent className="p-6">
                    <BrandingPanel />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {isPro && (
              <TabsContent value="ai" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="border border-border/50 shadow-sm overflow-hidden bg-card/50">
                  <CardContent className="p-6">
                    <AiCredentialsPanel />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

          </Tabs>
        </div>

        <DialogFooter className="shrink-0 p-6 bg-muted/20 border-t border-border/50">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
