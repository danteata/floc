"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { getUnitLabels, useTerminology } from "@/hooks/use-terminology"
import { useToast } from "@/hooks/use-toast"
import { convertPlusCodeToLatLng } from "@/lib/google-maps-utils"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { useOrganization } from "@/hooks/use-organization"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Member, UserRole, Unit } from "@/types/database"
import { Badge } from "./ui/badge"
import { MemberLabels, LabelSelector } from "./label-selector"
import { HouseholdPicker } from "./household-picker"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { FileUploader } from "@/components/file-uploader"
import { UnitPicker } from "@/components/unit-picker"
import { X, Crown } from "lucide-react"

const memberSchema = z.object({
  title: z.string().optional(),
  unit_ids: z.array(z.string()).optional(),
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
  avatar: z.string().optional(),
  skills: z.string().optional(),
})

type MemberFormValues = z.infer<typeof memberSchema>

interface MemberEditDialogProps {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function MemberEditDialog({
  member,
  open,
  onOpenChange,
  onSuccess,
}: MemberEditDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("basic")
  const [availableUnits, setAvailableUnits] = useState<any[]>([])
  const [memberUnitIds, setMemberUnitIds] = useState<string[]>([])
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const { toast } = useToast()
  const { terminology } = useTerminology()
  const unitLabels = getUnitLabels(terminology)

  // Split the name into first and last name
  let firstName: string = ""
  let lastName: string = ""
  if (member.name) {
    const nameParts = member.name.split(" ")
    firstName = nameParts[0]
    lastName = nameParts.slice(1).join(" ")
  }

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      title: member.title || "",
      first_name: member.first_name || firstName,
      last_name: member.last_name || lastName,
      email: member.email || "",
      phone: member.phone,
      dob: member.dob || "",
      birth_month: member.birth_month || undefined,
      birth_day: member.birth_day || undefined,
      gender: member.gender || "",
      status: member.status,
      joined_date: member.joined_date,
      address: member.address || "",
      city: member.city || "",
      state: member.state || "",
      zip: member.zip || "",
      country: member.country || "Ghana",
      plus_code: member.plus_code || "",
      unit_ids: memberUnitIds,
      avatar: member.avatar || "",
    },
  });

  const { organization } = useOrganization()
  // Load all units using Convex
  const unitsData = useQuery(api.units.listByOrg, open && organization?._id ? {
    organization_id: organization._id
  } : "skip");
  const updateMember = useMutation(api.members.update);

  useEffect(() => {
    if (unitsData) setAvailableUnits(unitsData.map((u: any) => ({ ...u, id: u._id })));
  }, [unitsData]);

  // Initial loading of member data into form
  useEffect(() => {
    if (open && member) {
      const m = member as any;
      const currentUnitIds = m.unit_ids || [];
      setMemberUnitIds(currentUnitIds);

      setUploadedImageUrl(member.avatar_url || member.avatar || null);

      form.reset({
        title: member.title || "",
        first_name: member.first_name || firstName,
        last_name: member.last_name || lastName,
        email: member.email || "",
        phone: member.phone,
        dob: member.dob || "",
        birth_month: member.birth_month || undefined,
        birth_day: member.birth_day || undefined,
        gender: member.gender || "",
        status: member.status,
        joined_date: member.joined_date,
        address: member.address || "",
        city: member.city || "",
        state: member.state || "",
        zip: member.zip || "",
        country: member.country || "Ghana",
        plus_code: member.plus_code || "",
        unit_ids: currentUnitIds,
        avatar: member.avatar_url || member.avatar || "",
        skills: (member as any).skills || "",
      });
    }
  }, [open, member, form]);

  const handlePhotoUpload = (storageId: string, previewUrl?: string) => {
    setUploadedImageUrl(previewUrl || storageId)
    form.setValue("avatar", storageId)
  }

  const removePhoto = () => {
    setUploadedImageUrl(null)
    form.setValue("avatar", "")
  }

  async function onSubmit(data: MemberFormValues) {
    setIsLoading(true)
    try {
      let latLng: { lat: number; lng: number } | null = null;
      if (data.plus_code) {
        latLng = await convertPlusCodeToLatLng(data.plus_code);
      }
      const normalizedPhone = (data.phone || "").replace(/\D/g, "")

      await updateMember({
        id: member._id || (member as any).id,
        updates: {
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
          plus_code: data.plus_code,
          latitude: latLng?.lat,
          longitude: latLng?.lng,
          avatar_url: data.avatar,
          skills: data.skills,
        },
        unit_ids: data.unit_ids ? data.unit_ids.map(id => id as any) : [],
      });

      toast({
        title: "Member updated",
        description: `Changes to ${data.first_name} ${data.last_name} are saved.`,
      })

      onOpenChange(false)
      if (onSuccess) onSuccess()
    } catch (error: any) {
      console.error("Error updating member:", error)
      toast({
        title: "Couldn't save the member",
        description: error.message || "Something went wrong. Try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col w-[calc(100%-2rem)] sm:w-[700px] max-h-[90vh] p-0 overflow-hidden"
      >
        <DialogHeader className="px-4 pt-6 pb-2 shrink-0 sm:px-6">
          <DialogTitle className="text-xl tracking-tight">Edit {member.name || "member"}</DialogTitle>
          <DialogDescription>
            Update their details, units, household and labels.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit as any)} className="flex flex-col flex-1 min-h-0">
            {/* Scrollable body: only this area scrolls, so the footer below stays
                reachable no matter how tall a given tab's content is (e.g. a long
                unit list). */}
            <div className="px-4 pb-6 flex-1 min-h-0 overflow-y-auto sm:px-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="mb-6 flex h-10 w-full justify-start overflow-x-auto p-1 sm:grid sm:grid-cols-6">
                  <TabsTrigger value="basic" className="flex-none px-3 text-xs sm:flex-1 sm:px-1.5">Basic</TabsTrigger>
                  <TabsTrigger value="contact" className="flex-none px-3 text-xs sm:flex-1 sm:px-1.5">Contact</TabsTrigger>
                  <TabsTrigger value="photo" className="flex-none px-3 text-xs sm:flex-1 sm:px-1.5">Photo</TabsTrigger>
                  <TabsTrigger value="unit" className="flex-none px-3 text-xs sm:flex-1 sm:px-1.5">{unitLabels.single}</TabsTrigger>
                  <TabsTrigger value="household" className="flex-none px-3 text-xs sm:flex-1 sm:px-1.5">Household</TabsTrigger>
                  <TabsTrigger value="labels" className="flex-none px-3 text-xs sm:flex-1 sm:px-1.5">Labels</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4 mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control as any}
                      name="title"
                      render={({ field }) => (
                        <FormItem className="md:col-span-1">
                          <FormLabel className="text-sm font-medium">Title</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Mr">Mr</SelectItem>
                              <SelectItem value="Mrs">Mrs</SelectItem>
                              <SelectItem value="Ms">Ms</SelectItem>
                              <SelectItem value="Dr">Dr</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control as any}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem className="md:col-span-3">
                          <FormLabel className="text-sm font-medium">First name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control as any}
                      name="last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Last name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control as any}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Gender</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control as any}
                    name="dob"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Date of birth</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control as any}
                      name="birth_month"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Birth month</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select month" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">January</SelectItem>
                              <SelectItem value="2">February</SelectItem>
                              <SelectItem value="3">March</SelectItem>
                              <SelectItem value="4">April</SelectItem>
                              <SelectItem value="5">May</SelectItem>
                              <SelectItem value="6">June</SelectItem>
                              <SelectItem value="7">July</SelectItem>
                              <SelectItem value="8">August</SelectItem>
                              <SelectItem value="9">September</SelectItem>
                              <SelectItem value="10">October</SelectItem>
                              <SelectItem value="11">November</SelectItem>
                              <SelectItem value="12">December</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control as any}
                      name="birth_day"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Birth day</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select day" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                <SelectItem key={day} value={day.toString()}>
                                  {day}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control as any}
                    name="skills"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Skills and talents</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Singing, playing an instrument, teaching" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </TabsContent>

                <TabsContent value="contact" className="space-y-4 mt-0">
                  <FormField
                    control={form.control as any}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Email address</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control as any}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Phone number</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control as any}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Home address</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control as any}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">City</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control as any}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Region or state</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control as any}
                      name="zip"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Postcode</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control as any}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Country</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control as any}
                    name="plus_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Plus code (for the map pin)</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="photo" className="space-y-4 mt-0">
                  <div className="space-y-6 flex flex-col items-center pt-2">
                    <div className="relative group">
                      <Avatar className="size-32 ring-1 ring-border">
                        <AvatarImage src={uploadedImageUrl || ""} alt="Member photo" />
                        <AvatarFallback className="bg-primary/10 font-semibold text-primary text-3xl">
                          {form.watch("first_name") && form.watch("last_name")
                            ? `${form.watch("first_name")[0]}${form.watch("last_name")[0]}`.toUpperCase()
                            : "?"}
                        </AvatarFallback>
                      </Avatar>
                      {uploadedImageUrl && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute bottom-1 right-1 rounded-full w-8 h-8 p-0 border-2 border-background"
                          onClick={removePhoto}
                        >
                          <X className="w-4 h-4" />
                          <span className="sr-only">Remove photo</span>
                        </Button>
                      )}
                    </div>

                    <div className="w-full">
                      <FileUploader onUploadComplete={handlePhotoUpload} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="unit" className="space-y-6 mt-0">
                  <FormField
                    control={form.control as any}
                    name="joined_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Date joined</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="unit_ids"
                    control={form.control as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">{unitLabels.plural}</FormLabel>
                        <UnitPicker
                          units={availableUnits}
                          selectedIds={field.value || []}
                          onToggle={(id) => {
                            const current = field.value || [];
                            field.onChange(
                              current.includes(id)
                                ? current.filter((m: string) => m !== id)
                                : [...current, id]
                            );
                          }}
                        />
                      </FormItem>
                    )}
                  />

                  {/* Units Led Section */}
                  <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    <div className="flex items-center gap-2 mb-3">
                      <Crown className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold text-foreground">Leads</h4>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {availableUnits.filter(u => {
                        const memberId = (member as any)._id || (member as any).id;
                        if (!u.leader_id) return false;
                        if (typeof u.leader_id === 'object' && u.leader_id !== null) {
                          return u.leader_id.toString() === memberId?.toString();
                        }
                        return u.leader_id === memberId;
                      }).length > 0 ? (
                        availableUnits
                          .filter(u => {
                            const memberId = (member as any)._id || (member as any).id;
                            if (!u.leader_id) return false;
                            if (typeof u.leader_id === 'object' && u.leader_id !== null) {
                              return u.leader_id.toString() === memberId?.toString();
                            }
                            return u.leader_id === memberId;
                          })
                          .map(unit => (
                            <div key={unit.id} className="flex items-center gap-3 p-2 bg-muted/40 rounded-lg border border-border">
                              <div className="flex-1">
                                <p className="text-sm text-foreground">{unit.name}</p>
                                <p className="text-xs text-muted-foreground">{unit.type}</p>
                              </div>
                              <Badge variant="secondary">{unitLabels.leader || "Leader"}</Badge>
                            </div>
                          ))
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">Doesn't lead any {unitLabels.plural?.toLowerCase() || "units"} yet</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Leaders are set on the {unitLabels.plural?.toLowerCase() || "units"} page.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="household" className="space-y-4 mt-0">
                  <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    {organization?._id ? (
                      <HouseholdPicker
                        memberId={((member as any)._id || (member as any).id) as Id<"members">}
                        organizationId={organization._id}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">Households load once your church is set up.</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="labels" className="space-y-4 mt-0">
                  <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    <LabelSelector
                      memberId={(member as any)._id || (member as any).id || ''}
                      variant="full"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Sticky footer: stays visible regardless of scroll position in the
                body above, so Submit is always reachable. */}
            <div className="shrink-0 px-4 py-4 flex items-center justify-between border-t border-border sm:px-6">
              <Button
                variant="ghost"
                type="button"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
