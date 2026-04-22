# GSS Support Ticketing System

A Next.js support ticketing system converted from the original ASP.NET MVC application. Features email-based ticket creation with auto-reply functionality.

## Tech Stack

- **Framework:** Next.js 16 (App Router) with TypeScript
- **Database:** SQL Server via Prisma ORM
- **Authentication:** NextAuth.js (Credentials provider)
- **Email Sending:** Nodemailer (SMTP)
- **Email Receiving:** IMAP (imap-simple + mailparser)
- **Styling:** Tailwind CSS

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your settings:

```bash
cp .env.example .env
```

Key settings to configure:
- `DATABASE_URL` - Your SQL Server connection string
- `AUTH_SECRET` - Generate with `openssl rand -base64 32`
- SMTP settings (for sending emails)
- IMAP settings (for receiving emails)

### 3. Setup Database

Push the schema to your database:

```bash
npm run db:push
```

Seed the database with an admin user:

```bash
npm run db:seed
```

Default admin credentials:
- **Username:** admin
- **Password:** Admin@123
- **Email:** admin@globalsoftwareservices.co.za

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Run Development Server with SSL (HTTPS on localhost)

For local HTTPS, run:

```bash
npm run dev:https
```

Open [https://localhost:3000](https://localhost:3000)

Notes:

- This uses Next.js built-in HTTPS support and generates a local self-signed certificate.
- If you already have your own cert/key files, place them in `certs/` and run:

```bash
npm run dev:https:cert
```

## Email Ticketing System

### How It Works

1. **Incoming emails** are polled via IMAP from a configured support email address
2. When a new email arrives:
   - If the sender's email matches a registered user, the ticket is linked to their account
   - If the sender is new, a customer record is auto-created
   - A new support ticket is created with the email content
   - An **auto-reply** is sent back confirming receipt with a ticket ID (e.g., `[GSS-abc123]`)
   - Admin users are notified via email
3. **Reply threading**: When users reply to ticket emails (keeping `[GSS-xxx]` in subject), replies are automatically added as messages to the existing ticket

### Triggering Email Polling

**Manual (Admin Dashboard):** Click the "Check Emails" button on the dashboard.

**API Endpoint (Admin):** `POST /api/email/poll`

**Cron Job (Automated):**
```
GET /api/cron/email-poll
Authorization: Bearer YOUR_AUTH_SECRET
```

Set up a cron service (Vercel Cron, cron-job.org, etc.) to call this endpoint at your desired interval.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run dev:https` | Start development server on `https://localhost:3000` with generated local cert |
| `npm run dev:https:cert` | Start development server on HTTPS using `certs/localhost.pem` and `certs/localhost-key.pem` |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database with admin user |
| `npm run db:studio` | Open Prisma Studio |

## Project Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── auth/               # NextAuth + register/verify
│   │   ├── issues/             # Ticket CRUD + messages + files
│   │   ├── users/              # User management
│   │   ├── projects/           # Project management
│   │   ├── dashboard/          # Dashboard stats
│   │   ├── email/poll/         # Manual email polling
│   │   └── cron/email-poll/    # Cron-based email polling
│   ├── (authenticated)/        # Protected pages
│   │   ├── dashboard/          # Main dashboard
│   │   ├── issues/             # Ticket list, detail, new
│   │   ├── users/              # User management (admin)
│   │   ├── projects/           # Project management
│   │   └── email-settings/     # Email config info
│   ├── login/                  # Login page
│   └── register/               # Registration page
├── components/                 # Shared UI components
├── lib/
│   ├── auth.ts                 # NextAuth configuration
│   ├── prisma.ts               # Prisma client singleton
│   ├── email.ts                # Email sending + templates
│   └── email-receiver.ts       # IMAP email polling service
├── types/                      # TypeScript type extensions
└── middleware.ts                # Route protection
prisma/
├── schema.prisma               # Database schema
└── seed.ts                     # Database seeder
```

## Roles

| Role | Permissions |
|------|-------------|
| **ADMIN** | Full access: manage users, all tickets, projects, email settings |
| **USER** | View/create own tickets, add messages and attachments |
| **EDITOR** | Same as USER with password management |
