/**
 * How Clerk's sign-in, sign-up and profile screens look and read. Without this
 * they showed Clerk's grey defaults and the application name set in the Clerk
 * dashboard ("Sign in to State of the Flock"), whatever Floc was called here.
 */

/** Clerk draws these itself, outside the stylesheet, so the brand is written out. */
const LIGHT = {
    colorPrimary: "#c1153f",
    colorText: "#1c1917",
    colorTextSecondary: "#6b625b",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#1c1917",
    colorDanger: "#c2261d",
}

const DARK = {
    colorPrimary: "#e0486c",
    colorText: "#f7f5f2",
    colorTextSecondary: "#b4aba3",
    colorBackground: "#241f1c",
    colorInputBackground: "#1b1714",
    colorInputText: "#f7f5f2",
    colorDanger: "#ef6b5f",
}

export function clerkAppearance(theme: "light" | "dark" = "light") {
    return {
        variables: {
            ...(theme === "dark" ? DARK : LIGHT),
            fontFamily: "'Inter Variable', system-ui, sans-serif",
            borderRadius: "0.5rem",
        },
        elements: {
            rootBox: "w-full",
            card: "shadow-soft ring-1 ring-foreground/10",
            headerTitle: "font-serif text-2xl font-medium tracking-tight",
            footer: "bg-transparent",
        },
    }
}

/** Floc's words for Clerk's screens. */
export const clerkLocalization = {
    signIn: {
        start: {
            title: "Sign in to Floc",
            subtitle: "Welcome back. Use the email or account you signed up with.",
            actionText: "New to Floc?",
            actionLink: "Create an account",
        },
    },
    signUp: {
        start: {
            title: "Create your Floc account",
            subtitle: "Set up your church in a few minutes. The free plan needs no card.",
            actionText: "Already have an account?",
            actionLink: "Sign in",
        },
    },
    formFieldLabel__emailAddress_username: "Email or username",
    formFieldInputPlaceholder__emailAddress_username: "you@yourchurch.org",
    formButtonPrimary: "Continue",
}
