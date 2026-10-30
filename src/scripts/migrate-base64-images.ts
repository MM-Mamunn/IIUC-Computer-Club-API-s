/**
 * One-time cleanup: move base64 profile photos out of the database into Cloudinary.
 * Run with `npm run db:migrate-images` (add `-- --dry-run` to only report).
 */
import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { db } from '../config/db';
import { users, committeeSubmissions } from '../db/schema';
import { uploadDataUriToCloudinary, PROFILE_PHOTO_UPLOAD } from '../utils/uploadImage';

const dryRun = process.argv.includes('--dry-run');
const BASE64_PATTERN = 'data:image/%';

const main = async () => {
  // Same image may appear in both tables; upload each distinct value once
  const uploaded = new Map<string, string>();
  const toUrl = async (dataUri: string) => {
    const existing = uploaded.get(dataUri);
    if (existing) return existing;
    const url = await uploadDataUriToCloudinary(dataUri, PROFILE_PHOTO_UPLOAD);
    uploaded.set(dataUri, url);
    return url;
  };

  const userRows = await db
    .select({ id: users.id, image: users.profileImage })
    .from(users)
    .where(like(users.profileImage, BASE64_PATTERN));

  const subRows = await db
    .select({ id: committeeSubmissions.id, image: committeeSubmissions.photoUrl })
    .from(committeeSubmissions)
    .where(like(committeeSubmissions.photoUrl, BASE64_PATTERN));

  console.log(`Found ${userRows.length} users and ${subRows.length} submissions with base64 photos.`);
  if (dryRun) {
    for (const r of userRows) console.log(`  users.${r.id}: ${(r.image!.length / 1024).toFixed(0)} KB`);
    for (const r of subRows) console.log(`  committee_submissions.${r.id}: ${(r.image!.length / 1024).toFixed(0)} KB`);
    return;
  }

  let failed = 0;
  for (const r of userRows) {
    try {
      const url = await toUrl(r.image!);
      await db.update(users).set({ profileImage: url }).where(eq(users.id, r.id));
      console.log(`  users.${r.id} -> ${url}`);
    } catch (err) {
      failed++;
      console.error(`  users.${r.id} failed: ${(err as Error).message}`);
    }
  }
  for (const r of subRows) {
    try {
      const url = await toUrl(r.image!);
      await db
        .update(committeeSubmissions)
        .set({ photoUrl: url })
        .where(eq(committeeSubmissions.id, r.id));
      console.log(`  committee_submissions.${r.id} -> ${url}`);
    } catch (err) {
      failed++;
      console.error(`  committee_submissions.${r.id} failed: ${(err as Error).message}`);
    }
  }

  console.log(failed ? `Done with ${failed} failures.` : 'Done.');
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
