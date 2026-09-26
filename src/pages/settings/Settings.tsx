import { useState } from "react"
import {
    Calendar,
    Home,
    Mail,
    UserIcon as Male,
    MapPin,
    Settings,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LayoutWrapper } from "@/components/layout-wrapper"
import { PageHeader } from "@/components/ui/page-header"

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState("Profile")

    const tabs = ["My details", "Profile", "Password", "Email", "Notification"]

    return (
        <LayoutWrapper>
            <div className="max-w-4xl mx-auto space-y-6">
                <PageHeader title="Settings" description="Your account and preferences." />

                <div className="glass-card border-border/50 shadow-soft rounded-xl overflow-hidden p-6 md:p-8">
                    {/* Tabs */}
                    <div className="flex overflow-x-auto pb-4 mb-6 gap-2 no-scrollbar border-b border-border/40">
                        {tabs.map((tab) => (
                            <button
                                key={tab}
                                className={`px-4 py-2 text-sm rounded-full transition-all whitespace-nowrap ${activeTab === tab
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Profile Content */}
                    {activeTab === "Profile" && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div>
                                <h2 className="text-xl font-semibold tracking-tight mb-1">Profile</h2>
                                <p className="text-sm text-muted-foreground">Update your photo and personal details here.</p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-muted/30 rounded-xl border border-border/40">
                                <Avatar className="h-24 w-24 border-4 border-background shadow-soft">
                                    <AvatarImage src="/placeholder.svg?height=96&width=96" alt="Profile" />
                                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">U</AvatarFallback>
                                </Avatar>
                                <div className="space-y-3 text-center sm:text-left">
                                    <div>
                                        <h3 className="font-medium">Your Photo</h3>
                                        <p className="text-xs text-muted-foreground">This will be displayed on your profile.</p>
                                    </div>
                                    <div className="flex gap-3 justify-center sm:justify-start">
                                        <Button variant="outline" size="sm" className="h-9 shadow-sm">
                                            Delete
                                        </Button>
                                        <Button size="sm" className="h-9 shadow-sm">
                                            Update
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-muted-foreground tracking-wider">Live in</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-3 text-muted-foreground h-4 w-4" />
                                        <Input className="pl-10 bg-background/50 border-input-border focus:ring-primary/20 transition-all" defaultValue="Zurich, Switzerland" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-muted-foreground tracking-wider">Street Address</label>
                                    <div className="relative">
                                        <Home className="absolute left-3 top-3 text-muted-foreground h-4 w-4" />
                                        <Input className="pl-10 bg-background/50 border-input-border focus:ring-primary/20 transition-all" defaultValue="2445 Crosswind Drive" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-muted-foreground tracking-wider">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-3 text-muted-foreground h-4 w-4" />
                                        <Input className="pl-10 bg-background/50 border-input-border focus:ring-primary/20 transition-all" defaultValue="uihutofficial@gmail.com" />
                                    </div>
                                </div>

                                <div className="hidden md:block"></div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-muted-foreground tracking-wider">Date Of Birth</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-3 text-muted-foreground h-4 w-4" />
                                        <Input className="pl-10 bg-background/50 border-input-border focus:ring-primary/20 transition-all" defaultValue="07.12.1995" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-muted-foreground tracking-wider">Gender</label>
                                    <div className="relative">
                                        <Male className="absolute left-3 top-3 text-muted-foreground h-4 w-4" />
                                        <Input className="pl-10 bg-background/50 border-input-border focus:ring-primary/20 transition-all" defaultValue="Male" />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-border/40">
                                <h3 className="text-lg font-semibold mb-4">Social Profiles</h3>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-muted-foreground tracking-wider">Facebook</label>
                                        <div className="flex shadow-sm rounded-md">
                                            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input-border bg-muted/50 text-muted-foreground text-sm">facebook.com/</span>
                                            <Input className="rounded-l-none bg-background/50 border-input-border focus:ring-primary/20 transition-all" placeholder="username" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-muted-foreground tracking-wider">Twitter</label>
                                        <div className="flex shadow-sm rounded-md">
                                            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input-border bg-muted/50 text-muted-foreground text-sm">twitter.com/</span>
                                            <Input className="rounded-l-none bg-background/50 border-input-border focus:ring-primary/20 transition-all" placeholder="username" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <Button variant="ghost">Cancel</Button>
                                <Button className="shadow-lg shadow-primary/20">Save Changes</Button>
                            </div>
                        </div>
                    )}

                    {activeTab !== "Profile" && (
                        <div className="py-20 text-center text-muted-foreground animate-in fade-in zoom-in-95 duration-300">
                            <div className="p-4 bg-muted/30 rounded-full w-fit mx-auto mb-4">
                                <Settings className="h-8 w-8 opacity-50" />
                            </div>
                            <h3 className="text-lg mb-1">Coming Soon</h3>
                            <p className="text-sm">The {activeTab} settings are currently under development.</p>
                        </div>
                    )}
                </div>
            </div>
        </LayoutWrapper>
    )
}
