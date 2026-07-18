import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const targetEmail = process.argv[2] ?? 'wkdgustj102@gmail.com';
const aiUrl = process.env.AI_SERVER_URL ?? 'https://idly-ai.onrender.com';

function getOAuth2Client(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function toSnippet(data: unknown): string {
  if (data === undefined || data === null) return '';
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return text.replace(/\s+/g, ' ').slice(0, 2000);
}

async function fetchMbox(refreshToken: string) {
  const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client(refreshToken) });
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 500,
      pageToken,
    });
    for (const message of res.data.messages ?? []) {
      if (message.id) messageIds.push(message.id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  console.log(`gmail_message_count=${messageIds.length}`);

  const parts: string[] = [];
  const batchSize = 10;
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((id) => gmail.users.messages.get({ userId: 'me', id, format: 'raw' })),
    );

    for (const result of results) {
      if (result.status === 'rejected') continue;
      const message = result.value.data;
      if (!message.raw) continue;

      const rawBytes = Buffer.from(message.raw, 'base64url').toString('binary');
      const date = message.internalDate
        ? new Date(Number(message.internalDate)).toUTCString()
        : new Date().toUTCString();
      parts.push(`From mboxrd@localhost ${date}\n${rawBytes}\n\n`);
    }

    if (i === 0 || (i + batchSize) % 100 === 0 || i + batchSize >= messageIds.length) {
      console.log(`gmail_fetch_progress=${Math.min(i + batchSize, messageIds.length)}/${messageIds.length}`);
    }
  }

  return Buffer.from(parts.join(''), 'binary');
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const account = await prisma.gmailAccount.findUnique({
      where: { email: targetEmail },
      select: { email: true, refreshToken: true },
    });

    if (!account) {
      throw new Error(`Gmail account not found: ${targetEmail}`);
    }

    console.log(`target_email=${account.email}`);
    console.log(`ai_url=${aiUrl}`);

    const mbox = await fetchMbox(account.refreshToken);
    console.log(`mbox_size_bytes=${mbox.byteLength}`);
    console.log(`mbox_size_mb=${(mbox.byteLength / 1024 / 1024).toFixed(2)}`);

    const form = new FormData();
    form.append('file', mbox, {
      filename: `${account.email.replace('@', '_at_')}.mbox`,
      contentType: 'application/mbox',
    });

    const startedAt = Date.now();
    const response = await axios.post(`${aiUrl}/analyze`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 10 * 60 * 1000,
      validateStatus: () => true,
    });

    console.log(`ai_status=${response.status}`);
    console.log(`ai_elapsed_ms=${Date.now() - startedAt}`);
    console.log(`ai_response_snippet=${toSnippet(response.data)}`);
  } catch (error) {
    if (error instanceof AxiosError) {
      console.log(`axios_error_code=${error.code ?? ''}`);
      console.log(`axios_error_message=${error.message}`);
      console.log(`axios_status=${error.response?.status ?? 'no-response'}`);
      console.log(`axios_response_snippet=${toSnippet(error.response?.data)}`);
      process.exitCode = 1;
      return;
    }

    console.log(`error=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
