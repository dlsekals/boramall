import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const orders = await prisma.order.findMany({
  include: { items: true },
  orderBy: { id: 'asc' }
});

console.log('Total orders in DB:', orders.length);
console.log('Total revenue:', orders.reduce((s,o) => s + o.totalPrice, 0).toLocaleString(), '원');
console.log('---');
orders.forEach(o => {
  console.log(`[${o.id.substring(0,13)}] userId: ${o.userId}, date: ${o.createdAt}, total: ${o.totalPrice.toLocaleString()}원, items: ${o.items.length}개, isPaid: ${o.isPaid}`);
  o.items.forEach(i => {
    console.log(`  - ${i.productName} x${i.quantity} @ ${i.price.toLocaleString()}원`);
  });
});

await prisma.$disconnect();
