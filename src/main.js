import { Actor } from 'apify';
import { gotScraping } from 'got-scraping';
import { log } from 'crawlee';
import {
    sanitizeRecord,
    extractInviteCode,
    parseInviteData,
    parseMessagesData,
    parseDiscordServersSearchHtml,
    extractInviteCodesFromHtml
} from './extractors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isProxyTransportError(errOrStatus) {
    const msg = String(errOrStatus?.message || errOrStatus || '');
    return errOrStatus === 597 || errOrStatus === 407 || /597|UPSTREAM407|407|Proxy responded with|tunneling socket/i.test(msg);
}

await Actor.init();

const diagnostics = [];
function addDiagnostic(msg) {
    if (msg && !diagnostics.includes(msg)) {
        diagnostics.push(msg);
    }
}

try {
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

    const itemLimit = Math.max(1, Number(maxItems) || 30);
    const msgLimit = Math.max(1, Number(maxMessages) || 50);

    log.info('🚀 Starting Discord Ultimate Scraper...', {
        mode,
        targetUrlsCount: Array.isArray(targetUrls) ? targetUrls.length : 0,
        searchKeywordsCount: Array.isArray(searchKeywords) ? searchKeywords.length : 0,
        channelIdsCount: Array.isArray(channelIds) ? channelIds.length : 0,
        maxItems: itemLimit,
        maxMessages: msgLimit
    });

    let proxyConfig;
    if (proxyConfiguration) {
        try {
            proxyConfig = await Actor.createProxyConfiguration(proxyConfiguration);
        } catch (err) {
            log.warning(`⚠️ Proxy initialization failed (${err.message}). Continuing without Apify proxy.`);
            addDiagnostic(`Proxy initialization skipped: ${err.message}`);
            proxyConfig = undefined;
        }
    }

    let urlsToProcess = Array.isArray(targetUrls) ? [...targetUrls] : [];
    const keywordsToProcess = Array.isArray(searchKeywords)
        ? searchKeywords.map((k) => String(k || '').trim()).filter(Boolean)
        : [];
    const channelsToProcess = Array.isArray(channelIds)
        ? channelIds.map((c) => String(c || '').trim()).filter(Boolean)
        : [];

    if (mode === 'AUTO_DETECT' && urlsToProcess.length === 0 && keywordsToProcess.length === 0 && channelsToProcess.length === 0) {
        urlsToProcess = [
            'https://discord.gg/python',
            'https://discord.gg/openai'
        ];
        log.info('ℹ️ No inputs provided. Defaulting to sample Discord servers:', { urls: urlsToProcess });
    }

    let proxyDisabled = false;
    async function httpRequest(url, { accept = 'application/json, text/plain, */*', parseJson = false, token = '' } = {}) {
        const maxAttempts = proxyConfig && !proxyDisabled ? 3 : 2;
        let lastErr = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const proxyUrl = proxyConfig && !proxyDisabled ? await proxyConfig.newUrl() : undefined;
            const headers = {
                'Accept': accept,
                'Accept-Language': 'en-US,en;q=0.9'
            };
            if (token) {
                headers['Authorization'] = token;
            }

            try {
                const res = await gotScraping({
                    url,
                    headerGeneratorOptions: {
                        browsers: [{ name: 'chrome', minVersion: 124 }],
                        operatingSystems: ['windows', 'macos']
                    },
                    headers,
                    proxyUrl,
                    responseType: 'text',
                    throwHttpErrors: false,
                    timeout: { request: 25000 },
                    retry: { limit: 0 }
                });

                const statusCode = res.statusCode;
                const bodyText = typeof res.body === 'string' ? res.body : String(res.body || '');

                if (isProxyTransportError(statusCode)) {
                    lastErr = new Error(`Proxy transport HTTP ${statusCode} on ${url}`);
                    if (attempt + 1 < maxAttempts) {
                        if (attempt >= 1) proxyDisabled = true;
                        await sleep(1000);
                        continue;
                    }
                    throw lastErr;
                }

                if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
                    const retryAfter = Number(res.headers['retry-after']) || 2;
                    lastErr = new Error(`HTTP ${statusCode} on ${url}`);
                    if (attempt + 1 < maxAttempts) {
                        await sleep(Math.min(10000, Math.max(1500, retryAfter * 1000)));
                        continue;
                    }
                    throw lastErr;
                }

                if (statusCode >= 400) {
                    const err = new Error(`HTTP ${statusCode} on ${url}: ${bodyText.slice(0, 140).replace(/\s+/g, ' ')}`);
                    err.statusCode = statusCode;
                    throw err;
                }

                if (parseJson) {
                    try {
                        return { statusCode, data: JSON.parse(bodyText), text: bodyText };
                    } catch (jsonErr) {
                        throw new Error(`Invalid JSON from ${url}: ${jsonErr.message}`);
                    }
                }

                return { statusCode, text: bodyText };
            } catch (err) {
                lastErr = err;
                if (isProxyTransportError(err)) {
                    if (attempt >= 1) proxyDisabled = true;
                    if (attempt + 1 < maxAttempts) {
                        await sleep(1000);
                        continue;
                    }
                }
                if (err.statusCode && err.statusCode < 500 && err.statusCode !== 429) {
                    throw err;
                }
                if (attempt + 1 < maxAttempts) {
                    await sleep(1500);
                    continue;
                }
                throw err;
            }
        }

        throw lastErr || new Error(`Request failed for ${url}`);
    }

    async function resolveInviteByCode(code, rawUrl = `https://discord.gg/${code}`) {
        const apiUrl = `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`;
        const res = await httpRequest(apiUrl, { parseJson: true });
        return parseInviteData(res.data, rawUrl);
    }

    async function enrichGuildViaWidget(guildId) {
        try {
            const widgetRes = await httpRequest(`https://discord.com/api/guilds/${guildId}/widget.json`, { parseJson: true });
            const instantInvite = widgetRes.data?.instant_invite;
            if (instantInvite) {
                const inviteCode = extractInviteCode(instantInvite);
                if (inviteCode) {
                    return await resolveInviteByCode(inviteCode, instantInvite);
                }
            }
        } catch (_) {
            // Widget disabled (HTTP 403) or unavailable is normal on many Discord servers
        }
        return null;
    }

    const stats = {
        servers: 0,
        messages: 0,
        discoveredServers: 0,
        failed: 0
    };

    // 1. PROCESS TARGET SERVERS / INVITES
    if (mode === 'AUTO_DETECT' || mode === 'SERVERS') {
        for (const rawUrl of urlsToProcess.slice(0, itemLimit)) {
        const code = extractInviteCode(rawUrl);
        if (!code) {
            log.warning('⚠️ Skipping unrecognized Discord invite URL:', { rawUrl });
            addDiagnostic(`Invalid Discord invite target skipped: ${JSON.stringify(rawUrl)}`);
            stats.failed++;
            continue;
        }

        log.info(`🎯 Resolving Discord Public Invite: ${code}`);
        try {
            const server = await resolveInviteByCode(code, typeof rawUrl === 'string' ? rawUrl : rawUrl?.url);
            if (!server) {
                throw new Error(`Discord invite API returned no guild data for code "${code}"`);
            }
            await Actor.pushData(sanitizeRecord(server));
            stats.servers++;
            log.info(`✅ Successfully scraped Server: "${server.serverName}" [Members: ${server.approximateMemberCount.toLocaleString()}, Online: ${server.approximatePresenceCount.toLocaleString()}]`);
        } catch (err) {
            log.error(`❌ Failed to resolve invite ${code}: ${err.message}`);
            addDiagnostic(`Invite "${code}" -> ${err.message}`);
            stats.failed++;
        }
    }
    }

    // 2. PROCESS CHANNEL MESSAGES
    if ((mode === 'AUTO_DETECT' || mode === 'MESSAGES') && channelsToProcess.length > 0) {
        const cleanToken = String(discordToken || '').trim();
        if (!cleanToken) {
            const msg = 'discordToken is required to extract Discord channel messages.';
            log.error(`❌ ${msg}`);
            addDiagnostic(msg);
            stats.failed += channelsToProcess.length;
        } else {
            for (const channelId of channelsToProcess) {
                log.info(`💬 Scraping messages for channel: ${channelId}`);
                try {
                    let collectedMsgs = 0;
                    let beforeId = '';
                    let authHeader = cleanToken;

                    while (collectedMsgs < msgLimit) {
                        const batchSize = Math.min(100, msgLimit - collectedMsgs);
                        const apiUrl = beforeId
                            ? `https://discord.com/api/v10/channels/${channelId}/messages?limit=${batchSize}&before=${beforeId}`
                            : `https://discord.com/api/v10/channels/${channelId}/messages?limit=${batchSize}`;

                        let res;
                        try {
                            res = await httpRequest(apiUrl, { parseJson: true, token: authHeader });
                        } catch (authErr) {
                            if (authErr.statusCode === 401 && !authHeader.startsWith('Bot ')) {
                                authHeader = `Bot ${cleanToken}`;
                                res = await httpRequest(apiUrl, { parseJson: true, token: authHeader });
                            } else {
                                throw authErr;
                            }
                        }

                        const rawBatch = Array.isArray(res.data) ? res.data : [];
                        if (rawBatch.length === 0) break;

                        const parsed = parseMessagesData(rawBatch, channelId);
                        for (const msg of parsed) {
                            await Actor.pushData(sanitizeRecord(msg));
                            collectedMsgs++;
                            stats.messages++;
                        }

                        beforeId = rawBatch[rawBatch.length - 1]?.id || '';
                        if (rawBatch.length < batchSize || !beforeId) break;
                    }

                    log.info(`✅ Extracted ${collectedMsgs} messages for channel: ${channelId}`);
                } catch (err) {
                    log.error(`❌ Failed fetching messages for channel ${channelId}: ${err.message}`);
                    addDiagnostic(`Channel ${channelId} -> ${err.message}`);
                    stats.failed++;
                }
            }
        }
    } else if (mode === 'MESSAGES') {
        log.warning('⚠️ Mode is set to MESSAGES, but no channelIds were provided.');
        addDiagnostic('MESSAGES mode requires non-empty channelIds and discordToken.');
    }

    // 3. PROCESS SERVER FINDER BY KEYWORD
    if ((mode === 'AUTO_DETECT' || mode === 'SERVER_FINDER') && keywordsToProcess.length > 0) {
        for (const keyword of keywordsToProcess) {
            log.info(`🔍 Searching public Discord communities for: "${keyword}"`);
            try {
                const seenGuildIds = new Set();
                const seenInvites = new Set();
                let discoveredForKeyword = 0;

                // Build candidate search queries (exact phrase first, then shorter sub-terms if needed)
                const words = keyword.split(/\s+/).filter((w) => w.length > 2);
                const queryVariants = [keyword];
                if (words.length >= 3) {
                    queryVariants.push(words.slice(0, 2).join(' '));
                    queryVariants.push(words[words.length - 1]);
                } else if (words.length === 2) {
                    queryVariants.push(words[0]);
                }

                // Tier A: Public Server Directory (discordservers.com) + Discord Widget / Invite enrichment
                for (const queryTerm of queryVariants) {
                    if (discoveredForKeyword >= itemLimit) break;

                    for (let page = 1; page <= 3 && discoveredForKeyword < itemLimit; page++) {
                        const dirUrl = page === 1
                            ? `https://discordservers.com/search/${encodeURIComponent(queryTerm)}`
                            : `https://discordservers.com/search/${encodeURIComponent(queryTerm)}?page=${page}`;

                        let candidates = [];
                        try {
                            const dirRes = await httpRequest(dirUrl, {
                                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                parseJson: false
                            });
                            candidates = parseDiscordServersSearchHtml(dirRes.text, keyword);
                        } catch (dirErr) {
                            log.debug(`Directory lookup failed on "${queryTerm}" page ${page}: ${dirErr.message}`);
                            break;
                        }

                        if (candidates.length === 0) break;

                        let newOnPage = 0;
                        for (const candidate of candidates) {
                            if (discoveredForKeyword >= itemLimit) break;
                            if (seenGuildIds.has(candidate.id)) continue;
                            seenGuildIds.add(candidate.id);
                            newOnPage++;

                            // Enrich via official Discord widget + invite API if widget is enabled
                            const enriched = await enrichGuildViaWidget(candidate.id);
                            let finalRecord = candidate;
                            if (enriched) {
                                if (enriched.inviteCode) seenInvites.add(enriched.inviteCode.toLowerCase());
                                finalRecord = sanitizeRecord({
                                    ...enriched,
                                    approximateMemberCount: Math.max(
                                        enriched.approximateMemberCount || 0,
                                        candidate.approximateMemberCount || 0
                                    ),
                                    serverDescription: enriched.serverDescription || candidate.serverDescription,
                                    searchQuery: keyword
                                });
                            }

                            await Actor.pushData(sanitizeRecord(finalRecord));
                            discoveredForKeyword++;
                            stats.discoveredServers++;
                        }

                        if (newOnPage === 0) break;
                    }

                    // Stop expanding fallback sub-terms if exact query already yielded plenty
                    if (discoveredForKeyword >= Math.min(5, itemLimit)) break;
                }

                // Tier B: Secondary public directory (discord.me tag pages) with live Discord Invite verification
                if (discoveredForKeyword < itemLimit) {
                    const tagSlug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    if (tagSlug) {
                        try {
                            const meRes = await httpRequest(`https://discord.me/servers/tag/${tagSlug}`, {
                                accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
                                parseJson: false
                            });
                            const codes = extractInviteCodesFromHtml(meRes.text);
                            for (const code of codes) {
                                if (discoveredForKeyword >= itemLimit) break;
                                if (seenInvites.has(code.toLowerCase())) continue;
                                seenInvites.add(code.toLowerCase());

                                try {
                                    const server = await resolveInviteByCode(code);
                                    if (server && !seenGuildIds.has(server.id)) {
                                        seenGuildIds.add(server.id);
                                        server.searchQuery = keyword;
                                        await Actor.pushData(sanitizeRecord(server));
                                        discoveredForKeyword++;
                                        stats.discoveredServers++;
                                    }
                                } catch (_) {}
                            }
                        } catch (meErr) {
                            log.debug(`Secondary directory lookup skipped for tag "${tagSlug}": ${meErr.message}`);
                        }
                    }
                }

                if (discoveredForKeyword === 0) {
                    log.warning(`⚠️ Server finder discovered 0 communities for "${keyword}".`);
                    addDiagnostic(`Server finder "${keyword}" returned 0 results.`);
                    stats.failed++;
                } else {
                    log.info(`✅ Discovered & saved ${discoveredForKeyword} Discord communities for "${keyword}"`);
                }
            } catch (err) {
                log.error(`❌ Server finder failed for "${keyword}": ${err.message}`);
                addDiagnostic(`Server finder "${keyword}" -> ${err.message}`);
                stats.failed++;
            }
        }
    }

    const totalRecordsExtracted = stats.servers + stats.messages + stats.discoveredServers;
    const status = totalRecordsExtracted === 0
        ? 'FAILED'
        : (stats.failed > 0 ? 'PARTIAL_SUCCESS' : 'COMPLETED');

    const summary = {
        status,
        timestamp: new Date().toISOString(),
        metrics: stats,
        totalRecordsExtracted,
        diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
        message: totalRecordsExtracted === 0
            ? 'Discord Ultimate Scraper extracted 0 records. See diagnostics for details.'
            : (stats.failed > 0
                ? 'Discord Ultimate Scraper completed with partial failures (check diagnostics).'
                : 'Discord Ultimate Scraper completed successfully.')
    };

    await Actor.setValue('OUTPUT', summary);
    log.info('🏁 Execution Finished. Executive Summary:', summary);

    if (totalRecordsExtracted === 0) {
        const reasonSummary = diagnostics[0] || 'All targets failed or returned 0 extractable records.';
        await Actor.fail(`Extracted 0 Discord records. ${reasonSummary}`);
    } else {
        await Actor.exit();
    }
} catch (fatalErr) {
    log.error(`💥 Fatal Actor error: ${fatalErr.message}`, { stack: fatalErr.stack });
    await Actor.setValue('OUTPUT', {
        status: 'FAILED',
        timestamp: new Date().toISOString(),
        totalRecordsExtracted: 0,
        diagnostics: [fatalErr.message, ...diagnostics],
        message: `Fatal error: ${fatalErr.message}`
    }).catch(() => {});
    await Actor.fail(fatalErr.message);
}
