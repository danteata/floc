'use client'

import { useMemo } from "react";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Loader2, Crown } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import MapView from "../../../components/map-view";
import { Member } from "@/types/database";
import { useSubscription } from "@/providers/SubscriptionProvider";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useUserRole } from "@/hooks/use-user-role";

export default function MapPage() {
    const { isPro, loading: subLoading } = useSubscription();
    const { role } = useUserRole();
    const isSuperAdmin = role === "super_admin";
    const canUseMap = isPro || isSuperAdmin;

    const membersData = useQuery(
        api.members.getAll,
        canUseMap ? {} : "skip",
    );
    const householdsData = useQuery(
        api.households.list,
        canUseMap ? {} : "skip",
    );
    const members = ((membersData ?? []) as unknown as Member[]).map((m: any) => ({
        ...m,
        id: m._id || m.id
    }));

    // One pin per household (its own address) instead of one per member living
    // there; members with no household, or whose household has no address set
    // yet, still get their own pin exactly as before.
    const pins = useMemo(() => {
        const householdById = new Map((householdsData ?? []).map((h) => [h._id as string, h]));
        const seenHouseholds = new Set<string>();
        const result: Member[] = [];

        for (const member of members) {
            const householdId = member.household_id as string | undefined;
            const household = householdId ? householdById.get(householdId) : undefined;

            if (household?.latitude && household?.longitude) {
                if (!seenHouseholds.has(householdId!)) {
                    seenHouseholds.add(householdId!);
                    const names = (household.members ?? []).map((m) => m.name).join(", ");
                    result.push({
                        ...member,
                        id: `household-${householdId}`,
                        name: household.name || names || member.name,
                        phone: undefined,
                        latitude: household.latitude,
                        longitude: household.longitude,
                    } as unknown as Member);
                }
                continue;
            }

            result.push(member);
        }
        return result;
    }, [members, householdsData]);

    return (
        <LayoutWrapper>
            <div className="container mx-auto flex flex-col gap-6 py-6">
                <PageHeader title="Member map" description="Where your members live, one pin per household." />
                <Card>
                    <CardContent>
                        {subLoading ? (
                            <div className="h-[400px] bg-muted rounded-lg flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : !canUseMap ? (
                            <div className="h-[400px] rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-4 px-6 text-center">
                                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Crown className="h-6 w-6 text-primary" />
                                </div>
                                <div className="space-y-1 max-w-sm">
                                    <h3 className="font-semibold">Member map is a Pro feature</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Upgrade to plot member addresses, plan outreach, and see your congregation geographically.
                                    </p>
                                </div>
                                <Button asChild>
                                    <Link to="/billing">Upgrade to Pro</Link>
                                </Button>
                            </div>
                        ) : membersData === undefined || householdsData === undefined ? (
                            <div className="h-[600px] bg-muted rounded-lg flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <MapView members={pins} />
                        )}
                    </CardContent>
                </Card>
            </div>
        </LayoutWrapper>
    );
}
