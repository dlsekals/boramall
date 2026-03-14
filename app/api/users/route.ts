import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const users = await prisma.user.findMany();
    return NextResponse.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body) ? body : [body];

    await prisma.$transaction(
      items.map(item => prisma.user.upsert({
        where: { nickname: item.nickname },
        update: item,
        create: item,
      }))
    );
    return NextResponse.json({ success: true, count: items.length });
  } catch (error) {
    console.error('Failed to save user(s):', error);
    return NextResponse.json({ error: 'Failed to save user(s)' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nickname = searchParams.get('nickname');
    if (!nickname) return NextResponse.json({ error: 'Missing nickname' }, { status: 400 });

    await prisma.user.delete({
      where: { nickname },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
