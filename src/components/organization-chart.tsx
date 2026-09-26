'use client'

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Building2,
  MapPin,
  Users,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'
import { useUserRole } from '@/hooks/use-user-role'
import { useToast } from '@/hooks/use-toast'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'
import { NoAccess } from "@/components/ui/no-access"
import { LoadingState } from "@/components/ui/loading-state"

interface ChartNode {
  id: string
  name: string
  type: 'organization' | 'division' | 'unit'
  unitType?: string // The actual unit type from database (ministry, administrative, geographic)
  level: number
  parentId?: string
  children: ChartNode[]
  memberCount: number
  /** False when this node's subtree is collapsed — its children are laid out
      and rendered as if it were a leaf. */
  isExpanded: boolean
  /** Every node beneath this one, collapsed or not. Shown on the toggle so a
      collapsed branch still says how much it is hiding. */
  descendantCount: number
  x: number
  y: number
  width: number
  height: number
}

interface OrganizationChartProps {
  organizationId?: string
  onUnitMove?: (unitId: string, targetType: 'division' | 'organization', targetId?: string) => void
}

export function OrganizationChart({ organizationId }: OrganizationChartProps) {
  const { isAdmin, role, isLoading: roleLoading } = useUserRole()
  const { toast } = useToast()

  // State
  const [selectedNode, setSelectedNode] = useState<ChartNode | null>(null)
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [showDetails, setShowDetails] = useState(true)
  // Ids whose subtree is hidden. A wide org fans out dozens of units off both
  // edges of the viewport; collapsing branches is what makes it readable.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null)
  const [dragOverLine, setDragOverLine] = useState<{ parentId: string; childId: string } | null>(null)
  const [draggedNode, setDraggedNode] = useState<ChartNode | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const gRef = useRef<SVGGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasAutoFitRef = useRef(false)

  // Dialog states
  const [nodeDetailsOpen, setNodeDetailsOpen] = useState(false)

  // Convex Queries & Mutations
  const chartData = useQuery(api.organizations.getChartData, {});
  const moveUnitMutation = useMutation(api.units.moveUnit);

  // Constants for layout. Boxes are sized to hold a two-line wrapped name —
  // organization names in particular ("Sikarios City Church - Ash Botchway
  // Temple") ran well past the old single-line 200px box.
  const NODE_WIDTH = 210
  const ROOT_WIDTH = 280
  const LEVEL_HEIGHT = 170
  const MIN_SPACING = 32

  const buildChartStructure = (
    org: any,
    allUnits: any[],
    memberCounts: any[],
    totalMembers: number,
    collapsed: Set<string>,
    detailed: boolean
  ): { root: ChartNode, map: Map<string, ChartNode> } => {
    const ROOT_HEIGHT = detailed ? 96 : 76
    const UNIT_HEIGHT = detailed ? 88 : 68
    // 1. Create the root node (Organization)
    const calculatedTotal = memberCounts?.reduce((sum, mc) => sum + (mc.count || 0), 0) || 0
    const actualTotal = totalMembers || calculatedTotal

    const rootNode: ChartNode = {
      id: org._id,
      name: org.name,
      type: 'organization',
      level: 0,
      children: [],
      memberCount: actualTotal,
      isExpanded: !collapsed.has(org._id),
      descendantCount: 0,
      x: 0, y: 0, // Will be set in second pass
      width: ROOT_WIDTH,
      height: ROOT_HEIGHT
    }

    // 2. Build hierarchical tree structure
    const unitMap = new Map<string, ChartNode>()

    allUnits.forEach(unit => {
      const node: ChartNode = {
        id: unit._id,
        name: unit.name,
        type: 'unit',
        unitType: unit.type,
        level: (unit.depth || 0) + 1,
        parentId: unit.parent_unit_id || org._id,
        children: [],
        memberCount: memberCounts?.find(mc => mc.unit_id === unit._id)?.count || 0,
        isExpanded: !collapsed.has(unit._id),
        descendantCount: 0,
        x: 0, y: 0,
        width: NODE_WIDTH,
        height: UNIT_HEIGHT
      }
      unitMap.set(unit._id, node)
    })

    // Attach units to their parents
    allUnits.forEach(unit => {
      const node = unitMap.get(unit._id)!
      if (unit.parent_unit_id) {
        const parent = unitMap.get(unit.parent_unit_id)
        if (parent) parent.children.push(node)
      } else {
        rootNode.children.push(node)
      }
    })

    // 3. Count descendants (independent of collapse — a collapsed branch still
    //    reports how many nodes it is hiding).
    const countDescendants = (node: ChartNode): number => {
      node.descendantCount = node.children.reduce(
        (sum, child) => sum + 1 + countDescendants(child),
        0,
      )
      return node.descendantCount
    }
    countDescendants(rootNode)

    // 4. First Pass: Calculate subtree widths. A collapsed node lays out as a
    //    leaf, which is the whole point — its branch stops consuming width.
    const subtreeWidthMap = new Map<string, number>()
    const calculateSubtreeWidth = (node: ChartNode): number => {
      if (node.children.length === 0 || !node.isExpanded) {
        subtreeWidthMap.set(node.id, node.width)
        return node.width
      }

      let totalChildrenWidth = 0
      node.children.forEach((child, i) => {
        totalChildrenWidth += calculateSubtreeWidth(child)
        if (i < node.children.length - 1) totalChildrenWidth += MIN_SPACING
      })

      const width = Math.max(node.width, totalChildrenWidth)
      subtreeWidthMap.set(node.id, width)
      return width
    }

    calculateSubtreeWidth(rootNode)

    // 5. Second Pass: Position nodes
    const positionNodes = (node: ChartNode, startX: number, y: number) => {
      const totalWidth = subtreeWidthMap.get(node.id)!
      node.x = startX + (totalWidth - node.width) / 2
      node.y = y

      if (!node.isExpanded) return

      let currentX = startX
      node.children.forEach(child => {
        const childWidth = subtreeWidthMap.get(child.id)!
        positionNodes(child, currentX, y + LEVEL_HEIGHT)
        currentX += childWidth + MIN_SPACING
      })
    }

    // Anchor the tree at x=0 (no node is ever positioned at a negative x this
    // way). Actual centering within the viewport happens separately via
    // fitToView, which measures the real container size — a fixed "center
    // around x=500" assumption here would clip wide trees whenever the
    // container is narrower than ~1000px or the tree wider than expected.
    positionNodes(rootNode, 0, 50)

    // Build flat map of *visible* nodes only. Nodes inside a collapsed branch
    // are never positioned, so including them would feed stale (0,0)
    // coordinates into fitToView's bounding box and wreck the auto-fit.
    const finalMap = new Map<string, ChartNode>()
    const fillMap = (n: ChartNode) => {
      finalMap.set(n.id, n)
      if (n.isExpanded) n.children.forEach(fillMap)
    }
    fillMap(rootNode)

    return { root: rootNode, map: finalMap }
  }

  const { rootNode, nodeMap } = useMemo(() => {
    if (!chartData) return { rootNode: null, nodeMap: new Map<string, ChartNode>() };
    const result = buildChartStructure(
      chartData.organization,
      chartData.units,
      chartData.memberCounts,
      chartData.totalMembers,
      collapsedIds,
      showDetails
    );
    return { rootNode: result.root, nodeMap: result.map };
  }, [chartData, collapsedIds, showDetails]);

  const handleNodeClick = (node: ChartNode) => {
    setSelectedNode(node)
    setNodeDetailsOpen(true)
  }

  const handleUnitMove = async (unitId: string, newParentId?: string) => {
    try {
      await moveUnitMutation({
        unitId: unitId as Id<"units">,
        newParentId: newParentId ? newParentId as Id<"units"> : undefined
      });
      toast({
        title: "Success",
        description: "Unit moved successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  const toggleCollapse = (nodeId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  // Every node that has children and could therefore be collapsed. The root is
  // included — collapsing it reduces the chart to the organization alone.
  const collapsibleIds = useMemo(() => {
    const ids: string[] = []
    const walk = (node: ChartNode) => {
      if (node.children.length > 0) {
        ids.push(node.id)
        node.children.forEach(walk)
      }
    }
    if (rootNode) walk(rootNode)
    return ids
  }, [rootNode])

  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every(id => collapsedIds.has(id))
  const toggleCollapseAll = () => {
    setCollapsedIds(allCollapsed ? new Set() : new Set(collapsibleIds))
  }

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.2))

  // Fit the whole tree inside the given viewport size: scales down (never up
  // past 100%) so every node is visible, and pans so the tree is centered
  // horizontally with a fixed top padding (it grows downward from the root).
  const FIT_PADDING = 40
  const fitToView = useCallback((viewportWidth: number, viewportHeight: number) => {
    if (!rootNode || viewportWidth === 0 || viewportHeight === 0) return

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    nodeMap.forEach(n => {
      minX = Math.min(minX, n.x)
      maxX = Math.max(maxX, n.x + n.width)
      minY = Math.min(minY, n.y)
      maxY = Math.max(maxY, n.y + n.height)
    })
    if (!isFinite(minX)) return

    const treeWidth = maxX - minX
    const treeHeight = maxY - minY
    const scaleX = (viewportWidth - FIT_PADDING * 2) / treeWidth
    const scaleY = (viewportHeight - FIT_PADDING * 2) / treeHeight
    // Never shrink past legibility: a 30-unit org would otherwise fit at 12%
    // and read as unlabelled grey boxes. Below the floor the tree overflows
    // and the user pans (or collapses a branch) instead.
    const MIN_FIT_ZOOM = 0.35
    const fittedZoom = Math.max(MIN_FIT_ZOOM, Math.min(1, scaleX, scaleY))

    const panX = (viewportWidth - treeWidth * fittedZoom) / (2 * fittedZoom) - minX
    const panY = FIT_PADDING / fittedZoom - minY

    setZoom(fittedZoom)
    setPanOffset({ x: panX, y: panY })
  }, [rootNode, nodeMap])

  const handleResetView = () => {
    const el = containerRef.current
    if (el) {
      fitToView(el.clientWidth, el.clientHeight)
    } else {
      setZoom(1)
      setPanOffset({ x: 0, y: 0 })
    }
  }

  // Auto-fit once, the first time the chart is actually laid out, so the tree
  // is never clipped off-screen regardless of org size.
  //
  // A ResizeObserver rather than a one-shot effect: this chart lives inside a
  // Tabs panel, so on the render where the data first arrives the container
  // can still be zero-sized. The old code called fitToView with a width of 0
  // (which bails out) and then latched `hasAutoFit`, permanently leaving the
  // chart at 100% with a wide tree running off both edges.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !rootNode) return

    const attemptFit = () => {
      if (hasAutoFitRef.current) return
      const { clientWidth, clientHeight } = el
      if (clientWidth === 0 || clientHeight === 0) return
      fitToView(clientWidth, clientHeight)
      hasAutoFitRef.current = true
    }

    attemptFit()
    const observer = new ResizeObserver(attemptFit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootNode, fitToView])

  const getNodeColor = (node: ChartNode): string => {
    if (node.type === 'organization') return 'var(--foreground)'
    if (node.type === 'unit') {
      // Use unit type for color coding
      switch (node.unitType) {
        case 'ministry': return 'var(--success)'
        case 'administrative': return 'var(--info)'
        case 'geographic': return 'var(--primary)'
        default: return 'var(--muted-foreground)'
      }
    }
    return 'var(--muted-foreground)'
  }

  const getNodeTypeLabel = (node: ChartNode): string => {
    if (node.type === 'organization') return 'Organization'
    if (node.type === 'division') return 'Division'
    if (node.type === 'unit') {
      // Return the actual unit type from database
      switch (node.unitType) {
        case 'ministry': return 'Ministry'
        case 'administrative': return 'Administrative'
        case 'geographic': return 'Geographic'
        default: return 'Unit'
      }
    }
    return node.type
  }

  const getTransformedPoint = (clientX: number, clientY: number, container: SVGGraphicsElement) => {
    const point = (container.ownerSVGElement || (container as unknown as SVGSVGElement)).createSVGPoint()
    point.x = clientX
    point.y = clientY
    const ctm = container.getScreenCTM()?.inverse()
    if (!ctm) return { x: clientX, y: clientY }
    const transformed = point.matrixTransform(ctm)
    return { x: transformed.x, y: transformed.y }
  }

  const handleMouseDown = (e: React.MouseEvent, node?: ChartNode) => {
    const container = gRef.current
    if (!container) return

    if (node) {
      if (node.type === 'organization') return // Can't move root
      e.stopPropagation()
      e.preventDefault() // Prevent text selection
      setDraggedNode(node)
      setIsDragging(true)
      // Center the drag ghost on the mouse position
      const point = getTransformedPoint(e.clientX, e.clientY, container)
      setMousePos(point)
    } else {
      // Background click - start panning
      setIsPanning(true)
      setLastMousePos({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const container = gRef.current
    if (!container) return

    if (isDragging && draggedNode) {
      const point = getTransformedPoint(e.clientX, e.clientY, container)
      setMousePos(point)

      // Detect potential drop target (node)
      const elements = document.elementsFromPoint(e.clientX, e.clientY)
      const nodeElement = elements.find(el => el.hasAttribute('data-node-id'))
      if (nodeElement) {
        const id = nodeElement.getAttribute('data-node-id')
        if (id && id !== draggedNode.id) {
          setDragOverNodeId(id)
          setDragOverLine(null)
          return
        }
      }

      // Detect potential drop target (connection line)
      const lineElement = elements.find(el => el.hasAttribute('data-connection-line'))
      if (lineElement) {
        const parentId = lineElement.getAttribute('data-parent-id')
        const childId = lineElement.getAttribute('data-child-id')
        if (parentId && childId && parentId !== draggedNode.id && childId !== draggedNode.id) {
          setDragOverLine({ parentId, childId })
          setDragOverNodeId(null)
          return
        }
      }

      setDragOverNodeId(null)
      setDragOverLine(null)
    } else if (isPanning) {
      const dx = (e.clientX - lastMousePos.x) / zoom
      const dy = (e.clientY - lastMousePos.y) / zoom
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setLastMousePos({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = async (e: React.MouseEvent) => {
    if (isDragging && draggedNode) {
      if (dragOverNodeId && dragOverNodeId !== draggedNode.parentId) {
        const targetNode = nodeMap.get(dragOverNodeId)
        if (targetNode?.type === 'organization') {
          // Drop on organization - move to root (no parent unit)
          await handleUnitMove(draggedNode.id, undefined)
        } else {
          // Drop on a unit node - move to be child of that node
          await handleUnitMove(draggedNode.id, dragOverNodeId)
        }
      } else if (dragOverLine) {
        // Drop on a connection line - insert between parent and child
        // The dragged node becomes child of the parent, and the original child becomes child of dragged node
        await handleUnitMove(draggedNode.id, dragOverLine.parentId)
        // Then move the original child to be under the dragged node
        await handleUnitMove(dragOverLine.childId, draggedNode.id)
      }
    }

    setIsDragging(false)
    setIsPanning(false)
    setDraggedNode(null)
    setDragOverNodeId(null)
    setDragOverLine(null)
  }

  const renderNode = (node: ChartNode): React.JSX.Element => {
    const isDraggedOver = dragOverNodeId === node.id
    const isBeingDragged = draggedNode?.id === node.id

    return (
      <g key={node.id}>
        {/* First child of the <g> so the tooltip resolves to the nearest node:
            the box may have ellipsised a long name. */}
        <title>{`${node.name} — ${getNodeTypeLabel(node)}, ${node.memberCount || 0} members`}</title>

        {/* Connection lines to children (hidden while this branch is collapsed) */}
        {node.isExpanded && node.children.map(child => {
          const isLineDraggedOver = dragOverLine?.parentId === node.id && dragOverLine?.childId === child.id
          return (
            <React.Fragment key={`line-${node.id}-${child.id}`}>
              {/* Invisible wider path for easier drop targeting */}
              <path
                d={`M${node.x + node.width / 2},${node.y + node.height} C${node.x + node.width / 2},${node.y + node.height + 20} ${child.x + child.width / 2},${child.y - 40} ${child.x + child.width / 2},${child.y}`}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="cursor-pointer"
                data-connection-line="true"
                data-parent-id={node.id}
                data-child-id={child.id}
              />
              {/* Visible connection line */}
              <path
                d={`M${node.x + node.width / 2},${node.y + node.height} C${node.x + node.width / 2},${node.y + node.height + 20} ${child.x + child.width / 2},${child.y - 40} ${child.x + child.width / 2},${child.y}`}
                fill="none"
                stroke={isLineDraggedOver ? 'var(--primary)' : 'var(--muted-foreground)'}
                strokeWidth={isLineDraggedOver ? 4 : 2}
                style={{ opacity: isLineDraggedOver ? 1 : 0.6, transition: 'all 0.2s' }}
              />
              {renderNode(child)}
            </React.Fragment>
          )
        })}

        {/* Node rectangle */}
        <rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          fill={getNodeColor(node)}
          stroke={isDraggedOver ? 'var(--primary)' : 'var(--card)'}
          strokeWidth={isDraggedOver ? 4 : 0}
          rx={16}
          filter="url(#shadow)"
          className={`cursor-grab active:cursor-grabbing transition-all ${isBeingDragged ? 'opacity-0' : 'hover:scale-[1.02]'}`}
          onMouseDown={(e) => handleMouseDown(e, node)}
          onClick={(e) => {
            e.stopPropagation()
            handleNodeClick(node)
          }}
          data-node-id={node.id}
        />

        {/* Node content.
            An SVG <text> element neither wraps nor clips, so a long name — an
            organization's especially — simply ran out past both edges of its
            box. A foreignObject hands the label to the HTML layout engine,
            which wraps it and ellipsises the overflow, and the <title> keeps
            the untruncated name available on hover. */}
        {!isBeingDragged && (
          <foreignObject
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            style={{ pointerEvents: 'none' }}
          >
            <div className="flex h-full w-full flex-col items-center justify-center px-3 text-center leading-tight">
              <div
                className="w-full font-semibold text-white"
                style={{
                  fontSize: node.type === 'organization' ? '14px' : '13px',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {node.name}
              </div>
              <div className="w-full truncate text-white/70" style={{ fontSize: '10px' }}>
                {getNodeTypeLabel(node)}
              </div>
              {showDetails && (
                <div className="w-full truncate text-white/60" style={{ fontSize: '10px' }}>
                  {node.memberCount || 0} member{node.memberCount === 1 ? '' : 's'}
                </div>
              )}
            </div>
          </foreignObject>
        )}

        {/* Collapse / expand toggle. Sits on the bottom edge, where the
            connectors leave the box, and reports the hidden subtree size so a
            collapsed branch never looks like a leaf. */}
        {node.children.length > 0 && !isBeingDragged && (
          <g
            className="cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapse(node.id)
            }}
          >
            <circle
              cx={node.x + node.width / 2}
              cy={node.y + node.height}
              r={11}
              fill="var(--background)"
              stroke="var(--border)"
              strokeWidth={1.5}
            />
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--foreground)"
              style={{ fontSize: node.isExpanded ? '14px' : '9px', fontWeight: 600, pointerEvents: 'none' }}
            >
              {node.isExpanded ? '\u2212' : node.descendantCount}
            </text>
          </g>
        )}
      </g>
    )
  }

  if (roleLoading) return <LoadingState message="Checking your access…" />
    if (!isAdmin && role !== 'organization_admin' && role !== 'division_admin' && role !== 'unit_admin') {
    return <NoAccess what="view the organization chart" who="organization and unit leaders" />
  }

  if (!chartData) {
    return (
      <Card className="shadow-soft rounded-xl border border-border/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading organization chart...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-soft rounded-xl border border-border/50 overflow-hidden">
        <CardHeader className="border-b border-border/50 pb-4 bg-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                Organization Chart
              </CardTitle>
              <CardDescription className="text-xs">
                Drag to pan, drag a unit onto another to re-parent it, and use the
                circle on a box to collapse its branch
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="h-8 rounded-lg shadow-sm"
              >
                {showDetails ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {showDetails ? 'Hide' : 'Show'} details
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={toggleCollapseAll}
                disabled={collapsibleIds.length === 0}
                className="h-8 rounded-lg shadow-sm"
              >
                {allCollapsed
                  ? <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
                  : <ChevronsDownUp className="h-3.5 w-3.5 mr-1" />}
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </Button>

              <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/50">
                <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-7 w-7 rounded-md">
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[40px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-7 w-7 rounded-md">
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={handleResetView}
                title="Fit chart to view"
                className="h-8 w-8 rounded-lg shadow-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 bg-muted/20">
          <div ref={containerRef} className="relative overflow-hidden h-[700px] select-none">
            <svg
              width="100%"
              height="100%"
              className="select-none"
              style={{ cursor: isDragging ? 'grabbing' : isPanning ? 'move' : 'default', userSelect: 'none' }}
              onMouseDown={(e) => handleMouseDown(e)}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                  <feOffset dx="0" dy="4" result="offsetblur" />
                  <feComponentTransfer>
                    <feFuncA type="linear" slope="0.15" />
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <g
                ref={gRef}
                style={{
                  transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                  transformOrigin: '0 0',
                  transition: (isDragging || isPanning) ? 'none' : 'transform 0.2s ease-out'
                }}
              >
                {rootNode && renderNode(rootNode)}

                {/* Dragging Ghost/Line - Render in a separate overlay that doesn't scale with zoom */}
                {isDragging && draggedNode && (
                  <g style={{ pointerEvents: 'none' }}>
                    {/* Potential Connection Wire */}
                    {dragOverNodeId && nodeMap.get(dragOverNodeId) && (
                      <path
                        d={`M${nodeMap.get(dragOverNodeId)!.x + nodeMap.get(dragOverNodeId)!.width / 2},${nodeMap.get(dragOverNodeId)!.y + nodeMap.get(dragOverNodeId)!.height} C${nodeMap.get(dragOverNodeId)!.x + nodeMap.get(dragOverNodeId)!.width / 2},${nodeMap.get(dragOverNodeId)!.y + nodeMap.get(dragOverNodeId)!.height + 40} ${mousePos.x},${mousePos.y - 40} ${mousePos.x},${mousePos.y}`}
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                    )}

                    {/* Dragged Node Ghost - Position at mouse coordinates directly */}
                    <rect
                      x={mousePos.x - draggedNode.width / 2}
                      y={mousePos.y - draggedNode.height / 2}
                      width={draggedNode.width}
                      height={draggedNode.height}
                      fill={getNodeColor(draggedNode)}
                      rx={16}
                      opacity={0.9}
                      filter="url(#shadow)"
                    />
                    <text
                      x={mousePos.x}
                      y={mousePos.y}
                      textAnchor="middle"
                      className="text-sm fill-white"
                      style={{ fontSize: '14px', dominantBaseline: 'middle' }}
                    >
                      {draggedNode.name}
                    </text>
                  </g>
                )}
              </g>
            </svg>
          </div>
        </CardContent>
      </Card>

      <Dialog open={nodeDetailsOpen} onOpenChange={setNodeDetailsOpen}>
        <DialogContent className="rounded-xl shadow-soft-lg border-border/50 sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className={`p-2 rounded-lg ${selectedNode?.type === 'organization' ? 'bg-muted text-muted-foreground' :
                selectedNode?.type === 'division' ? 'bg-info/10 text-info-strong dark:text-info' :
                  'bg-success/10 text-success-strong dark:text-success'
                }`}>
                {selectedNode?.type === 'organization' && <Building2 className="h-5 w-5" />}
                {selectedNode?.type === 'division' && <MapPin className="h-5 w-5" />}
                {selectedNode?.type === 'unit' && <Users className="h-5 w-5" />}
              </div>
              {selectedNode?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedNode ? getNodeTypeLabel(selectedNode) : 'Unit'} Overview
            </DialogDescription>
          </DialogHeader>

          {selectedNode && (
            <div className="space-y-6 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground tracking-wide">Type</Label>
                  <div>
                    <Badge variant="outline" className="font-medium bg-secondary/20 border-secondary-foreground/20">
                      {getNodeTypeLabel(selectedNode)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground tracking-wide">Personnel</Label>
                  <div className="text-2xl text-foreground">{selectedNode.memberCount} <span className="text-sm font-normal text-muted-foreground">members</span></div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Hierarchy Level</span>
                  <span className="font-medium">Level {selectedNode.level}</span>
                </div>
                <div className="h-1.5 w-full bg-secondary/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${(selectedNode.level + 1) * 25}%` }}
                  />
                </div>
              </div>

              {selectedNode.children.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  <Label className="text-xs text-muted-foreground tracking-wide mb-2 block">Direct Subordinates</Label>
                  <div className="text-sm bg-muted/30 p-3 rounded-lg border border-border/50">
                    {selectedNode.children.length} direct children nodes
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
