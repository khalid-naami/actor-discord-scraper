import { Actor } from 'apify';
import { gotScraping } from 'got-scraping';
import { log } from 'crawlee';
import {
    extractInviteCode,
    parseInviteData,
    parseMessagesData
} from './extractors.js';

await Actor.init();

const input = (await Actor.getInput()) || {};
const {
    mode = 'AUTO_DETECT',
    targetUrls = [],
    searchKeywords = [],
    channelIds = [],
    maxMessages = 50,
    maxItems = 30,
    discordToken = '',
    proxyConfiguration
} = input;

log.info('🚀 Starting Discord Ultimate Scraper...', {
    mode,
    targetUrlsCount: targetUrls.length,
    searchKeywordsCount: searchKeywords.length,
    channelIdsCount: channelIds.length
});

const proxyConfig = proxyConfiguration ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined;

// Default sample targets if nothing provided
let urlsToProcess = [...targetUrls];
let keywordsToProcess = [...searchKeywords];
let channelsToProcess = [...channelIds];

if (urlsToProcess.length === 0 && keywordsToProcess.length === 0 && channelsToProcess.length === 0) {
    urlsToProcess = [
        'https://discord.gg/python',
        'https://discord.gg/openai'
    ];
    log.info('ℹ️ No inputs provided. Defaulting to sample Discord servers:', { urls: urlsToProcess });
}

function buildHeaders(token = null) {
    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
    };
    if (token) {
        headers['Authorization'] = token.startsWith('Bot ') ? token : token;
    }
    return headers;
}

// Fast JSON fetcher
async function fetchDiscordJson(url, token = null) {
    const proxyUrl = proxyConfig ? await proxyConfig.newUrl() : undefined;
    const response = await gotScraping({
        url,
        headers: buildHeaders(token),
        proxyUrl,
        responseType: 'json',
        timeout: { request: 25000 },
        retry: { limit: 2 }
    });
    return response.body;
}

const stats = {
    servers: 0,
    messages: 0,
    discoveredServers: 0,
    failed: 0
};

// 1. PROCESS TARGET SERVERS / INVITES
for (const rawUrl of urlsToProcess) {
    const code = extractInviteCode(rawUrl);
    if (!code) continue;

    log.info(`🎯 Resolving Discord Public Invite: ${code}`);

    try {
        const apiUrl = `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`;
        const data = await fetchDiscordJson(apiUrl);

        const server = parseInviteData(data, rawUrl);
        if (server) {
            await Actor.pushData(server);
            stats.servers++;
            log.info(`✅ Successfully scraped Server: "${server.serverName}" [Members: ${server.approximateMemberCount.toLocaleString()}, Online: ${server.approximatePresenceCount.toLocaleString()}]`);
        }
    } catch (err) {
        log.error(`❌ Failed to resolve invite ${code}: ${err.message}`);
        stats.failed++;
    }
}

// 2. PROCESS CHANNEL MESSAGES
if (channelsToProcess.length > 0) {
    for (const channelId of channelsToProcess) {
        log.info(`💬 Scraping messages for channel: ${channelId}`);
        try {
            const limit = Math.min(100, maxMessages);
            const apiUrl = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`;
            const data = await fetchDiscordJson(apiUrl, discordToken);

            const messages = parseMessagesData(data, channelId);
            for (const msg of messages) {
                await Actor.pushData(msg);
            }
            stats.messages += messages.length;
            log.info(`✅ Extracted ${messages.length} messages for channel: ${channelId}`);
        } catch (err) {
            log.error(`❌ Failed fetching messages for channel ${channelId}: ${err.message}`);
            stats.failed++;
        }
    }
}

// 3. PROCESS SERVER FINDER BY KEYWORD
if (keywordsToProcess.length > 0) {
    for (const keyword of keywordsToProcess) {
        log.info(`🔍 Searching public Discord communities for: "${keyword}"`);
        try {
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:discord.gg "${keyword}"`)}`;
            const proxyUrl = proxyConfig ? await proxyConfig.newUrl() : undefined;
            const res = await gotScraping({
                url: searchUrl,
                proxyUrl,
                headers: buildHeaders(),
                timeout: { request: 25000 }
            });

            const inviteRegex = /https?:\/\/discord\.gg\/([a-zA-Z0-9_-]+)/gi;
            const foundCodes = [];
            let match;
            while ((match = inviteRegex.exec(res.body)) !== null) {
                foundCodes.push(match[1]);
            }

            const uniqueCodes = [...new Set(foundCodes)].slice(0, maxItems);
            log.info(`🔗 Discovered ${uniqueCodes.length} candidate servers for "${keyword}"`);

            for (const code of uniqueCodes) {
                try {
                    const apiUrl = `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`;
                    const data = await fetchDiscordJson(apiUrl);
                    const server = parseInviteData(data, `https://discord.gg/${code}`);
                    if (server) {
                        server.searchQuery = keyword;
                        await Actor.pushData(server);
                        stats.discoveredServers++;
                        log.info(`🎉 Discovered & Verified Server: "${server.serverName}" [Members: ${server.approximateMemberCount.toLocaleString()}]`);
                    }
                } catch (_) {}
            }
        } catch (err) {
            log.error(`❌ Server finder failed for "${keyword}": ${err.message}`);
            stats.failed++;
        }
    }
}

// Save summary report
const summary = {
    status: 'COMPLETED',
    timestamp: new Date().toISOString(),
    metrics: stats,
    totalRecordsExtracted: stats.servers + stats.messages + stats.discoveredServers,
    message: 'Discord Ultimate Scraper completed successfully.'
};

await Actor.setValue('OUTPUT', summary);
log.info('🏁 Execution Finished. Executive Summary:', summary);

await Actor.exit();
