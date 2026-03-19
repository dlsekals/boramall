import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: Request) {
  try {
    const { credential } = await req.json();
    
    if (!credential) {
      return NextResponse.json({ success: false, error: 'No credential provided' }, { status: 400 });
    }

    // Verify the Google ID token
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID);
    const ticket = await oauth2Client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    
    if (!payload) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    // Return user info from Google
    return NextResponse.json({
      success: true,
      user: {
        name: payload.name || '',
        email: payload.email || '',
        picture: payload.picture || '',
        googleId: payload.sub,
      }
    });
  } catch (error) {
    console.error('Google verify error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
