/**
 * Massive Seed — generates a large volume of realistic data for stress-testing.
 *
 * Prerequisite: Run `bun run db:seed` first to create positions, roles, and
 * the active committee. This script adds ON TOP of that baseline.
 *
 * What it creates:
 *   • 3 closed committees (2023, 2024, 2025) + their female counterparts
 *   • 200 users (100 male, 100 female) — password = id
 *   • Executives assigned to every committee
 *   • 30+ events spread across committees
 *   • Event registrations, expenses, claims, vouchers
 *
 * Usage: bun run src/scripts/seed-massive.ts
 */
import 'dotenv/config';
import { db } from '../config/db';
import { users, committee, executives } from '../db/schema';
import {
  events,
  eventRegistrations,
  eventExpenses,
  expenseClaims,
  vouchers,
} from '../db/event.schema';
import { hashPassword } from '../utils/hash';
import cloudinary from '../config/cloudinary';
import path from 'path';

/** Upload a local image file to Cloudinary and return the secure URL (skips re-upload if already exists) */
async function uploadLocal(filename: string): Promise<string> {
  const filePath = path.resolve(__dirname, '../../', filename);
  const publicId = path.basename(filename, path.extname(filename));
  const result = await cloudinary.uploader.upload(filePath, {
    folder: 'ccapi/seed',
    public_id: publicId,
    overwrite: false,
    unique_filename: false,
  });
  return result.secure_url;
}

// ── Helpers ──
const maleNames = [
  'Abdullah',
  'Imran',
  'Faisal',
  'Shakil',
  'Rakib',
  'Jubayer',
  'Saiful',
  'Kamrul',
  'Momin',
  'Fahim',
  'Sabbir',
  'Touhid',
  'Habib',
  'Rayhan',
  'Sharif',
  'Jewel',
  'Rony',
  'Sohel',
  'Nayeem',
  'Arafat',
  'Sazzad',
  'Masum',
  'Rashed',
  'Zahid',
  'Sumon',
  'Hasnat',
  'Siam',
  'Mehedi',
  'Rasel',
  'Ifty',
  'Noman',
  'Tushar',
  'Jibon',
  'Limon',
  'Shamim',
  'Nasir',
  'Sobuj',
  'Rezwan',
  'Milon',
  'Parvez',
  'Kamal',
  'Riaz',
  'Biplab',
  'Ashik',
  'Shoaib',
  'Sakib',
  'Dipu',
  'Billal',
  'Taslim',
  'Robin',
];

const femaleNames = [
  'Rafia',
  'Tasnim',
  'Jannatul',
  'Lamia',
  'Sadia',
  'Maryam',
  'Sumaiya',
  'Nafisa',
  'Rima',
  'Farhana',
  'Naima',
  'Bushra',
  'Tasneem',
  'Shirin',
  'Lubna',
  'Afrin',
  'Sanjida',
  'Tamanna',
  'Tanjila',
  'Munni',
  'Sharmin',
  'Salma',
  'Halima',
  'Asma',
  'Rukaiya',
  'Sabrina',
  'Dina',
  'Nahida',
  'Mahfuza',
  'Rebeka',
  'Sumona',
  'Shapla',
  'Urmi',
  'Jharna',
  'Moushumi',
  'Lucky',
  'Shilpi',
  'Lipi',
  'Papia',
  'Mili',
  'Kaniz',
  'Shabnaz',
  'Nasreen',
  'Dilara',
  'Rokeya',
  'Hasina',
  'Monira',
  'Rahima',
  'Kulsum',
  'Shirley',
];

const lastNames = [
  'Ahmed',
  'Hasan',
  'Islam',
  'Rahman',
  'Akter',
  'Hossain',
  'Khan',
  'Chowdhury',
  'Siddique',
  'Uddin',
  'Miah',
  'Begum',
  'Sultana',
  'Khatun',
  'Ali',
  'Jahan',
];

const venues = [
  'IIUC Auditorium',
  'CSE Lab 1',
  'CSE Lab 2',
  'Room 301',
  'Room 402',
  'Library Hall',
  'Cafeteria',
  'Engineering Building',
  'Central Mosque',
  'Open Field',
  'Online (Zoom)',
  'Online (Google Meet)',
];

const eventTitles = [
  'Intra IIUC Programming Contest',
  'Web Development Workshop',
  'AI & Machine Learning Seminar',
  'Cyber Security Bootcamp',
  'Annual General Meeting',
  'Freshers Welcome',
  'Farewell Ceremony',
  'Database Design Masterclass',
  'Mobile App Hackathon',
  'Cloud Computing Workshop',
  'Open Source Day',
  'Tech Talk Series',
  'Competitive Programming Camp',
  'Design Thinking Workshop',
  'IoT Hands-on Lab',
  'Blockchain Basics',
  'Data Science Workshop',
  'Career Guidance Seminar',
  'Interview Prep Session',
  'Project Showcase',
  'Robotics Demo Day',
  'Game Dev Jam',
  'Linux Installation Fest',
  'Git & GitHub Workshop',
  'Resume Building Workshop',
  'Freelancing Masterclass',
  'Annual Sports Day',
  'Photography Contest',
  'Quiz Competition',
  'Debate Competition',
  'Blood Donation Campaign',
  'Cultural Night',
  'Eid Reunion',
];

const expenseCategories = [
  'venue',
  'logistics',
  'food',
  'printing',
  'prizes',
  'decoration',
  'other',
] as const;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function seedMassive() {
  console.log('🚀 Massive seed starting...\n');

  // ─── 0. Upload banner images to Cloudinary ───
  console.log('  📸 Uploading banner images to Cloudinary...');
  const [iftarImg1, iftarImg2, iftarImg3, iftarImg4, iftarMainImg, quranImg] = await Promise.all([
    uploadLocal('iftar-mahfil-1.jpeg'),
    uploadLocal('iftar-mahfil-2.jpeg'),
    uploadLocal('iftar-mahfil-3.jpeg'),
    uploadLocal('iftar-mahfil-4.jpeg'),
    uploadLocal('iftar-mahfil.jpeg'),
    uploadLocal('quran-recitation.jpeg'),
  ]);
  const bannerImages = [iftarImg1, iftarImg2, iftarImg3, iftarImg4, iftarMainImg, quranImg];
  console.log(`  ✅ ${bannerImages.length} banner images uploaded`);

  // ─── 1. Generate 200 users (100 male + 100 female) ───
  const allUsers: { id: string; name: string; gender: string; email: string }[] = [];

  // Males: C221001 – C221100
  for (let i = 1; i <= 100; i++) {
    const id = `C22${String(1000 + i)}`;
    const firstName = maleNames[(i - 1) % maleNames.length];
    const lastName = lastNames[i % lastNames.length];
    allUsers.push({
      id,
      name: `${firstName} ${lastName}`,
      gender: 'male',
      email: `${firstName.toLowerCase()}${i}@iiuc.ac.bd`,
    });
  }

  // Females: C221201 – C221300
  for (let i = 1; i <= 100; i++) {
    const id = `C22${String(1200 + i)}`;
    const firstName = femaleNames[(i - 1) % femaleNames.length];
    const lastName = lastNames[i % lastNames.length];
    allUsers.push({
      id,
      name: `${firstName} ${lastName}`,
      gender: 'female',
      email: `${firstName.toLowerCase()}${i}@iiuc.ac.bd`,
    });
  }

  // Hash passwords in batches of 20 to avoid memory spikes
  const BATCH = 20;
  for (let start = 0; start < allUsers.length; start += BATCH) {
    const batch = allUsers.slice(start, start + BATCH);
    const rows = await Promise.all(
      batch.map(async (u) => ({
        id: u.id,
        name: u.name,
        gender: u.gender,
        email: u.email,
        password: await hashPassword(u.id), // password = id
      })),
    );
    await db.insert(users).values(rows).onConflictDoNothing();
  }
  console.log(`  ✅ ${allUsers.length} users created (password = id)`);

  // ─── 2. Closed committees (2023, 2024, 2025) — active 2026 already created by seed.ts ───
  const committeeData = [
    { number: '2023', gender: 'male', start: '2023-01-01', end: '2023-12-31', budget: 30000 },
    { number: '2023F', gender: 'female', start: '2023-01-01', end: '2023-12-31', budget: null },
    { number: '2024', gender: 'male', start: '2024-01-01', end: '2024-12-31', budget: 40000 },
    { number: '2024F', gender: 'female', start: '2024-01-01', end: '2024-12-31', budget: null },
    { number: '2025', gender: 'male', start: '2025-01-01', end: '2025-12-31', budget: 45000 },
    { number: '2025F', gender: 'female', start: '2025-01-01', end: '2025-12-31', budget: null },
  ];
  await db
    .insert(committee)
    .values(
      committeeData.map((c) => ({
        number: c.number,
        gender: c.gender,
        start: c.start,
        session: c.number.endsWith('F')
          ? `${c.number.slice(0, -1)} Session`
          : `${c.number} Session`,
        end: c.end,
        beginningBudget: c.budget,
        description: `IIUC CC ${c.number} (${c.gender})`,
      })),
    )
    .onConflictDoNothing();
  console.log('  ✅ 6 closed committees created (male+female)');

  // ─── 3. Assign executives to each committee ───
  const maleIds = allUsers.filter((u) => u.gender === 'male').map((u) => u.id);
  const femaleIds = allUsers.filter((u) => u.gender === 'female').map((u) => u.id);

  let maleIdx = 0;
  let femaleIdx = 0;

  const execRows: {
    id: string;
    number: string;
    role: string;
    position: string;
    assignedBy: string;
  }[] = [];

  const maleComms = ['2023', '2024', '2025'];
  const femaleComms = ['2023F', '2024F', '2025F'];

  for (const comNum of maleComms) {
    const presId = maleIds[maleIdx++];
    execRows.push(
      { id: presId, number: comNum, role: 'president', position: 'president', assignedBy: presId },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'vice president 1',
        position: 'vice president',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'vice president 2',
        position: 'vice president',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'general secretary',
        position: 'general secretary',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'treasurer',
        position: 'treasurer',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'assistant general secretary 1',
        position: 'assistant general secretary',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'assistant general secretary 2',
        position: 'assistant general secretary',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'secretary',
        position: 'innovation and tech',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'secretary',
        position: 'event management',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'secretary',
        position: 'media and design',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'assistant secretary 1',
        position: 'public relations',
        assignedBy: presId,
      },
      {
        id: maleIds[maleIdx++],
        number: comNum,
        role: 'assistant secretary 2',
        position: 'logistics',
        assignedBy: presId,
      },
    );
  }

  for (const comNum of femaleComms) {
    // No president in female committee — the male committee president oversees both
    const maleComNum = comNum.replace('F', '');
    const malePresExec = execRows.find((e) => e.number === maleComNum && e.role === 'president')!;
    const presId = malePresExec.id;

    execRows.push(
      {
        id: femaleIds[femaleIdx++],
        number: comNum,
        role: 'vice president 1',
        position: 'vice president',
        assignedBy: presId,
      },
      {
        id: femaleIds[femaleIdx++],
        number: comNum,
        role: 'general secretary',
        position: 'general secretary',
        assignedBy: presId,
      },
      {
        id: femaleIds[femaleIdx++],
        number: comNum,
        role: 'treasurer',
        position: 'treasurer',
        assignedBy: presId,
      },
      {
        id: femaleIds[femaleIdx++],
        number: comNum,
        role: 'assistant general secretary 1',
        position: 'assistant general secretary',
        assignedBy: presId,
      },
      {
        id: femaleIds[femaleIdx++],
        number: comNum,
        role: 'secretary',
        position: 'innovation and tech',
        assignedBy: presId,
      },
      {
        id: femaleIds[femaleIdx++],
        number: comNum,
        role: 'secretary',
        position: 'event management',
        assignedBy: presId,
      },
      {
        id: femaleIds[femaleIdx++],
        number: comNum,
        role: 'assistant secretary 1',
        position: 'public relations',
        assignedBy: presId,
      },
    );
  }

  // Insert in batches
  for (let start = 0; start < execRows.length; start += 50) {
    await db
      .insert(executives)
      .values(execRows.slice(start, start + 50))
      .onConflictDoNothing();
  }
  console.log(`  ✅ ${execRows.length} executive assignments`);

  // ─── 4. Events across all committees ───
  const eventRows: {
    title: string;
    description: string;
    committeeNumber: string;
    eventDate: Date;
    venue: string;
    isPaid: boolean;
    fee: number;
    maxParticipants: number | null;
    bannerImage: string;
    status: string;
    genderRestriction: string;
    createdBy: string;
    estimatedBudget: number;
    allocatedBudget: number;
  }[] = [];

  let titleIdx = 0;

  for (const comNum of [...maleComms, ...femaleComms]) {
    const isFemale = comNum.endsWith('F');
    const baseYear = parseInt(comNum.replace('F', ''));
    const isClosed = baseYear < 2026;
    const presExec = execRows.find((e) => e.number === comNum && e.role === 'president');
    const createdBy = presExec?.id ?? maleIds[0];

    // 4-6 events per committee
    const count = randInt(4, 6);
    for (let i = 0; i < count; i++) {
      const title = eventTitles[titleIdx % eventTitles.length];
      titleIdx++;
      const month = randInt(2, 11);
      const day = randInt(1, 28);
      const isPaid = Math.random() > 0.6;
      const fee = isPaid ? pick([100, 200, 300, 500]) : 0;

      eventRows.push({
        title: `${title} ${baseYear}`,
        description: `${title} organized by IIUC Computer Club committee ${comNum}`,
        committeeNumber: comNum,
        eventDate: new Date(baseYear, month - 1, day),
        venue: pick(venues),
        isPaid,
        fee,
        maxParticipants: Math.random() > 0.5 ? randInt(30, 200) : null,
        bannerImage: pick(bannerImages),
        status: isClosed ? 'completed' : Math.random() > 0.3 ? 'upcoming' : 'ongoing',
        genderRestriction: isFemale ? 'female' : Math.random() > 0.7 ? 'male' : 'both',
        createdBy,
        estimatedBudget: randInt(2000, 15000),
        allocatedBudget: randInt(1000, 10000),
      });
    }
  }

  const insertedEvents: {
    id: number;
    committeeNumber: string;
    isPaid: boolean;
    fee: number | null;
    createdBy: string;
  }[] = [];
  for (const row of eventRows) {
    const [inserted] = await db.insert(events).values(row).returning({
      id: events.id,
      committeeNumber: events.committeeNumber,
      isPaid: events.isPaid,
      fee: events.fee,
      createdBy: events.createdBy,
    });
    insertedEvents.push(inserted);
  }
  console.log(`  ✅ ${insertedEvents.length} events created`);

  // ─── 5. Event registrations (batch insert) ───
  const regRows: {
    eventId: number;
    userId: string;
    paymentStatus: string;
    paymentMethod: string | null;
    transactionId: string | null;
  }[] = [];

  for (const ev of insertedEvents) {
    const isFemale = ev.committeeNumber.endsWith('F');
    const pool = isFemale ? femaleIds : maleIds;
    const numRegs = randInt(5, 25);
    const regUsers = pool.slice(0, numRegs);

    for (const uid of regUsers) {
      regRows.push({
        eventId: ev.id,
        userId: uid,
        paymentStatus: ev.isPaid
          ? pick(['pending', 'verified', 'verified', 'verified', 'failed'])
          : 'free',
        paymentMethod: ev.isPaid ? pick(['bkash', 'nagad']) : null,
        transactionId: ev.isPaid ? `TXN${ev.id}${uid.slice(-3)}` : null,
      });
    }
  }

  for (let start = 0; start < regRows.length; start += 50) {
    await db
      .insert(eventRegistrations)
      .values(regRows.slice(start, start + 50))
      .onConflictDoNothing();
  }
  console.log(`  ✅ ${regRows.length} event registrations`);

  // ─── 6. Event expenses (batch insert) ───
  const expRows: {
    eventId: number;
    description: string;
    amount: number;
    category: string;
    submittedBy: string;
  }[] = [];

  for (const ev of insertedEvents) {
    const numExpenses = randInt(2, 5);
    for (let i = 0; i < numExpenses; i++) {
      expRows.push({
        eventId: ev.id,
        description: `${pick(['Snacks', 'Banners', 'Printing', 'Prizes', 'Sound system rental', 'Decorations', 'Transport', 'Certificates'])} for event`,
        amount: randInt(200, 5000),
        category: pick([...expenseCategories]),
        submittedBy: ev.createdBy,
      });
    }
  }

  for (let start = 0; start < expRows.length; start += 50) {
    await db.insert(eventExpenses).values(expRows.slice(start, start + 50));
  }
  console.log(`  ✅ ${expRows.length} event expenses`);

  // ─── 7. Expense claims (batch insert) ───
  const claimRows: {
    eventId: number;
    userId: string;
    description: string;
    amount: number;
    proofImage: string;
    status: string;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    paidBy: string | null;
    paidAt: Date | null;
  }[] = [];

  for (const ev of insertedEvents) {
    if (Math.random() > 0.5) continue;
    const isFemale = ev.committeeNumber.endsWith('F');
    const pool = isFemale ? femaleIds : maleIds;
    const claimant = pick(pool.slice(0, 20));
    const status = pick(['pending', 'approved', 'paid', 'rejected']);

    claimRows.push({
      eventId: ev.id,
      userId: claimant,
      description: `Reimbursement for ${pick(['printing', 'snacks', 'transport', 'supplies'])}`,
      amount: randInt(100, 3000),
      proofImage: 'https://placehold.co/400x300?text=Receipt',
      status,
      reviewedBy: status !== 'pending' ? ev.createdBy : null,
      reviewedAt: status !== 'pending' ? new Date() : null,
      paidBy: status === 'paid' ? ev.createdBy : null,
      paidAt: status === 'paid' ? new Date() : null,
    });
  }

  if (claimRows.length > 0) {
    for (let start = 0; start < claimRows.length; start += 50) {
      await db.insert(expenseClaims).values(claimRows.slice(start, start + 50));
    }
  }
  console.log(`  ✅ ${claimRows.length} expense claims`);

  // ─── 8. Vouchers (batch insert) ───
  const voucherRows: {
    eventId: number;
    voucherNumber: string;
    type: string;
    totalRevenue: number;
    totalExpense: number;
    clubSubsidy: number;
    netAmount: number;
    data: unknown;
    generatedBy: string;
  }[] = [];

  let voucherSeq = 1;
  for (const ev of insertedEvents) {
    if (Math.random() > 0.6) continue;
    const baseYear = ev.committeeNumber.replace('F', '');
    const totalExpense = randInt(3000, 15000);
    const totalRevenue = ev.isPaid ? randInt(1000, 10000) : 0;

    voucherRows.push({
      eventId: ev.id,
      voucherNumber: `IIUC-CC-${baseYear}-${String(voucherSeq++).padStart(3, '0')}`,
      type: 'event_summary',
      totalRevenue,
      totalExpense,
      clubSubsidy: Math.max(0, totalExpense - totalRevenue),
      netAmount: totalRevenue - totalExpense,
      data: {
        expenseBreakdown: [
          { category: 'food', amount: randInt(500, 3000) },
          { category: 'venue', amount: randInt(500, 2000) },
          { category: 'printing', amount: randInt(200, 1000) },
        ],
      },
      generatedBy: ev.createdBy,
    });
  }

  if (voucherRows.length > 0) {
    for (let start = 0; start < voucherRows.length; start += 50) {
      await db.insert(vouchers).values(voucherRows.slice(start, start + 50));
    }
  }
  console.log(`  ✅ ${voucherRows.length} vouchers`);

  // ─── Summary ───
  console.log('\n🎉 Massive seed completed!');
  console.log(
    `   ${allUsers.length} users · ${committeeData.length} committees · ${insertedEvents.length} events`,
  );
  console.log(
    `   ${regRows.length} registrations · ${expRows.length} expenses · ${claimRows.length} claims · ${voucherRows.length} vouchers`,
  );
  console.log('\n👤 All user passwords = their ID (e.g. C221001 / C221001)');
  console.log('   Closed committee 2025 president: C221025');
  console.log('   Closed committee 2025F VP1 (female): C221225');

  process.exit(0);
}

seedMassive().catch((err) => {
  console.error('❌ Massive seed failed:', err);
  process.exit(1);
});
