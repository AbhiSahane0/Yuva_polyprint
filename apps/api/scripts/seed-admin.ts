/**
 * Creates the first administrator.
 *
 *   ADMIN_USERNAME=anand ADMIN_PASSWORD='...' npm run seed:admin -w @yuva/api
 *
 * Refuses to run if an active administrator already exists, so it cannot be
 * used to quietly mint a second one on a live system. Credentials come from the
 * environment rather than arguments, keeping the password out of shell history
 * and out of `ps`.
 */
import 'dotenv/config';
import { createUserSchema } from '@yuva/shared';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

async function main() {
  const username = process.env['ADMIN_USERNAME'];
  const password = process.env['ADMIN_PASSWORD'];
  const displayName = process.env['ADMIN_NAME'] ?? 'Administrator';

  if (!username || !password) {
    console.error(
      '\nerror: set ADMIN_USERNAME and ADMIN_PASSWORD.\n\n' +
        "  ADMIN_USERNAME=anand ADMIN_PASSWORD='choose-a-real-one' \\\n" +
        '    npm run seed:admin -w @yuva/api\n',
    );
    process.exit(1);
  }

  const parsed = createUserSchema.safeParse({ username, password, displayName, isAdmin: true });
  if (!parsed.success) {
    console.error('\nerror: those details are not valid:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    console.error('');
    process.exit(1);
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { isAdmin: true, isActive: true },
    select: { username: true },
  });
  if (existingAdmin) {
    console.error(
      `\nerror: an administrator already exists ("${existingAdmin.username}").\n` +
        '       Create further users from the Users screen, or reset a password there.\n',
    );
    process.exit(1);
  }

  const clash = await prisma.user.findUnique({
    where: { username: parsed.data.username },
    select: { id: true },
  });
  if (clash) {
    console.error(`\nerror: the username "${parsed.data.username}" is already taken.\n`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      username: parsed.data.username,
      passwordHash: await hashPassword(parsed.data.password),
      displayName: parsed.data.displayName,
      isAdmin: true,
      modules: [],
    },
    select: { username: true, displayName: true },
  });

  console.log(`\nAdministrator created: ${user.username} (${user.displayName})`);
  console.log('Sign in, then add the rest of the office from the Users screen.\n');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
