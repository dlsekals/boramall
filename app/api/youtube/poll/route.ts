import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import prisma from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

interface PollLog {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'chat';
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!session || !(session as any).accessToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated with Google.' }, { status: 401 });
    }

    const { liveChatId, nextPageToken, productId, salesLimit, autoReply } = await req.json();
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
    const successOrders: { name: string, qty: number, fullName: string }[] = [];
    const outOfStockOrders: { name: string, qty: number, fullName: string }[] = [];
    const unregisteredUsers: { name: string, fullName: string }[] = [];
    
    // Check if salesLimit is reached *before* processing messages if it was passed
    let reachedSalesLimit = false;
    
    // Prevent double processing in the same poll (e.g. someone spamming '1')
    // A more robust implementation would track processed message IDs in DB.
    const processedAuthors = new Set<string>();

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      logs.push({ message: `Product ${productId} not found or inactive.`, type: 'error' });
      return NextResponse.json({ success: true, nextPageToken: newNextPageToken, pollingIntervalMillis, logs });
    }

    let currentStock = product.stock;
    // Calculate effective stock considering salesLimit
    // If salesLimit is defined, effective stock is the minimum of currentStock and salesLimit
    let effectiveStock = salesLimit !== undefined && salesLimit !== null ? Math.min(currentStock, salesLimit) : currentStock;

    if (effectiveStock <= 0 && salesLimit !== undefined && salesLimit !== null) {
      reachedSalesLimit = true;
    }

    if (!reachedSalesLimit) {
      for (const msg of messages) {
        const authorName = msg.authorDetails?.displayName || 'Unknown';
        const channelId = msg.authorDetails?.channelId || '';
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
        // Extra step: try to match by base nickname (ignoring things after '-')
        const baseNameMatch = authorName.replace(/^@/, '').split('-')[0];
        
        // Extract 3 chars from channel ID immediately following "UC" (if present)
        let channelSuffix = channelId.length >= 3 ? channelId.slice(-3) : channelId;
        const ucIndex = channelId.indexOf('UC');
        if (ucIndex !== -1 && channelId.length >= ucIndex + 5) {
            channelSuffix = channelId.substring(ucIndex + 2, ucIndex + 5);
        }
        
        // Final handle should not include @ according to the new requirements
        const displayAuthorName = authorName.replace(/^@/, '');
        const fullGeneratedHandle = `${displayAuthorName}(${channelSuffix})`;

        let user = await prisma.user.findFirst({
          where: {
            OR: [
              { youtubeHandle: authorName },
              { youtubeHandle: '@' + authorName },
              { youtubeHandle: fullGeneratedHandle },
              { nickname: authorName },
              { nickname: '@' + authorName },
              // Match just the base name
              { nickname: baseNameMatch },
              { nickname: '@' + baseNameMatch },
            ]
          }
        });

        if (!user) {
          unregisteredUsers.push({ name: authorName, fullName: fullGeneratedHandle });
          logs.push({ message: `Unregistered user requested order: ${authorName}`, type: 'warning' });
          continue;
        }

        // If user matched but their youtubeHandle is empty or doesn't have the suffix, update it automatically
        if (user.youtubeHandle !== fullGeneratedHandle) {
           user = await prisma.user.update({
             where: { nickname: user.nickname }, // Use nickname, email doesn't exist
             data: { youtubeHandle: fullGeneratedHandle }
           });
           logs.push({ message: `Auto-updated handle for ${user.nickname} to ${fullGeneratedHandle}`, type: 'info' });
        }

        // Check stock
        if (effectiveStock >= qty) {
          // Process order
          try {
            await prisma.$transaction(async (tx) => {
              // decrease stock
              await tx.product.update({
                where: { id: product.id },
                data: { stock: { decrement: qty } }
              });
              
              // Check for existing unpaid order from today for this user
              const todayStr = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
              const existingOrder = await tx.order.findFirst({
                where: {
                  userId: user.nickname,
                  isPaid: false,
                  createdAt: todayStr,
                },
                include: { items: true }
              });

              if (existingOrder) {
                // Merge: check if same product already in order
                const existingItem = existingOrder.items.find(i => i.productName === product.name);
                if (existingItem) {
                  // Update quantity of existing item
                  await tx.orderItem.update({
                    where: { id: existingItem.id },
                    data: { quantity: existingItem.quantity + qty }
                  });
                } else {
                  // Add new item to existing order
                  await tx.orderItem.create({
                    data: {
                      orderId: existingOrder.id,
                      productName: product.name,
                      price: product.price,
                      quantity: qty,
                      purchasePrice: product.purchasePrice,
                      isConsignment: product.isConsignment,
                      vendorName: product.vendorName
                    }
                  });
                }
                // Update total price
                await tx.order.update({
                  where: { id: existingOrder.id },
                  data: { totalPrice: existingOrder.totalPrice + product.price * qty }
                });
              } else {
                // Create new order
                const orderId = `ORD-${Date.now()}-${Math.floor(Math.random()*1000)}`;
                await tx.order.create({
                  data: {
                    id: orderId,
                    userId: user.nickname,
                    totalPrice: product.price * qty,
                    createdAt: todayStr,
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
              }
            });

            currentStock -= qty;
            effectiveStock -= qty;
            successOrders.push({ name: authorName, qty, fullName: fullGeneratedHandle });
            logs.push({ message: `Order processed: ${qty}x ${product.name} for ${fullGeneratedHandle}`, type: 'success' });
            
            if (effectiveStock === 0 && salesLimit !== undefined && salesLimit !== null) {
               reachedSalesLimit = true;
               break; // Stop processing further messages once sales limit is hit
            }
            
          } catch (err: any) {
            console.error('Failed to create order:', err);
            logs.push({ message: `Transaction failed for ${authorName}: ${err.message}`, type: 'error' });
          }
        } else {
          outOfStockOrders.push({ name: authorName, qty, fullName: fullGeneratedHandle });
          logs.push({ message: `Stock insufficient for ${fullGeneratedHandle} (Req: ${qty}, Eff. Stock: ${effectiveStock})`, type: 'error' });
        }
        }
      } // end if valid order
    } // end for loop

    // 2. Formulate and Send automated replies to YouTube Live Chat
    const replies: string[] = [];
    
    if (successOrders.length > 0) {
      const names = successOrders.map(o => {
          return `${o.fullName}(${o.qty})`;
      }).join(', ');
      
      if (effectiveStock === 0 || reachedSalesLimit) {
        replies.push(`[${product.name}] ${names}님 주문 완료 되었습니다 😊 상품이 매진되었습니다!`);
      } else {
        replies.push(`[${product.name}] ${names}님 주문 완료 되었습니다 😊 남은 수량은 ${effectiveStock}개 입니다.`);
      }
    }

    if (reachedSalesLimit) {
      // The user specifically requested that even if sold out, it should mention the successful buyers first if any
      // This is already handled by the `successOrders` push above!
      // Simply append a "Sold out!" message specifically for the sales limit.
      const stopLimitMessage = `🔥 [${product.name}] 준비된 수량이 모두 매진 되었습니다! 🔥`;
      if (!autoReply) replies.push(stopLimitMessage); // ensure it's in the list for critical delivery 
      else replies[replies.length - 1] = stopLimitMessage; // or replace if autoReply handled it

      const soldInThisPoll = successOrders.reduce((sum, o) => sum + o.qty, 0);

    // Stop the bot completely since limit is reached
      logs.push({ message: `Sales Limit reached. Preparing to stop bot.`, type: 'warning' });
      // We do NOT return early here anymore. We let the loop below dispatch the replies.
    }

    if (outOfStockOrders.length > 0) {
      const names = outOfStockOrders.map(o => {
          return `${o.fullName}(${o.qty})`;
      }).join(', ');
      // If stock is 0, mention sold out completely
      if (effectiveStock === 0) {
        replies.push(`[${product.name}] ${names}님 상품이 매진 되었습니다! 죄송합니다 😭`);
      } else {
        replies.push(`[${product.name}] ${names}님 재고가 부족합니다 (잔여: ${effectiveStock}개) 😭`);
      }
    }

    if (unregisteredUsers.length > 0) {
      // Group up to 3 names per message to keep it short
      const names = unregisteredUsers.map(u => u.fullName).slice(0, 3).join(', ');
      const suffix = unregisteredUsers.length > 3 ? ` 외 ${unregisteredUsers.length - 3}명` : '';
      replies.push(`${names}${suffix}님 회원가입 및 유튜브 아이디(핸들) 등록 먼저 부탁드립니다 😊`);
    }

    // If autoReply is false, clear all normal order replies, 
    // BUT keep critical system messages (like Sold Out) if we hit limits.
    let finalRepliesToSent: string[];
    if (autoReply) {
      finalRepliesToSent = replies;
    } else if (reachedSalesLimit || effectiveStock === 0) {
      // Build buyer summary for sold-out message
      const buyerSummaryParts = successOrders.map(o => `${o.fullName}(${o.qty}개)`);
      const totalSold = successOrders.reduce((sum, o) => sum + o.qty, 0);
      if (totalSold > 0) {
        finalRepliesToSent = [`[${product.name}] ${buyerSummaryParts.join(', ')} 🔥총 ${totalSold}개 전량 매진되었습니다🔥`];
      } else {
        finalRepliesToSent = [`🔥 [${product.name}] 준비된 수량이 모두 매진 되었습니다! 🔥`];
      }
    } else {
      finalRepliesToSent = [];
    }

    // Send replies to YouTube sequentially
    for (const reply of finalRepliesToSent) {
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

    const soldInThisPoll = successOrders.reduce((sum, o) => sum + o.qty, 0);

    return NextResponse.json({ 
      success: true, 
      nextPageToken: newNextPageToken,
      pollingIntervalMillis,
      logs,
      stopBot: currentStock <= 0 || reachedSalesLimit,
      soldAmount: soldInThisPoll,
      successOrders: successOrders.map(o => ({ name: o.name, qty: o.qty })),
      unregisteredUsers: unregisteredUsers.map(u => u.fullName)
    });

  } catch (error: any) {
    console.error('YouTube API Error (poll):', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
