'use client'

import { Fragment, useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Settings, Save, RefreshCw } from 'lucide-react'
import { useUserRole } from '@/hooks/use-user-role'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useToast } from '@/hooks/use-toast'
import { NoAccess } from "@/components/ui/no-access"
import { LoadingState } from "@/components/ui/loading-state"

// Generic defaults for an org that hasn't customized its structure: every
// level is just "Unit Level N". Named vocabularies are opt-in, not default.
const DEFAULT_LEVEL_TERMS = {
  level1_singular: 'Unit Level 1', level1_plural: 'Unit Level 1s',
  level2_singular: 'Unit Level 2', level2_plural: 'Unit Level 2s',
  level3_singular: 'Unit Level 3', level3_plural: 'Unit Level 3s',
  level4_singular: 'Unit Level 4', level4_plural: 'Unit Level 4s',
}

export function TerminologyManagement() {
  const { isAdmin, isLoading: roleLoading } = useUserRole()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const organizationData = useQuery(api.organizations.current);
  const updateOrganization = useMutation(api.organizations.update);

  // Form state
  const [formData, setFormData] = useState({ ...DEFAULT_LEVEL_TERMS })

  useEffect(() => {
    if (organizationData) {
      setFormData({
        level1_singular: organizationData.level1_singular || DEFAULT_LEVEL_TERMS.level1_singular,
        level1_plural: organizationData.level1_plural || DEFAULT_LEVEL_TERMS.level1_plural,
        level2_singular: organizationData.level2_singular || DEFAULT_LEVEL_TERMS.level2_singular,
        level2_plural: organizationData.level2_plural || DEFAULT_LEVEL_TERMS.level2_plural,
        level3_singular: organizationData.level3_singular || DEFAULT_LEVEL_TERMS.level3_singular,
        level3_plural: organizationData.level3_plural || DEFAULT_LEVEL_TERMS.level3_plural,
        level4_singular: organizationData.level4_singular || DEFAULT_LEVEL_TERMS.level4_singular,
        level4_plural: organizationData.level4_plural || DEFAULT_LEVEL_TERMS.level4_plural,
      })
    }
  }, [organizationData])

  const handleSaveTerminology = async () => {
    if (!organizationData) return;

    setIsSaving(true)
    try {
      await updateOrganization({
        id: organizationData._id,
        updates: formData
      });

      toast({
        title: "Terminology saved",
      })
    } catch (error: any) {
      console.error('Error saving terminology:', error)
      toast({
        title: "Couldn't save the terminology",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetToDefaults = () => {
    setFormData({ ...DEFAULT_LEVEL_TERMS })
  }

  if (roleLoading) return <LoadingState message="Checking your access…" />
    if (!isAdmin) {
    return <NoAccess what="change your church's terminology" who="administrators" />
  }

  if (organizationData === undefined) {
    return (
      <div className="p-12 text-center flex flex-col items-center gap-4">
        <RefreshCw className="h-6 w-6 text-muted-foreground/60 animate-spin" />
        <p className="text-sm text-muted-foreground">Loading terminology…</p>
      </div>
    )
  }

  const levels = [1, 2, 3, 4] as const
  type TermKey = keyof typeof formData

  return (
    <div className="container p-4 md:p-10 max-w-6xl mx-auto space-y-8">
      <PageHeader
        title="Terminology"
        description="The names used for each level of your church's structure."
      />

      <div className="grid gap-6">
        {/* How the terms read now */}
        <Card className="rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/50 p-6">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Preview
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              The words Floc will use for each level, in the singular and plural.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {levels.map((n) => (
                <div key={n} className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Level {n}</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-border text-foreground h-7 px-2.5 rounded-lg bg-background">{formData[`level${n}_singular` as TermKey]}</Badge>
                    <Badge variant="outline" className="border-border text-foreground h-7 px-2.5 rounded-lg bg-background">{formData[`level${n}_plural` as TermKey]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* The terms themselves */}
        <Card className="rounded-xl overflow-hidden">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-lg font-semibold">Names for each level</CardTitle>
            <CardDescription className="text-muted-foreground">
              Use the words your members use for each level, such as zone, district or cell.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-6 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              {levels.map((n) => (
                <Fragment key={n}>
                  <div className="space-y-2">
                    <Label htmlFor={`level${n}-singular`} className="text-sm font-medium">Level {n}, singular</Label>
                    <Input
                      id={`level${n}-singular`}
                      value={formData[`level${n}_singular` as TermKey]}
                      onChange={(e) => setFormData({ ...formData, [`level${n}_singular`]: e.target.value })}
                      className="rounded-lg border-border h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`level${n}-plural`} className="text-sm font-medium">Level {n}, plural</Label>
                    <Input
                      id={`level${n}-plural`}
                      value={formData[`level${n}_plural` as TermKey]}
                      onChange={(e) => setFormData({ ...formData, [`level${n}_plural`]: e.target.value })}
                      className="rounded-lg border-border h-10"
                    />
                  </div>
                </Fragment>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-border justify-end">
              <Button
                variant="ghost"
                onClick={handleResetToDefaults}
                className="text-muted-foreground rounded-lg"
              >
                Reset to defaults
              </Button>
              <Button
                onClick={handleSaveTerminology}
                disabled={isSaving}
                className="rounded-lg"
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSaving ? 'Saving…' : 'Save terminology'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Examples */}
        <Card className="rounded-xl overflow-hidden">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-base font-semibold">How they read together</CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2">
            <div className="space-y-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center border-b border-border pb-3">
                <span className="text-muted-foreground">In order</span>
                <span className="text-foreground">{formData.level1_plural} <span className="text-muted-foreground">/</span> {formData.level2_plural} <span className="text-muted-foreground">/</span> {formData.level3_plural}</span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center border-b border-border pb-3">
                <span className="text-muted-foreground">Leader titles</span>
                <span className="text-foreground">{formData.level1_singular} admin, {formData.level2_singular} lead</span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center">
                <span className="text-muted-foreground">Nesting</span>
                <span className="text-foreground">{formData.level3_plural} sit within a {formData.level2_singular}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
