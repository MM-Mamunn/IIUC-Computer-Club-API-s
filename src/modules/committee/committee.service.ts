// committee.service.ts
import type { Context } from 'hono';
import { db } from '../../config/db';
import { committee, executives, users, committeeSubmissions } from '../../db/schema';
import { HTTPException } from 'hono/http-exception';
import { and, eq, isNull, isNotNull, desc, or } from 'drizzle-orm';
import { cached, invalidate } from '../../utils/cache';
import { uploadImageToCloudinary } from '../../utils/uploadImage';

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
    return db
      .select({
        id: executives.id,
        name: users.name,
        email: users.email,
        gender: users.gender,
        profileImage: users.profileImage,
        role: executives.role,
        position: executives.position,
        bio: users.description,
        githubUrl: users.githubUrl,
        linkedinUrl: users.linkedinUrl,
        facebookUrl: users.facebookUrl,
        twitterUrl: users.twitterUrl,
      })
      .from(executives)
      .innerJoin(users, eq(executives.id, users.id))
      .where(eq(executives.number, number));
  });
};

// ─── Committee Member Application Submissions ───

export interface CommitteeSubmissionInput {
  name: string;
  designation: string;
  matrixId: string;
  batch: string;
  email: string;
  committeeNumber?: string | null;
  session?: string | null;
  photo?: File | string | null;
  bio?: string | null;
  skills?: string | null;
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  facebookUrl?: string | null;
}

export const submitCommitteeApplication = async (data: CommitteeSubmissionInput) => {
  const name = data.name?.trim();
  const designation = data.designation?.trim();
  const matrixId = data.matrixId?.trim().toUpperCase();
  const batch = data.batch?.trim();
  const email = data.email?.trim().toLowerCase();

  if (!name) {
    throw new HTTPException(400, { message: 'Full Name is required' });
  }
  if (!designation) {
    throw new HTTPException(400, { message: 'Designation role is required' });
  }
  if (!matrixId) {
    throw new HTTPException(400, { message: 'Matrix ID is required' });
  }
  if (!batch) {
    throw new HTTPException(400, { message: 'Batch selection is required' });
  }
  if (!email) {
    throw new HTTPException(400, { message: 'Student Email is required' });
  }

  // Strict IIUC Undergraduate email validation
  if (!email.endsWith('@ugrad.iiuc.ac.bd')) {
    throw new HTTPException(400, {
      message: 'Official IIUC student email required. Email must end with @ugrad.iiuc.ac.bd',
    });
  }

  // Auto-resolve active committee number and session if not explicitly provided
  let commNumber = data.committeeNumber?.trim() || null;
  let commSession = data.session?.trim() || null;

  if (!commNumber || !commSession) {
    const activeComms = await db
      .select({ number: committee.number, session: committee.session, gender: committee.gender })
      .from(committee)
      .where(isNull(committee.end))
      .orderBy(desc(committee.start));

    const latestComm =
      activeComms[0] ||
      (
        await db
          .select({ number: committee.number, session: committee.session, gender: committee.gender })
          .from(committee)
          .orderBy(desc(committee.start))
          .limit(1)
      )[0];

    if (latestComm) {
      if (!commNumber) commNumber = latestComm.number;
      if (!commSession) commSession = latestComm.session;
    }
  }

  // Handle photo upload if provided
  let photoUrl: string | null = null;
  if (data.photo && typeof data.photo === 'object' && 'arrayBuffer' in data.photo) {
    const file = data.photo as File;
    if (file.size > 0) {
      photoUrl = await uploadImageToCloudinary(file);
    }
  } else if (typeof data.photo === 'string' && data.photo.trim().length > 0) {
    photoUrl = data.photo.trim();
  }

  // Check if an application already exists for this matrixId
  const existing = await db
    .select()
    .from(committeeSubmissions)
    .where(eq(committeeSubmissions.matrixId, matrixId))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(committeeSubmissions)
      .set({
        name,
        designation,
        batch,
        email,
        committeeNumber: commNumber ?? existing[0].committeeNumber,
        session: commSession ?? existing[0].session,
        photoUrl: photoUrl ?? existing[0].photoUrl,
        bio: data.bio?.trim() || null,
        skills: data.skills ? (typeof data.skills === 'string' ? data.skills : JSON.stringify(data.skills)) : null,
        portfolioUrl: data.portfolioUrl?.trim() || null,
        githubUrl: data.githubUrl?.trim() || null,
        linkedinUrl: data.linkedinUrl?.trim() || null,
        facebookUrl: data.facebookUrl?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(committeeSubmissions.id, existing[0].id))
      .returning();

    invalidate('dashboard:');
    invalidate('committee:members:');
    invalidate('president:');

    return {
      submission: updated,
      isUpdate: true,
      message: 'Application updated successfully!',
    };
  }

  const [created] = await db
    .insert(committeeSubmissions)
    .values({
      name,
      designation,
      matrixId,
      batch,
      email,
      committeeNumber: commNumber || null,
      session: commSession || null,
      photoUrl: photoUrl || null,
      bio: data.bio?.trim() || null,
      skills: data.skills ? (typeof data.skills === 'string' ? data.skills : JSON.stringify(data.skills)) : null,
      portfolioUrl: data.portfolioUrl?.trim() || null,
      githubUrl: data.githubUrl?.trim() || null,
      linkedinUrl: data.linkedinUrl?.trim() || null,
      facebookUrl: data.facebookUrl?.trim() || null,
      status: 'pending',
    })
    .returning();

  invalidate('dashboard:');
  invalidate('committee:members:');
  invalidate('president:');

  return {
    submission: created,
    isUpdate: false,
    message: 'Application submitted successfully!',
  };
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

