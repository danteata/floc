'use client'

import { useState, useEffect } from 'react'
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

// Generic defaults for an org that hasn't customized its structure: every
// level is just "Unit Level N". Named vocabularies are opt-in, not default.
const DEFAULT_LEVEL_TERMS = {
  level1_singular: 'Unit Level 1', level1_plural: 'Unit Level 1s',
  level2_singular: 'Unit Level 2', level2_plural: 'Unit Level 2s',
  level3_singular: 'Unit Level 3', level3_plural: 'Unit Level 3s',
  level4_singular: 'Unit Level 4', level4_plural: 'Unit Level 4s',
}

export function TerminologyManagement() {
  const { isAdmin } = useUserRole()
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
        title: "Success",
        description: "Terminology settings have been updated.",
      })
    } catch (error: any) {
      console.error('Error saving terminology:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to save terminology settings.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetToDefaults = () => {
    setFormData({ ...DEFAULT_LEVEL_TERMS })
  }

  if (!isAdmin) {
    return (
      <div className="container p-4 md:p-6">
        <Card className="border-border/50 shadow-soft rounded-3xl overflow-hidden">
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <Settings className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-xl tracking-tight mb-2">Access Denied</h3>
              <p className="text-muted-foreground">
                You don't have permission to manage terminology settings.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (organizationData === undefined) {
    return (
      <div className="p-12 text-center animate-pulse flex flex-col items-center gap-4">
        <RefreshCw className="h-8 w-8 text-muted-foreground/40 animate-spin" />
        <p className="font-bold text-muted-foreground/70 text-sm">Loading terminology configuration...</p>
      </div>
    )
  }

  return (
    <div className="container p-4 md:p-10 max-w-6xl mx-auto space-y-10">
      <PageHeader
        title="Terminology"
        description="The names used for each level of your church's structure."
      />

      <div className="grid gap-8">
        {/* Current Terminology Preview */}
        <Card className="border-border/50 shadow-soft-xl rounded-3xl overflow-hidden bg-muted/50">
          <CardHeader className="bg-white border-b border-border/50 p-8">
            <CardTitle className="flex items-center gap-3 tracking-tight text-xl">
              <Settings className="h-5 w-5 text-muted-foreground/70" />
              Active Taxonomy
            </CardTitle>
            <CardDescription className="font-medium text-muted-foreground">
              Preview how your localized terms integrate into the interface
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-3">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider">Level 1</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border text-muted-foreground h-8 px-3 rounded-lg bg-white">{formData.level1_singular}</Badge>
                  <Badge variant="outline" className="border-border text-muted-foreground h-8 px-3 rounded-lg bg-white">{formData.level1_plural}</Badge>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider">Level 2</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border text-muted-foreground h-8 px-3 rounded-lg bg-white">{formData.level2_singular}</Badge>
                  <Badge variant="outline" className="border-border text-muted-foreground h-8 px-3 rounded-lg bg-white">{formData.level2_plural}</Badge>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider">Level 3</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border text-muted-foreground h-8 px-3 rounded-lg bg-white">{formData.level3_singular}</Badge>
                  <Badge variant="outline" className="border-border text-muted-foreground h-8 px-3 rounded-lg bg-white">{formData.level3_plural}</Badge>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider">Level 4</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border text-muted-foreground h-8 px-3 rounded-lg bg-white">{formData.level4_singular}</Badge>
                  <Badge variant="outline" className="border-border text-muted-foreground h-8 px-3 rounded-lg bg-white">{formData.level4_plural}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Terminology Settings */}
        <Card className="border-border/50 shadow-soft-2xl rounded-3xl overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="font-black tracking-tight text-xl">Localized Labels</CardTitle>
            <CardDescription className="font-medium text-muted-foreground">
              Customize labels for different levels of your organizational structure
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 p-8 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
              {/* Level 1 */}
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Level 1 Singular</Label>
                <Input
                  value={formData.level1_singular}
                  onChange={(e) => setFormData({ ...formData, level1_singular: e.target.value })}
                  className="rounded-xl border-border h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Level 1 Plural</Label>
                <Input
                  value={formData.level1_plural}
                  onChange={(e) => setFormData({ ...formData, level1_plural: e.target.value })}
                  className="rounded-xl border-border h-11"
                />
              </div>

              {/* Level 2 */}
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Level 2 Singular</Label>
                <Input
                  value={formData.level2_singular}
                  onChange={(e) => setFormData({ ...formData, level2_singular: e.target.value })}
                  className="rounded-xl border-border h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Level 2 Plural</Label>
                <Input
                  value={formData.level2_plural}
                  onChange={(e) => setFormData({ ...formData, level2_plural: e.target.value })}
                  className="rounded-xl border-border h-11"
                />
              </div>

              {/* Level 3 */}
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Level 3 Singular</Label>
                <Input
                  value={formData.level3_singular}
                  onChange={(e) => setFormData({ ...formData, level3_singular: e.target.value })}
                  className="rounded-xl border-border h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Level 3 Plural</Label>
                <Input
                  value={formData.level3_plural}
                  onChange={(e) => setFormData({ ...formData, level3_plural: e.target.value })}
                  className="rounded-xl border-border h-11"
                />
              </div>

              {/* Level 4 */}
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Level 4 Singular</Label>
                <Input
                  value={formData.level4_singular}
                  onChange={(e) => setFormData({ ...formData, level4_singular: e.target.value })}
                  className="rounded-xl border-border h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 tracking-wider pl-1">Level 4 Plural</Label>
                <Input
                  value={formData.level4_plural}
                  onChange={(e) => setFormData({ ...formData, level4_plural: e.target.value })}
                  className="rounded-xl border-border h-11"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-8 border-t border-border justify-end">
              <Button
                variant="ghost"
                onClick={handleResetToDefaults}
                className="font-bold text-muted-foreground rounded-xl px-6"
              >
                Reset to Defaults
              </Button>
              <Button
                onClick={handleSaveTerminology}
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-11 px-10 shadow-soft"
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSaving ? 'Saving Changes...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Preview */}
        <Card className="border-border/50 shadow-soft rounded-3xl overflow-hidden bg-muted/50">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="font-black tracking-tight text-lg text-muted-foreground/70">Contextual Integration</CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-2">
            <div className="space-y-4 text-sm text-muted-foreground">
              <div className="flex justify-between items-center border-b border-border pb-3">
                <span className="text-muted-foreground/70">Navigation Pattern:</span>
                <span className="text-foreground">{formData.level1_plural} <span className="text-muted-foreground/70">/</span> {formData.level2_plural} <span className="text-muted-foreground/70">/</span> {formData.level3_plural}</span>
              </div>
              <div className="flex justify-between items-center border-b border-border pb-3">
                <span className="text-muted-foreground/70">Administrative Titles:</span>
                <span className="text-foreground">{formData.level1_singular} Admin, {formData.level2_singular} Lead</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground/70">Reporting Structure:</span>
                <span className="text-foreground">{formData.level3_plural} nested within {formData.level2_singular}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
