import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST() {
  try {
    // 1. Fetch all active (unarchived) orders to check if there's anything to archive.
    const activeOrdersCount = await prisma.order.count({
      where: { isArchived: false }
    });

    if (activeOrdersCount === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No active orders to archive." });
    }

    // 2. Update all active orders to isArchived = true.
    const result = await prisma.order.updateMany({
      where: { isArchived: false },
      data: { isArchived: true },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Failed to archive orders:', error);
    return NextResponse.json({ error: 'Failed to archive orders' }, { status: 500 });
  }
}
