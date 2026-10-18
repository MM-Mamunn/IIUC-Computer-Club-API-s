// committee.service.ts
import type { Context } from 'hono';
import { db } from '../../config/db';
import { committee, executives, users, committeeSubmissions, roles, positions } from '../../db/schema';
import { HTTPException } from 'hono/http-exception';
import { and, eq, isNull, isNotNull, desc, or, asc, inArray } from 'drizzle-orm';
import { cached, invalidate } from '../../utils/cache';
import { uploadImageToCloudinary } from '../../utils/uploadImage';
import { hashPassword } from '../../utils/hash';
import { generateToken } from '../../utils/jwt';

export const addCommittee = async (
  number: string,
  start: string,
  session: string,
  beginningBudget: number,
  description: string | null,
  userId: string,
) => {
  if (userId === 'DMAU') {
    throw new HTTPException(403, {
      message: 'Only the current department chairman and president (MMU) can create a new committee session.',
    });
  }

  if (!number || !start || !session) {
    throw new HTTPException(400, {
      message: 'number, start, and session are required',
    });
  }
  if (isNaN(Date.parse(start))) {
    throw new HTTPException(400, {
      message: 'Invalid start date format',
    });
  }
  if (
    typeof beginningBudget !== 'number' ||
    !Number.isFinite(beginningBudget) ||
    beginningBudget <= 0
  ) {
    throw new HTTPException(400, {
      message: 'beginningBudget is required and must be a positive number',
    });
  }

  const cleanNumber = number.trim().replace(/F$/i, '');
  const maleNumber = cleanNumber;
  const femaleNumber = `${cleanNumber}F`;

  // Check if any active committee already exists for either gender
  const activeCommittees = await db
    .select()
    .from(committee)
    .where(
      and(isNull(committee.end), or(eq(committee.gender, 'male'), eq(committee.gender, 'female'))),
    )
    .limit(1);

  if (activeCommittees.length > 0) {
    throw new HTTPException(409, {
      message: 'Active committees already exist. You must close them first.',
    });
  }

  // Check by committee number existence (both male and female)
  const existing = await db
    .select()
    .from(committee)
    .where(or(eq(committee.number, maleNumber), eq(committee.number, femaleNumber)))
    .limit(1);

  if (existing.length > 0) {
    throw new HTTPException(409, {
      message: `Committee ${existing[0].number} already exists`,
    });
  }

  // Insert both committees
  const [maleCommittee] = await db
    .insert(committee)
    .values({
      number: maleNumber,
      start,
      session,
      gender: 'male',
      end: null,
      beginningBudget,
      description: description ?? `IIUC Computer Club Committee ${maleNumber} (Male)`,
    })
    .returning();

  await db.insert(committee).values({
    number: femaleNumber,
    start,
    session,
    gender: 'female',
    end: null,
    beginningBudget: null,
    description: description ? `${description} (Female)` : `IIUC Computer Club Executive Committee ${femaleNumber} (Female)`,
  });

  // Assign the creator as president of both committees
  await db.insert(executives).values([
    {
      id: userId,
      number: maleCommittee.number,
      role: 'president',
      position: 'president',
      assignedBy: userId,
    },
    {
      id: userId,
      number: femaleNumber,
      role: 'president',
      position: 'president',
      assignedBy: userId,
    },
  ]);

  // Invalidate committee + dashboard caches
  invalidate('committee:');
  invalidate('dashboard:');
  invalidate('president:');

  return maleCommittee;
};

export const showActive = () =>
  cached('committee:active', 60_000, async () => {
    return db
      .select({
        number: committee.number,
        gender: committee.gender,
        start: committee.start,
        session: committee.session,
        end: committee.end,
        description: committee.description,
        beginningBudget: committee.beginningBudget,
      })
      .from(committee)
      .where(isNull(committee.end));
  });

export const showPositions = async (number: string, c: Context) => {
  const poss = await db
    .selectDistinct({ position: executives.position })
    .from(executives)
    .where(eq(executives.number, number));
  return poss;
};

// ─── Show All Committees (cached 60s) ───
export const showAllCommittees = () =>
  cached('committee:all', 60_000, async () => {
    return db
      .select({
        number: committee.number,
        gender: committee.gender,
        start: committee.start,
        session: committee.session,
        end: committee.end,
        description: committee.description,
        beginningBudget: committee.beginningBudget,
      })
      .from(committee)
      .orderBy(desc(committee.start));
  });

// ─── Close Committee ───
export const closeCommittee = async (number: string, endDate: string, userId?: string) => {
  const [existing] = await db.select().from(committee).where(eq(committee.number, number));

  if (!existing) {
    throw new HTTPException(404, { message: 'Committee not found' });
  }

  if (existing.end) {
    throw new HTTPException(400, { message: 'Committee is already closed' });
  }

  // Permissions: MMU can close any committee; others (including DMAU) can only close committees they created/presided over
  if (userId !== 'MMU') {
    const isPresidentOfTarget = await db
      .select()
      .from(executives)
      .where(
        and(
          eq(executives.id, userId ?? ''),
          eq(executives.number, number),
          eq(executives.role, 'president'),
        ),
      );

    if (isPresidentOfTarget.length === 0) {
      throw new HTTPException(403, {
        message: 'You can only close committees that you created / presided over.',
      });
    }
  }

  if (!endDate || isNaN(Date.parse(endDate))) {
    throw new HTTPException(400, { message: 'Valid end date is required' });
  }

  // Close this committee
  const [updated] = await db
    .update(committee)
    .set({ end: endDate })
    .where(eq(committee.number, number))
    .returning();

  // Invalidate committee + dashboard caches
  invalidate('committee:');
  invalidate('dashboard:');
  invalidate('president:');

  return updated;
};

// ─── Show Committee Members (cached 60s) ───
export const showMembers = async (number: string) => {
  const [com] = await db.select().from(committee).where(eq(committee.number, number));

  if (!com) {
    throw new HTTPException(404, { message: 'Committee not found' });
  }

  return cached(`committee:members:${number}`, 60_000, async () => {
    const rows = await db
      .select({
        id: executives.id,
        name: users.name,
        email: users.email,
        gender: users.gender,
        profileImage: users.profileImage,
        role: executives.role,
        position: executives.position,
        subDesignation: committeeSubmissions.designation,
        userBio: users.description,
        userBatch: users.batch,
        subBatch: committeeSubmissions.batch,
        subBio: committeeSubmissions.bio,
        subSkills: committeeSubmissions.skills,
        portfolioUrl: committeeSubmissions.portfolioUrl,
        githubUrl: users.githubUrl,
        linkedinUrl: users.linkedinUrl,
        facebookUrl: users.facebookUrl,
        twitterUrl: users.twitterUrl,
        department: users.department,
        rolePriority: roles.priority,
      })
      .from(executives)
      .innerJoin(users, eq(executives.id, users.id))
      .leftJoin(
        committeeSubmissions,
        and(
          eq(committeeSubmissions.matrixId, executives.id),
          eq(committeeSubmissions.committeeNumber, executives.number),
        ),
      )
      .leftJoin(roles, eq(executives.role, roles.role))
      .where(eq(executives.number, number))
      .orderBy(asc(roles.priority), asc(users.name));

    const memberIds = Array.from(new Set(rows.map((r) => r.id)));
    const allTenures =
      memberIds.length > 0
        ? await db
            .select({
              id: executives.id,
              committeeNumber: executives.number,
              position: executives.position,
              role: executives.role,
              session: committee.session,
              subDesignation: committeeSubmissions.designation,
            })
            .from(executives)
            .innerJoin(committee, eq(executives.number, committee.number))
            .leftJoin(
              committeeSubmissions,
              and(
                eq(committeeSubmissions.matrixId, executives.id),
                eq(committeeSubmissions.committeeNumber, executives.number),
              ),
            )
            .where(inArray(executives.id, memberIds))
            .orderBy(desc(committee.start))
        : [];

    const tenuresByMember = new Map<
      string,
      Array<{
        committeeNumber: string;
        session: string | null;
        designation: string;
        role: string | null;
      }>
    >();

    for (const t of allTenures) {
      const arr = tenuresByMember.get(t.id) || [];
      arr.push({
        committeeNumber: t.committeeNumber,
        session: t.session,
        designation: t.subDesignation || t.position || 'Member',
        role: t.role,
      });
      tenuresByMember.set(t.id, arr);
    }

    return rows.map((r) => {
      let parsedSkills: string[] = [];
      if (r.subSkills) {
        try {
          const s = JSON.parse(r.subSkills);
          parsedSkills = Array.isArray(s) ? s : [r.subSkills];
        } catch {
          parsedSkills = r.subSkills.split(',').map((x) => x.trim()).filter(Boolean);
        }
      }

      const displayPosition = r.subDesignation || r.position;

      return {
        id: r.id,
        name: r.name,
        email: r.email,
        gender: r.gender,
        profileImage: r.profileImage,
        role: r.role,
        position: displayPosition,
        designation: displayPosition,
        batch: r.subBatch || r.userBatch || null,
        bio: r.subBio || r.userBio || null,
        githubUrl: r.githubUrl,
        linkedinUrl: r.linkedinUrl,
        facebookUrl: r.facebookUrl,
        twitterUrl: r.twitterUrl,
        portfolioUrl: r.portfolioUrl || r.twitterUrl || null,
        department: r.department || 'Dept. of CSE',
        skills: parsedSkills,
        committeeNumber: number,
        history: tenuresByMember.get(r.id) || [],
      };
    });
  });
};

// ─── Committee Member Application Submissions ───

export interface CommitteeSubmissionInput {
  name: string;
  designation: string;
  matrixId: string;
  batch: string;
  email: string;
  password?: string;
  gender?: 'male' | 'female' | null;
  department?: string | null;
  committeeNumber?: string | null;
  session?: string | null;
  photo?: File | string | null;
  photoUrl?: string | null;
  bio?: string | null;
  skills?: string | string[] | null;
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  facebookUrl?: string | null;
  twitterUrl?: string | null;
}

export function mapDesignationToRole(designation: string): string {
  if (!designation) return 'executive member';
  const r = designation.toLowerCase().trim();
  if (r === 'president') return 'president';
  if (r.includes('vice president 1') || r.includes('vice-president 1') || r.includes('vp 1') || r.includes('vp-1')) return 'vice president 1';
  if (r.includes('vice president 2') || r.includes('vice-president 2') || r.includes('vp 2') || r.includes('vp-2')) return 'vice president 2';
  if (r.includes('vice president 3') || r.includes('vice-president 3') || r.includes('vp 3') || r.includes('vp-3')) return 'vice president 3';
  if (r.includes('vice president 4') || r.includes('vice-president 4') || r.includes('vp 4') || r.includes('vp-4')) return 'vice president 4';
  if (r.includes('vice president') || r.includes('vice-president') || r.includes('vp')) return 'vice president 1';
  if (r.includes('general secretary') && !r.includes('assistant')) return 'general secretary';
  if (r.includes('treasurer')) return 'treasurer';
  if (r.includes('assistant general secretary 1') || r.includes('ags 1') || r.includes('ags-1')) return 'assistant general secretary 1';
  if (r.includes('assistant general secretary 2') || r.includes('ags 2') || r.includes('ags-2')) return 'assistant general secretary 2';
  if (r.includes('assistant general secretary 3') || r.includes('ags 3') || r.includes('ags-3')) return 'assistant general secretary 3';
  if (r.includes('assistant general secretary') || r.includes('ags')) return 'assistant general secretary 1';
  if (r.includes('assistant secretary 1') || r.includes('assistant office secretary')) return 'assistant secretary 1';
  if (r.includes('assistant secretary 2')) return 'assistant secretary 2';
  if (r.includes('assistant secretary 3')) return 'assistant secretary 3';
  if (r.includes('assistant') && r.includes('secretary')) return 'assistant secretary 1';
  if (r.includes('secretary')) return 'secretary';
  return 'executive member';
}

export const submitCommitteeApplication = async (data: CommitteeSubmissionInput) => {
  const name = data.name?.trim();
  const designation = data.designation?.trim();
  const matrixId = data.matrixId?.trim().toUpperCase();
  const batch = data.batch?.trim();
  const email = data.email?.trim().toLowerCase();

  // a. Validate input
  if (!name) {
    throw new HTTPException(400, { message: 'Full Name is required' });
  }
  if (!designation) {
    throw new HTTPException(400, { message: 'Designation is required' });
  }
  if (!matrixId) {
    throw new HTTPException(400, { message: 'Matrix ID is required' });
  }
  if (!batch) {
    throw new HTTPException(400, { message: 'Batch selection is required' });
  }
  if (!email || !email.endsWith('@ugrad.iiuc.ac.bd')) {
    throw new HTTPException(400, {
      message: 'Official IIUC student email required. Email must end with @ugrad.iiuc.ac.bd',
    });
  }

  // Committee number resolution & validation
  let commNumber = data.committeeNumber?.trim();
  if (!commNumber) {
    const activeComms = await db
      .select()
      .from(committee)
      .where(and(isNull(committee.end), eq(committee.isActive, true)))
      .orderBy(desc(committee.start))
      .limit(1);
    commNumber = activeComms[0]?.number;
  }

  if (!commNumber) {
    throw new HTTPException(400, { message: 'Target Committee Number is required' });
  }

  const [targetComm] = await db
    .select()
    .from(committee)
    .where(eq(committee.number, commNumber))
    .limit(1);

  if (!targetComm) {
    throw new HTTPException(400, {
      message: `Committee '${commNumber}' does not exist in the committee table.`,
    });
  }

  // Handle photo upload
  let photoUrl: string | null = data.photoUrl || null;
  if (data.photo && typeof data.photo === 'object' && 'arrayBuffer' in data.photo) {
    const file = data.photo as File;
    if (file.size > 0) {
      photoUrl = await uploadImageToCloudinary(file);
    }
  } else if (typeof data.photo === 'string' && data.photo.trim().length > 0) {
    photoUrl = data.photo.trim();
  }

  const autoApprove = (process.env.COMMITTEE_AUTO_APPROVE ?? 'true').toLowerCase() === 'true';
  const effectiveStatus = autoApprove ? 'approved' : 'pending';

  // Run everything in ONE DB transaction
  const result = await db.transaction(async (tx) => {
    // b. Find user by matrixId OR email
    const [userByMatrix] = await tx
      .select()
      .from(users)
      .where(eq(users.id, matrixId))
      .limit(1);

    const [userByEmail] = await tx
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // If matrixId and email match two different users, return 409
    if (userByMatrix && userByEmail && userByMatrix.id !== userByEmail.id) {
      throw new HTTPException(409, {
        message: 'Conflict: Matrix ID and Student Email belong to two different registered accounts.',
      });
    }

    const existingUser = userByMatrix || userByEmail;
    const targetUserId = existingUser ? existingUser.id : matrixId;

    if (!existingUser) {
      // New user: hash password and insert
      const plainPassword = data.password?.trim() || matrixId;
      const hashedPassword = await hashPassword(plainPassword);

      await tx.insert(users).values({
        id: matrixId,
        name,
        email,
        password: hashedPassword,
        gender: data.gender || targetComm.gender || 'male',
        department: data.department?.trim() || 'Dept. of CSE',
        batch,
        profileImage: photoUrl || null,
        description: data.bio?.trim() || null,
        githubUrl: data.githubUrl?.trim() || null,
        linkedinUrl: data.linkedinUrl?.trim() || null,
        facebookUrl: data.facebookUrl?.trim() || null,
        twitterUrl: data.portfolioUrl?.trim() || data.twitterUrl?.trim() || null,
        mustChangePassword: false,
      });
    } else {
      // Existing user: NEVER overwrite password. Update profile fields only.
      await tx
        .update(users)
        .set({
          name,
          batch: batch || existingUser.batch,
          profileImage: photoUrl || existingUser.profileImage,
          description: data.bio?.trim() || existingUser.description,
          githubUrl: data.githubUrl?.trim() || existingUser.githubUrl,
          linkedinUrl: data.linkedinUrl?.trim() || existingUser.linkedinUrl,
          facebookUrl: data.facebookUrl?.trim() || existingUser.facebookUrl,
          twitterUrl: (data.portfolioUrl?.trim() || data.twitterUrl?.trim()) || existingUser.twitterUrl,
        })
        .where(eq(users.id, existingUser.id));
    }

    // Ensure position exists in positions table
    const posKey = designation.toLowerCase().trim();
    await tx
      .insert(positions)
      .values({
        position: posKey,
        description: designation,
      })
      .onConflictDoNothing();

    const roleName = mapDesignationToRole(designation);

    // c. Upsert executives (only approved submissions create or keep the executives row)
    if (effectiveStatus === 'approved') {
      await tx
        .insert(executives)
        .values({
          id: targetUserId,
          number: commNumber,
          role: roleName,
          position: posKey,
          assignedBy: 'MMU',
        })
        .onConflictDoUpdate({
          target: [executives.id, executives.number],
          set: {
            role: roleName,
            position: posKey,
          },
        });
    }

    // d. Upsert committee_submissions on (matrixId, committeeNumber)
    const formattedSkills = data.skills
      ? Array.isArray(data.skills)
        ? JSON.stringify(data.skills)
        : data.skills
      : null;

    const [sub] = await tx
      .insert(committeeSubmissions)
      .values({
        name,
        designation,
        matrixId: targetUserId,
        batch,
        email,
        committeeNumber: commNumber,
        session: targetComm.session || data.session || null,
        photoUrl: photoUrl || (existingUser?.profileImage ?? null),
        bio: data.bio?.trim() || (existingUser?.description ?? null),
        skills: formattedSkills,
        portfolioUrl: data.portfolioUrl?.trim() || data.twitterUrl?.trim() || null,
        githubUrl: data.githubUrl?.trim() || null,
        linkedinUrl: data.linkedinUrl?.trim() || null,
        facebookUrl: data.facebookUrl?.trim() || null,
        status: effectiveStatus,
      })
      .onConflictDoUpdate({
        target: [committeeSubmissions.matrixId, committeeSubmissions.committeeNumber],
        set: {
          name,
          designation,
          batch,
          email,
          session: targetComm.session || data.session || null,
          photoUrl: photoUrl || (existingUser?.profileImage ?? null),
          bio: data.bio?.trim() || (existingUser?.description ?? null),
          skills: formattedSkills,
          portfolioUrl: data.portfolioUrl?.trim() || data.twitterUrl?.trim() || null,
          githubUrl: data.githubUrl?.trim() || null,
          linkedinUrl: data.linkedinUrl?.trim() || null,
          facebookUrl: data.facebookUrl?.trim() || null,
          status: effectiveStatus,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Generate JWT token for auto-login
    const token = generateToken({
      id: targetUserId,
      role: roleName,
      position: posKey,
      gender: data.gender || targetComm.gender || 'male',
      committeeNumber: commNumber,
      mustChangePassword: false,
    });

    return {
      submission: sub,
      userId: targetUserId,
      token,
      status: effectiveStatus,
      message: effectiveStatus === 'approved'
        ? 'Application registered and approved successfully!'
        : 'Application submitted and pending approval.',
    };
  });

  // e. After commit, invalidate caches
  invalidate(`committee:members:${commNumber}`);
  invalidate('committee:active');
  invalidate('committee:all');
  invalidate('committee:');
  invalidate('users:');
  invalidate('dashboard:');

  return result;
};

export const getCommitteeSubmissionByMatrixId = async (matrixId: string) => {
  const [sub] = await db
    .select()
    .from(committeeSubmissions)
    .where(eq(committeeSubmissions.matrixId, matrixId.toUpperCase().trim()))
    .limit(1);

  if (!sub) {
    throw new HTTPException(404, { message: 'Submission not found for this Matrix ID' });
  }

  return sub;
};

export const getAllCommitteeSubmissions = async () => {
  return db
    .select()
    .from(committeeSubmissions)
    .orderBy(desc(committeeSubmissions.createdAt));
};


