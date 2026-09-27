'use client'

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { QrCode } from "lucide-react"

/**
 * Renders a check-in session's QR code from its `qrUrl`. Shared between
 * CheckInQrPanel (single-session admin tool) and the Command Center's inline
 * "start a session" quick action, so the QRCode.toDataURL call isn't
 * duplicated.
 */
export function SessionQrCode({ qrUrl }: { qrUrl: string | null }) {
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

    // Reset the stale image the moment qrUrl changes (adjust state during
    // render, per this codebase's convention), rather than inside the
    // effect body — keeps the effect itself free of synchronous setState.
    const [lastUrl, setLastUrl] = useState<string | null>(null)
    if (qrUrl !== lastUrl) {
        setLastUrl(qrUrl)
        setQrDataUrl(null)
    }

    useEffect(() => {
        if (!qrUrl) return
        let cancelled = false
        QRCode.toDataURL(qrUrl, { width: 512, margin: 2, errorCorrectionLevel: "M" })
            .then((url) => {
                if (!cancelled) setQrDataUrl(url)
            })
            .catch((err) => console.error("QR generation failed", err))
        return () => { cancelled = true }
    }, [qrUrl])

    if (!qrDataUrl) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <QrCode className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">Generating QR code…</p>
            </div>
        )
    }

    // Always white behind the code, in dark mode too: phone cameras read a
    // dark-on-light QR code far more reliably.
    return (
        <div className="rounded-lg border border-border/50 bg-white p-4">
            <img src={qrDataUrl} alt="Check-in QR code" className="h-56 w-56 max-w-full" />
        </div>
    )
}
