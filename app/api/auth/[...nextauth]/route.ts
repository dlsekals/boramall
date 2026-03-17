import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl",
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    CredentialsProvider({
      name: "Admin Login",
      credentials: {
        password: { label: "비밀번호", type: "password" }
      },
      async authorize(credentials) {
        // 단일 관리자 비밀번호 확인 (환경 변수로 관리하는 것이 좋지만, 일단 기존 방식 유지 후 개선 가능)
        const adminPassword = process.env.ADMIN_PASSWORD || "injc0924";
        
        if (credentials?.password === adminPassword) {
          return { id: "1", name: "Admin", email: "admin@boramall.com", role: "admin" };
        }
        
        return null;
      }
    })
  ],
  pages: {
    signIn: '/admin/login',
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // 1. Initial sign in
      if (account && user) {
        if (account.provider === 'google') {
           token.accessToken = account.access_token;
           // Google requires prompt="consent" to receive refresh token, which we have in options
           token.refreshToken = account.refresh_token; 
           // Calculate expiration time (typically 3600 seconds/1 hour from now)
           // fallback to 1 hour if expires_at is undefined
           token.accessTokenExpires = account.expires_at 
             ? account.expires_at * 1000 
             : Date.now() + 3600 * 1000;
           token.role = "admin";
        } else {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           token.role = (user as any).role;
        }
        return token;
      }
      
      // 2. Return previous token if the access token has not expired yet
      // buffer time: refresh 5 mins before expiry
      if (token.accessTokenExpires && Date.now() < (token.accessTokenExpires as number) - 5 * 60 * 1000) {
        return token;
      }

      // 3. Access token has expired, try to update it
      if (token.refreshToken && typeof token.refreshToken === 'string') {
        try {
          console.log("Access token expired. Refreshing...");
          const response = await fetch("https://oauth2.googleapis.com/token", {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID || "",
              client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
              grant_type: "refresh_token",
              refresh_token: token.refreshToken,
            }),
            method: "POST",
          });

          const tokens = await response.json();

          if (!response.ok) {
             throw tokens;
          }

          return {
            ...token,
            accessToken: tokens.access_token,
            // Fall back to old refresh token
            refreshToken: tokens.refresh_token ?? token.refreshToken,
            accessTokenExpires: Date.now() + tokens.expires_in * 1000,
          };
        } catch (error) {
          console.error("Error refreshing google access token", error);
          // Return the token as is, but mark it with an error property
          return { ...token, error: "RefreshAccessTokenError" as const };
        }
      }

      // Fallback
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = token.role;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session as any).accessToken = token.accessToken;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session as any).refreshToken = token.refreshToken;
        // Expose error text to client if refresh failed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session as any).error = token.error;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
