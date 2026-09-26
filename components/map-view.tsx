'use client'

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import { Member } from '../src/types/database'
import { ExternalLink, MapPinOff } from 'lucide-react'

const MAPS_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""

declare global {
    interface Window {
        /** Google calls this when it rejects the Maps key (invalid, restricted, no billing). */
        gm_authFailure?: () => void
    }
}

type Unavailable = 'missing-key' | 'rejected'

/** What the page shows instead of Google's grey error box when the map cannot load. */
function MapUnavailable({ reason }: { reason: Unavailable }) {
    const copy = reason === 'missing-key'
        ? {
            title: "The map isn't set up yet",
            body: "It needs a Google Maps key, which an administrator adds once for the whole church.",
        }
        : {
            title: "The map can't load right now",
            body: "Google turned down this site's map key, so the map is off until an administrator replaces or re-enables the key.",
        }
    return (
        <div className="flex h-[480px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 text-center">
            <MapPinOff className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <div className="max-w-sm space-y-1">
                <p className="text-sm font-medium text-foreground">{copy.title}</p>
                <p className="text-sm text-muted-foreground">{copy.body}</p>
            </div>
        </div>
    )
}

const containerStyle = {
    width: '100%',
    height: '600px'
}

/** Only used when no member has a location yet; the map otherwise fits the pins. */
const fallbackCenter = { lat: 20, lng: 0 }

// The Floc crimson (the primary token), written out because a marker icon is a
// data URI drawn by Google, outside the stylesheet.
const MARKER_COLOUR = '#c1153f'

// A marker with a person in it, in the brand colour
const createCustomMarkerIcon = () => {
    return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
      <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="${MARKER_COLOUR}" stroke="white" stroke-width="2"/>
        <g transform="translate(12,12)">
          <circle cx="0" cy="-2" r="2" fill="white"/>
          <path d="M -3 0 Q 0 0 3 0 L 3 2 Q 0 2 -3 2 Z" fill="white"/>
          <path d="M -2 2 L -2 6 L 2 6 L 2 2 Z" fill="white"/>
          <path d="M -4 6 L 4 6 L 4 10 L -4 10 Z" fill="white"/>
        </g>
      </svg>
    `),
        scaledSize: new google.maps.Size(24, 24),
        anchor: new google.maps.Point(12, 24)
    }
}

interface MapViewProps {
    members: Member[]
}

export default function MapView({ members }: MapViewProps) {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: MAPS_KEY
    })
    const [rejected, setRejected] = useState(false)

    // Google reports a rejected key through this global, not through the loader.
    useEffect(() => {
        window.gm_authFailure = () => setRejected(true)
        return () => { window.gm_authFailure = undefined }
    }, [])

    const located = useMemo(
        () => members.filter((m) => m.latitude && m.longitude),
        [members]
    )

    const [hoveredMember, setHoveredMember] = useState<Member | null>(null)
    const [selectedMember, setSelectedMember] = useState<Member | null>(null)
    const [isMapLoaded, setIsMapLoaded] = useState(false)
    const [isInfoWindowHovered, setIsInfoWindowHovered] = useState(false)
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const handleMapLoad = useCallback((map: google.maps.Map) => {
        setIsMapLoaded(true)
        if (located.length === 0) return
        const bounds = new google.maps.LatLngBounds()
        located.forEach((m) => bounds.extend({ lat: m.latitude!, lng: m.longitude! }))
        map.fitBounds(bounds, 48)
    }, [located])

    const handleMarkerMouseOver = useCallback((member: Member) => {
        // Clear any pending close timeout
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current)
            closeTimeoutRef.current = null
        }
        setHoveredMember(member)
    }, [])

    const handleMarkerMouseOut = useCallback(() => {
        // Delay closing to allow moving to InfoWindow
        closeTimeoutRef.current = setTimeout(() => {
            if (!isInfoWindowHovered) {
                setHoveredMember(null)
            }
        }, 150) // 150ms delay
    }, [isInfoWindowHovered])

    const handleInfoWindowMouseOver = useCallback(() => {
        setIsInfoWindowHovered(true)
        // Clear any pending close timeout
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current)
            closeTimeoutRef.current = null
        }
    }, [])

    const handleInfoWindowMouseOut = useCallback(() => {
        setIsInfoWindowHovered(false)
        // Delay closing to allow moving back to marker
        closeTimeoutRef.current = setTimeout(() => {
            setHoveredMember(null)
        }, 150) // 150ms delay
    }, [])

    const handleMarkerClick = useCallback((member: Member) => {
        // For mobile: toggle selection on click
        if (selectedMember?.id === member.id) {
            setSelectedMember(null)
        } else {
            setSelectedMember(member)
        }
        // Also set as hovered for consistency
        setHoveredMember(member)
    }, [selectedMember])

    const handleMapClick = useCallback(() => {
        // Close InfoWindow when clicking on map (mobile)
        setSelectedMember(null)
        setHoveredMember(null)
    }, [])

    const getMapsUrl = useCallback((lat: number, lng: number, name: string) => {
        // Google Maps URL that works on both iOS and Android
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodeURIComponent(name)}`
    }, [])

    const handleOpenInMaps = useCallback((e: React.MouseEvent, member: Member) => {
        e.stopPropagation()
        if (member.latitude && member.longitude) {
            const url = getMapsUrl(member.latitude, member.longitude, member.name)
            window.open(url, '_blank', 'noopener,noreferrer')
        }
    }, [getMapsUrl])

    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current)
            }
        }
    }, [])

    if (!MAPS_KEY) return <MapUnavailable reason="missing-key" />
    if (rejected || loadError) return <MapUnavailable reason="rejected" />

    return isLoaded ? (
        <GoogleMap
            mapContainerStyle={containerStyle}
            center={fallbackCenter}
            zoom={2}
            onLoad={handleMapLoad}
            onClick={handleMapClick}
        >
            {members.map((member) => {
                if (member.latitude && member.longitude) {
                    return (
                        <Marker
                            key={member.id}
                            position={{ lat: member.latitude, lng: member.longitude }}
                            icon={isMapLoaded ? createCustomMarkerIcon() : undefined}
                            onMouseOver={() => handleMarkerMouseOver(member)}
                            onMouseOut={handleMarkerMouseOut}
                            onClick={() => handleMarkerClick(member)}
                        />
                    )
                }
                return null
            })}

            {(() => {
                const displayMember = hoveredMember || selectedMember
                if (displayMember && displayMember.latitude && displayMember.longitude) {
                    return (
                        <InfoWindow
                            position={{ lat: displayMember.latitude, lng: displayMember.longitude }}
                            onCloseClick={() => {
                                setSelectedMember(null)
                                setHoveredMember(null)
                            }}
                        >
                            <div
                                className="p-3 min-w-[180px]"
                                onMouseOver={handleInfoWindowMouseOver}
                                onMouseOut={handleInfoWindowMouseOut}
                            >
                                {/* Google draws the info window white in both themes, so its text
                                    keeps fixed dark colours rather than theme tokens. */}
                                <h4 className="mb-1 font-semibold" style={{ color: '#1c1917' }}>{displayMember.name}</h4>
                                {displayMember.phone && (
                                    <p className="mb-2 text-sm" style={{ color: '#57534e' }}>{displayMember.phone}</p>
                                )}
                                <button
                                    onClick={(e) => handleOpenInMaps(e, displayMember)}
                                    className="flex items-center gap-1.5 text-sm font-medium hover:underline"
                                    style={{ color: MARKER_COLOUR }}
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Open in Maps
                                </button>
                            </div>
                        </InfoWindow>
                    )
                }
                return null
            })()}
        </GoogleMap>
    ) : <></>
}
