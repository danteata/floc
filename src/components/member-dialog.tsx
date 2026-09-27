import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileUploader } from "@/components/file-uploader"
import { UnitPicker } from "@/components/unit-picker"
import { useToast } from "@/hooks/use-toast"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useOrganization } from "@/hooks/use-organization"
import { useUserRole } from "@/hooks/use-user-role"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { X, Image as ImageIcon } from "lucide-react"

const memberSchema = z.object({
  title: z.string().optional(),
  first_name: z.string().min(1, "Enter a first name"),
  last_name: z.string().min(1, "Enter a last name"),
  email: z.string().email("Enter a valid email address").optional().or(z.literal("")),
  phone: z.string().min(1, "Enter a phone number"),
  dob: z.string().optional(),
  birth_month: z.number().min(1).max(12).optional(),
  birth_day: z.number().min(1).max(31).optional(),
  gender: z.string().optional(),
  status: z.string().min(1, "Choose a status"),
  joined_date: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  plus_code: z.string().optional(),
  unit_ids: z.array(z.string()).optional(),
  skills: z.string().optional(),
  avatar_url: z.string().optional(),
})

type MemberFormData = z.infer<typeof memberSchema>

interface MemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function MemberDialog({ open, onOpenChange, onSuccess }: MemberDialogProps) {
  const [activeTab, setActiveTab] = useState("basic")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const { toast } = useToast()
  const { trackEvent } = useAnalytics()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
    mode: "onChange",
    defaultValues: {
      title: "",
      gender: "",
      status: "visitor",
      country: "Ghana",
      unit_ids: [],
    },
  })

  // Register all select fields with react-hook-form
  useEffect(() => {
    register("title")
    register("gender")
    register("status")
    register("birth_month")
    register("birth_day")
    register("unit_ids")
  }, [register])

  // Load units when dialog opens
  const { organization } = useOrganization()
  const unitsData = useQuery(api.units.list, open && organization ? {} : "skip");

  const createMember = useMutation(api.members.create);

  // Unit-level admins can only assign members to units they administer; org
  // admins may assign any unit. Mirrors the backend scope enforcement.
  const { isAdmin, unitLeaderships } = useUserRole();
  const restrictToScope = !isAdmin;
  const allowedUnitIds = new Set((unitLeaderships || []).map((u: any) => u._id));
  const inScope = (units: any[]) =>
    restrictToScope ? units.filter(u => allowedUnitIds.has(u._id)) : units;


  // Handle photo upload completion
  const handlePhotoUpload = (url: string) => {
    setUploadedImageUrl(url)
    setValue("avatar_url", url)
  }

  // Remove uploaded photo
  const removePhoto = () => {
    setUploadedImageUrl(null)
    setValue("avatar_url", "")
  }

  // Handle unit selection changes
  const handleUnitToggle = (unitId: string, checked: boolean) => {
    const currentUnits = watch("unit_ids") || [];
    if (checked) {
      setValue("unit_ids", [...currentUnits, unitId]);
    } else {
      setValue("unit_ids", currentUnits.filter(id => id !== unitId));
    }
  };

  const onSubmit = async (data: MemberFormData) => {
    // Non-org admins must place the member in a unit they manage.
    if (restrictToScope && (!data.unit_ids || data.unit_ids.length === 0)) {
      toast({
        title: "Choose a unit",
        description: "You can only add members to units you manage. Choose at least one on the Units tab.",
        variant: "destructive",
      })
      return
    }
    setIsSubmitting(true)
    try {
      const normalizedPhone = (data.phone || "").replace(/\D/g, "")
      await createMember({
        name: `${data.first_name} ${data.last_name}`,
        email: data.email || undefined,
        phone: normalizedPhone,
        status: data.status,
        dob: data.dob,
        birth_month: data.birth_month,
        birth_day: data.birth_day,
        gender: data.gender,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: data.country,
        organization_id: organization?._id,
        unit_ids: (data.unit_ids || []).map(id => id as any),
        avatar_url: data.avatar_url,
        joined_date: data.joined_date,
        skills: data.skills,
        plus_code: (data as any).plus_code,
      });

      trackEvent(AnalyticsEventType.MEMBER_CREATED, {
        source: 'dialog',
        status: data.status,
        has_avatar: !!data.avatar_url,
        unit_count: (data.unit_ids || []).length,
      });

      toast({
        title: "Member added",
        description: `${data.first_name} ${data.last_name} is now in the directory.`,
      })

      // Reset form and close dialog
      reset()
      setUploadedImageUrl(null)
      onOpenChange(false)
      if (onSuccess) onSuccess()
    } catch (error: any) {
      console.error("Submission error:", error)
      toast({
        title: "Couldn't add the member",
        description: error.message || "Something went wrong. Try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Create a wrapper function for handleSubmit
  const onSubmitWrapper = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    handleSubmit(onSubmit)(e)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[calc(100%-2rem)] sm:max-w-4xl max-h-[90vh] p-0 overflow-hidden"
      >
        <form onSubmit={onSubmitWrapper} className="flex flex-col h-full max-h-[90vh]">
          <DialogHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">Add member</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Fields marked <span className="text-destructive">*</span> are required. Everything else can be added later.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6">
              <TabsList className="grid w-full grid-cols-4 p-1 bg-muted/50 rounded-xl border border-border/50">
                <TabsTrigger value="basic" className="rounded-lg data-active:bg-background data-active:shadow-soft transition-all text-xs sm:text-sm">Basic</TabsTrigger>
                <TabsTrigger value="contact" className="rounded-lg data-active:bg-background data-active:shadow-soft transition-all text-xs sm:text-sm">Contact</TabsTrigger>
                <TabsTrigger value="units" className="rounded-lg data-active:bg-background data-active:shadow-soft transition-all text-xs sm:text-sm">Units</TabsTrigger>
                <TabsTrigger value="photo" className="rounded-lg data-active:bg-background data-active:shadow-soft transition-all text-xs sm:text-sm">Photo</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <TabsContent value="basic" className="space-y-6 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
                  <div className="md:col-span-1 space-y-2">
                    <Label htmlFor="title" className="text-sm font-medium">Title</Label>
                    <Select value={watch("title")} onValueChange={(value) => setValue("title", value, { shouldValidate: true })}>
                      <SelectTrigger id="title" className="rounded-lg bg-background/50 border-input-border">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl shadow-xl border-border/50">
                        <SelectItem value="mr">Mr</SelectItem>
                        <SelectItem value="mrs">Mrs</SelectItem>
                        <SelectItem value="ms">Ms</SelectItem>
                        <SelectItem value="dr">Dr</SelectItem>
                        <SelectItem value="rev">Rev</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="first_name" className="text-sm font-medium after:content-['*'] after:text-destructive after:ml-0.5">
                      First name
                    </Label>
                    <Input id="first_name" {...register("first_name")} className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                    {errors.first_name && (
                      <p className="text-xs font-medium text-destructive mt-1">{errors.first_name.message}</p>
                    )}
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="last_name" className="text-sm font-medium after:content-['*'] after:text-destructive after:ml-0.5">
                      Last name
                    </Label>
                    <Input id="last_name" {...register("last_name")} className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                    {errors.last_name && (
                      <p className="text-xs font-medium text-destructive mt-1">{errors.last_name.message}</p>
                    )}
                  </div>
                  <div className="md:col-span-1 space-y-2">
                    <Label htmlFor="status" className="text-sm font-medium after:content-['*'] after:text-destructive after:ml-0.5">
                      Status
                    </Label>
                    <Select value={watch("status")} onValueChange={(value) => setValue("status", value, { shouldValidate: true })}>
                      <SelectTrigger className="rounded-lg bg-background/50 border-input-border">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl shadow-xl border-border/50">
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="visitor">Visitor</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.status && (
                      <p className="text-xs font-medium text-destructive mt-1">{errors.status.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="dob" className="text-sm font-medium">Date of birth</Label>
                    <Input type="date" {...register("dob")} className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birth_month" className="text-sm font-medium">Birth month</Label>
                    <Select value={watch("birth_month")?.toString() ?? ""} onValueChange={(value) => setValue("birth_month", parseInt(value))}>
                      <SelectTrigger className="rounded-lg bg-background/50 border-input-border">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl shadow-xl border-border/50">
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                          <SelectItem key={month} value={month.toString()}>
                            {new Date(0, month - 1).toLocaleString('en', { month: 'long' })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birth_day" className="text-sm font-medium">Birth day</Label>
                    <Select value={watch("birth_day")?.toString() ?? ""} onValueChange={(value) => setValue("birth_day", parseInt(value))}>
                      <SelectTrigger className="rounded-lg bg-background/50 border-input-border">
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl shadow-xl border-border/50">
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={day.toString()}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="gender" className="text-sm font-medium">Gender</Label>
                    <Select value={watch("gender") ?? ""} onValueChange={(value) => setValue("gender", value)}>
                      <SelectTrigger className="rounded-lg bg-background/50 border-input-border">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl shadow-xl border-border/50">
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="joined_date" className="text-sm font-medium">Date joined</Label>
                    <Input type="date" {...register("joined_date")} className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skills" className="text-sm font-medium">Skills and talents</Label>
                  <Input {...register("skills")} placeholder="e.g. Singing, playing an instrument, teaching" className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                </div>
              </TabsContent>

              <TabsContent value="contact" className="space-y-6 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email address <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input {...register("email")} type="email" placeholder="example@email.com" className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                    {errors.email && (
                      <p className="text-xs font-medium text-destructive mt-1">{errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium after:content-['*'] after:text-destructive after:ml-0.5">
                      Phone number
                    </Label>
                    <Input {...register("phone")} placeholder="+233…" className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                    {errors.phone && (
                      <p className="text-xs font-medium text-destructive mt-1">{errors.phone.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium">Home address</Label>
                  <Input {...register("address")} placeholder="Street and house number" className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-sm font-medium">City</Label>
                    <Input {...register("city")} className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-sm font-medium">Region or state</Label>
                    <Input {...register("state")} className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip" className="text-sm font-medium">Postcode</Label>
                    <Input {...register("zip")} className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plus_code" className="text-sm font-medium">Plus code (for the map pin)</Label>
                  <Input {...register("plus_code")} placeholder="e.g. 7FG6V8VR+2G" className="rounded-lg bg-background/50 border-input-border focus-visible:ring-primary/20" />
                </div>
              </TabsContent>

              <TabsContent value="units" className="space-y-4 mt-0">
                <div>
                  <Label className="text-sm font-medium">Units</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    {restrictToScope
                      ? "Add this member to at least one of the units you manage."
                      : "Choose the units this member belongs to."}
                  </p>
                  <UnitPicker
                    units={inScope(unitsData || [])}
                    selectedIds={watch("unit_ids") || []}
                    onToggle={(id) => handleUnitToggle(id, !(watch("unit_ids") || []).includes(id))}
                  />
                </div>
              </TabsContent>

              <TabsContent value="photo" className="mt-0">
                <div className="flex flex-col items-center space-y-6 pt-4">
                  <div className="relative">
                    <Avatar className="w-28 h-28 border border-border rounded-full">
                      <AvatarImage src={uploadedImageUrl || ""} className="object-cover" />
                      <AvatarFallback className="bg-muted rounded-full">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                      </AvatarFallback>
                    </Avatar>
                    {uploadedImageUrl && (
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={removePhoto}
                        className="absolute -top-1 -right-1 h-7 w-7 rounded-full shadow-sm"
                        title="Remove photo"
                      >
                        <X className="w-4 h-4" />
                        <span className="sr-only">Remove photo</span>
                      </Button>
                    )}
                  </div>

                  <div className="w-full max-w-sm space-y-3">
                    <FileUploader onUploadComplete={handlePhotoUpload} />
                    <p className="text-xs text-muted-foreground text-center">
                      JPG or PNG, up to 4 MB. Square photos look best.
                    </p>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="p-4 border-t border-border sm:p-6 sm:pt-4">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !isValid}
              title={!isValid ? "Fill in first name, last name, phone and status to continue" : undefined}
              className="min-w-32"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Adding…
                </span>
              ) : (
                "Add member"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
