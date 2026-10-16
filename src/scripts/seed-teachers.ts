import 'dotenv/config';
import { db } from '../config/db';
import { users } from '../db/schema';
import { hashPassword } from '../utils/hash';

const TEACHERS = [
  {
    id: 'SHZ',
    name: 'Mr. Md Sadman Hafiz',
    email: 'hafiz.sust333@gmail.com',
    password: 'vN7#qL2!xR9@kP4',
    gender: 'male',
  },
  {
    id: 'NS',
    name: 'Mr. Md. Nazmus Sazid',
    email: 'md.nazmus.sajid94@gmail.com',
    password: 'tF8$wQ3%hM6!zK1',
    gender: 'male',
  },
  {
    id: 'MJI',
    name: 'Mohammad Jaweed Iqbal',
    email: '',
    password: 'pC5@dH9&nV2#sY7',
    gender: 'male',
  },
  {
    id: 'RN',
    name: 'Mrs. Raisa Nuzhat',
    email: 'raisa.csecu@gmail.com',
    password: 'bL4!rT8$xJ3@eN6',
    gender: 'female',
  },
] as const;

async function seedTeachers() {
  console.log('Seeding teacher accounts...');

  for (const teacher of TEACHERS) {
    const hashedPassword = await hashPassword(teacher.password);

    await db
      .insert(users)
      .values({
        id: teacher.id,
        name: teacher.name,
        gender: teacher.gender,
        email: teacher.email,
        password: hashedPassword,
        description: 'Teacher',
        department: 'CSE',
        mustChangePassword: true,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: teacher.name,
          gender: teacher.gender,
          email: teacher.email,
          password: hashedPassword,
          description: 'Teacher',
          department: 'CSE',
          mustChangePassword: true,
        },
      });

    console.log(`  Seeded ${teacher.id} (${teacher.email})`);
  }

  console.log('\nTeacher credentials:');
  for (const teacher of TEACHERS) {
    console.log(`${teacher.id}\t${teacher.email}\t${teacher.password}`);
  }
}

seedTeachers().catch((error) => {
  console.error('Failed to seed teacher accounts:', error);
  process.exitCode = 1;
});
