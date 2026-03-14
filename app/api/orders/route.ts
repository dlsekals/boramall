import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(orders);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const itemsArray = Array.isArray(body) ? body : [body];

    await prisma.$transaction(async (tx) => {
      for (const orderPayload of itemsArray) {
        const { items, ...orderData } = orderPayload;

        // Upsert the main order details
        await tx.order.upsert({
          where: { id: orderData.id },
          update: orderData,
          create: orderData,
        });

        // If items are provided, replace them completely
        if (items && Array.isArray(items)) {
          await tx.orderItem.deleteMany({
            where: { orderId: orderData.id },
          });

          if (items.length > 0) {
            await tx.orderItem.createMany({
              data: items.map((item: any) => ({
                productName: item.productName,
                price: item.price,
                quantity: item.quantity,
                purchasePrice: item.purchasePrice || null,
                isConsignment: Boolean(item.isConsignment),
                vendorName: item.vendorName || null,
                orderId: orderData.id,
              })),
            });
          }
        }
      }
    });

    return NextResponse.json({ success: true, count: itemsArray.length });
  } catch (error) {
    console.error('Failed to save order(s):', error);
    return NextResponse.json({ error: 'Failed to save order(s)' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Cascading delete will handle order items automatically due to schema definitions
    await prisma.order.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete order:', error);
    return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 });
  }
}
