import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!session || !(session as any).accessToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated with Google. Please log in again.' }, { status: 401 });
    }

    const { videoId } = await req.json();
    if (!videoId) {
      return NextResponse.json({ success: false, error: 'Video ID is required' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    oauth2Client.setCredentials({ access_token: (session as any).accessToken });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    // Get liveChatId from videoId
    const response = await youtube.videos.list({
      part: ['liveStreamingDetails'],
      id: [videoId]
    });

    if (!response.data.items || response.data.items.length === 0) {
      return NextResponse.json({ success: false, error: 'Video not found or not a live stream.' }, { status: 404 });
    }

    const liveStreamingDetails = response.data.items[0].liveStreamingDetails;
    if (!liveStreamingDetails || !liveStreamingDetails.activeLiveChatId) {
      return NextResponse.json({ success: false, error: 'Live chat is not active or video is not currently live.' }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      liveChatId: liveStreamingDetails.activeLiveChatId 
    });

  } catch (error: any) {
    console.error('YouTube API Error (connect):', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
