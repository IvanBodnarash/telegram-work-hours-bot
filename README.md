# Work Hours Tracker Bot

A Telegram bot for tracking work hours, work sessions, games/tasks, clients, night hours, statistics, and monthly CSV exports.

The bot is built with **TypeScript**, runs on **Cloudflare Workers**, and uses **Cloudflare D1** for persistent storage.

It is designed around Telegram inline interactions and state-driven flows, so most actions happen inside a single bot message without cluttering the chat.

---

## Table of Contents

- [Features](#features)
- [Commands](#commands)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database](#database)
- [Time Tracking](#time-tracking)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Cloudflare D1](#cloudflare-d1)
- [Deployment](#deployment)
- [Telegram Webhook](#telegram-webhook)
- [Security](#security)
- [Project Status](#project-status)
- [License](#license)

---

## Features

### Work Sessions

- Register work start with `/in`
- Register work end with `/out`
- Use the current time or enter a time manually
- Track multiple work sessions per day
- Prevent multiple open sessions for the same work day
- Validate that clock-out is not earlier than clock-in
- Track historical work sessions for previous dates

### Games / Tasks

- Add games/tasks with:
  - date
  - scheduled time
  - client name
  - game type
- Connect games/tasks to work sessions
- Add entries for today or previous dates
- Manage reusable game types
- Assign a custom emoji to each game type

### Editing

Existing entries can be edited directly from Telegram.

Supported fields include:

- scheduled time
- client name
- game type
- clock-in time
- clock-out time

Entries can also be deleted with confirmation.

### Reports

The bot provides:

- daily reports
- weekly reports
- monthly reports
- day selection
- week selection
- total worked hours
- night hours
- game/task information
- client information

### Statistics

Monthly statistics include:

- total worked hours
- number of worked days
- total games/tasks
- average worked time per day
- most frequent game/task types

### CSV Export

Monthly data can be exported to CSV.

The export contains:

- date
- game/task
- client
- scheduled time
- clock-in
- clock-out
- work duration

A summary section is also included with:

- number of games/tasks per day
- total work time per day
- night hours
- monthly totals

The CSV uses UTF-8 with BOM and semicolon-separated values for better spreadsheet compatibility.

### Settings

The bot supports:

- configurable night start time
- custom emoji for each month
- timezone-aware date and time calculations

### Clean Telegram Flows

Multi-step actions use Telegram inline keyboards and message editing.

Instead of sending a new bot message for every step, the existing flow message is updated.

Valid manual inputs are removed after processing, which keeps the chat clean.

---

## Commands

| Command     | Description                  |
| ----------- | ---------------------------- |
| `/today`    | Show today's work            |
| `/week`     | Show the current week        |
| `/month`    | Show the current month       |
| `/add`      | Add a game/task              |
| `/in`       | Register work start          |
| `/out`      | Register work end            |
| `/edit`     | Edit an existing entry       |
| `/games`    | Manage game types            |
| `/stats`    | Show monthly statistics      |
| `/export`   | Export monthly data to CSV   |
| `/settings` | Configure bot settings       |
| `/help`     | Show available commands      |
| `/start`    | Show bot help                |
| `/cancel`   | Cancel the current operation |

---

## How It Works

The bot uses Telegram webhooks.

```text
Telegram
   ↓
Cloudflare Worker
   ↓
Command / Callback / State Handler
   ↓
Cloudflare D1
   ↓
Telegram Bot API
```

Cloudflare Workers process incoming Telegram updates.

Cloudflare D1 stores both persistent data and temporary conversation state, so the bot does not depend on in-memory state or a continuously running local server.

Example multi-step flow:

```text
/add
↓
Choose date
↓
Choose game type
↓
Enter scheduled time
↓
Enter client
↓
Confirm
```

For historical entries, the bot can additionally ask for clock-in and clock-out times.

## Tech Stack

- TypeScript
- Cloudflare Workers
- Cloudflare D1
- Telegram Bot API
- Wrangler
- Node.js / npm for local development

## Project Structure

```text
src/
├── callbacks/
│   ├── index.ts
│   ├── addCallbacks.ts
│   ├── workCallbacks.ts
│   ├── editCallbacks.ts
│   ├── reportCallbacks.ts
│   ├── settingsCallbacks.ts
│   ├── exportCallbacks.ts
│   └── statsCallbacks.ts
│
├── handlers/
│   ├── add.ts
│   ├── today.ts
│   ├── week.ts
│   ├── month.ts
│   ├── games.ts
│   ├── state.ts
│   ├── in.ts
│   ├── out.ts
│   ├── edit.ts
│   ├── settings.ts
│   ├── export.ts
│   ├── stats.ts
│   ├── help.ts
│   └── cancel.ts
│
├── formatters/
│   └── dayFormatter.ts
│
├── services/
│   ├── chatService.ts
│   ├── chatStateService.ts
│   ├── gameService.ts
│   ├── gameTypeService.ts
│   ├── monthSettingsService.ts
│   ├── workDayService.ts
│   ├── workSessionService.ts
│   ├── exportService.ts
│   └── statsService.ts
│
├── utils/
│   ├── date.ts
│   ├── datePicker.ts
│   ├── time.ts
│   └── telegram.ts
│
└── index.ts
```

## Main Layers

| Layer      | Purpose                                                     |
| ---------- | ----------------------------------------------------------- |
| Handlers   | Handle commands and larger user flows                       |
| Callbacks  | Handle Telegram inline keyboard callback queries            |
| Services   | Contain database access and data operations                 |
| Formatters | Convert stored work data into readable Telegram reports     |
| Utils      | Contain reusable Telegram, date, time, and keyboard helpers |

## Database

The bot uses Cloudflare D1.

Main tables:

- `chats`
- `month_settings`
- `game_types`
- `work_days`
- `work_sessions`
- `games`
- `chat_states`

### `chats`

Stores Telegram chat configuration, including:

- Telegram chat ID
- chat name
- chat type
- timezone
- night start time
- optional Telegram thread/topic ID

### `game_types`

Stores reusable game/task types with a name and emoji.

### `work_days`

Represents individual work dates.

### `work_sessions`

Stores clock-in and clock-out periods.

A single work day can contain multiple sessions.

### `games`

Stores individual games/tasks and connects them to:

- work day
- game type
- optional work session

### `chat_states`

Stores temporary state for multi-step interactions.

Example states:

```text
WAITING_FOR_GAME_TIME
WAITING_FOR_GAME_CLIENT
WAITING_FOR_IN_TIME
WAITING_FOR_OUT_TIME
WAITING_FOR_EDIT_GAME_TIME
WAITING_FOR_EDIT_GAME_CLIENT
WAITING_FOR_EXPORT_MONTH
```

Because this state is stored in D1, flows can continue across separate Worker requests.

## Time Tracking

The bot is timezone-aware.

Each chat can use its own timezone.

Time calculations include:

- current local date
- current local time
- work session duration
- multiple sessions per day
- overlapping sessions
- adjacent sessions
- night work duration

Overlapping and adjacent work sessions are merged when calculating totals to avoid counting the same time twice.

## Night Hours

Night work starts from a configurable time.

Example:

```text
Night start: 22:00
```

If a work session overlaps the configured night period, the bot calculates:

- total worked time
- night worked time

## Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/work-hours-bot.git
```

Enter the project:

```bash
cd work-hours-bot
```

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

or:

```bash
npx wrangler dev
```

## Environment Variables

Create a `.dev.vars` file in the project root:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

Do not commit this file.

For production, store the token as a Cloudflare secret:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

## Cloudflare D1

Create a D1 database:

```bash
npx wrangler d1 create work-hours-db
```

Configure it in wrangler.jsonc:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "work-hours-db",
      "database_id": "YOUR_DATABASE_ID"
    }
  ]
}
```

`wrangler.jsonc` can be committed to Git.

Do not store API tokens, passwords, or other secrets inside it.

Database migrations are stored in the `migrations/` directory.

## Deployment

Authenticate with Cloudflare:

```bash
npx wrangler login
```

Check the currently authenticated account:

```bash
npx wrangler whoami
```

Deploy:

```bash
npm run deploy
```

or:

```bash
npx wrangler deploy
```

After deployment, the bot runs on Cloudflare Workers and does not require a local computer to stay online.

## Telegram Webhook

Telegram communicates with the deployed Worker through a webhook.

The webhook should point to your Worker URL.

Example:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-worker.workers.dev
```

Do not publish a real bot token in documentation, GitHub commits, issues, or screenshots.

## Security

Recommended `.gitignore`:

```gitignore
node_modules/

.dev.vars
.env
.env.*
!.env.example

.wrangler/
dist/

.DS_Store
Thumbs.db
```

Make sure files containing secrets are not tracked.

## Project Status

The bot is currently usable as a personal work-hours tracking tool.

Implemented functionality includes:

- work session tracking
- games/tasks
- historical entries
- editing
- daily, weekly, and monthly reports
- night hour calculations
- monthly statistics
- CSV export
- settings
- persistent Telegram interaction state

The project is actively usable, while further improvements and refactoring can be added later as needed.

## License

Currently intended for personal and educational use.