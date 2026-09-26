"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Trash2, Zap } from "lucide-react"
import { useAction, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useOrganization } from "@/hooks/use-organization"
import { useUserRole } from "@/hooks/use-user-role"
import { errorMessage } from "@/lib/errors"

/**
 * Connecting your own AI provider.
 *
 * The key is write-only from here on: once saved, the page shows the last four
 * characters and whether it last worked, and there is no path that reads the
 * value back — not for the admin who typed it, and not for anyone who reaches
 * this screen afterwards.
 */
export function AiCredentialsPanel() {
  const { organization } = useOrganization()
  const { isAdmin } = useUserRole()
  const { toast } = useToast()

  const status = useQuery(
    api.ai.queries.status,
    isAdmin && organization?._id ? { organization_id: organization._id } : "skip",
  )
  const setCredential = useAction(api.ai.credentials.set)
  const clearCredential = useAction(api.ai.credentials.clear)
  const testCredential = useAction(api.ai.credentials.test)

  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [busy, setBusy] = useState<"save" | "test" | "clear" | null>(null)

  const existing = status?.credentials ?? []

  const save = async () => {
    if (!organization?._id) return
    setBusy("save")
    try {
      const result = await setCredential({
        organization_id: organization._id,
        provider,
        api_key: apiKey,
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
      })
      setApiKey("")
      toast({
        title: "Key saved",
        description: `${result.provider} key ending ${result.hint} is now in use for this organization.`,
      })
    } catch (err) {
      toast({ title: "Couldn't save the key", description: errorMessage(err), variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    if (!organization?._id) return
    setBusy("test")
    try {
      const result = await testCredential({ organization_id: organization._id })
      toast({
        title: result.ok ? "Key works" : "The provider refused",
        description: result.message,
        variant: result.ok ? undefined : "destructive",
      })
    } catch (err) {
      toast({ title: "Couldn't test the key", description: errorMessage(err), variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: Id<"ai_credentials">) => {
    if (!organization?._id) return
    setBusy("clear")
    try {
      await clearCredential({ organization_id: organization._id, credential_id: id })
      toast({ title: "Key removed" })
    } catch (err) {
      toast({ title: "Couldn't remove the key", description: errorMessage(err), variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  if (!isAdmin) {
  /**
   * The `/admin` route is gated on being signed in, not on being an admin, so
   * a plain member can reach the console shell. The backend refuses these
   * queries either way — this stops the refusal arriving as a thrown query
   * that takes the page down with it.
   */
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        The AI provider key is managed by administrators.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          AI provider
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your own provider account and your data reaches the model under{" "}
          <em>your</em> contract, retention settings and region — not ours. Without a key here,
          AI features stay off for this organization.
        </p>
      </div>

      {status && !status.enabled && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <AlertTriangle className="h-4 w-4 text-warning-strong mt-0.5 shrink-0" />
          <p className="text-sm">
            AI features are switched off across the whole deployment right now, so a key saved here
            won't be used until that's lifted.
          </p>
        </div>
      )}

      {existing.length > 0 && (
        <div className="space-y-2">
          <Label>Connected</Label>
          {existing.map((credential) => (
            <div
              key={credential.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{credential.provider_label}</span>
                  <code className="text-xs text-muted-foreground">{credential.hint}</code>
                  {credential.model && (
                    <Badge variant="outline" className="text-[10px]">
                      {credential.model}
                    </Badge>
                  )}
                </div>
                {credential.last_error ? (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {credential.last_error}
                  </p>
                ) : credential.last_used_at ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success-strong" />
                    Last worked {new Date(credential.last_used_at).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not used yet — test it below.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={test} disabled={busy !== null}>
                  {busy === "test" ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="mr-2 h-3.5 w-3.5" />
                  )}
                  Test
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => remove(credential.id)}
                  disabled={busy !== null}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border/50 p-4">
        <Label>{existing.length > 0 ? "Replace the key" : "Add a key"}</Label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-provider" className="text-xs text-muted-foreground">
              Provider
            </Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
              <SelectTrigger id="ai-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="openai">OpenAI-compatible</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-key" className="text-xs text-muted-foreground">
              API key
            </Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-model" className="text-xs text-muted-foreground">
              Model (optional)
            </Label>
            <Input
              id="ai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Leave blank for the default"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-base-url" className="text-xs text-muted-foreground">
              Endpoint (optional)
            </Label>
            <Input
              id="ai-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="For a self-hosted or Azure endpoint"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          The key is encrypted before it's stored and never shown again — you'll see only the last
          four characters. Changing it later means pasting a new one.
        </p>

        <Button onClick={save} disabled={apiKey.trim().length < 8 || busy !== null}>
          {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save key
        </Button>
      </div>
    </div>
  )
}
