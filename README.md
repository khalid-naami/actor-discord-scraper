# 🎮 Discord Ultimate Scraper & Server Finder (Servers, Members, Online Counts & Messages)

High-speed, all-in-one Discord data extractor and community discovery engine on Apify. Extract **Public Discord Servers & Guilds** (total member counts, online presence, icons, banners, verification status), **Channel Messages & Chat History**, and **Automated Server Finder by Keyword** without needing a bot.

---

## ⚡ Key Features

- 🌐 **Zero Bot / Zero Token Required for Servers**: Resolves any Discord invite link (`discord.gg/...`, `discord.com/invite/...`) via Discord's public API to get real-time member counts and online presence without needing a bot in the server.
- 👥 **Server & Guild Intelligence**: Extract Server Name, Description, Total Members (`approximate_member_count`), Online Members (`approximate_presence_count`), Server Icons/Banners, Vanity URL, and Guild Features.
- 💬 **Channel Messages & History**: Extract messages with author usernames, avatars, bot flags, timestamps, attachments, and reaction counters.
- 🔍 **Automated Server Finder by Keyword**: Search and discover public Discord servers and communities based on any niche or keyword (e.g., *artificial intelligence*, *indie hackers*, *crypto alpha*, *gaming*).
- 📧 **Direct Lead Generation**: Automatically extracts business contact emails, phone numbers, and external links found in server descriptions and welcome text.
- 🛡️ **Blazing Speed & Anti-Throttling**: Lightweight direct API requests powered by `got-scraping` with Apify Proxy support.

---

## 📥 Input Configuration

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `mode` | String | `AUTO_DETECT` | Extraction mode: `AUTO_DETECT`, `SERVERS`, `MESSAGES`, `SERVER_FINDER`. |
| `targetUrls` | Array | `[...]` | List of Discord invite links (`https://discord.gg/python`, etc.). |
| `searchKeywords` | Array | `[]` | Keywords to discover public Discord servers across the web. |
| `channelIds` | Array | `[]` | Channel IDs to scrape message history from (requires `discordToken`). |
| `maxMessages` | Integer | `50` | Maximum messages to extract per channel. |
| `maxItems` | Integer | `30` | Maximum servers or discovery items to process. |
| `discordToken` | String | `""` | Optional Discord Bot or User token for private channel message scraping. |
| `proxyConfiguration` | Object | `{ useApifyProxy: true }` | Apify Residential proxy configuration (recommended). |

---

## 📤 Output Data Format

### 1. Discord Public Server Record

```json
{
  "type": "SERVER",
  "id": "267624335836053504",
  "url": "https://discord.gg/python",
  "inviteCode": "python",
  "serverName": "Python",
  "serverDescription": "The official Discord server for the Python programming language community. Contact: admins@pythondiscord.com",
  "approximateMemberCount": 385000,
  "approximatePresenceCount": 94000,
  "iconUrl": "https://cdn.discordapp.com/icons/267624335836053504/a_123.png?size=512",
  "bannerUrl": "https://cdn.discordapp.com/banners/267624335836053504/456.png?size=1024",
  "vanityUrlCode": "python",
  "features": [
    "COMMUNITY",
    "VERIFIED",
    "PARTNERED",
    "VANITY_URL",
    "DISCOVERABLE"
  ],
  "verificationLevel": 3,
  "emails": [
    "admins@pythondiscord.com"
  ],
  "scrapedAt": "2026-10-09T13:25:00.000Z"
}
```

### 2. Discord Channel Message Record

```json
{
  "type": "MESSAGE",
  "id": "123456789012345678",
  "messageId": "123456789012345678",
  "channelId": "987654321098765432",
  "url": "https://discord.com/channels/@me/987654321098765432/123456789012345678",
  "content": "Check out our latest release notes on GitHub!",
  "authorUsername": "dev_lead",
  "authorGlobalName": "Alex Rivera",
  "authorId": "112233445566778899",
  "isBot": false,
  "timestamp": "2026-10-09T11:45:00.000Z",
  "reactions": [
    { "emoji": "🚀", "count": 42 },
    { "emoji": "🎉", "count": 28 }
  ],
  "externalLinks": [
    "https://github.com/project/release/v2"
  ],
  "scrapedAt": "2026-10-09T13:25:00.000Z"
}
```

---

## 💼 Business & Lead Generation Use Cases

- **Developer & Web3 Community Sourcing**: Identify the largest and most active Discord servers in your tech stack.
- **Market Sizing & Community Tracking**: Track daily active member growth and engagement in target niche servers.
- **Partnership & Influencer Outreach**: Find server owners and community admins for sponsorships and co-marketing.

---

## 📄 License
Apache-2.0
