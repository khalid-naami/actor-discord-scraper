/**
 * Discord Ultimate Scraper - Extractors & Parsers
 * High-speed parsing for Public Server Invites, Channel Messages, and Discovery.
 */

// Helper to extract email addresses
export function extractEmails(text) {
    if (!text || typeof text !== 'string') return [];
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const matches = text.match(emailRegex) || [];
    const ignored = ['discord.com', 'discord.gg', 'discordapp.com', 'example.com'];
    const unique = [...new Set(matches.map(m => m.trim().toLowerCase()))];
    return unique.filter(e => !ignored.some(d => e.endsWith(`@${d}`)));
}

// Helper to extract phone numbers
export function extractPhones(text) {
    if (!text || typeof text !== 'string') return [];
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}/g;
    const matches = text.match(phoneRegex) || [];
    const valid = matches
        .map(p => p.trim())
        .filter(p => {
            const digits = p.replace(/\D/g, '');
            return digits.length >= 8 && digits.length <= 15;
        });
    return [...new Set(valid)];
}

// Helper to extract external links
export function extractExternalLinks(text) {
    if (!text || typeof text !== 'string') return [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex) || [];
    return [...new Set(matches.filter(u => !u.includes('discord.com') && !u.includes('discord.gg') && !u.includes('discordapp.com')))];
}

// Extract invite code from Discord URL
export function extractInviteCode(url) {
    if (!url) return null;
    const match = url.match(/(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9_-]+)/i)
        || url.match(/^([a-zA-Z0-9_-]+)$/);
    return match ? match[1] : null;
}

// Parse Discord Public Invite API response
export function parseInviteData(data, rawUrl) {
    if (!data || typeof data !== 'object') return null;

    const code = data.code;
    const guild = data.guild || {};
    const channel = data.channel || {};

    const guildId = guild.id || null;
    const serverName = guild.name || code;
    const serverDesc = guild.description || '';
    const approxMembers = data.approximate_member_count ?? 0;
    const approxPresence = data.approximate_presence_count ?? 0;

    // CDN Icons & Banners
    let iconUrl = null;
    if (guildId && guild.icon) {
        const ext = guild.icon.startsWith('a_') ? 'gif' : 'png';
        iconUrl = `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.${ext}?size=512`;
    }

    let bannerUrl = null;
    if (guildId && (guild.banner || guild.splash)) {
        const hash = guild.banner || guild.splash;
        const ext = hash.startsWith('a_') ? 'gif' : 'png';
        bannerUrl = `https://cdn.discordapp.com/banners/${guildId}/${hash}.${ext}?size=1024`;
    }

    const emails = extractEmails(serverDesc);
    const phones = extractPhones(serverDesc);
    const externalLinks = extractExternalLinks(serverDesc);

    return {
        type: 'SERVER',
        id: guildId || code,
        url: `https://discord.gg/${code}`,
        inviteCode: code,
        serverName,
        serverDescription: serverDesc,
        approximateMemberCount: approxMembers,
        approximatePresenceCount: approxPresence,
        iconUrl,
        bannerUrl,
        vanityUrlCode: guild.vanity_url_code || null,
        features: guild.features || [],
        verificationLevel: guild.verification_level ?? null,
        channelId: channel.id || null,
        channelName: channel.name || null,
        email: emails[0] || null,
        emails: emails.length > 0 ? emails : undefined,
        phones: phones.length > 0 ? phones : undefined,
        externalLinks: externalLinks.length > 0 ? externalLinks : undefined,
        scrapedAt: new Date().toISOString()
    };
}

// Parse Discord Channel Messages
export function parseMessagesData(messages, channelId) {
    if (!Array.isArray(messages)) return [];

    return messages.map(msg => {
        const author = msg.author || {};
        const content = msg.content || '';

        // Reactions
        const reactions = (msg.reactions || []).map(r => ({
            emoji: r.emoji?.name,
            count: r.count
        }));

        // Attachments
        const attachments = (msg.attachments || []).map(a => ({
            id: a.id,
            filename: a.filename,
            size: a.size,
            url: a.url
        }));

        const emails = extractEmails(content);
        const phones = extractPhones(content);
        const externalLinks = extractExternalLinks(content);

        return {
            type: 'MESSAGE',
            id: msg.id,
            messageId: msg.id,
            channelId,
            url: `https://discord.com/channels/@me/${channelId}/${msg.id}`,
            content,
            authorUsername: author.username,
            authorGlobalName: author.global_name || null,
            authorId: author.id,
            isBot: Boolean(author.bot),
            timestamp: msg.timestamp,
            attachments: attachments.length > 0 ? attachments : undefined,
            reactions: reactions.length > 0 ? reactions : undefined,
            email: emails[0] || null,
            emails: emails.length > 0 ? emails : undefined,
            phones: phones.length > 0 ? phones : undefined,
            externalLinks: externalLinks.length > 0 ? externalLinks : undefined,
            scrapedAt: new Date().toISOString()
        };
    });
}
