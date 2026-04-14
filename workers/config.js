require('dotenv').config({ path: '../.env' });

module.exports = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL || 'intel@contractsintel.com',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    supportRefreshToken: process.env.GMAIL_REFRESH_TOKEN_SUPPORT,
  },
  sam: {
    apiKey: process.env.SAM_API_KEY,
  },
  instantly: {
    apiKey: process.env.INSTANTLY_API_KEY,
    workspaceId: process.env.INSTANTLY_WORKSPACE_ID,
  },
};
