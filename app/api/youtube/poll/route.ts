import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import prisma from '@/lib/prisma';

interface PollLog {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'chat';
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!session || !(session as any).accessToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated with Google.' }, { status: 401 });
    }

    const { liveChatId, nextPageToken, productId } = await req.json();
    if (!liveChatId || !productId) {
      return NextResponse.json({ success: false, error: 'liveChatId and productId are required' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    oauth2Client.setCredentials({ access_token: (session as any).accessToken });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // 1. Fetch live chat messages
    const requestParams: any = {
      liveChatId,
      part: ['snippet', 'authorDetails'],
      maxResults: 200,
    };
    if (nextPageToken) requestParams.pageToken = nextPageToken;

    const response = await youtube.liveChatMessages.list(requestParams);
    
    const messages = response.data.items || [];
    const newNextPageToken = response.data.nextPageToken;
    const pollingIntervalMillis = response.data.pollingIntervalMillis || 5000;

    const logs: PollLog[] = [];

    if (messages.length === 0) {
      return NextResponse.json({ success: true, nextPageToken: newNextPageToken, pollingIntervalMillis, logs });
    }

    // Prepare lists for grouping replies
    const successOrders: { name: string, qty: number }[] = [];
    const outOfStockOrders: { name: string, qty: number }[] = [];
    const unregisteredUsers: string[] = [];
    
    // Prevent double processing in the same poll (e.g. someone spamming '1')
    // A more robust implementation would track processed message IDs in DB.
    const processedAuthors = new Set<string>();

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      logs.push({ message: `Product ${productId} not found or inactive.`, type: 'error' });
      return NextResponse.json({ success: true, nextPageToken: newNextPageToken, pollingIntervalMillis, logs });
    }

    let currentStock = product.stock;

    for (const msg of messages) {
      const authorName = msg.authorDetails?.displayName || 'Unknown';
      const text = msg.snippet?.displayMessage || '';
      
      // Basic logging of chat
      // logs.push({ message: `${authorName}: ${text}`, type: 'chat' });

      // If text is a pure number (or has some padding spaces)
      const sanitizedText = text.trim();
      const qty = parseInt(sanitizedText, 10);
      
      // Check if it is a valid order command (e.g. "1", "2")
      // Also ensure it is exactly a number to avoid parsing e.g. "1등"
      if (!isNaN(qty) && qty > 0 && String(qty) === sanitizedText) {
        
        // Skip if author already processed in this batch to prevent spam
        const authorId = msg.authorDetails?.channelId || authorName;
        if (processedAuthors.has(authorId)) continue;
        processedAuthors.add(authorId);

        // Find user in DB by youtubeHandle or nickname
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { youtubeHandle: authorName },
              { youtubeHandle: '@' + authorName }, // sometimes they missed the @
              { nickname: authorName },
              { nickname: '@' + authorName }
            ]
          }
        });

        if (!user) {
          unregisteredUsers.push(`@${authorName}`);
          logs.push({ message: `Unregistered user requested order: ${authorName}`, type: 'warning' });
          continue;
        }

        // Check stock
        if (currentStock >= qty) {
          // Process order
          try {
            await prisma.$transaction(async (tx) => {
              // decrease stock
              await tx.product.update({
                where: { id: product.id },
                data: { stock: { decrement: qty } }
              });
              
              const orderId = `ORD-${Date.now()}-${Math.floor(Math.random()*1000)}`;
              
              await tx.order.create({
                data: {
                  id: orderId,
                  userId: user.nickname,
                  totalPrice: product.price * qty,
                  createdAt: new Date().toISOString(),
                  isPaid: false,
                  items: {
                    create: {
                      productName: product.name,
                      price: product.price,
                      quantity: qty,
                      purchasePrice: product.purchasePrice,
                      isConsignment: product.isConsignment,
                      vendorName: product.vendorName
                    }
                  }
                }
              });
            });

            currentStock -= qty;
            successOrders.push({ name: authorName, qty });
            logs.push({ message: `Order processed: ${qty}x ${product.name} for ${authorName}`, type: 'success' });
            
          } catch (err: any) {
            console.error('Failed to create order:', err);
            logs.push({ message: `Transaction failed for ${authorName}: ${err.message}`, type: 'error' });
          }
        } else {
          outOfStockOrders.push({ name: authorName, qty });
          logs.push({ message: `Stock insufficient for ${authorName} (Req: ${qty}, Stock: ${currentStock})`, type: 'error' });
        }
      }
    }

    // 2. Formulate and Send automated replies to YouTube Live Chat
    const replies: string[] = [];
    
    if (successOrders.length > 0) {
      const names = successOrders.map(o => `@${o.name}(${o.qty})`).join(', ');
      replies.push(`[${product.name}] ${names}님 주문 완료 되었습니다 😊 남은 수량은 ${currentStock}개 입니다.`);
    }

    if (outOfStockOrders.length > 0) {
      const names = outOfStockOrders.map(o => `@${o.name}(${o.qty})`).join(', ');
      // If stock is 0, mention sold out completely
      if (currentStock === 0) {
        replies.push(`[${product.name}] ${names}님 상품이 매진 되었습니다! 죄송합니다 😭`);
      } else {
        replies.push(`[${product.name}] ${names}님 재고가 부족합니다 (잔여: ${currentStock}개) 😭`);
      }
    }

    if (unregisteredUsers.length > 0) {
      // Group up to 3 names per message to keep it short
      const names = unregisteredUsers.slice(0, 3).join(', ');
      const suffix = unregisteredUsers.length > 3 ? ` 외 ${unregisteredUsers.length - 3}명` : '';
      replies.push(`${names}${suffix}님 회원가입 및 유튜브 아이디(핸들) 등록 먼저 부탁드립니다 😊`);
    }

    // Send replies to YouTube sequentially
    for (const reply of replies) {
      try {
        await youtube.liveChatMessages.insert({
          part: ['snippet'],
          requestBody: {
            snippet: {
              liveChatId: liveChatId,
              type: 'textMessageEvent',
              textMessageDetails: {
                messageText: reply
              }
            }
          }
        });
        logs.push({ message: `Bot replied: ${reply}`, type: 'info' });
        // sleep a bit to avoid hitting rate limit rapidly
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        console.error('Failed to send reply:', err);
        logs.push({ message: `Bot reply failed: ${err.message}`, type: 'error' });
      }
    }

    return NextResponse.json({ 
      success: true, 
      nextPageToken: newNextPageToken,
      pollingIntervalMillis,
      logs 
    });

  } catch (error: any) {
    console.error('YouTube API Error (poll):', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
