
import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

export default function InvitePage() {
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()

    useEffect(() => {
        if (token) {
            navigate(`/accept-invitation?token=${token}`)
        }
    }, [token, navigate])

    return (
        <div className="min-h-dvh flex items-center justify-center bg-background px-4" role="status">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening your invitation…
            </div>
        </div>
    )
}
