/**
 * Discord Ultimate Scraper - Extractors & Parsers
 * High-speed parsing for Public Server Invites, Widgets, Channel Messages, and Directory Discovery.
 */

export function sanitizeRecord(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number') {
        return Number.isNaN(value) || !Number.isFinite(value) ? undefined : value;
    }
    if (Array.isArray(value)) {
        const cleaned = [];
        for (const item of value) {
            const next = sanitizeRecord(item);
            if (next !== undefined) cleaned.push(next);
        }
        return cleaned;
    }
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            const next = sanitizeRecord(v);
            if (next !== undefined) out[k] = next;
        }
        return out;
    }
    return value;
}

export function decodeHtmlEntities(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;|&#x27;/gi, "'")
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#(\d+);/g, (_, dec) => {
            const code = parseInt(dec, 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : _;
        })
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            const code = parseInt(hex, 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : _;
        })
        .replace(/&amp;/gi, '&');
}

export function parseSafeInt(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

// Helper to extract email addresses
export function extractEmails(text) {
    if (!text || typeof text !== 'string') return [];
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const matches = text.match(emailRegex) || [];
    const ignored = ['discord.com', 'discord.gg', 'discordapp.com', 'example.com'];
    const unique = [...new Set(matches.map((m) => m.trim().toLowerCase()))];
    return unique.filter((e) => !ignored.some((d) => e === d || e.endsWith(`@${d}`)));
}

// Helper to extract phone numbers
export function extractPhones(text) {
    if (!text || typeof text !== 'string') return [];
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}/g;
    const matches = text.match(phoneRegex) || [];
    const valid = matches
        .map((p) => p.trim())
        .filter((p) => {
            const digits = p.replace(/\D/g, '');
            return digits.length >= 8 && digits.length <= 15;
        });
    return [...new Set(valid)];
}

// Helper to extract external links
export function extractExternalLinks(text) {
    if (!text || typeof text !== 'string') return [];
    const urlRegex = /(https?:\/\/[^\s"'<>)\]]+)/g;
    const matches = text.match(urlRegex) || [];
    return [...new Set(
        matches
            .map((u) => u.replace(/[),.;]+$/, ''))
            .filter((u) => !u.includes('discord.com') && !u.includes('discord.gg') && !u.includes('discordapp.com'))
    )];
}

// Extract invite code from Discord URL or bare code
export function extractInviteCode(rawInput) {
    let raw = '';
    if (typeof rawInput === 'string') {
        raw = rawInput.trim();
    } else if (rawInput && typeof rawInput === 'object' && typeof rawInput.url === 'string') {
        raw = rawInput.url.trim();
    }
    if (!raw) return null;

    if (/^[a-zA-Z0-9_-]{2,64}$/.test(raw)) {
        return raw;
    }

    const match = raw.match(/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : null;
}

// Parse Discord Public Invite API response
export function parseInviteData(data, rawUrl) {
    if (!data || typeof data !== 'object' || !data.code) return null;

    const code = String(data.code);
    const guild = data.guild || {};
    const channel = data.channel || {};

    const guildId = guild.id ? String(guild.id) : undefined;
    const serverName = String(guild.name || code);
    const serverDesc = String(guild.description || '');
    const approxMembers = parseSafeInt(data.approximate_member_count, 0);
    const approxPresence = parseSafeInt(data.approximate_presence_count, 0);

    let iconUrl;
    if (guildId && guild.icon) {
        const ext = String(guild.icon).startsWith('a_') ? 'gif' : 'png';
        iconUrl = `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.${ext}?size=512`;
    }

    let bannerUrl;
    if (guildId && guild.banner) {
        const ext = String(guild.banner).startsWith('a_') ? 'gif' : 'png';
        bannerUrl = `https://cdn.discordapp.com/banners/${guildId}/${guild.banner}.${ext}?size=1024`;
    } else if (guildId && guild.splash) {
        bannerUrl = `https://cdn.discordapp.com/splashes/${guildId}/${guild.splash}.png?size=1024`;
    }

    const emails = extractEmails(serverDesc);
    const phones = extractPhones(serverDesc);
    const externalLinks = extractExternalLinks(serverDesc);

    return sanitizeRecord({
        type: 'SERVER',
        id: guildId || code,
        url: rawUrl && /^https?:\/\/discord\.(gg|com\/invite)/i.test(rawUrl) ? `https://discord.gg/${code}` : `https://discord.gg/${code}`,
        inviteCode: code,
        serverName,
        serverDescription: serverDesc || undefined,
        approximateMemberCount: approxMembers,
        approximatePresenceCount: approxPresence,
        iconUrl,
        bannerUrl,
        vanityUrlCode: guild.vanity_url_code || undefined,
        features: Array.isArray(guild.features) ? guild.features : [],
        verificationLevel: typeof guild.verification_level === 'number' ? guild.verification_level : undefined,
        channelId: channel.id ? String(channel.id) : undefined,
        channelName: channel.name || undefined,
        email: emails[0],
        emails: emails.length > 0 ? emails : undefined,
        phone: phones[0],
        phones: phones.length > 0 ? phones : undefined,
        externalLinks: externalLinks.length > 0 ? externalLinks : undefined,
        source: 'discord_invite_api',
        scrapedAt: new Date().toISOString()
    });
}

// Parse Discord Channel Messages
export function parseMessagesData(messages, channelId) {
    if (!Array.isArray(messages)) return [];

    return messages
        .filter((msg) => msg && typeof msg === 'object' && msg.id)
        .map((msg) => {
            const author = msg.author || {};
            const content = String(msg.content || '');

            const reactions = (Array.isArray(msg.reactions) ? msg.reactions : []).map((r) => sanitizeRecord({
                emoji: r?.emoji?.name,
                count: parseSafeInt(r?.count, 0)
            }));

            const attachments = (Array.isArray(msg.attachments) ? msg.attachments : []).map((a) => sanitizeRecord({
                id: a?.id ? String(a.id) : undefined,
                filename: a?.filename,
                size: typeof a?.size === 'number' ? a.size : undefined,
                url: a?.url
            }));

            const emails = extractEmails(content);
            const phones = extractPhones(content);
            const externalLinks = extractExternalLinks(content);

            return sanitizeRecord({
                type: 'MESSAGE',
                id: String(msg.id),
                messageId: String(msg.id),
                channelId: String(channelId),
                url: `https://discord.com/channels/@me/${channelId}/${msg.id}`,
                content,
                authorUsername: author.username || undefined,
                authorGlobalName: author.global_name || undefined,
                authorId: author.id ? String(author.id) : undefined,
                isBot: Boolean(author.bot),
                timestamp: msg.timestamp || undefined,
                attachments: attachments.length > 0 ? attachments : undefined,
                reactions: reactions.length > 0 ? reactions : undefined,
                email: emails[0],
                emails: emails.length > 0 ? emails : undefined,
                phone: phones[0],
                phones: phones.length > 0 ? phones : undefined,
                externalLinks: externalLinks.length > 0 ? externalLinks : undefined,
                source: 'discord_channel_api',
                scrapedAt: new Date().toISOString()
            });
        });
}

// Parse discordservers.com search HTML (JSON-LD ItemList + HTML server cards with member counts)
export function parseDiscordServersSearchHtml(html, keyword) {
    if (!html || typeof html !== 'string') return [];

    const byId = new Map();

    // 1. Parse rendered server cards: <a href="/server/<id>"><h3>Name</h3><p>261 members</p><p>Desc</p></a>
    const cardRegex = /<a\b[^>]+href=["']\/server\/(\d{15,22})["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = cardRegex.exec(html)) !== null) {
        const id = match[1];
        const inner = match[2];

        const h3Match = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
        const serverName = decodeHtmlEntities((h3Match ? h3Match[1] : '').replace(/<[^>]+>/g, '').trim());

        const pMatches = [...inner.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
            .map((m) => decodeHtmlEntities(m[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').trim()));

        let memberCount = 0;
        let description = '';
        for (const pText of pMatches) {
            const memMatch = pText.match(/^([\d,]+)\s+members?/i);
            if (memMatch) {
                memberCount = parseSafeInt(memMatch[1].replace(/,/g, ''), 0);
            } else if (pText && pText.length > description.length) {
                description = pText;
            }
        }

        if (!byId.has(id)) {
            byId.set(id, {
                id,
                url: `https://discordservers.com/server/${id}`,
                serverName: serverName || `Server ${id}`,
                serverDescription: description || undefined,
                approximateMemberCount: memberCount,
                searchQuery: keyword
            });
        }
    }

    // 2. Enrich or supplement from JSON-LD ItemList (often holds untruncated full descriptions)
    const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldRegex.exec(html)) !== null) {
        try {
            const data = JSON.parse(ldMatch[1]);
            const items = Array.isArray(data?.itemListElement) ? data.itemListElement : [];
            for (const item of items) {
                if (!item || typeof item !== 'object') continue;
                const itemUrl = String(item.url || '');
                const idMatch = itemUrl.match(/\/server\/(\d{15,22})/);
                if (!idMatch) continue;
                const id = idMatch[1];
                const existing = byId.get(id) || {
                    id,
                    url: `https://discordservers.com/server/${id}`,
                    approximateMemberCount: 0,
                    searchQuery: keyword
                };
                if (item.name) existing.serverName = decodeHtmlEntities(String(item.name));
                if (item.description && (!existing.serverDescription || String(item.description).length > existing.serverDescription.length)) {
                    existing.serverDescription = decodeHtmlEntities(String(item.description));
                }
                byId.set(id, existing);
            }
        } catch (_) {}
    }

    const results = [];
    for (const entry of byId.values()) {
        const desc = entry.serverDescription || '';
        const emails = extractEmails(desc);
        const phones = extractPhones(desc);
        const externalLinks = extractExternalLinks(desc);
        results.push(sanitizeRecord({
            type: 'SERVER',
            id: entry.id,
            url: entry.url,
            serverName: entry.serverName,
            serverDescription: desc || undefined,
            approximateMemberCount: entry.approximateMemberCount ?? 0,
            email: emails[0],
            emails: emails.length > 0 ? emails : undefined,
            phone: phones[0],
            phones: phones.length > 0 ? phones : undefined,
            externalLinks: externalLinks.length > 0 ? externalLinks : undefined,
            searchQuery: keyword,
            source: 'discordservers_directory',
            scrapedAt: new Date().toISOString()
        }));
    }

    return results;
}

// Extract genuine discord invite codes from directory HTML pages
export function extractInviteCodesFromHtml(html) {
    if (!html || typeof html !== 'string') return [];
    const ignored = new Set(['servers', 'discord', 'discordme', 'disboard', 'topgg', 'invite', 'bot', 'store']);
    const regex = /https?:\/\/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9_-]{2,40})/gi;
    const codes = [];
    let m;
    while ((m = regex.exec(html)) !== null) {
        const code = m[1];
        if (!ignored.has(code.toLowerCase())) {
            codes.push(code);
        }
    }
    return [...new Set(codes)];
}
