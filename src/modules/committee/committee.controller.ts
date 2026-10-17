import type { Context } from 'hono';
import {
  addCommittee,
  showActive,
  showPositions,
  showAllCommittees,
  closeCommittee,
  showMembers,
  submitCommitteeApplication,
  getCommitteeSubmissionByMatrixId,
  getAllCommitteeSubmissions,
} from './committee.service';

// committee.controller.ts
type CommitteeBody = {
  number: string;
  start: string;
  session: string;
  beginningBudget: number;
  description?: string | null;
};

export const newCommittee = async (c: Context) => {
  const body = (await c.req.json()) as CommitteeBody;
  const user = c.get('user');

  const committee = await addCommittee(
    body.number,
    body.start,
    body.session,
    body.beginningBudget,
    body.description ?? null,
    user.id
  );

  return c.json({ committee }, 201);
};
export const activeCommittees = async (c: Context) => {
  const active = await showActive();

  return c.json({ active }, 201);
};

export const positions = async (c: Context) => {
  const { number } = await c.req.json();
  const pos = await showPositions(number, c);
  return c.json({ pos }, 201);
};

export const allCommittees = async (c: Context) => {
  const all = await showAllCommittees();
  return c.json({ committees: all }, 200);
};

export const close = async (c: Context) => {
  const number = c.req.param('number');
  const { endDate } = await c.req.json();
  const user = c.get('user');
  const committee = await closeCommittee(number, endDate, user?.id);
  return c.json({ committee }, 200);
};

export const members = async (c: Context) => {
  const number = c.req.param('number');
  const membersList = await showMembers(number);
  return c.json({ members: membersList }, 200);
};

export const createSubmission = async (c: Context) => {
  const contentType = c.req.header('content-type') || '';
  let data: Record<string, any> = {};
  let photoFile: File | null = null;
  const user = c.get('user');

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    data = body;
    if (body['photo'] && typeof body['photo'] === 'object') {
      photoFile = body['photo'] as File;
    }
  } else {
    data = await c.req.json().catch(() => ({}));
  }

  const matrixId = (user?.id || String(data.matrixId || '')).toUpperCase().trim();

  const result = await submitCommitteeApplication({
    name: String(data.name || ''),
    designation: String(data.designation || ''),
    matrixId,
    batch: String(data.batch || ''),
    email: String(data.email || ''),
    photo: photoFile || data.photoUrl || data.photo,
    password: data.password ? String(data.password) : undefined,
    department: data.department ? String(data.department) : undefined,
    gender: data.gender ? String(data.gender) as 'male' | 'female' : undefined,
    bio: data.bio ? String(data.bio) : null,
    skills: data.skills ? data.skills : null,
    portfolioUrl: data.portfolioUrl ? String(data.portfolioUrl) : null,
    githubUrl: data.githubUrl ? String(data.githubUrl) : null,
    linkedinUrl: data.linkedinUrl ? String(data.linkedinUrl) : null,
    facebookUrl: data.facebookUrl ? String(data.facebookUrl) : null,
    committeeNumber: data.committeeNumber ? String(data.committeeNumber) : undefined,
    session: data.session ? String(data.session) : undefined,
  });

  return c.json(result, 201);
};

export const getSubmission = async (c: Context) => {
  const matrixId = c.req.param('matrixId');
  const submission = await getCommitteeSubmissionByMatrixId(matrixId);
  return c.json({ submission }, 200);
};

export const listSubmissions = async (c: Context) => {
  const submissions = await getAllCommitteeSubmissions();
  return c.json({ submissions }, 200);
};

