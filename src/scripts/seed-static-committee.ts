/**
 * Seed Static Committee Data into Database
 * Reads frontend/src/data/static-committee.json and idempotently upserts:
 *  - Committees (2027, 2027F)
 *  - Positions & Roles
 *  - Users (with secure default hashed password if new; preserves password if existing)
 *  - Executives junction (id = matrixId, number = committeeNumber)
 *  - Committee Submissions (status = approved)
 *
 * Usage: node node_modules/tsx/dist/cli.mjs src/scripts/seed-static-committee.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { db } from '../config/db';
import {
  committee,
  users,
  executives,
  positions,
  roles,
  committeeSubmissions,
} from '../db/schema';
import { eq, or, and } from 'drizzle-orm';
import { invalidate } from '../utils/cache';

interface StaticMember {
  id: string;
  name: string;
  email: string | null;
  gender?: 'male' | 'female' | null;
  profileImage?: string | null;
  role?: string | null;
  position?: string | null;
  committeeNumber?: string | null;
  bio?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  facebookUrl?: string | null;
  twitterUrl?: string | null;
  portfolioUrl?: string | null;
  websiteUrl?: string | null;
  batch?: string | null;
  skills?: string[] | null;
  department?: string | null;
}

interface StaticCommitteeGroup {
  number: string;
  gender: 'male' | 'female';
  start: string;
  end: string | null;
  description: string | null;
  beginningBudget: number | null;
  session: string;
}

interface StaticData {
  session: string;
  committees: StaticCommitteeGroup[];
  members: Record<string, StaticMember[]>;
}

function normalizeRole(roleStr?: string | null): string {
  if (!roleStr) return 'executive member';
  const r = roleStr.toLowerCase().trim();
  if (r === 'president') return 'president';
  if (r.includes('vice president 1') || r.includes('vice-president 1') || r.includes('vp 1')) return 'vice president 1';
  if (r.includes('vice president 2') || r.includes('vice-president 2') || r.includes('vp 2')) return 'vice president 2';
  if (r.includes('vice president 3') || r.includes('vice-president 3') || r.includes('vp 3')) return 'vice president 3';
  if (r.includes('vice president 4') || r.includes('vice-president 4') || r.includes('vp 4')) return 'vice president 4';
  if (r.includes('vice president') || r.includes('vice-president')) return 'vice president 1';
  if (r.includes('general secretary') && !r.includes('assistant')) return 'general secretary';
  if (r.includes('treasurer')) return 'treasurer';
  if (r.includes('assistant general secretary 1') || r.includes('ags 1')) return 'assistant general secretary 1';
  if (r.includes('assistant general secretary 2') || r.includes('ags 2')) return 'assistant general secretary 2';
  if (r.includes('assistant general secretary 3') || r.includes('ags 3')) return 'assistant general secretary 3';
  if (r.includes('assistant general secretary') || r.includes('ags')) return 'assistant general secretary 1';
  if (r.includes('assistant secretary 1')) return 'assistant secretary 1';
  if (r.includes('assistant secretary 2')) return 'assistant secretary 2';
  if (r.includes('assistant secretary 3')) return 'assistant secretary 3';
  if (r.includes('assistant secretary')) return 'assistant secretary 1';
  if (r.includes('secretary')) return 'secretary';
  return 'executive member';
}

function getRolePriority(role: string): number {
  if (role === 'president') return 1;
  if (role.startsWith('vice president')) return 2;
  if (role === 'general secretary' || role === 'treasurer') return 3;
  if (role.startsWith('assistant general secretary')) return 4;
  if (role === 'secretary') return 5;
  if (role.startsWith('assistant secretary')) return 6;
  return 7;
}

async function runSeed() {
  console.log('🚀 Starting Idempotent Seed Migration from static-committee.json...\n');

  const jsonPath = path.resolve(__dirname, '../../../frontend/src/data/static-committee.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`static-committee.json not found at ${jsonPath}`);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const staticData: StaticData = JSON.parse(rawData);

  let committeesUpserted = 0;
  let positionsUpserted = 0;
  let usersInserted = 0;
  let usersUpdated = 0;
  let executivesUpserted = 0;
  let submissionsUpserted = 0;

  // 1. Ensure Roles table has all standard roles
  const standardRoles = [
    { role: 'president', priority: 1, description: 'President of the club' },
    { role: 'vice president 1', priority: 2, description: 'First vice president' },
    { role: 'vice president 2', priority: 2, description: 'Second vice president' },
    { role: 'vice president 3', priority: 2, description: 'Third vice president' },
    { role: 'vice president 4', priority: 2, description: 'Fourth vice president' },
    { role: 'general secretary', priority: 3, description: 'General secretary' },
    { role: 'treasurer', priority: 3, description: 'Treasurer of the club' },
    { role: 'assistant general secretary 1', priority: 4, description: 'First assistant general secretary' },
    { role: 'assistant general secretary 2', priority: 4, description: 'Second assistant general secretary' },
    { role: 'assistant general secretary 3', priority: 4, description: 'Third assistant general secretary' },
    { role: 'secretary', priority: 5, description: 'Secretary' },
    { role: 'assistant secretary 1', priority: 6, description: 'Assistant secretary 1' },
    { role: 'assistant secretary 2', priority: 6, description: 'Assistant secretary 2' },
    { role: 'assistant secretary 3', priority: 6, description: 'Assistant secretary 3' },
    { role: 'executive member', priority: 7, description: 'Executive member' },
  ];

  for (const r of standardRoles) {
    await db
      .insert(roles)
      .values(r)
      .onConflictDoUpdate({
        target: roles.role,
        set: { priority: r.priority, description: r.description },
      });
  }

  // 2. Upsert Committees
  for (const comm of staticData.committees) {
    await db
      .insert(committee)
      .values({
        number: comm.number,
        gender: comm.gender,
        start: comm.start,
        end: comm.end,
        session: comm.session,
        beginningBudget: comm.beginningBudget,
        description: comm.description,
      })
      .onConflictDoUpdate({
        target: committee.number,
        set: {
          session: comm.session,
          start: comm.start,
          end: comm.end,
          gender: comm.gender,
          description: comm.description,
        },
      });
    committeesUpserted++;
  }
  console.log(`✅ Upserted ${committeesUpserted} committees.`);

  // Default hashed password for new seeded members
  const defaultPasswordHash = await bcrypt.hash('iiuc2027#', 10);

  // 3. Process all members across all committee keys
  for (const [commNum, membersList] of Object.entries(staticData.members)) {
    console.log(`Processing ${membersList.length} members for Committee ${commNum}...`);

    for (const m of membersList) {
      const rawId = m.id.trim();
      const matrixId = rawId.toUpperCase();
      const posString = (m.position || m.role || 'Executive Member').trim();
      const posKey = posString.toLowerCase();
      const normalizedRoleName = normalizeRole(m.role || m.position);

      // Ensure position exists in positions table
      await db
        .insert(positions)
        .values({
          position: posKey,
          description: posString,
        })
        .onConflictDoNothing();
      positionsUpserted++;

      // Fallback email if null
      const email = (m.email?.trim().toLowerCase()) || `${rawId.toLowerCase()}@iiuc.ac.bd`;
      const gender = m.gender || (commNum.endsWith('F') ? 'female' : 'male');
      const department = m.department?.trim() || 'Dept. of CSE';

      // Check if user exists by ID or email
      const [existingUser] = await db
        .select()
        .from(users)
        .where(or(eq(users.id, matrixId), eq(users.email, email)))
        .limit(1);

      if (!existingUser) {
        await db.insert(users).values({
          id: matrixId,
          name: m.name.trim(),
          email,
          gender,
          password: defaultPasswordHash,
          department,
          description: m.bio?.trim() || null,
          profileImage: m.profileImage || null,
          githubUrl: m.githubUrl?.trim() || null,
          linkedinUrl: m.linkedinUrl?.trim() || null,
          facebookUrl: m.facebookUrl?.trim() || null,
          twitterUrl: m.portfolioUrl?.trim() || m.twitterUrl?.trim() || null,
          mustChangePassword: true,
        });
        usersInserted++;
      } else {
        // Update profile fields without touching existing password
        await db
          .update(users)
          .set({
            name: m.name.trim(),
            gender: existingUser.gender || gender,
            description: m.bio?.trim() || existingUser.description,
            profileImage: m.profileImage || existingUser.profileImage,
            githubUrl: m.githubUrl?.trim() || existingUser.githubUrl,
            linkedinUrl: m.linkedinUrl?.trim() || existingUser.linkedinUrl,
            facebookUrl: m.facebookUrl?.trim() || existingUser.facebookUrl,
            twitterUrl: (m.portfolioUrl?.trim() || m.twitterUrl?.trim()) || existingUser.twitterUrl,
          })
          .where(eq(users.id, existingUser.id));
        usersUpdated++;
      }

      const targetUserId = existingUser ? existingUser.id : matrixId;

      // 4. Upsert Executive tenure (id = targetUserId, number = commNum)
      await db
        .insert(executives)
        .values({
          id: targetUserId,
          number: commNum,
          role: normalizedRoleName,
          position: posKey,
          assignedBy: 'MMU',
        })
        .onConflictDoUpdate({
          target: [executives.id, executives.number],
          set: {
            role: normalizedRoleName,
            position: posKey,
          },
        });
      executivesUpserted++;

      // 5. Upsert Committee Submission for detailed metadata
      const formattedSkills = m.skills
        ? Array.isArray(m.skills)
          ? JSON.stringify(m.skills)
          : m.skills
        : null;

      const [existingSub] = await db
        .select()
        .from(committeeSubmissions)
        .where(
          and(
            eq(committeeSubmissions.matrixId, targetUserId),
            eq(committeeSubmissions.committeeNumber, commNum),
          ),
        )
        .limit(1);

      if (existingSub) {
        await db
          .update(committeeSubmissions)
          .set({
            name: m.name.trim(),
            designation: posString,
            batch: m.batch?.trim() || existingSub.batch || 'General',
            email,
            session: staticData.session,
            photoUrl: m.profileImage || existingSub.photoUrl,
            bio: m.bio?.trim() || existingSub.bio,
            skills: formattedSkills || existingSub.skills,
            portfolioUrl: m.portfolioUrl || m.websiteUrl || existingSub.portfolioUrl,
            githubUrl: m.githubUrl?.trim() || existingSub.githubUrl,
            linkedinUrl: m.linkedinUrl?.trim() || existingSub.linkedinUrl,
            facebookUrl: m.facebookUrl?.trim() || existingSub.facebookUrl,
            status: 'approved',
            updatedAt: new Date(),
          })
          .where(eq(committeeSubmissions.id, existingSub.id));
      } else {
        await db.insert(committeeSubmissions).values({
          name: m.name.trim(),
          designation: posString,
          matrixId: targetUserId,
          batch: m.batch?.trim() || 'General',
          email,
          committeeNumber: commNum,
          session: staticData.session,
          photoUrl: m.profileImage || null,
          bio: m.bio?.trim() || null,
          skills: formattedSkills,
          portfolioUrl: m.portfolioUrl || m.websiteUrl || null,
          githubUrl: m.githubUrl?.trim() || null,
          linkedinUrl: m.linkedinUrl?.trim() || null,
          facebookUrl: m.facebookUrl?.trim() || null,
          status: 'approved',
        });
      }
      submissionsUpserted++;
    }
  }

  // Invalidate caches
  invalidate('committee:');
  invalidate('dashboard:');
  invalidate('users:');
  invalidate('president:');

  console.log('\n=============================================');
  console.log('🎉 SEED MIGRATION COMPLETED SUCCESSFULLY');
  console.log('=============================================');
  console.log(`Committees Upserted:    ${committeesUpserted}`);
  console.log(`Positions Upserted:     ${positionsUpserted}`);
  console.log(`Users Created:          ${usersInserted}`);
  console.log(`Users Updated:          ${usersUpdated}`);
  console.log(`Executives Tenures:     ${executivesUpserted}`);
  console.log(`Submissions Recorded:   ${submissionsUpserted}`);
  console.log('=============================================\n');

  process.exit(0);
}

runSeed().catch((err) => {
  console.error('❌ Seed Migration Failed:', err);
  process.exit(1);
});
