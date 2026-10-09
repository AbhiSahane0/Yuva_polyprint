/**
 * Hands every existing user the sections they could already open.
 *
 * Six parts of the app used to need no tick at all: Orders, Dispatch,
 * Planning, Production, Quality & waste, Machines and Employees were visible
 * to anyone signed in, and Costing came free with Rates. Giving each of them
 * its own module is what lets the owner decide who sees what — but it would
 * also take those screens away from everybody the moment it shipped, which is
 * not a decision anyone made.
 *
 * So each user is granted exactly what they could reach the day before:
 * the five that were open to all, and Costing only where they already had
 * Rates. The owner then unticks what they want hidden, which is the whole
 * point of the change.
 *
 * Administrators are skipped — they see everything regardless of ticks.
 * Idempotent: run it twice and the second run reports nothing to do.
 */
import { prisma } from '../src/lib/prisma.js';

/** Open to anyone signed in before this change. */
const WAS_OPEN_TO_ALL = ['orders', 'dispatch', 'planning', 'production', 'resources'];

/** Came free with another module, so it follows that one. */
const FOLLOWED: { module: string; camefrom: string }[] = [{ module: 'costing', camefrom: 'rates' }];

const users = await prisma.user.findMany({
  where: { isAdmin: false },
  select: { id: true, username: true, displayName: true, modules: true },
  orderBy: { username: 'asc' },
});

let changed = 0;
for (const user of users) {
  const held = new Set(user.modules);
  const adding: string[] = [];

  for (const module of WAS_OPEN_TO_ALL) {
    if (!held.has(module)) adding.push(module);
  }
  for (const { module, camefrom } of FOLLOWED) {
    if (held.has(camefrom) && !held.has(module)) adding.push(module);
  }

  if (adding.length === 0) {
    console.log(`  already set  ${user.displayName} (${user.username})`);
    continue;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { modules: [...user.modules, ...adding] },
  });
  console.log(`  granted      ${user.displayName} (${user.username})  + ${adding.join(', ')}`);
  changed += 1;
}

console.log(
  changed === 0
    ? '\nNothing to do — everyone already holds what they could reach.'
    : `\n${changed} user${changed === 1 ? '' : 's'} updated. Nobody has lost a screen; untick from Users to take one away.`,
);

await prisma.$disconnect();
