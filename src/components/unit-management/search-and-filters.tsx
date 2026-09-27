'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Grid3X3, List } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchAndFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  filterType: 'all' | 'administrative' | 'functional' | 'geographic'
  onFilterTypeChange: (value: any) => void
  filterInheritance: 'all' | 'direct' | 'inherited' | 'template'
  onFilterInheritanceChange: (value: 'all' | 'direct' | 'inherited' | 'template') => void
  viewMode: 'grid' | 'list'
  onViewModeChange: (mode: 'grid' | 'list') => void
}

export function SearchAndFilters({
  searchTerm,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterInheritance,
  onFilterInheritanceChange,
  viewMode,
  onViewModeChange,
}: SearchAndFiltersProps) {
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 border border-border/50 rounded-xl bg-card">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full">
        <div className="relative w-full md:w-auto md:min-w-[300px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search units…"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-10 w-full rounded-lg bg-background/50 border-input-border focus:ring-1 focus:ring-primary/20"
          />
        </div>

        <Select value={filterType} onValueChange={onFilterTypeChange}>
          <SelectTrigger className="h-10 w-full md:w-[180px] rounded-lg bg-background/50 border-input-border">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-lg border-border/50">
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="administrative">Administrative</SelectItem>
            <SelectItem value="functional">Functional</SelectItem>
            <SelectItem value="geographic">Geographic</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterInheritance} onValueChange={onFilterInheritanceChange}>
          <SelectTrigger className="h-10 w-full md:w-[180px] rounded-lg bg-background/50 border-input-border">
            <SelectValue placeholder="Inheritance" />
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-lg border-border/50">
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
            <SelectItem value="inherited">Inherited</SelectItem>
            <SelectItem value="template">Templates</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
        <Button
          variant={viewMode === 'grid' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('grid')}
          aria-label="Grid view"
          className={cn("h-8 px-3 rounded-md transition-all", viewMode === 'grid' && "bg-background text-foreground shadow-sm hover:bg-background")}
        >
          <Grid3X3 className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === 'list' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('list')}
          aria-label="List view"
          className={cn("h-8 px-3 rounded-md transition-all", viewMode === 'list' && "bg-background text-foreground shadow-sm hover:bg-background")}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
