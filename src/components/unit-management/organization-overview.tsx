'use client'

import { StatCard, StatGrid } from '@/components/ui/stat-card'
import { Users, Layers, Target, Briefcase } from 'lucide-react'

interface OrganizationOverviewProps {
  organization: {
    units?: any[];
    totalMembers?: number;
  } | null
}

export function OrganizationOverview({ organization }: OrganizationOverviewProps) {
  if (!organization) return null;

  const totalUnits = organization.units?.length || 0;
  const totalMembers = organization.totalMembers || 0;
  // Combine functional and ministry units (ministry is a subset of functional)
  const functionalUnits = organization.units?.filter(u => u.type === 'functional' || u.type === 'ministry')?.length || 0;
  const adminUnits = organization.units?.filter(u => u.type === 'administrative' || u.type === 'geographic')?.length || 0;

  return (
    <StatGrid>
      <StatCard label="Total members" value={totalMembers} icon={Users} />
      <StatCard label="Total units" value={totalUnits} icon={Layers} />
      <StatCard label="Functional units" value={functionalUnits} icon={Target} />
      <StatCard label="Admin units" value={adminUnits} icon={Briefcase} />
    </StatGrid>
  )
}
