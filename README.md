# Floc Church Management System

A comprehensive church management system built with Vite + React + Convex.

## Features

### Core Technologies

- 🔐 Authentication using Clerk
- 🧠 Backend + database via Convex
- 🎨 UI components from Radix UI and shadcn/ui
- 💅 Styling with Tailwind CSS

### Key Functionalities

- 👥 Member management
- ✓ Attendance tracking
- 📅 Event management
- 👤 User profiles
- 📊 Dashboard with analytics
- 📱 Responsive layout with sidebar navigation

## Technical Overview

The application is structured with a modern React architecture using TypeScript and is bundled with Vite. It integrates Convex for data storage and realtime queries, and Clerk for authentication. It's built to gracefully handle cases where authentication isn't configured, showing appropriate fallback UI elements.

### Development Practices

- ⚙️ Environment-based configuration
- 🚀 Dynamic imports for better performance
- 📝 Type safety with TypeScript
- 🧩 Component-based architecture
- 📱 Responsive design principles

## Getting Started

### Prerequisites

- Node.js 18.17.0 or later
- pnpm (recommended) or npm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/danteata/sotf.git
   cd sotf
   ```

2. Install dependencies:

   ```bash
   pnpm install
   # or
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory with the following variables:

   ```
    # Clerk Authentication (optional but recommended)
    VITE_CLERK_PUBLISHABLE_KEY=your_publishable_key

    # Convex (required)
    VITE_CONVEX_URL=https://your-deployment.convex.cloud

    # Google Maps (optional)
    VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
   ```

   Some settings belong to the Convex **deployment**, not the browser bundle,
   and are set with `npx convex env set` rather than in `.env.local`:

   ```bash
   # Required before an organization can store its own AI provider key.
   # Without it, saving a key fails loudly rather than storing plaintext.
   npx convex env set AI_CREDENTIAL_KEY "$(openssl rand -base64 32)"

   # Optional: a platform-wide AI key, used only by organizations that have
   # not supplied one of their own.
   npx convex env set ANTHROPIC_API_KEY sk-ant-...
   ```

   Rotating `AI_CREDENTIAL_KEY` makes every stored provider key undecryptable;
   admins are told to re-enter theirs. Keep it somewhere you can recover it.

4. Run the development server:

   ```bash
   pnpm dev
   # or
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

### Building for Production

```bash
pnpm build
# or
npm run build
```

Then start the production server:

```bash
pnpm start
# or
npm start
```

## Contributing

[Add contribution guidelines here]

## License

[Add license information here]
