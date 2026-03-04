import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

/**
 * Use NextAuth v5 lazy initialization so that process.env is read at request
 * time instead of module-init time.  On Cloudflare Workers the env bindings
 * (vars + secrets) are only populated inside a request context, so the eager
 * `NextAuth({ … })` pattern would see empty env vars and fail.
 */
export const { handlers, signIn, signOut, auth } = NextAuth(() => {
  // SEC-06: warn if AUTH_SECRET is missing (don't throw — the NextAuth lazy-init
  // callback runs at module-init time in the Edge/middleware bundle, before
  // Cloudflare Worker secrets are populated into process.env).
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret && process.env.ENVIRONMENT === 'production') {
    console.warn('[auth] AUTH_SECRET not yet available — will be resolved at request time via Worker secrets');
  }
  return {
  trustHost: true,
  secret,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'read:user user:email repo',
        },
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken as string,
      };
    },
  },
};
});
