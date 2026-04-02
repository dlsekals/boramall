import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany({
    where: {
      name: '백승주'
    }
  });
  console.log(users.map(u => ({ nickname: u.nickname, len: u.nickname.length, enc: encodeURIComponent(u.nickname) })));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
