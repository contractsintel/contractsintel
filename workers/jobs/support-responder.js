const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

async function run() {
  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  // Set up Gmail client for support@contractsintel.com
  const oauth2Client = new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret
  );
  oauth2Client.setCredentials({ refresh_token: config.gmail.supportRefreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

  // Get unread messages
  const { data: messages } = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread -from:me -from:noreply -from:no-reply -from:mailer-daemon',
    maxResults: 10,
  });

  if (!messages.messages?.length) {
    console.log('  No unread support emails');
    return;
  }

  console.log(`  Processing ${messages.messages.length} unread emails`);

  for (const msg of messages.messages) {
    const { data: full } = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });

    const headers = full.payload.headers;
    const from = headers.find((h) => h.name === 'From')?.value || '';
    const subject = headers.find((h) => h.name === 'Subject')?.value || '';
    const messageId = headers.find((h) => h.name === 'Message-ID')?.value || '';

    // Extract body
    let body = '';
    if (full.payload.body?.data) {
      body = Buffer.from(full.payload.body.data, 'base64').toString('utf-8');
    } else if (full.payload.parts) {
      const textPart = full.payload.parts.find((p) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    if (!body.trim()) continue;

    // Extract sender email
    const senderEmail = from.match(/<(.+?)>/)?.[1] || from.trim();

    // Check if this is from a customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, company_name, plan')
      .eq('email', senderEmail)
      .single();

    // Skip emails that look like automated/marketing
    const skipPatterns = [/unsubscribe/i, /newsletter/i, /noreply/i, /automated/i];
    if (skipPatterns.some((p) => p.test(from) || p.test(subject))) {
      await gmail.users.messages.modify({
        userId: 'me',
        id: msg.id,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });
      continue;
    }

    // Generate AI response
    const systemPrompt = `You are the support agent for ContractsIntel, a government contracts intelligence platform.
You are responding to emails sent to support@contractsintel.com.

About ContractsIntel:
- We monitor SAM.gov for contract opportunities
- We match contracts to subscriber profiles using AI
- We send daily digest emails with scored opportunities
- Plans: Discovery ($99/mo), BD Pro ($299/mo), Team ($899/mo)
- All plans include a 14-day free trial
- We help with bid/no-bid decisions and proposal support

Guidelines:
- Be professional, helpful, and concise
- If it's a billing issue, direct them to their dashboard settings or ask them to reply with details
- If it's a feature request, thank them and say you've noted it
- If it's a technical issue, acknowledge it and say the team is looking into it
- If they want to cancel, try to understand why and offer to help resolve their concern
- NEVER make up information about their account
- Sign as "ContractsIntel Support Team"
- If the email contains legal language or threats, respond with: "Thank you for reaching out. We're forwarding your message to our team for review. We'll get back to you within 24 hours."

${profile ? `Customer info: ${profile.full_name || 'Unknown'}, ${profile.company_name || 'Unknown company'}, Plan: ${profile.plan || 'unknown'}` : 'This person is not a current customer.'}`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `From: ${from}\nSubject: ${subject}\n\n${body.substring(0, 3000)}`
        }],
      });

      const reply = response.content[0].text;

      // Send reply via Gmail
      const rawEmail = [
        `To: ${from}`,
        `Subject: Re: ${subject}`,
        `In-Reply-To: ${messageId}`,
        `References: ${messageId}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        reply,
      ].join('\r\n');

      const encodedEmail = Buffer.from(rawEmail).toString('base64url');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedEmail, threadId: full.threadId },
      });

      // Mark as read
      await gmail.users.messages.modify({
        userId: 'me',
        id: msg.id,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });

      console.log(`  Replied to ${senderEmail}: "${subject}"`);

      // Flag legal/escalation emails
      if (/legal|attorney|lawyer|lawsuit|cease|desist/i.test(body)) {
        console.log(`  ⚠️ ESCALATION: Legal language detected from ${senderEmail}`);
      }
    } catch (err) {
      console.log(`  Failed to respond to ${senderEmail}: ${err.message}`);
    }
  }
}

module.exports = { run };
