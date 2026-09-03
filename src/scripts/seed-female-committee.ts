import 'dotenv/config';
import { db } from '../config/db';
import { positions, roles, users, executives, committee } from '../db/schema';
import { hashPassword } from '../utils/hash';
import { eq, or } from 'drizzle-orm';
import { invalidate } from '../utils/cache';

/**
 * Official IIUC Computer Club Executive Committee (FEMALE) — Autumn 25 – Spring 26
 * Source: Official University PDF Notification "CC_Executive Committee List (25-26).pdf"
 */

// ── 1. Teachers Body ──
const FEMALE_COMMITTEE_TEACHERS = [
  {
    id: 'DMAU',
    name: 'Dr. Mohammad Aman Ullah',
    designation: 'Professor, Dept. of CSE',
    gender: 'male',
    email: 'ullah047@yahoo.com',
    role: 'president',
    position: 'president',
  },
  {
    id: 'IBH',
    name: 'Israt Binteh Habib',
    designation: 'Lecturer, Dept. of CSE',
    gender: 'female',
    email: 'israt@iiuc.ac.bd',
    role: 'vice president 1',
    position: 'vice president',
  },
  {
    id: 'AJ',
    name: 'Ayesha Julekha',
    designation: 'Lecturer, Dept. of CSE',
    gender: 'female',
    email: 'ayesha@iiuc.ac.bd',
    role: 'vice president 2',
    position: 'vice president',
  },
  {
    id: 'MJ',
    name: 'Miskatul Jannat',
    designation: 'Lecturer, Dept. of CSE',
    gender: 'female',
    email: 'miskat@iiuc.ac.bd',
    role: 'vice president 3',
    position: 'vice president',
  },
  {
    id: 'SR',
    name: 'Sahariar Reza',
    designation: 'Lecturer, Dept. of CSE',
    gender: 'male',
    email: 'sr@ugrad.iiuc.ac.bd',
    role: 'treasurer',
    position: 'treasurer',
  },
];

// ── 2. Students Body (Exact 33 members from official PDF) ──
const FEMALE_COMMITTEE_STUDENTS = [
  {
    sl: 1,
    id: 'C221235',
    name: 'Jannatul Adon Joha',
    semester: '8th',
    email: 'c221235@ugrad.iiuc.ac.bd',
    role: 'general secretary',
    position: 'general secretary',
  },
  {
    sl: 2,
    id: 'C223229',
    name: 'Israth Jahan Worthy',
    semester: '7th',
    email: 'c223229@ugrad.iiuc.ac.bd',
    role: 'assistant general secretary 1',
    position: 'assistant general secretary',
  },
  {
    sl: 3,
    id: 'C221222',
    name: 'Nafisa Nawar',
    semester: '8th',
    email: 'c221222@ugrad.iiuc.ac.bd',
    role: 'assistant general secretary 2',
    position: 'assistant general secretary',
  },
  {
    sl: 4,
    id: 'C233421',
    name: 'Samea Binte Saif',
    semester: '5th',
    email: 'samea3071@gmail.com',
    role: 'secretary',
    position: 'office & logistic secretary',
  },
  {
    sl: 5,
    id: 'C233449',
    name: 'Nusrath Jahan Shawon',
    semester: '5th',
    email: 'nusratjahanshawon1@gmail.com',
    role: 'assistant secretary 1',
    position: 'assistant office & logistic secretary',
  },
  {
    sl: 6,
    id: 'C223212',
    name: 'Souriya Sultana',
    semester: '7th',
    email: 'souriyasultana@gmail.com',
    role: 'assistant secretary 2',
    position: 'assistant office & logistic secretary',
  },
  {
    sl: 7,
    id: 'C251233',
    name: 'Fariha Binte Faiz',
    semester: '2nd',
    email: 'ahirafzaif@gmail.com',
    role: 'executive member',
    position: 'executive member',
  },
  {
    sl: 8,
    id: 'C231501',
    name: 'Sanjida Khan Moulee',
    semester: '6th',
    email: 'sanjidakhan.cse55@gmail.com',
    role: 'secretary',
    position: 'finance secretary',
  },
  {
    sl: 9,
    id: 'C231411',
    name: 'Syeda Ramisa Rownok',
    semester: '6th',
    email: 'c231411@ugrad.iiuc.ac.bd',
    role: 'assistant secretary 1',
    position: 'assistant finance secretary',
  },
  {
    sl: 10,
    id: 'C221201',
    name: 'Sumaiya Islam',
    semester: '8th',
    email: 'sumaiyamanisha093@gmail.com',
    role: 'secretary',
    position: 'social welfare & public relations secretary',
  },
  {
    sl: 11,
    id: 'C231445',
    name: 'Bibi Fatema',
    semester: '5th',
    email: 'bibifatema1415@gmail.com',
    role: 'assistant secretary 1',
    position: 'assistant social welfare & public relations secretary',
  },
  {
    sl: 12,
    id: 'C221264',
    name: 'Jabin Tasnim',
    semester: '8th',
    email: 'jabintasnim95@gmail.com',
    role: 'secretary',
    position: 'press & publication secretary',
  },
  {
    sl: 13,
    id: 'C223311',
    name: 'Tahsin Islam Nafisa',
    semester: '7th',
    email: 'c223311@ugrad.iiuc.ac.bd',
    role: 'assistant secretary 1',
    position: 'assistant press & publication secretary',
  },
  {
    sl: 14,
    id: 'C241429',
    name: 'Jannatul Maowa',
    semester: '4th',
    email: 'c241429@ugrad.iiuc.ac.bd',
    role: 'executive member',
    position: 'executive member',
  },
  {
    sl: 15,
    id: 'C223236',
    name: 'Afia Ebnath Boshra',
    semester: '7th',
    email: 'afiaebnathboshra@gmail.com',
    role: 'secretary',
    position: 'sports & debate secretary',
  },
  {
    sl: 16,
    id: 'C231533',
    name: 'Arpita Barua',
    semester: '6th',
    email: 'arpitabarua145@gmail.com',
    role: 'assistant secretary 1',
    position: 'assistant sports & debate secretary',
  },
  {
    sl: 17,
    id: 'C231519',
    name: 'Maryam Tahira',
    semester: '6th',
    email: 'tahiramaryam34@gmail.com',
    role: 'assistant secretary 2',
    position: 'assistant sports & debate secretary',
  },
  {
    sl: 18,
    id: 'C221225',
    name: 'Jebanur Rashid Chowdhury',
    semester: '8th',
    email: 'c221225@ugrad.iiuc.ac.bd',
    role: 'secretary',
    position: 'event secretary',
  },
  {
    sl: 19,
    id: 'C233477',
    name: 'Sumyah Monir Mithy',
    semester: '6th',
    email: 'sumaiyamonir2003@gmail.com',
    role: 'assistant secretary 1',
    position: 'assistant event secretary',
  },
  {
    sl: 20,
    id: 'C231532',
    name: 'Rubaiyat Sharmin Mahin',
    semester: '6th',
    email: 'c231532@ugrad.iiuc.ac.bd',
    role: 'assistant secretary 2',
    position: 'assistant event secretary',
  },
  {
    sl: 21,
    id: 'C231540',
    name: 'Sabria Shabnam Afra',
    semester: '6th',
    email: 'c231540@ugrad.iiuc.ac.bd',
    role: 'executive member',
    position: 'executive member',
  },
  {
    sl: 22,
    id: 'C221251',
    name: 'Nowrin Akter Mahi',
    semester: '8th',
    email: 'c221251@ugrad.iiuc.ac.bd',
    role: 'secretary',
    position: 'cultural secretary',
  },
  {
    sl: 23,
    id: 'C243462',
    name: 'Sabiha Ferdousi Saba',
    semester: '3rd',
    email: 'c243462@ugrad.iiuc.ac.bd',
    role: 'assistant secretary 1',
    position: 'assistant cultural secretary',
  },
  {
    sl: 24,
    id: 'C233466',
    name: 'Nafia Nowshin',
    semester: '4th',
    email: 'c233466@ugrad.iiuc.ac.bd',
    role: 'assistant secretary 2',
    position: 'assistant cultural secretary',
  },
  {
    sl: 25,
    id: 'C221256',
    name: 'Tahiat Tabassum',
    semester: '8th',
    email: 'tahiatc56@gmail.com',
    role: 'secretary',
    position: 'photography secretary',
  },
  {
    sl: 26,
    id: 'C223204',
    name: 'Bibi Ayesha Akhter',
    semester: '7th',
    email: 'ayeshahasan0907@gmail.com',
    role: 'assistant secretary 1',
    position: 'assistant photography secretary',
  },
  {
    sl: 27,
    id: 'C241460',
    name: 'Masharu Islam Nammi',
    semester: '4th',
    email: 'masharuislam@gmail.com',
    role: 'executive member',
    position: 'executive member',
  },
  {
    sl: 28,
    id: 'C231436',
    name: 'Tasmiya Tithi',
    semester: '6th',
    email: 'tasmiyatithi290@gmail.com',
    role: 'secretary',
    position: 'creative & design secretary',
  },
  {
    sl: 29,
    id: 'C243406',
    name: 'Tabiba Chowdhury',
    semester: '3rd',
    email: 'tabibachowdhury54@gmail.com',
    role: 'assistant secretary 1',
    position: 'assistant creative & design secretary',
  },
  {
    sl: 30,
    id: 'C243423',
    name: 'Labiba Aftab',
    semester: '3rd',
    email: 'aftablabiba@gmail.com',
    role: 'assistant secretary 2',
    position: 'assistant creative & design secretary',
  },
  {
    sl: 31,
    id: 'C233431',
    name: 'Mostafa Arfin',
    semester: '5th',
    email: 'mostafaarfinchamp@gmail.com',
    role: 'secretary',
    position: 'research and development secretary',
  },
  {
    sl: 32,
    id: 'C233436',
    name: 'Meherun Nesa Jerin',
    semester: '5th',
    email: 'meherunnesa1620@gmail.com',
    role: 'assistant secretary 1',
    position: 'assistant research and development secretary',
  },
  {
    sl: 33,
    id: 'C233430',
    name: 'Humaira Adiba',
    semester: '5th',
    email: 'humairaadiba3045@gmail.com',
    role: 'assistant secretary 2',
    position: 'assistant research and development secretary',
  },
];

async function seedFemaleCommittee() {
  console.log('🌸 Seeding Official IIUC Computer Club Female Committee (2026F)...');

  // ── 1. Insert missing reference positions ──
  const neededPositions = [
    { position: 'office & logistic secretary', description: 'Office & Logistic Secretary' },
    {
      position: 'assistant office & logistic secretary',
      description: 'Assistant Office & Logistic Secretary',
    },
    {
      position: 'social welfare & public relations secretary',
      description: 'Social Welfare & Public Relations Secretary',
    },
    {
      position: 'assistant social welfare & public relations secretary',
      description: 'Assistant Social Welfare & Public Relations Secretary',
    },
    { position: 'press & publication secretary', description: 'Press & Publication Secretary' },
    {
      position: 'assistant press & publication secretary',
      description: 'Assistant Press & Publication Secretary',
    },
    { position: 'sports & debate secretary', description: 'Sports & Debate Secretary' },
    {
      position: 'assistant sports & debate secretary',
      description: 'Assistant Sports & Debate Secretary',
    },
    { position: 'creative & design secretary', description: 'Creative & Design Secretary' },
    {
      position: 'assistant creative & design secretary',
      description: 'Assistant Creative & Design Secretary',
    },
  ];
  await db.insert(positions).values(neededPositions).onConflictDoNothing();
  console.log('  ✅ Verified positions table');

  // ── 2. Insert missing reference roles if any ──
  const neededRoles = [
    { role: 'vice president 3', priority: 2, description: 'Third vice president' },
  ];
  await db.insert(roles).values(neededRoles).onConflictDoNothing();
  console.log('  ✅ Verified roles table');

  // ── 3. Upsert Teachers Body into users ──
  for (const t of FEMALE_COMMITTEE_TEACHERS) {
    const cleanId = t.id.trim();
    const cleanEmail = t.email.trim();
    const passwordHash = await hashPassword(cleanId);

    const [existing] = await db
      .select()
      .from(users)
      .where(or(eq(users.id, cleanId), eq(users.email, cleanEmail)));

    if (existing) {
      await db
        .update(users)
        .set({
          name: t.name,
          gender: t.gender as 'male' | 'female',
          email: cleanEmail,
          description: t.designation,
        })
        .where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({
        id: cleanId,
        name: t.name,
        gender: t.gender as 'male' | 'female',
        email: cleanEmail,
        password: passwordHash,
        description: t.designation,
      });
    }
  }
  console.log(`  ✅ Verified ${FEMALE_COMMITTEE_TEACHERS.length} Teachers Body profiles`);

  // ── 4. Upsert 33 Female Students into users ──
  for (const s of FEMALE_COMMITTEE_STUDENTS) {
    const cleanId = s.id.trim();
    const cleanEmail = s.email.trim();
    const passwordHash = await hashPassword(cleanId);

    const [existing] = await db
      .select()
      .from(users)
      .where(or(eq(users.id, cleanId), eq(users.email, cleanEmail)));

    if (existing) {
      await db
        .update(users)
        .set({
          id: cleanId,
          name: s.name,
          gender: 'female',
          email: cleanEmail,
        })
        .where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({
        id: cleanId,
        name: s.name,
        gender: 'female',
        email: cleanEmail,
        password: passwordHash,
      });
    }
  }
  console.log(`  ✅ Verified ${FEMALE_COMMITTEE_STUDENTS.length} Student Body profiles`);

  // ── 5. Ensure Committee 2026F exists & active ──
  await db
    .insert(committee)
    .values({
      number: '2026F',
      gender: 'female',
      start: '2026-01-01',
      session: 'Autumn 2025 - Spring 2026',
      end: null,
      beginningBudget: 50000,
      description: 'IIUC Computer Club Executive Committee (FEMALE)',
    })
    .onConflictDoUpdate({
      target: committee.number,
      set: {
        gender: 'female',
        session: 'Autumn 2025 - Spring 2026',
        end: null,
        description: 'IIUC Computer Club Executive Committee (FEMALE)',
      },
    });

  // ── 6. Clear existing 2026F executives ──
  await db.delete(executives).where(eq(executives.number, '2026F'));

  // ── 7. Insert all 38 Executives assigned by DMAU ──
  const allExecs = [
    ...FEMALE_COMMITTEE_TEACHERS.map((t) => ({
      id: t.id.trim(),
      number: '2026F',
      role: t.role,
      position: t.position,
      assignedBy: 'DMAU',
    })),
    ...FEMALE_COMMITTEE_STUDENTS.map((s) => ({
      id: s.id.trim(),
      number: '2026F',
      role: s.role,
      position: s.position,
      assignedBy: 'DMAU',
    })),
  ];

  await db.insert(executives).values(allExecs);
  console.log(`  ✅ Assigned ${allExecs.length} executives to 2026F (all assignedBy: 'DMAU')`);

  // ── 8. Invalidate Caches ──
  invalidate('committee:');
  invalidate('dashboard:');
  invalidate('president:');
  console.log('  ✅ Cache cleared');

  console.log('\n🎉 Official Female Committee (2026F) seeded successfully from PDF!');
  process.exit(0);
}

seedFemaleCommittee().catch((err) => {
  console.error('❌ Failed seeding female committee:', err);
  process.exit(1);
});
