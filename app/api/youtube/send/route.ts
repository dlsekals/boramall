import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!session || !(session as any).accessToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated with Google.' }, { status: 401 });
    }

    const { liveChatId, message } = await req.json();
    if (!liveChatId || !message) {
      return NextResponse.json({ success: false, error: 'liveChatId and message are required' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    oauth2Client.setCredentials({ access_token: (session as any).accessToken });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    await youtube.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: {
            messageText: message
          }
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('YouTube API Error (send):', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
