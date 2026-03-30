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
import { eq } from 'drizzle-orm';

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

const CURRENT_MALE_COMMITTEE_2026 = [
  {
    id: 'DMAU',
    name: 'Dr Mohammad Aman Ullah',
    role: 'president',
    position: 'president',
  },
  {
    id: 'MRI',
    name: 'Md Rasedul Islam',
    role: 'vice president 1',
    position: 'vice president',
  },
  {
    id: 'AYA',
    name: 'ABM Yasir Arafat',
    role: 'vice president 2',
    position: 'vice president',
  },
  {
    id: 'SR',
    name: 'Sahariar Reza',
    role: 'treasurer',
    position: 'treasurer',
  },
  {
    id: 'C221072',
    name: 'Mohammed Faisal Fardin Chowdhury',
    role: 'general secretary',
    position: 'general secretary',
  },
  {
    id: 'C221194',
    name: 'Shahadat Hasan Arvi',
    role: 'assistant general secretary 1',
    position: 'assistant general secretary',
  },
  {
    id: 'C223413',
    name: 'Md Abu Bakar Siddik Didar',
    role: 'assistant general secretary 2',
    position: 'assistant general secretary',
  },
  {
    id: 'C223009',
    name: 'Ezaz Ahmed',
    role: 'assistant general secretary 3',
    position: 'assistant general secretary',
  },
  {
    id: 'C231025',
    name: 'Munyim Mahmud Mahi',
    role: 'secretary',
    position: 'office secretary',
  },
  {
    id: 'C231152',
    name: 'M M Sadik Islam',
    role: 'assistant secretary',
    position: 'assistant office secretary',
  },
  {
    id: 'C223169',
    name: 'Md Abdullah Al Anser',
    role: 'secretary',
    position: 'finance secretary',
  },
  {
    id: 'C241022',
    name: 'Arifur Rahman',
    role: 'assistant secretary',
    position: 'assistant finance secretary',
  },
  {
    id: 'C221046',
    name: 'Mamun Mahmud',
    role: 'secretary',
    position: 'innovation & tech secretary',
  },
  {
    id: 'C231139',
    name: 'Abdullah Al Shaimon',
    role: 'assistant secretary',
    position: 'assistant innovation & tech secretary',
  },
  {
    id: 'C231022',
    name: 'Adnan Mahmud Alvee',
    role: 'assistant secretary',
    position: 'assistant innovation & tech secretary',
  },
  {
    id: 'C241166',
    name: 'Minhajur Rahman Bhuiyan',
    role: 'secretary',
    position: 'debate secretary',
  },
  {
    id: 'C231315',
    name: 'A F M Sayeed Islam',
    role: 'assistant secretary',
    position: 'assistant debate secretary',
  },
  {
    id: 'C241162',
    name: 'Shakib Jishan Ranik',
    role: 'assistant secretary',
    position: 'assistant debate secretary',
  },
  {
    id: 'C233253',
    name: 'Md Siyam Elahe',
    role: 'secretary',
    position: 'cultural secretary',
  },
  {
    id: 'C253159',
    name: 'Md. Al-Amin',
    role: 'assistant secretary',
    position: 'assistant cultural secretary',
  },
  {
    id: 'C223110',
    name: 'Md Fahim Ul Hoque',
    role: 'secretary',
    position: 'press and publication secretary',
  },
  {
    id: 'C223414',
    name: 'Md. Abdullah Al Mamun Dinar',
    role: 'assistant secretary',
    position: 'assistant press and publication secretary',
  },
  {
    id: 'C221059',
    name: 'Istadahul Hoque',
    role: 'secretary',
    position: 'sports secretary',
  },
  {
    id: 'C223416',
    name: 'Md. Foisal Islam Fahad',
    role: 'assistant secretary',
    position: 'assistant sports secretary',
  },
  {
    id: 'C241124',
    name: 'Anoawarul Islam Sagar',
    role: 'assistant secretary',
    position: 'assistant sports secretary',
  },
  {
    id: 'C223053',
    name: 'Imdadur Rashid',
    role: 'secretary',
    position: 'logistics & organizing secretary',
  },
  {
    id: 'C231153',
    name: 'Sajid Hossen',
    role: 'assistant secretary',
    position: 'assistant logistics & organizing secretary',
  },
  {
    id: 'C243114',
    name: 'Md. Saimon Sobhan Shuvo',
    role: 'assistant secretary',
    position: 'assistant logistics & organizing secretary',
  },
  {
    id: 'C233093',
    name: 'Md. Ali Azgor',
    role: 'secretary',
    position: 'creative & design secretary',
  },
  {
    id: 'C231325',
    name: 'Shahriar Mohammad Aqib',
    role: 'assistant secretary',
    position: 'assistant creative and design secretary',
  },
  {
    id: 'C243217',
    name: 'Md. Shahraj Mashrafe Mashfi',
    role: 'assistant secretary',
    position: 'assistant creative and design secretary',
  },
  {
    id: 'C243116',
    name: 'Mohammad Rasib Iftekhar Nabil',
    role: 'assistant secretary',
    position: 'assistant creative and design secretary',
  },
  {
    id: 'C223163',
    name: 'Mynul Kabir Nayem',
    role: 'secretary',
    position: 'photography secretary',
  },
  {
    id: 'C241268',
    name: 'Sakibul Islam Sakif',
    role: 'assistant secretary',
    position: 'assistant photography secretary',
  },
  {
    id: 'C221076',
    name: 'Md Faisal Hoque Rifat',
    role: 'secretary',
    position: 'research and development secretary',
  },
  {
    id: 'C223032',
    name: 'Mohammed Shakawat Hossen',
    role: 'assistant secretary',
    position: 'assistant research and development secretary',
  },
  {
    id: 'C231068',
    name: 'Hasnain Kabir Nabil',
    role: 'assistant secretary',
    position: 'assistant research and development secretary',
  },
  {
    id: 'C223134',
    name: 'Tawab Ahmed Nafi',
    role: 'secretary',
    position: 'event secretary',
  },
  {
    id: 'C223168',
    name: 'Mohammad Saiful Islam',
    role: 'assistant secretary',
    position: 'assistant event secretary',
  },
  {
    id: 'C241155',
    name: 'Idrath Hossan Zidan',
    role: 'assistant secretary',
    position: 'assistant event secretary',
  },
  {
    id: 'C233070',
    name: 'Eman Hossain Arman',
    role: 'secretary',
    position: 'public relations secretary',
  },
  {
    id: 'C241181',
    name: 'Mahin Mashrafe Maruf',
    role: 'assistant secretary',
    position: 'assistant public relations secretary',
  },
  {
    id: 'C233222',
    name: 'Md. Amzad Hosen Pinso',
    role: 'secretary',
    position: 'social welfare secretary',
  },
  {
    id: 'C231145',
    name: 'Taseen Ahmed',
    role: 'assistant secretary',
    position: 'assistant social welfare secretary',
  },
  {
    id: 'C241175',
    name: 'Abdullah Al Mahmud Sayem',
    role: 'assistant secretary',
    position: 'assistant social welfare secretary',
  },
  {
    id: 'C233049',
    name: 'Abdul Al Bin Shahin',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C233081',
    name: 'Shahiduz Zaman Fahim',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C241263',
    name: 'Tajbik Sifat',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C241190',
    name: 'Md Tahfimul Alam Abir',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C243194',
    name: 'Durjoy Chandra Das',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C243062',
    name: 'Mohammad Tanzim Uddin',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C243172',
    name: 'Tahimur Rahman Samin',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C251102',
    name: 'Zawad Abrar Mahmud',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C251021',
    name: 'Anan Sadid',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C251007',
    name: 'Md. Sharafat Hossain',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C253099',
    name: 'Azizul Hoque Samin',
    role: 'executive member',
    position: 'executive member',
  },
  {
    id: 'C253156',
    name: 'Md. Rakibul Islam',
    role: 'executive member',
    position: 'executive member',
  },
] as const;

function emailFromId(id: string) {
  return `${id.toLowerCase()}@ugrad.iiuc.ac.bd`;
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
    { position: 'office secretary', description: 'Office secretary' },
    { position: 'assistant office secretary', description: 'Assistant office secretary' },
    { position: 'finance secretary', description: 'Finance secretary' },
    { position: 'assistant finance secretary', description: 'Assistant finance secretary' },
    { position: 'innovation & tech secretary', description: 'Innovation & Tech secretary' },
    {
      position: 'assistant innovation & tech secretary',
      description: 'Assistant Innovation & Tech secretary',
    },
    { position: 'debate secretary', description: 'Debate secretary' },
    { position: 'assistant debate secretary', description: 'Assistant debate secretary' },
    { position: 'cultural secretary', description: 'Cultural secretary' },
    { position: 'assistant cultural secretary', description: 'Assistant cultural secretary' },
    {
      position: 'press and publication secretary',
      description: 'Press and Publication secretary',
    },
    {
      position: 'assistant press and publication secretary',
      description: 'Assistant Press and Publication secretary',
    },
    { position: 'sports secretary', description: 'Sports secretary' },
    { position: 'assistant sports secretary', description: 'Assistant sports secretary' },
    {
      position: 'logistics & organizing secretary',
      description: 'Logistics & Organizing secretary',
    },
    {
      position: 'assistant logistics & organizing secretary',
      description: 'Assistant Logistics & Organizing secretary',
    },
    { position: 'creative & design secretary', description: 'Creative & Design secretary' },
    {
      position: 'assistant creative and design secretary',
      description: 'Assistant Creative and Design secretary',
    },
    { position: 'photography secretary', description: 'Photography secretary' },
    {
      position: 'assistant photography secretary',
      description: 'Assistant Photography secretary',
    },
    {
      position: 'research and development secretary',
      description: 'Research and Development secretary',
    },
    {
      position: 'assistant research and development secretary',
      description: 'Assistant Research and Development secretary',
    },
    { position: 'event secretary', description: 'Event secretary' },
    { position: 'assistant event secretary', description: 'Assistant Event secretary' },
    { position: 'public relations secretary', description: 'Public Relations secretary' },
    {
      position: 'assistant public relations secretary',
      description: 'Assistant Public Relations secretary',
    },
    { position: 'social welfare secretary', description: 'Social Welfare secretary' },
    {
      position: 'assistant social welfare secretary',
      description: 'Assistant Social Welfare secretary',
    },
    { position: 'executive member', description: 'Executive member of the club' },
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
    {
      role: 'assistant general secretary 3',
      priority: 4,
      description: 'Third assistant general secretary',
    },
    { role: 'secretary', priority: 5, description: 'Secretary' },
    { role: 'assistant secretary', priority: 6, description: 'Assistant secretary' },
    { role: 'executive member', priority: 7, description: 'Executive member' },
  ];
  await db.insert(roles).values(roleList).onConflictDoNothing();
  console.log(`  ✅ ${roleList.length} roles inserted`);

  // ── 3. Users — password = id ──
  const userList = [
    ...CURRENT_MALE_COMMITTEE_2026.map((member) => ({
      id: member.id,
      name: member.name,
      gender: 'male' as const,
      email: emailFromId(member.id),
    })),
    // Female sample users
    {
      id: 'C231140',
      name: 'Fatima Akter',
      gender: 'female',
      email: emailFromId('C231140'),
    },
    {
      id: 'C231141',
      name: 'Aisha Begum',
      gender: 'female',
      email: emailFromId('C231141'),
    },
    {
      id: 'C231142',
      name: 'Mariam Sultana',
      gender: 'female',
      email: emailFromId('C231142'),
    },
    {
      id: 'C231143',
      name: 'Nusrat Jahan',
      gender: 'female',
      email: emailFromId('C231143'),
    },
    // Students (no executive role)
    {
      id: 'C231201',
      name: 'Zahid Hasan',
      gender: 'male',
      email: emailFromId('C231201'),
    },
    {
      id: 'C231202',
      name: 'Samira Khan',
      gender: 'female',
      email: emailFromId('C231202'),
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
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: u.name,
          gender: u.gender,
          email: u.email,
          password: hashed,
        },
      });
  }
  console.log(`  ✅ ${userList.length} users inserted (password = id)`);

  // ── 4. Active Committee (male + female pair) ──
  await db
    .insert(committee)
    .values([
      {
        number: 'Autumn 2026',
        gender: 'male',
        start: '2026-01-01',
        session: 'Autumn 2025 - Spring 2026',
        end: null,
        beginningBudget: 50000,
        description: 'IIUC Computer Club Committee 2026 (Male)',
      },
      {
        number: 'Autumn 2026 Female',
        gender: 'female',
        start: '2026-01-01',
        session: 'Autumn 2025 - Spring 2026',
        end: null,
        beginningBudget: null,
        description: 'IIUC Computer Club Committee 2026 (Female)',
      },
    ])
    .onConflictDoNothing();
  console.log('  ✅ Active committee 2026 / 2026F created');

  // ── 5. Assign executives ──
  const executiveList = [
    ...CURRENT_MALE_COMMITTEE_2026.map((member) => ({
      id: member.id,
      number: '2026',
      role: member.role,
      position: member.position,
      assignedBy: 'DMAU',
    })),
    // Female sample committee
    {
      id: 'C231140',
      number: '2026F',
      role: 'vice president 1',
      position: 'vice president',
      assignedBy: 'DMAU',
    },
    {
      id: 'C231141',
      number: '2026F',
      role: 'general secretary',
      position: 'general secretary',
      assignedBy: 'DMAU',
    },
    {
      id: 'C231142',
      number: '2026F',
      role: 'treasurer',
      position: 'treasurer',
      assignedBy: 'DMAU',
    },
    {
      id: 'C231143',
      number: '2026F',
      role: 'assistant general secretary 1',
      position: 'assistant general secretary',
      assignedBy: 'DMAU',
    },
  ];

  await db.delete(executives).where(eq(executives.number, '2026'));
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
      createdBy: 'DMAU',
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
      createdBy: 'DMAU',
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
      createdBy: 'DMAU',
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
  console.log('   President:  DMAU / DMAU');
  console.log('   VP-1:       MRI / MRI');
  console.log('   VP-2:       AYA / AYA');
  console.log('   Treasurer:  SR / SR');
  console.log('   Current GS: C221072 / C221072');
  console.log('   AGS-1:      C221194 / C221194');
  console.log('   Office Sec: C231025 / C231025');
  console.log('   Asst. I&T:  C231139 / C231139');
  console.log('   Exec Mem:   C233049 / C233049');
  console.log('   Female VP:  C231140 / C231140');
  console.log('   Student (male):  C231201 / C231201');
  console.log('   Student (female): C231202 / C231202');

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
