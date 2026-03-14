import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const handler = NextAuth({
  providers: [
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
    async jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = token.role;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
