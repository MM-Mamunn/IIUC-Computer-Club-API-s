/**
 * Basic Seed — inserts the essential reference data (positions, roles)
 * plus a president user and an active committee so you can log in and
 * start testing immediately.
 *
 * Password === ID for every user.
 *
 * Usage: bun run src/scripts/seed.ts
 */
import 'dotenv/config';
import { db } from '../config/db';
import { positions, roles, users, committee, executives } from '../db/schema';
import { events } from '../db/event.schema';
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

async function seed() {
  console.log('🌱 Seeding essential data...\n');

  // ── 1. Positions ──
  const positionList = [
    { position: 'president', description: 'The president of the club' },
    { position: 'vice president', description: 'Vice president of the club' },
    { position: 'general secretary', description: 'General secretary of the club' },
    {
      position: 'assistant general secretary',
      description: 'Assistant general secretary of the club',
    },
    { position: 'treasurer', description: 'Treasurer of the club' },
    { position: 'innovation and tech', description: 'Innovation and tech secretary' },
    { position: 'research and publication', description: 'Research and publication secretary' },
    { position: 'event management', description: 'Event management secretary' },
    { position: 'public relations', description: 'Public relations secretary' },
    { position: 'media and design', description: 'Media and design secretary' },
    { position: 'logistics', description: 'Logistics secretary' },
  ];
  await db.insert(positions).values(positionList).onConflictDoNothing();
  console.log(`  ✅ ${positionList.length} positions inserted`);

  // ── 2. Roles (with priority) ──
  const roleList = [
    { role: 'president', priority: 1, description: 'President of the club' },
    { role: 'vice president 1', priority: 2, description: 'First vice president' },
    { role: 'vice president 2', priority: 2, description: 'Second vice president' },
    { role: 'vice president 3', priority: 2, description: 'Third vice president' },
    { role: 'vice president 4', priority: 2, description: 'Fourth vice president' },
    { role: 'general secretary', priority: 3, description: 'General secretary' },
    { role: 'treasurer', priority: 3, description: 'Treasurer of the club' },
    {
      role: 'assistant general secretary 1',
      priority: 4,
      description: 'First assistant general secretary',
    },
    {
      role: 'assistant general secretary 2',
      priority: 4,
      description: 'Second assistant general secretary',
    },
    { role: 'secretary', priority: 5, description: 'Secretary' },
    { role: 'assistant secretary', priority: 6, description: 'Assistant secretary' },
  ];
  await db.insert(roles).values(roleList).onConflictDoNothing();
  console.log(`  ✅ ${roleList.length} roles inserted`);

  // ── 3. Users — password = id ──
  const userList = [
    // Male president
    {
      id: 'C231139',
      name: 'Shaimon Al Sha',
      gender: 'male',
      email: 'shaimon@iiuc.ac.bd',
    },
    // Female president
    {
      id: 'C231140',
      name: 'Fatima Akter',
      gender: 'female',
      email: 'fatima@iiuc.ac.bd',
    },
    // Male members
    {
      id: 'C231101',
      name: 'Rafiq Ahmed',
      gender: 'male',
      email: 'rafiq@iiuc.ac.bd',
    },
    {
      id: 'C231102',
      name: 'Tanvir Islam',
      gender: 'male',
      email: 'tanvir@iiuc.ac.bd',
    },
    {
      id: 'C231103',
      name: 'Nazmul Hasan',
      gender: 'male',
      email: 'nazmul@iiuc.ac.bd',
    },
    {
      id: 'C231104',
      name: 'Mahbubur Rahman',
      gender: 'male',
      email: 'mahbub@iiuc.ac.bd',
    },
    {
      id: 'C231105',
      name: 'Arif Hossain',
      gender: 'male',
      email: 'arif@iiuc.ac.bd',
    },
    // Female members
    {
      id: 'C231141',
      name: 'Aisha Begum',
      gender: 'female',
      email: 'aisha@iiuc.ac.bd',
    },
    {
      id: 'C231142',
      name: 'Mariam Sultana',
      gender: 'female',
      email: 'mariam@iiuc.ac.bd',
    },
    {
      id: 'C231143',
      name: 'Nusrat Jahan',
      gender: 'female',
      email: 'nusrat@iiuc.ac.bd',
    },
    // Students (no executive role)
    {
      id: 'C231201',
      name: 'Zahid Hasan',
      gender: 'male',
      email: 'zahid@iiuc.ac.bd',
    },
    {
      id: 'C231202',
      name: 'Samira Khan',
      gender: 'female',
      email: 'samira@iiuc.ac.bd',
    },
  ];

  for (const u of userList) {
    const hashed = await hashPassword(u.id); // password = id
    await db
      .insert(users)
      .values({
        id: u.id,
        name: u.name,
        gender: u.gender,
        email: u.email,
        password: hashed,
      })
      .onConflictDoNothing();
  }
  console.log(`  ✅ ${userList.length} users inserted (password = id)`);

  // ── 4. Active Committee (male + female pair) ──
  await db
    .insert(committee)
    .values([
      {
        number: '2026',
        gender: 'male',
        start: '2026-01-01',
        end: null,
        beginningBudget: 50000,
        description: 'IIUC Computer Club Committee 2026 (Male)',
      },
      {
        number: '2026F',
        gender: 'female',
        start: '2026-01-01',
        end: null,
        beginningBudget: null,
        description: 'IIUC Computer Club Committee 2026 (Female)',
      },
    ])
    .onConflictDoNothing();
  console.log('  ✅ Active committee 2026 / 2026F created');

  // ── 5. Assign executives ──
  const executiveList = [
    // Male committee
    {
      id: 'C231139',
      number: '2026',
      role: 'president',
      position: 'president',
      assignedBy: 'C231139',
    },
    {
      id: 'C231101',
      number: '2026',
      role: 'vice president 1',
      position: 'vice president',
      assignedBy: 'C231139',
    },
    {
      id: 'C231102',
      number: '2026',
      role: 'general secretary',
      position: 'general secretary',
      assignedBy: 'C231139',
    },
    {
      id: 'C231103',
      number: '2026',
      role: 'treasurer',
      position: 'treasurer',
      assignedBy: 'C231139',
    },
    {
      id: 'C231104',
      number: '2026',
      role: 'assistant general secretary 1',
      position: 'assistant general secretary',
      assignedBy: 'C231139',
    },
    {
      id: 'C231105',
      number: '2026',
      role: 'secretary',
      position: 'innovation and tech',
      assignedBy: 'C231139',
    },
    // Female committee (no president — the male committee president oversees both)
    {
      id: 'C231140',
      number: '2026F',
      role: 'vice president 1',
      position: 'vice president',
      assignedBy: 'C231139',
    },
    {
      id: 'C231141',
      number: '2026F',
      role: 'general secretary',
      position: 'general secretary',
      assignedBy: 'C231139',
    },
    {
      id: 'C231142',
      number: '2026F',
      role: 'treasurer',
      position: 'treasurer',
      assignedBy: 'C231139',
    },
    {
      id: 'C231143',
      number: '2026F',
      role: 'assistant general secretary 1',
      position: 'assistant general secretary',
      assignedBy: 'C231139',
    },
  ];

  await db.insert(executives).values(executiveList).onConflictDoNothing();
  console.log(`  ✅ ${executiveList.length} executives assigned`);

  // ── 6. Upload banner images & create sample events ──
  console.log('  📸 Uploading banner images...');
  const [iftarImg, iftarImg2, quranImg, charityImg] = await Promise.all([
    uploadLocal('iftar-mahfil.jpeg'),
    uploadLocal('iftar-mahfil-1.jpeg'),
    uploadLocal('quran-recitation.jpeg'),
    uploadLocal('iftar-mahfil-3.jpeg'),
  ]);

  const sampleEvents = [
    {
      title: 'Iftar Mahfil 2026',
      description:
        'Ramadan Week 2026 — Iftar Mahfil. Venue: Kacchi Dine, Jamal Khan. Reporting Time: 04:45 PM, Event Start: 05:00 PM. Open for all male CSE Department students.',
      committeeNumber: '2026',
      eventDate: new Date('2026-03-05T17:00:00'),
      registrationDeadline: new Date('2026-03-04T23:59:00'),
      venue: 'Kacchi Dine, Jamal Khan',
      isPaid: true,
      fee: 400,
      maxParticipants: 100,
      bannerImage: iftarImg,
      status: 'upcoming',
      genderRestriction: 'male',
      createdBy: 'C231139',
      estimatedBudget: 40000,
      allocatedBudget: 30000,
      paymentNumbers: { bkash: ['01815246166'], nagad: [] },
    },
    {
      title: 'Iftar Mahfil 2026 (Female)',
      description: 'Ramadan Week 2026 — Iftar Mahfil for female students. Date: 5 & 6 March, 2026.',
      committeeNumber: '2026F',
      eventDate: new Date('2026-03-06T17:00:00'),
      venue: 'IIUC Campus',
      isPaid: false,
      fee: 0,
      maxParticipants: 80,
      bannerImage: iftarImg2,
      status: 'upcoming',
      genderRestriction: 'female',
      createdBy: 'C231140',
      estimatedBudget: 20000,
      allocatedBudget: 15000,
    },
    {
      title: 'Quran Recitation Competition 2026',
      description:
        'Ramadan Week 2026 — Quran Recitation Competition. Date: 01 March 2026, Sunday. Room CX103, 11:00 AM. Registration Fee: 30 BDT (CSE), 50 BDT (Others). Only male students of Faculty of Science & Engineering.',
      committeeNumber: '2026',
      eventDate: new Date('2026-03-01T11:00:00'),
      registrationDeadline: new Date('2026-02-26T23:59:00'),
      venue: 'CSE Extension (CX) Building, Room CX103',
      isPaid: true,
      fee: 30,
      maxParticipants: 50,
      bannerImage: quranImg,
      status: 'upcoming',
      genderRestriction: 'male',
      createdBy: 'C231139',
      estimatedBudget: 5000,
      allocatedBudget: 3000,
      paymentNumbers: { bkash: ['01814399321'], nagad: [] },
    },
    {
      title: 'Computer Club Charity Campaign 2026',
      description:
        'Fund raising starts from 24th February 2026. Iftar for One Person: TK 120, Food Package for a Family: TK 350. Donation Booth: CSE Main Building.',
      committeeNumber: '2026',
      eventDate: new Date('2026-02-24T10:00:00'),
      venue: 'CSE Main Building (Donation Booth)',
      isPaid: false,
      isDonation: true,
      fee: 0,
      bannerImage: charityImg,
      status: 'ongoing',
      genderRestriction: 'both',
      createdBy: 'C231139',
      estimatedBudget: 50000,
      allocatedBudget: 0,
      paymentNumbers: { bkash: ['01312636302'], nagad: ['01867704636'] },
    },
  ];

  for (const ev of sampleEvents) {
    await db.insert(events).values(ev).onConflictDoNothing();
  }
  console.log(`  ✅ ${sampleEvents.length} sample events created with banner images`);

  console.log('\n🎉 Basic seed completed!\n');
  console.log('👤 Login accounts (password = id):');
  console.log('   President:  C231139 / C231139');
  console.log('   Female VP:  C231140 / C231140');
  console.log('   VP:       C231101 / C231101');
  console.log('   GS:       C231102 / C231102');
  console.log('   Treasurer: C231103 / C231103');
  console.log('   AGS:      C231104 / C231104');
  console.log('   Secretary: C231105 / C231105');
  console.log('   Student (male):  C231201 / C231201');
  console.log('   Student (female): C231202 / C231202');

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
