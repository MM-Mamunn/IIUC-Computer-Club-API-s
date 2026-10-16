import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from '../config/db';
import { users, committee, executives, roles, positions, committeeSubmissions } from '../db/schema';
import { hashPassword } from '../utils/hash';
import { eq, and, or } from 'drizzle-orm';
import { invalidate } from '../utils/cache';

interface RawMember {
  id: string;
  name: string;
  email?: string | null;
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
  skills?: string[] | string | null;
}

export function mapRoleToDbRole(role?: string | null): string {
  if (!role) return 'executive member';
  const r = role.toLowerCase().trim();
  if (r === 'president') return 'president';
  if (r === 'vice president 1' || r === 'vice president-1') return 'vice president 1';
  if (r === 'vice president 2' || r === 'vice president-2') return 'vice president 2';
  if (r === 'vice president 3' || r === 'vice president-3') return 'vice president 3';
  if (r === 'vice president 4' || r === 'vice president-4') return 'vice president 4';
  if (r === 'vice president') return 'vice president';
  if (r === 'treasurer') return 'treasurer';
  if (r === 'general secretary') return 'general secretary';
  if (r === 'assistant general secretary 1' || r === 'assistant general secretary-1') return 'assistant general secretary 1';
  if (r === 'assistant general secretary 2' || r === 'assistant general secretary-2') return 'assistant general secretary 2';
  if (r === 'assistant general secretary 3' || r === 'assistant general secretary-3') return 'assistant general secretary 3';
  if (r.startsWith('assistant general secretary')) return 'assistant general secretary 1';
  if (r === 'secretary') return 'secretary';
  if (r === 'assistant secretary 1' || r === 'assistant secretary-1') return 'assistant secretary 1';
  if (r === 'assistant secretary 2' || r === 'assistant secretary-2') return 'assistant secretary 2';
  if (r === 'assistant secretary 3' || r === 'assistant secretary-3') return 'assistant secretary 3';
  if (r.startsWith('assistant secretary')) return 'assistant secretary';
  return 'executive member';
}

async function ensurePosition(pos: string) {
  const norm = pos.toLowerCase().trim();
  const [existing] = await db.select().from(positions).where(eq(positions.position, norm));
  if (!existing) {
    await db.insert(positions).values({
      position: norm,
      description: pos,
    });
  }
  return norm;
}

async function seedPresentCommittee() {
  console.log('🌱 Starting Present Committee 2027 & 2027F Dynamic Sync...');

  // 1. Ensure 'vice president' role exists in roles table
  const existingRoles = await db.select().from(roles);
  const roleNames = new Set(existingRoles.map((r) => r.role));

  if (!roleNames.has('vice president')) {
    await db.insert(roles).values({
      role: 'vice president',
      priority: 2,
      description: 'Vice President of the club',
    });
    console.log('  ✅ Added "vice president" role to roles table');
  }

  // 2. Load static data
  const jsonPath = path.resolve(process.cwd(), '../frontend/src/data/static-committee.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Cannot find static data at ${jsonPath}`);
  }

  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const committeesList = rawData.committees || [];
  const sessionLabel = rawData.session || 'Autumn 2026 - Spring 2027';

  // 3. Ensure committees 2027 and 2027F exist
  for (const comm of committeesList) {
    const [existingComm] = await db
      .select()
      .from(committee)
      .where(eq(committee.number, comm.number));

    if (!existingComm) {
      await db.insert(committee).values({
        number: comm.number,
        gender: comm.gender,
        start: comm.start,
        session: comm.session || sessionLabel,
        description: comm.description,
        end: null,
      });
      console.log(`  ✅ Created active committee ${comm.number}`);
    }
  }

  // 4. Process all members
  const membersByNumber: Record<string, RawMember[]> = rawData.members || {};
  let totalProcessed = 0;

  for (const [commNum, list] of Object.entries(membersByNumber)) {
    const isFemale = commNum.toUpperCase().endsWith('F');
    const defaultGender = isFemale ? 'female' : 'male';

    console.log(`\n  Syncing Committee ${commNum} (${list.length} members)...`);

    for (const m of list) {
      const memberId = m.id.trim();
      const rawRole = m.role || 'executive member';
      const dbRole = mapRoleToDbRole(rawRole);
      const rawPosition = m.position || m.role || 'Executive Member';
      const dbPosition = await ensurePosition(rawPosition);
      const email =
        m.email?.trim() ||
        (memberId.startsWith('C') || memberId.startsWith('c')
          ? `${memberId.toLowerCase()}@ugrad.iiuc.ac.bd`
          : `${memberId.toLowerCase()}@iiuc.ac.bd`);

      // 4a. Upsert User (match by ID or Email to handle aliases like AYA / ABMYA)
      const [existingUser] = await db
        .select()
        .from(users)
        .where(or(eq(users.id, memberId), eq(users.email, email)));

      let effectiveUserId = memberId;

      if (!existingUser) {
        const hashedPassword = await hashPassword(memberId);
        await db.insert(users).values({
          id: memberId,
          name: m.name.trim(),
          email,
          gender: m.gender || defaultGender,
          password: hashedPassword,
          profileImage: m.profileImage || null,
          description: m.bio || null,
          department: 'Dept. of CSE',
          githubUrl: m.githubUrl || null,
          linkedinUrl: m.linkedinUrl || null,
          facebookUrl: m.facebookUrl || null,
          twitterUrl: m.twitterUrl || m.portfolioUrl || m.websiteUrl || null,
        });
      } else {
        effectiveUserId = existingUser.id;
        await db
          .update(users)
          .set({
            name: existingUser.name || m.name.trim(),
            profileImage: existingUser.profileImage || m.profileImage || null,
            description: existingUser.description || m.bio || null,
            githubUrl: existingUser.githubUrl || m.githubUrl || null,
            linkedinUrl: existingUser.linkedinUrl || m.linkedinUrl || null,
            facebookUrl: existingUser.facebookUrl || m.facebookUrl || null,
            twitterUrl: existingUser.twitterUrl || m.twitterUrl || m.portfolioUrl || m.websiteUrl || null,
          })
          .where(eq(users.id, effectiveUserId));
      }

      // 4b. Upsert Executive
      const [existingExec] = await db
        .select()
        .from(executives)
        .where(and(eq(executives.id, effectiveUserId), eq(executives.number, commNum)));

      if (!existingExec) {
        await db.insert(executives).values({
          id: effectiveUserId,
          number: commNum,
          role: dbRole,
          position: dbPosition,
          assignedBy: 'MMU',
        });
      } else {
        await db
          .update(executives)
          .set({
            role: dbRole,
            position: dbPosition,
          })
          .where(and(eq(executives.id, effectiveUserId), eq(executives.number, commNum)));
      }

      // 4c. Upsert Committee Submission record for unified profile sync
      const [existingSub] = await db
        .select()
        .from(committeeSubmissions)
        .where(eq(committeeSubmissions.matrixId, effectiveUserId));

      const skillsFormatted = m.skills
        ? typeof m.skills === 'string'
          ? m.skills
          : JSON.stringify(m.skills)
        : null;

      if (!existingSub) {
        await db.insert(committeeSubmissions).values({
          name: m.name.trim(),
          designation: rawPosition,
          matrixId: effectiveUserId,
          batch: m.batch || 'General',
          email,
          committeeNumber: commNum,
          session: sessionLabel,
          photoUrl: m.profileImage || null,
          bio: m.bio || null,
          skills: skillsFormatted,
          portfolioUrl: m.portfolioUrl || m.websiteUrl || m.twitterUrl || null,
          githubUrl: m.githubUrl || null,
          linkedinUrl: m.linkedinUrl || null,
          facebookUrl: m.facebookUrl || null,
          status: 'approved',
        });
      } else {
        await db
          .update(committeeSubmissions)
          .set({
            name: existingSub.name || m.name.trim(),
            designation: existingSub.designation || rawPosition,
            committeeNumber: commNum,
            session: sessionLabel,
            photoUrl: existingSub.photoUrl || m.profileImage || null,
            bio: existingSub.bio || m.bio || null,
            skills: existingSub.skills || skillsFormatted,
            portfolioUrl: existingSub.portfolioUrl || m.portfolioUrl || m.websiteUrl || null,
            githubUrl: existingSub.githubUrl || m.githubUrl || null,
            linkedinUrl: existingSub.linkedinUrl || m.linkedinUrl || null,
            facebookUrl: existingSub.facebookUrl || m.facebookUrl || null,
            status: 'approved',
          })
          .where(eq(committeeSubmissions.id, existingSub.id));
      }

      totalProcessed++;
    }
  }

  // 5. Invalidate caches
  invalidate('committee:');
  invalidate('dashboard:');
  invalidate('users:');

  console.log(`\n🎉 Present committee dynamic sync complete! Total members synced: ${totalProcessed}`);
}

seedPresentCommittee()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Failed syncing present committee:', err);
    process.exit(1);
  });
