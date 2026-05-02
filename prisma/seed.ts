// Seed script — run with:
//   npx tsx prisma/seed.ts
//
// Creates a super-admin User, one tenant with a few members, a campaign
// with items, a handful of pledges, and some transactions. Safe to run
// against an empty DB; idempotent enough that re-running on the same
// empty DB produces the same state (all keys are deterministic).

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:12345678@127.0.0.1:5432/church_app?schema=public';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

async function main(): Promise<void> {
  const superAdminUid = 'seed-super-admin-uid';
  const adminUid = 'seed-admin-uid';
  const memberUid = 'seed-member-uid';

  console.log('Seeding…');

  // Users
  const superAdmin = await prisma.user.upsert({
    where: { firebaseUid: superAdminUid },
    update: {},
    create: {
      firebaseUid: superAdminUid,
      email: 'super@churchflow.dev',
      displayName: 'Super Admin',
      isSuperAdmin: true,
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { firebaseUid: adminUid },
    update: {},
    create: {
      firebaseUid: adminUid,
      email: 'pastor@grace.example',
      displayName: 'Pastor Jane',
    },
  });

  const memberUser = await prisma.user.upsert({
    where: { firebaseUid: memberUid },
    update: {},
    create: {
      firebaseUid: memberUid,
      email: 'mary@grace.example',
      displayName: 'Mary Giver',
    },
  });

  // Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'grace-community' },
    update: {},
    create: {
      slug: 'grace-community',
      name: 'Grace Community Church',
      createdBy: superAdmin.firebaseUid,
    },
  });

  // Members
  const adminMember = await prisma.member.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: adminUser.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: adminUser.id,
      firstName: 'Pastor',
      lastName: 'Jane',
      email: adminUser.email,
      role: 'ADMIN',
      createdBy: superAdmin.firebaseUid,
    },
  });

  const maryMember = await prisma.member.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: memberUser.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: memberUser.id,
      firstName: 'Mary',
      lastName: 'Giver',
      email: memberUser.email,
      role: 'USER',
      createdBy: adminUser.firebaseUid,
    },
  });

  // Temp (unlinked) member — for testing invite-to-link flow
  const existingTemp = await prisma.member.findFirst({
    where: { tenantId: tenant.id, firstName: 'Temp', lastName: 'Visitor' },
  });
  const tempMember =
    existingTemp ??
    (await prisma.member.create({
      data: {
        tenantId: tenant.id,
        firstName: 'Temp',
        lastName: 'Visitor',
        role: 'USER',
        createdBy: adminUser.firebaseUid,
      },
    }));

  // Campaign + items
  const existingCampaign = await prisma.campaign.findFirst({
    where: { tenantId: tenant.id, title: 'New Sanctuary Building Fund' },
  });
  const campaign =
    existingCampaign ??
    (await prisma.campaign.create({
      data: {
        tenantId: tenant.id,
        title: 'New Sanctuary Building Fund',
        description: 'Raising funds for the new sanctuary construction.',
        status: 'ACTIVE',
        createdBy: adminUser.firebaseUid,
        deadline: dayjs('2027-12-31').toDate(),
      },
    }));

  const items = await Promise.all(
    [
      { title: 'Roofing', targetAmount: 100000 },
      { title: 'Gates & Fencing', targetAmount: 50000 },
      { title: 'Pews', targetAmount: 300000 },
    ].map(async (i, idx) => {
      const existing = await prisma.campaignItem.findFirst({
        where: { tenantId: tenant.id, campaignId: campaign.id, title: i.title },
      });
      if (existing) return existing;
      return prisma.campaignItem.create({
        data: {
          tenantId: tenant.id,
          campaignId: campaign.id,
          title: i.title,
          targetAmount: i.targetAmount,
          sortOrder: idx,
        },
      });
    }),
  );

  // Pledges
  const existingPledge = await prisma.pledge.findFirst({
    where: { tenantId: tenant.id, memberId: maryMember.id, campaignId: campaign.id },
  });
  const pledge =
    existingPledge ??
    (await prisma.pledge.create({
      data: {
        tenantId: tenant.id,
        campaignId: campaign.id,
        campaignItemId: items[0].id, // Roofing
        memberId: maryMember.id,
        pledgedAmount: 25000,
        status: 'ACTIVE',
        createdBy: adminUser.firebaseUid,
      },
    }));

  // Transactions (some attributed to the pledge, some free-form)
  const existingTxCount = await prisma.transaction.count({
    where: { tenantId: tenant.id },
  });
  if (existingTxCount === 0) {
    await prisma.transaction.createMany({
      data: [
        {
          id: randomUUID(),
          tenantId: tenant.id,
          memberId: maryMember.id,
          type: 'TITHE',
          amount: 150,
          date: dayjs('2026-04-07').toDate(),
          createdBy: adminUser.firebaseUid,
        },
        {
          id: randomUUID(),
          tenantId: tenant.id,
          memberId: maryMember.id,
          type: 'OFFERING',
          amount: 40,
          date: dayjs('2026-04-14').toDate(),
          createdBy: adminUser.firebaseUid,
        },
        {
          id: randomUUID(),
          tenantId: tenant.id,
          memberId: maryMember.id,
          pledgeId: pledge.id,
          campaignId: pledge.campaignId,
          campaignItemId: pledge.campaignItemId,
          type: 'COMMITMENT',
          amount: 2500,
          date: dayjs('2026-04-21').toDate(),
          referenceNumber: 'TRF-2026-0421',
          createdBy: adminUser.firebaseUid,
        },
      ],
    });
  }

  console.log('Seed complete.');
  console.log(`  Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`  Super-admin uid: ${superAdminUid}`);
  console.log(`  Admin uid: ${adminUid}`);
  console.log(`  Member uid: ${memberUid}`);
  console.log(`  Campaign items: ${items.length}`);
  console.log(`  Temp member id: ${tempMember.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
