import 'dotenv/config';
import { once } from 'events';
import { createWriteStream } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  decryptToken,
  isEncrypted,
  resolveEncryptionKey,
} from '../src/common/crypto/token-crypto';

type GmailAccountRow = {
  id: string;
  email: string;
  refreshToken: string;
};

type ExportManifestRow = {
  email: string;
  filePath: string;
  count: number;
  skipped: number;
  sizeBytes: number;
  sizeMb: number;
  lastEmailDate: string | null;
  elapsedMs: number;
};

const DEFAULT_LIMIT = 3;
const BATCH_SIZE = 10;

function parseArgs(argv: string[]) {
  const args = [...argv];
  const emails: string[] = [];
  let limit = DEFAULT_LIMIT;
  let outDir = path.resolve(process.cwd(), '..', 'mbox-exports', timestamp());

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--limit') {
      limit = Number(args[++i] ?? DEFAULT_LIMIT);
    } else if (arg === '--out') {
      outDir = path.resolve(args[++i] ?? outDir);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      emails.push(arg);
    }
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('--limit must be a positive number');
  }

  return { emails, limit, outDir };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeFileName(email: string) {
  return email.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getOAuth2Client(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function plainRefreshToken(encryptedOrPlain: string) {
  if (!isEncrypted(encryptedOrPlain)) return encryptedOrPlain;
  const key = resolveEncryptionKey(
    process.env.REFRESH_TOKEN_SECRET,
    process.env.NODE_ENV,
  );
  return decryptToken(encryptedOrPlain, key);
}

async function writeChunk(
  stream: ReturnType<typeof createWriteStream>,
  chunk: string,
) {
  if (!stream.write(chunk, 'binary')) {
    await once(stream, 'drain');
  }
}

async function fetchMboxToFile(account: GmailAccountRow, filePath: string) {
  const gmail = google.gmail({
    version: 'v1',
    auth: getOAuth2Client(plainRefreshToken(account.refreshToken)),
  });

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

  console.log(`[${account.email}] message_count=${messageIds.length}`);

  const stream = createWriteStream(filePath, { encoding: 'binary' });
  let fetched = 0;
  let skipped = 0;
  let sizeBytes = 0;
  let lastEmailDate: Date | null = null;

  try {
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((id) =>
          gmail.users.messages.get({ userId: 'me', id, format: 'raw' }),
        ),
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          skipped += 1;
          continue;
        }

        const message = result.value.data;
        if (!message.raw) {
          skipped += 1;
          continue;
        }

        const rawBytes = Buffer.from(message.raw, 'base64url').toString('binary');
        const emailDate = message.internalDate
          ? new Date(Number(message.internalDate))
          : new Date();
        if (!lastEmailDate || emailDate > lastEmailDate) lastEmailDate = emailDate;

        const chunk = `From mboxrd@localhost ${emailDate.toUTCString()}\n${rawBytes}\n\n`;
        sizeBytes += Buffer.byteLength(chunk, 'binary');
        await writeChunk(stream, chunk);
        fetched += 1;
      }

      if (i === 0 || i + BATCH_SIZE >= messageIds.length || (i + BATCH_SIZE) % 100 === 0) {
        console.log(
          `[${account.email}] progress=${Math.min(i + BATCH_SIZE, messageIds.length)}/${messageIds.length}`,
        );
      }
    }
  } finally {
    stream.end();
    await once(stream, 'finish');
  }

  return {
    count: fetched,
    skipped,
    sizeBytes,
    lastEmailDate: lastEmailDate?.toISOString() ?? null,
  };
}

async function loadAccounts(prisma: PrismaClient, emails: string[], limit: number) {
  if (emails.length > 0) {
    return prisma.gmailAccount.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, refreshToken: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  return prisma.gmailAccount.findMany({
    where: { status: 'connected' },
    select: { id: true, email: true, refreshToken: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    take: limit,
  });
}

async function main() {
  const { emails, limit, outDir } = parseArgs(process.argv.slice(2));
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const accounts = await loadAccounts(prisma, emails, limit);
    if (accounts.length === 0) {
      throw new Error('No Gmail accounts found to export');
    }

    if (emails.length > 0 && accounts.length !== emails.length) {
      const found = new Set(accounts.map((account) => account.email));
      const missing = emails.filter((email) => !found.has(email));
      throw new Error(`Gmail account not found: ${missing.join(', ')}`);
    }

    await mkdir(outDir, { recursive: true });
    console.log(`export_dir=${outDir}`);
    console.log(`account_count=${accounts.length}`);

    const manifestPath = path.join(outDir, 'manifest.json');
    let manifest: ExportManifestRow[] = [];
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ExportManifestRow[];
    } catch {
      manifest = [];
    }

    for (const account of accounts) {
      const startedAt = Date.now();
      const filePath = path.join(outDir, `${safeFileName(account.email)}.mbox`);
      const result = await fetchMboxToFile(account, filePath);

      const row = {
        email: account.email,
        filePath,
        count: result.count,
        skipped: result.skipped,
        sizeBytes: result.sizeBytes,
        sizeMb: Number((result.sizeBytes / 1024 / 1024).toFixed(2)),
        lastEmailDate: result.lastEmailDate,
        elapsedMs: Date.now() - startedAt,
      };
      manifest = manifest.filter((item) => item.email !== account.email);
      manifest.push(row);
      console.log(
        `[${account.email}] saved=${filePath} count=${row.count} skipped=${row.skipped} size_mb=${row.sizeMb}`,
      );
    }

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`manifest=${manifestPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`error=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
