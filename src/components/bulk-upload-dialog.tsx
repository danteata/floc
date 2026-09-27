"use client"

import { useState, useCallback, useMemo } from "react"
import { AlertCircle, Check, Download, FileSpreadsheet, Upload, X, Loader2 } from "lucide-react"
import * as XLSX from "xlsx"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMutation, useQuery } from "convex/react"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { api } from "../../convex/_generated/api"
import { useOrganization } from "@/hooks/use-organization"
import { Id } from "../../convex/_generated/dataModel"

interface BulkUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type UploadStatus = "idle" | "uploading" | "validating" | "preview" | "success" | "error"

interface PreviewData {
  firstName: string
  lastName: string
  otherNames?: string
  email: string
  rawUnits: { name: string, type: string }[]
  displayUnitNames: string[]
  location: string
  phone: string
  status: string
  joinDate: string
  dob?: string
  birthMonth?: number
  birthDay?: number
  gender?: string
  address?: string
  plusCode?: string
  matchStatus?: "update" | "create"
  isValid: boolean
  errors?: string[]
}

export function BulkUploadDialog({ open, onOpenChange, onSuccess }: BulkUploadDialogProps) {
  const { organization } = useOrganization()
  const createBulk = useMutation(api.members.createBulk)
  const allUnitsQuery = useQuery(api.units.list, organization?._id ? {} : "skip")
  const allUnits = allUnitsQuery || []
  const existingMembers = useQuery(api.members.getAll, organization?._id ? { organization_id: organization._id } : "skip")
  const { trackEvent } = useAnalytics()

  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [targetUnitId, setTargetUnitId] = useState<string>("")

  const normalizePhone = (phone?: string | null) => {
    let cleaned = (phone || "").replace(/\D/g, "")

    // Remove country code prefix if present (+233 or 233)
    if (cleaned.startsWith("233") && cleaned.length > 9) {
      cleaned = cleaned.substring(3) // Remove '233' prefix
    }

    // If phone has exactly 9 digits, it's likely missing the leading '0'
    if (cleaned.length === 9) {
      return "0" + cleaned
    }

    return cleaned
  }

  const extractFirstName = (fullName?: string | null) => (fullName || "").trim().split(/\s+/)[0]?.toLowerCase() ?? ""

  const existingMemberIndex = useMemo(() => {
    const index = new Map<string, Set<string>>()
    if (!existingMembers) return index
    for (const m of existingMembers as any[]) {
      const phone = normalizePhone(m.phone)
      if (!phone) continue
      const first = extractFirstName(m.name)
      if (!first) continue
      const bucket = index.get(phone) ?? new Set<string>()
      bucket.add(first)
      index.set(phone, bucket)
    }
    return index
  }, [existingMembers])

  const validateRecord = useCallback((record: any): PreviewData => {
    const errors: string[] = []

    const getValue = (keys: string[]): string => {
      for (const key of keys) {
        if (record[key] !== undefined && record[key] !== null) {
          return String(record[key]).trim()
        }
        const lowerKey = key.toLowerCase()
        const recordKey = Object.keys(record).find(k => {
          const kLower = k.toLowerCase()
          return kLower === lowerKey ||
            kLower.replace(/_/g, '') === lowerKey.replace(/_/g, '') ||
            kLower.replace(/\s/g, '') === lowerKey.replace(/\s/g, '')
        })
        if (recordKey && record[recordKey] !== undefined && record[recordKey] !== null) {
          return String(record[recordKey]).trim()
        }
      }
      return ""
    }

    let email = getValue(["email", "e-mail", "mail"])
    const phone = getValue(["phone", "mobile", "cell", "telephone", "contact"])
    let cleanPhone = ""
    if (phone) {
      cleanPhone = normalizePhone(phone)
    }

    let status = getValue(["status", "member_status", "membership"]).toLowerCase()
    if (!["active", "inactive", "visitor"].includes(status)) {
      status = "active"
    }

    const dobValue = getValue(["dob", "date_of_birth", "birthday", "birth_date"])
    let dob = ""
    let birthMonth: number | undefined
    let birthDay: number | undefined

    if (dobValue) {
      const d = new Date(dobValue)
      if (!isNaN(d.getTime())) {
        dob = format(d, "yyyy-MM-dd")
        birthMonth = d.getMonth() + 1
        birthDay = d.getDate()
      } else {
        const parts = dobValue.split(/[-/]/)
        if (parts.length === 3) {
          let y, m, day;
          if (parts[0].length === 4) { [y, m, day] = parts }
          else { [day, m, y] = parts }
          const pd = new Date(`${y}-${m}-${day}`)
          if (!isNaN(pd.getTime())) {
            dob = format(pd, "yyyy-MM-dd")
            birthMonth = pd.getMonth() + 1
            birthDay = pd.getDate()
          }
        }
      }
    }

    if (!birthMonth || !birthDay) {
      const monthValue = getValue(["birthMonth", "month", "birth_month", "month of birth", "birth month"])
      const dayValue = getValue(["birthDay", "day", "birth_day", "day of the month", "day of month", "birth day"])

      if (monthValue) {
        const month = parseInt(monthValue)
        if (!isNaN(month) && month >= 1 && month <= 12) {
          birthMonth = month
        } else {
          const monthMap: Record<string, number> = {
            'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
            'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
            'aug': 8, 'august': 8, 'sep': 9, 'september': 9, 'oct': 10, 'october': 10,
            'nov': 11, 'november': 11, 'dec': 12, 'december': 12
          }
          const monthStr = monthValue.toLowerCase().substring(0, 3)
          if (monthMap[monthStr]) birthMonth = monthMap[monthStr]
        }
      }

      if (dayValue) {
        const day = parseInt(dayValue)
        if (!isNaN(day) && day >= 1 && day <= 31) birthDay = day
      }
    }

    // Parse first name: handle multiple names by taking only the first one
    const rawFirstName = getValue(["first name", "firstname", "firstName", "first_name", "given_name", "forename"])
    const rawLastName = getValue(["last name", "lastname", "lastName", "last_name", "surname", "family_name"])

    // Split first name if it contains multiple names (space-separated)
    const nameParts = rawFirstName.trim().split(/\s+/)
    let firstName = nameParts[0] || ""
    const otherNames = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined

    let lastName = rawLastName

    const fullName = getValue(["full name", "fullname", "name"])
    if ((!firstName || !lastName) && fullName) {
      const parts = fullName.trim().split(/\s+/)
      if (parts.length > 0) {
        if (!firstName) firstName = parts[0]
        if (!lastName) lastName = parts.slice(1).join(" ")
      }
    }

    const errorsList: string[] = []
    if (!firstName) errorsList.push("First name is missing")
    if (!lastName) errorsList.push("Last name is missing")

    if (!email && firstName && lastName && organization?.name) {
      const cleanOrg = organization.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '')
      const cleanLast = lastName.toLowerCase().replace(/[^a-z0-9]/g, '')
      email = `${cleanFirst}.${cleanLast}@${cleanOrg}.com`
    }

    const rawUnits: { name: string, type: string }[] = []

    const regionInput = getValue(["region", "zone", "area", "territory"])
    if (regionInput) {
      regionInput.split(/[,;&]/).forEach(r => {
        const name = r.trim()
        if (name) rawUnits.push({ name, type: 'geographic' })
      })
    }

    const ministryInput = getValue(["ministries", "ministry", "department", "group", "basonta"])
    if (ministryInput) {
      ministryInput.split(/[,;&]/).forEach(m => {
        const name = m.trim()
        if (name) rawUnits.push({ name, type: 'functional' })
      })
    }

    const genericUnitsInput = getValue(["units", "unit", "groups", "teams"])
    if (genericUnitsInput) {
      genericUnitsInput.split(/[,;&]/).forEach(u => {
        const name = u.trim()
        if (name) rawUnits.push({ name, type: 'functional' })
      })
    }

    const uniqueUnits = Array.from(new Map(rawUnits.map(item => [item.name, item])).values());

    const physicalAddress = getValue(["physical address", "address"])
    const location = getValue(["location", "residence"])
    const plusCode = getValue(["gps address", "plus code", "plus_code", "g plus code", "g plus co"])
    const gender = getValue(["gender", "sex"])

    const matchStatus = cleanPhone && existingMemberIndex.get(cleanPhone)?.has(firstName.toLowerCase())
      ? "update"
      : "create"

    return {
      firstName,
      lastName,
      otherNames,
      email,
      phone: cleanPhone,
      location,
      address: physicalAddress || location,
      plusCode: plusCode || undefined,
      gender: gender || undefined,
      status,
      joinDate: getValue(["joinDate", "join_date", "dateJoined"]),
      dob: dob || undefined,
      birthMonth,
      birthDay,
      rawUnits: uniqueUnits,
      displayUnitNames: uniqueUnits.map(u => u.name),
      matchStatus,
      isValid: errorsList.length === 0,
      errors: errorsList.length > 0 ? errorsList : undefined
    }
  }, [allUnits, organization, existingMemberIndex])

  const processFile = (file: File) => {
    setFileName(file.name)
    setUploadStatus("uploading")
    setProgress(0)

    const reader = new FileReader()
    reader.onload = (e) => {
      setProgress(50)
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        setUploadStatus("validating")
        setProgress(80)

        const validatedData = jsonData.map((record: any) => validateRecord(record))

        setPreviewData(validatedData)
        setUploadStatus("preview")
        setProgress(100)
      } catch (err: any) {
        console.error("Parse error:", err)
        setErrorMessage("Couldn't read that file. Check it's a CSV or Excel file (.csv, .xlsx or .xls) and try again.")
        setUploadStatus("error")
      }
    }
    reader.onerror = () => {
      setErrorMessage("Couldn't open that file. Try again, or save it again and re-upload.")
      setUploadStatus("error")
    }
    reader.readAsArrayBuffer(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleConfirmUpload = async () => {
    const validRecords = previewData.filter(r => r.isValid)
    const invalidCount = previewData.length - validRecords.length

    if (validRecords.length === 0) {
      setErrorMessage("No rows are ready to import. Each row needs a first and last name.")
      return
    }

    setUploadStatus("uploading")
    try {
      const membersToInsert = validRecords.map(r => ({
        name: r.otherNames ? `${r.firstName} ${r.otherNames} ${r.lastName}`.trim() : `${r.firstName} ${r.lastName}`.trim(),
        first_name: r.firstName,
        last_name: r.lastName,
        other_names: r.otherNames,
        email: r.email,
        phone: r.phone || "0000000000",
        status: r.status,
        dob: r.dob,
        birth_month: r.birthMonth,
        birth_day: r.birthDay,
        gender: r.gender,
        address: r.address || undefined,
        plus_code: r.plusCode || undefined,
        units: r.rawUnits
      }))

      const result = await createBulk({
        members: membersToInsert,
        target_unit_id: (targetUnitId && targetUnitId !== "org_wide") ? targetUnitId as Id<"units"> : undefined,
        organization_id: organization?._id
      })

      const created = (result as any)?.created ?? validRecords.length
      const updated = (result as any)?.updated ?? 0

      trackEvent(AnalyticsEventType.MEMBER_BULK_UPLOADED, {
        created_count: created,
        updated_count: updated,
        skipped_count: invalidCount,
        target_unit_id: !!targetUnitId,
      });

      setErrorMessage(`${created} added, ${updated} updated, ${invalidCount} skipped.`)
      setUploadStatus("success")
      onSuccess?.()
    } catch (err: any) {
      console.error("Upload error:", err)
      setErrorMessage(err.message || "Couldn't import the members. Try again.")
      setUploadStatus("error")
    }
  }

  const handleDownloadTemplate = () => {
    const template = [{
      "First Name": "Jerome",
      "Surname": "Kudanu",
      "Contact": "0509502393",
      "Gender": "Male",
      "Month": "9",
      "Day": "8",
      "Location": "Ogbojo",
      "Physical Address": "29 Boundary Street",
      "GPS Address": "GD-107-2177",
      "Units": "Dancing Stars, Technical & Media",
      "Region": "South Region",
      "G Plus Code": "GD-107-2177",
    }]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Members")
    XLSX.writeFile(wb, "bulk-upload-template.xlsx")
  }

  const handleReset = () => {
    setUploadStatus("idle")
    setProgress(0)
    setFileName(null)
    setPreviewData([])
    setErrorMessage(null)
  }

  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

  const validCount = previewData.filter(r => r.isValid).length
  const invalidCount = previewData.length - validCount

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk upload members</DialogTitle>
          <DialogDescription>Add or update members from a CSV or Excel file. A row updates an existing member when the first name and phone number match.</DialogDescription>
        </DialogHeader>

        {uploadStatus === "idle" && (
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="template">Template</TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="border-2 border-dashed rounded-lg p-8 text-center sm:p-12" onDrop={handleDrop} onDragOver={handleDragOver}>
              <input type="file" id="bulk-upload-file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
              <label htmlFor="bulk-upload-file" className="cursor-pointer flex flex-col items-center">
                <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="font-medium">Drop a file here, or click to choose one</p>
                <p className="text-xs text-muted-foreground mt-1">CSV, XLSX or XLS</p>
              </label>
            </TabsContent>
            <TabsContent value="template" className="pt-4 text-center">
              <p className="text-sm text-muted-foreground mb-4">Download the template to see which columns to use.</p>
              <Button onClick={handleDownloadTemplate} variant="outline">
                <Download className="mr-2 h-4 w-4" /> Download template
              </Button>
            </TabsContent>
          </Tabs>
        )}

        {(uploadStatus === "uploading" || uploadStatus === "validating") && (
          <div className="py-8 space-y-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm">{uploadStatus === "uploading" ? "Uploading…" : "Checking rows…"}</p>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {uploadStatus === "preview" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm">{fileName}</p>
              <div className="flex gap-2">
                <Badge className="bg-success/15 text-success-strong">{validCount} ready</Badge>
                {invalidCount > 0 && <Badge className="bg-destructive/15 text-destructive-strong">{invalidCount} with problems</Badge>}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Add everyone to a unit <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Select value={targetUnitId} onValueChange={setTargetUnitId}>
                <SelectTrigger><SelectValue placeholder="Choose a unit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_wide">No unit (whole church)</SelectItem>
                  {allUnits.map(u => (
                    <SelectItem key={u._id} value={u._id}>{u.name} ({u.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Regions and groups named in the file are created for you if they don't exist yet.
              </p>
            </div>

            <div className="border rounded-md max-h-[400px] overflow-auto text-xs">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap w-10"><span className="sr-only">Ready</span></TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap w-20">Action</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">First name</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Other names</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Last name</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Email</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Phone</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Status</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Gender</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Birthday</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Location</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Address</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Plus code</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Region</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap">Units and groups</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 whitespace-nowrap w-16">Problems</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.slice(0, 50).map((r, i) => (
                    <TableRow key={i} className={r.isValid ? "" : "bg-destructive/10"}>
                      <TableCell>{r.isValid ? <Check className="h-4 w-4 text-success-strong" /> : <X className="h-4 w-4 text-destructive-strong" />}</TableCell>
                      <TableCell>
                        <Badge className={r.matchStatus === "update" ? "bg-warning/15 text-warning-strong" : "bg-success/15 text-success-strong"}>
                          {r.matchStatus === "update" ? "Update" : "Add"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{r.firstName}</TableCell>
                      <TableCell>{r.otherNames || ""}</TableCell>
                      <TableCell className="font-medium">{r.lastName}</TableCell>
                      <TableCell>{r.email || ""}</TableCell>
                      <TableCell>{r.phone || ""}</TableCell>
                      <TableCell>
                        <Badge className={
                          r.status === "active" ? "bg-success/15 text-success-strong" :
                            r.status === "inactive" ? "bg-warning/15 text-warning-strong" :
                              "bg-info/15 text-info-strong"
                        }>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.gender || ""}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.dob ? format(new Date(`${r.dob}T00:00:00`), "d MMM yyyy") : r.birthMonth && r.birthDay ? format(new Date(2000, r.birthMonth - 1, r.birthDay), "d MMM") : ""}</TableCell>
                      <TableCell>{r.location || ""}</TableCell>
                      <TableCell className="max-w-[150px] truncate" title={r.address}>{r.address || ""}</TableCell>
                      <TableCell>{r.plusCode || ""}</TableCell>
                      <TableCell>{r.rawUnits.filter(u => u.type === 'geographic').map(u => u.name).join(", ") || ""}</TableCell>
                      <TableCell>{r.rawUnits.filter(u => u.type === 'functional').map(u => u.name).join(", ") || ""}</TableCell>
                      <TableCell>
                        {r.errors ? (
                          <span className="inline-flex items-center gap-1 text-destructive-strong" title={r.errors.join(", ")}>
                            <AlertCircle className="h-4 w-4" aria-hidden="true" />
                            <span className="whitespace-nowrap">{r.errors.join(", ")}</span>
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {previewData.length > 50 && <p className="p-2 text-center text-muted-foreground">Showing the first 50 of {previewData.length} rows. Every ready row will be imported.</p>}
            </div>
          </div>
        )}

        {uploadStatus === "success" && (
          <div className="py-8 text-center space-y-2">
            <Check className="h-12 w-12 text-success-strong mx-auto" />
            <h3 className="text-lg font-semibold">Members imported</h3>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        )}

        {uploadStatus === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Couldn't import the file</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          {uploadStatus === "idle" && <Button variant="ghost" onClick={handleClose}>Cancel</Button>}
          {uploadStatus === "preview" && (
            <>
              <Button variant="ghost" onClick={handleReset}>Choose another file</Button>
              <Button onClick={handleConfirmUpload} disabled={validCount === 0}>Import {validCount} {validCount === 1 ? "member" : "members"}</Button>
            </>
          )}
          {uploadStatus === "success" && <Button onClick={handleClose}>Done</Button>}
          {uploadStatus === "error" && <Button onClick={handleReset}>Try again</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}