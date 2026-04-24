/**
 * Promote a Firebase Auth user to super admin.
 *
 * Usage:
 *   npm run seed:super-admin -- someone@example.com
 *
 * What it does:
 *   1. Looks up the user in Firebase Auth (by email).
 *   2. Upserts the User row in Postgres with isSuperAdmin=true.
 *      - If the user has signed into the app already, we flip their flag.
 *      - If they haven't, we create the row — the session-exchange path
 *        will find it by firebaseUid on first sign-in.
 *   3. Rebuilds the Firebase custom claims so the next token carries
 *      { isSuperAdmin: true, tenantMemberships: {...} }.
 *
 * The user must have a Firebase Auth account (sign up through the app at
 * least once, or be created via the Firebase console). After running,
 * they need to sign out and back in — or the frontend can just call
 * refreshSession() — to pick up the new claim.
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Load .env the same way main.ts does, so DATABASE_URL + Firebase creds
// are picked up when this runs outside the Nest runtime.
expand(loadEnv());

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function initAdmin(): void {
  if (getApps()[0]) return;

  // Matches FirebaseAdminService.loadCredential — prefer a service-account
  // path, fall back to the three-variable form. Stays in sync so dev and
  // CLI use the same credentials.
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path) {
    const file = JSON.parse(require('node:fs').readFileSync(path, 'utf-8'));
    initializeApp({ credential: cert(file) });
    return;
  }

  initializeApp({
    credential: cert({
      projectId: requireEnv('FIREBASE_PROJECT_ID'),
      clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey: requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    }),
  });
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run seed:super-admin -- <email>');
    process.exit(1);
  }

  initAdmin();
  const auth = getAuth();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
  });

  let fbUser;
  try {
    fbUser = await auth.getUserByEmail(email);
  } catch {
    console.error(
      `❌ No Firebase Auth user with email ${email}.\n` +
        `   Create them in the Firebase console or have them sign in once, then re-run.`,
    );
    process.exit(1);
  }

  // Upsert the User row with isSuperAdmin=true. If the user hasn't signed
  // into the app yet, this creates their Postgres profile ahead of time
  // so the session exchange finds it by firebaseUid.
  const user = await prisma.user.upsert({
    where: { firebaseUid: fbUser.uid },
    update: { isSuperAdmin: true },
    create: {
      firebaseUid: fbUser.uid,
      email: fbUser.email ?? email,
      displayName: fbUser.displayName ?? fbUser.email ?? fbUser.uid,
      photoUrl: fbUser.photoURL ?? null,
      isSuperAdmin: true,
    },
  });

  // Rebuild the custom claims payload (mirrors UserClaimsService.refreshFor).
  const memberRows = await prisma.member.findMany({
    where: { userId: user.id, deletedAt: null, tenant: { deletedAt: null } },
    include: { tenant: { select: { slug: true } } },
  });

  const tenantMemberships: Record<string, { memberId: string; role: 'ADMIN' | 'USER' }> = {};
  for (const m of memberRows) {
    tenantMemberships[m.tenant.slug] = { memberId: m.id, role: m.role };
  }

  await auth.setCustomUserClaims(fbUser.uid, {
    isSuperAdmin: true,
    tenantMemberships,
  });

  console.log(`✓ ${email} is now a super admin`);
  console.log(`  Firebase uid: ${fbUser.uid}`);
  console.log(`  Postgres User.id: ${user.id}`);
  console.log(
    `  They must sign out + back in (or call refreshSession) for the new claim to take effect.`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
