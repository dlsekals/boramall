import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const nicknameToDelete = '@htt';
  try {
     const res = await prisma.user.delete({
        where: { nickname: nicknameToDelete }
     });
     console.log('DELETED:', res);
  } catch (e) {
     console.error('ERROR DELETING:', e.message);
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
