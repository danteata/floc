"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AUTOMATION_TEMPLATES, AutomationTemplate } from "./templates"

interface TemplateGalleryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (template: AutomationTemplate) => void
}

export function TemplateGalleryDialog({ open, onOpenChange, onSelect }: TemplateGalleryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>New automation</DialogTitle>
          <DialogDescription>Choose a starting point. You can change everything on the next step.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {AUTOMATION_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="text-left rounded-xl border border-border/60 p-4 hover:border-primary hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <div className="flex items-center gap-2 mb-2">
                <t.icon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{t.title}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
