# ReachInbox Email Job Scheduler

## Architecture Overview

This project is a full-stack email scheduling service designed to simulate real-world outreach campaigns. It uses **BullMQ** and **Redis** for robust delayed job execution instead of cron jobs.

### Backend Structure
- **Express + TypeScript**: API layer.
- **BullMQ**: Handles job queueing. Instead of a cron job polling for the next emails, each email is pushed to BullMQ with a specific `delay`. This natively leverages Redis to only activate the worker when the scheduled time arrives.
- **Persistence on Restart**: Since BullMQ jobs are stored in Redis (and we persist Redis via Docker volumes) and metadata is stored in PostgreSQL, if the server restarts, BullMQ will automatically resume processing any jobs that are due, without duplication.
- **Rate Limiting (Emails per hour)**: A Redis counter (`rate_limit:{senderId}:{hourTimestamp}`) tracks emails sent per hour. If the limit is reached, the job is caught, a Slack notification is fired (if configured), and the job is pushed into the next hour window using `job.moveToDelayed()` natively in BullMQ.
- **Concurrency**: The worker is configured with `concurrency: 5` (configurable via env), allowing it to process multiple independent senders in parallel safely.

### Frontend Structure
- **Next.js (App Router)** + **Tailwind CSS**.
- **NextAuth**: Handles Google OAuth authentication.
- **PapaParse**: Used on the frontend to parse CSV lead files securely before pushing to the backend.

## How to Run

### 1. Start Infrastructure
Make sure Docker Desktop is running.
```bash
docker-compose up -d
```
This starts PostgreSQL (port 5432), Redis (port 6379), and Elasticsearch (port 9200).

### 2. Setup Backend
```bash
cd apps/backend
npm install
npx prisma generate
npx prisma db push
```
Create a `.env` in `apps/backend`:
```env
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/reachinbox
REDIS_HOST=localhost
REDIS_PORT=6379
ELASTICSEARCH_NODE=http://localhost:9200
ETHEREAL_USER=your_ethereal_user@ethereal.email
ETHEREAL_PASS=your_ethereal_pass
```
Run Backend:
```bash
npm run dev
```
Bull-board is available at `http://localhost:4000/admin/queues`.

### 3. Setup Frontend
```bash
cd apps/frontend
npm install
```
Create a `.env` in `apps/frontend`:
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=a_secure_random_string
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```
Run Frontend:
```bash
npm run dev
```
Visit `http://localhost:3000`.

## Features
- **Scheduler**: Delay-based BullMQ enqueuing.
- **Persistence**: Redis volume + Postgres ensures no data loss on restarts.
- **Rate Limiting**: Custom token-bucket algorithm per sender delays jobs to the next hour.
- **Concurrency**: BullMQ workers process jobs safely in parallel.
- **Dashboard**: Next.js UI for viewing sent/scheduled jobs and composing emails via CSV upload.