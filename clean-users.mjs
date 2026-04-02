import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  try {
     const users = await prisma.user.findMany({ where: { name: '백승주' } });
     const toKeep = ['@랑이맘', '@랑이맘-o4n']; // Will NOT delete these if they are legit.
     // Wait, let's just count how many have no orders.
     let count = 0;
     for (const u of users) {
         if (!toKeep.includes(u.nickname)) {
            const orders = await prisma.order.findMany({ where: { userId: u.nickname }});
            if (orders.length === 0) {
               await prisma.user.delete({ where: { nickname: u.nickname }});
               console.log("DELETED", u.nickname);
               count++;
            }
         }
     }
     console.log('Deleted junk users count:', count);
  } catch (e) {
     console.error('ERROR:', e);
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
