//          / __ \____ _(_)   _____  ____/ /
//         / / / / __ `/ / | / / _ \/ __  /
//        / /_/ / /_/ / /| |/ /  __/ /_/ /
//       /_____/\__,_/_/ |___/\___/\__,_/

const electron = require('electron');
const { app, BrowserWindow, ipcMain } = electron;
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const https = require('https');
const { exec, execSync } = require('child_process');
const DiscordRPC = require('discord-rpc');

const isDev = !app.isPackaged;

// Replace this with your Discord Application Client ID from https://discord.com/developers/applications
const DISCORD_CLIENT_ID = '1382097609560166400';

DiscordRPC.register(DISCORD_CLIENT_ID);
const rpc = new DiscordRPC.Client({ transport: 'ipc' });
const rpcStartTime = new Date();

const PAGE_LABELS = {
    0: 'Home',
    2: 'Rank Editor',
    3: 'Skin Changer',
    4: 'Authorize',
    5: 'Customize',
    6: 'Account Manager',
    7: 'Cosmetics',
    8: 'Agent Locker',
};

const QUEUE_LABELS = {
    'competitive': 'Competitive',
    'unrated': 'Unrated',
    'spikerush': 'Spike Rush',
    'deathmatch': 'Deathmatch',
    'escalation': 'Escalation',
    'replication': 'Replication',
    'swiftplay': 'Swiftplay',
    'premier': 'Premier',
    'hurm': 'Team Deathmatch',
    'onefa': '1v1',
};

let currentPageLabel = 'Home';
let valorantGameState = null;

function formatQueue(queueId) {
    if (!queueId) return null;
    return QUEUE_LABELS[queueId.toLowerCase()] || (queueId.charAt(0).toUpperCase() + queueId.slice(1));
}

function setDiscordActivity() {
    if (!rpc) return;
    let details, state;

    if (valorantGameState && valorantGameState.sessionState === 'INGAME') {
        details = 'In a Match';
        const queue = formatQueue(valorantGameState.queueId);
        const size = valorantGameState.partySize;
        state = [queue, size > 1 ? `${size} in Party` : null].filter(Boolean).join(' · ') || 'Playing';
    } else if (valorantGameState && valorantGameState.sessionState === 'PREGAME') {
        details = 'Agent Select';
        const queue = formatQueue(valorantGameState.queueId);
        const size = valorantGameState.partySize;
        state = [queue, size > 1 ? `${size} in Party` : null].filter(Boolean).join(' · ') || 'Choosing Agent';
    } else if (valorantGameState) {
        details = 'In Valorant';
        const size = valorantGameState.partySize;
        state = size > 1 ? `${size} in Party` : 'In Menus';
    } else {
        details = currentPageLabel !== 'Home' ? `Browsing ${currentPageLabel}` : 'In the App';
        state = "Oxyn Valorant";
    }

    rpc.setActivity({
        details,
        state,
        startTimestamp: rpcStartTime,
        largeImageKey: 'logo',
        largeImageText: "Oxyn Valorant",
        instance: false,
    }).catch(() => {});
}

async function fetchValorantGameState() {
    if (!axiosClient || !playerUUid) {
        valorantGameState = null;
        return;
    }
    try {
        const res = await axiosClient.get('/chat/v4/presences');
        const myPresence = res.data.presences.find(p => p.puuid === playerUUid);
        if (!myPresence) { valorantGameState = null; return; }
        const priv = JSON.parse(Buffer.from(myPresence.private, 'base64').toString('utf8'));
        const pd = priv.playerPresenceData || priv;
        valorantGameState = {
            sessionState: priv.sessionLoopState || pd.sessionLoopState || 'MENUS',
            queueId: priv.queueId || pd.queueId || null,
            partySize: priv.partySize || pd.partySize || 0,
        };
    } catch (e) {
        valorantGameState = null;
    }
}

async function updateRpc() {
    await fetchValorantGameState();
    setDiscordActivity();
}

rpc.on('ready', () => {
    updateRpc();
    setInterval(updateRpc, 15e3);
});

rpc.login({ clientId: DISCORD_CLIENT_ID }).catch(() => {});

require('@electron/remote/main').initialize();

var mainWindow, axiosClient, accessToken, entitlementsToken, playerUUid, riotClientVersion, shard, configEndpoint, coreGameUrl, playerUrl;
var accountsFilePath, agentLockerConfigPath;
var agentLockerConfig = { enabled: false, agentUuid: null };
var agentLockerLocked = false;
var agentLockerInterval = null;

function readAgentLockerConfig() {
    try {
        if (agentLockerConfigPath && fs.existsSync(agentLockerConfigPath)) {
            return JSON.parse(fs.readFileSync(agentLockerConfigPath, 'utf8'));
        }
    } catch (e) {}
    return { enabled: false, agentUuid: null };
}

function saveAgentLockerConfig(cfg) {
    if (agentLockerConfigPath) fs.writeFileSync(agentLockerConfigPath, JSON.stringify(cfg, null, 2));
}

function startAgentLockerPolling() {
    if (agentLockerInterval) return;
    agentLockerInterval = setInterval(async () => {
        if (!agentLockerConfig.enabled || !agentLockerConfig.agentUuid || !axiosClient || !playerUUid) {
            agentLockerLocked = false;
            return;
        }
        try {
            const preRes = await axiosClient.get(`pregame/v1/players/${playerUUid}`);
            const matchId = preRes.data.MatchID;
            if (!matchId) { agentLockerLocked = false; return; }
            if (agentLockerLocked) return;
            await axiosClient.post(`pregame/v1/matches/${matchId}/select/${agentLockerConfig.agentUuid}`);
            await axiosClient.post(`pregame/v1/matches/${matchId}/lock/${agentLockerConfig.agentUuid}`);
            agentLockerLocked = true;
            console.log('Agent locked:', agentLockerConfig.agentUuid);
        } catch (e) {
            agentLockerLocked = false;
        }
    }, 2000);
}

function readAccounts() {
    try {
        if (accountsFilePath && fs.existsSync(accountsFilePath)) {
            return JSON.parse(fs.readFileSync(accountsFilePath, 'utf8'));
        }
    } catch (e) {}
    return [];
}

function saveAccountsList(accounts) {
    if (accountsFilePath) fs.writeFileSync(accountsFilePath, JSON.stringify(accounts, null, 2));
}

app.on('window-all-closed', () => { app.quit(); });
app.on('before-quit', () => { rpc.destroy().catch(() => {}); });

app.whenReady().then(() => {
    accountsFilePath = path.join(app.getPath('userData'), 'accounts.json');
    agentLockerConfigPath = path.join(app.getPath('userData'), 'agentLockerConfig.json');
    agentLockerConfig = readAgentLockerConfig();
    startAgentLockerPolling();
    axios.get('https://valorant-api.com/v1/version').then(res => {
        riotClientVersion = res.data.data.riotClientVersion;
    })
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        resizable: false,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: !isDev
        }
    });
    require('@electron/remote/main').enable(mainWindow.webContents);
    mainWindow.setMenu(null);
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
    }
});

ipcMain.on('localfolder', () => {
    mainWindow.webContents.send('localfolder', process.env.LOCALAPPDATA);
})

ipcMain.on('rpc:pageUpdate', (event, pageId) => {
    currentPageLabel = PAGE_LABELS[pageId] || 'Home';
    setDiscordActivity();
})

ipcMain.on('rankUpdate', (event, arg1, arg2) => {
    if (!axiosClient) return mainWindow.webContents.send('unauthorized');
    const Tier = arg1;
    const LeaderboardPos = arg2;

    axiosClient.get('/chat/v4/presences').then(res => {
        const myPresence = res.data.presences.find(p => p.puuid === playerUUid);
        if (!myPresence) return console.log('Presence not found, puuid:', playerUUid);

        const privateData = JSON.parse(Buffer.from(myPresence.private, 'base64').toString('utf8'));

        privateData.playerPresenceData.competitiveTier = Tier;
        if (LeaderboardPos !== undefined) privateData.playerPresenceData.leaderboardPosition = LeaderboardPos;

        axiosClient.put('/chat/v2/me', {
            state: myPresence.state,
            private: Buffer.from(JSON.stringify(privateData)).toString('base64'),
            shared: {
                actor: "",
                details: "",
                location: "",
                product: "valorant",
                time: new Date().valueOf() + 35000
            }
        }).then(() => {
            console.log('Rank update success!');
        }).catch(err => {
            console.log('Rank update error:', err.message);
            console.log('Error response:', err.response?.data);
        });
    }).catch(err => console.log('Presence fetch error:', err.message));
});

ipcMain.on('profileUpdate', async (event, data) => {
    if (!axiosClient) return mainWindow.webContents.send('unauthorized');

    try {
        const presenceRes = await axiosClient.get('/chat/v4/presences');
        const myPresence = presenceRes.data.presences.find(p => p.puuid === playerUUid);
        if (myPresence) {
            const privateData = JSON.parse(Buffer.from(myPresence.private, 'base64').toString('utf8'));

            if (data.accountLevel !== undefined) privateData.playerPresenceData.accountLevel = data.accountLevel;
            if (data.leaderboardPosition !== undefined) privateData.playerPresenceData.leaderboardPosition = data.leaderboardPosition;
            if (data.isIdle !== undefined) privateData.isIdle = data.isIdle;
            if (data.playerCardId) privateData.playerPresenceData.playerCardId = data.playerCardId;
            if (data.playerTitleId !== undefined) privateData.playerPresenceData.playerTitleId = data.playerTitleId;

            await axiosClient.put('/chat/v2/me', {
                state: myPresence.state,
                private: Buffer.from(JSON.stringify(privateData)).toString('base64'),
                shared: {
                    actor: "",
                    details: "",
                    location: "",
                    product: "valorant",
                    time: new Date().valueOf() + 35000
                }
            });
            console.log('Presence updated');
        }
    } catch (err) { console.log('Presence update error:', err.message); }

    console.log('profileUpdate data received:', JSON.stringify(data));
    if (playerUrl) {
        const pdHeaders = {
            'Authorization': 'Bearer ' + accessToken,
            'X-Riot-Entitlements-JWT': entitlementsToken,
            'X-Riot-ClientVersion': riotClientVersion,
            'X-Riot-ClientPlatform': 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuNzY4LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
            'Content-Type': 'application/json'
        };
        let loadout = null, loadoutVer = null;
        for (const ver of ['v3', 'v2']) {
            try {
                const r = await axios.get(`${playerUrl}/personalization/${ver}/players/${playerUUid}/playerloadout`, { headers: pdHeaders });
                loadout = r.data; loadoutVer = ver;
                console.log(`Loadout fetched via ${ver}, Identity:`, JSON.stringify(loadout.Identity));
                break;
            } catch (e) { console.log(`Loadout GET ${ver}:`, e.response?.status, e.message); }
        }
        if (loadout?.Identity) {
            if (data.playerCardId) loadout.Identity.PlayerCardID = data.playerCardId;
            if (data.playerTitleId !== undefined) loadout.Identity.PlayerTitleID = data.playerTitleId;
            if (data.preferredLevelBorderId) loadout.Identity.PreferredLevelBorderID = data.preferredLevelBorderId;
            if (data.accountLevel !== undefined) loadout.Identity.AccountLevel = data.accountLevel;
            console.log('Identity after update:', JSON.stringify(loadout.Identity));
            try {
                await axios.put(`${playerUrl}/personalization/${loadoutVer}/players/${playerUUid}/playerloadout`, loadout, { headers: pdHeaders });
                console.log('Loadout PUT success');
            } catch (err) {
                console.log('Loadout PUT error:', err.response?.status, err.message);
                console.log('Error response:', JSON.stringify(err.response?.data));
            }
        } else {
            console.log('No Identity in loadout or loadout fetch failed');
        }
    } else {
        console.log('playerUrl not set — cannot update loadout');
    }
});

ipcMain.on('auth', async (event, port, password) => {
    axiosClient = axios.create({
        baseURL: `https://127.0.0.1:${port}/`,
        timeout: 5000,
        headers: {
            common: {
                'User-Agent': 'ShooterGame/8 Windows/10.0.19042.1.768.64bit',
                'X-Riot-ClientPlatform': 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuNzY4LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
                'X-Riot-ClientVersion': riotClientVersion,
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`riot:${password}`).toString('base64')
            }
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        })
    });

    axiosClient.get('product-session/v1/external-sessions').then(res => {
        const valorantSession = Object.values(res.data).find(s => s.productId === 'valorant');
        if (valorantSession) {
            const args = valorantSession.launchConfiguration?.arguments || [];
            args.forEach(arg => {
                if (arg.includes('-ares-deployment')) shard = arg.split("=")[1];
                else if (arg.includes("-config-endpoint")) configEndpoint = arg.split("=")[1];
            });
        }

        if (shard) {
            setUrls(shard);
        } else {
            getShardFallback();
        }
    }).catch(err => {
        console.log('External sessions error:', err.message);
        getShardFallback();
    });

    function setUrls(s) {
        coreGameUrl = `https://glz-${s}-1.${s}.a.pvp.net`;
        playerUrl = `https://pd.${s}.a.pvp.net`;
        console.log('coreGameUrl:', coreGameUrl);
        console.log('playerUrl:', playerUrl);
    }

    async function getShardFallback() {
        try {
            const r = await axiosClient.get('chat/v1/session');
            const region = r.data?.region;
            if (region) {
                shard = region.replace(/\d/g, '');
                setUrls(shard);
                return;
            }
        } catch (e) { console.log('chat/v1/session fallback failed:', e.message); }
        console.log('Could not determine shard/region');
    }

    try {
        const entitlementsRes = await axiosClient.get('entitlements/v1/token');
        accessToken = entitlementsRes.data.accessToken;
        entitlementsToken = entitlementsRes.data.token;

        const userRes = await axios.get('https://auth.riotgames.com/userinfo', {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        playerUUid = userRes.data.sub;

        setTimeout(() => {
            mainWindow.webContents.send('userAuth', userRes.data);
        }, 500);

    } catch (err) {
        console.log('Auth Error:', err.message || err);
        mainWindow.webContents.send('unauthorized');
    }
})

ipcMain.on('equip', async (event, skinUid) => {
    if (!axiosClient) return mainWindow.webContents.send('unauthorized');
    if (!playerUrl) {
        console.log('playerUrl not set yet, playerUrl:', playerUrl, 'shard:', shard);
        return mainWindow.webContents.send('unauthorized');
    }

    const pdHeaders = {
        'Authorization': 'Bearer ' + accessToken,
        'X-Riot-Entitlements-JWT': entitlementsToken,
        'X-Riot-ClientVersion': riotClientVersion,
        'X-Riot-ClientPlatform': 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuNzY4LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
        'Content-Type': 'application/json'
    };

    let loadout = null;
    let loadoutVersion = null;
    for (const ver of ['v3', 'v2']) {
        try {
            const res = await axios.get(`${playerUrl}/personalization/${ver}/players/${playerUUid}/playerloadout`, { headers: pdHeaders });
            loadout = res.data;
            loadoutVersion = ver;
            console.log(`Loadout fetched via ${ver}`);
            break;
        } catch (err) {
            console.log(`Loadout GET ${ver} error:`, err.response?.status, err.message);
        }
    }

    if (!loadout) return console.log('Could not fetch loadout');

    const weaponsRes = await axios.get('https://valorant-api.com/v1/weapons').catch(e => null);
    if (!weaponsRes) return console.log('Could not fetch weapons from valorant-api');

    const gun = weaponsRes.data.data.find(weapon =>
        weapon.skins.some(skin => skin.uuid.toLowerCase() === skinUid.toLowerCase())
    );
    if (!gun) return console.log('Gun not found for skin:', skinUid);

    const skinData = gun.skins.find(skin => skin.uuid.toLowerCase() === skinUid.toLowerCase());
    const guns = loadout.Guns || loadout.guns;
    if (!guns) return console.log('No Guns array in loadout response');

    const gunInLoadout = guns.find(g => (g.ID || g.id)?.toLowerCase() === gun.uuid.toLowerCase());
    if (!gunInLoadout) return console.log('Gun not found in loadout:', gun.uuid);

    const skinLevel = skinData.levels?.[0]?.uuid;
    const skinChroma = skinData.chromas?.[0]?.uuid;

    if ('SkinID' in gunInLoadout || !('skinId' in gunInLoadout)) gunInLoadout.SkinID = skinData.uuid;
    if ('skinId' in gunInLoadout) gunInLoadout.skinId = skinData.uuid;
    if (skinLevel) {
        if ('SkinLevelID' in gunInLoadout || !('skinLevelId' in gunInLoadout)) gunInLoadout.SkinLevelID = skinLevel;
        if ('skinLevelId' in gunInLoadout) gunInLoadout.skinLevelId = skinLevel;
    }
    if (skinChroma) {
        if ('ChromaID' in gunInLoadout || !('chromaId' in gunInLoadout)) gunInLoadout.ChromaID = skinChroma;
        if ('chromaId' in gunInLoadout) gunInLoadout.chromaId = skinChroma;
    }

    axios.put(`${playerUrl}/personalization/${loadoutVersion}/players/${playerUUid}/playerloadout`, loadout, {
        headers: pdHeaders
    }).then(() => console.log('Skin equipped successfully!'))
        .catch(err => console.log('Equip PUT error:', err.response?.status, err.message));
})

process.on("unhandledRejection", async (reason, p, origin) => {
    console.log(reason.stack);
});

process.on("uncaughtExceptionMonitor", async (err, origin) => {
    console.log(err.stack);
});

// ── Account Switcher ────────────────────────────────────────────────────────

function findFileRecursive(dir, filename, maxDepth = 5) {
    if (maxDepth <= 0) return null;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
    for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return fullPath;
        if (entry.isDirectory()) {
            const found = findFileRecursive(fullPath, filename, maxDepth - 1);
            if (found) return found;
        }
    }
    return null;
}

ipcMain.on('accountSwitcher:getAccounts', (event) => {
    event.reply('accountSwitcher:accounts', readAccounts());
});

ipcMain.on('accountSwitcher:import', async (event) => {
    const localAppData = process.env.LOCALAPPDATA;
    const lockfilePath = path.join(localAppData, 'Riot Games', 'Riot Client', 'Config', 'lockfile');

    let lockfileData;
    try {
        lockfileData = fs.readFileSync(lockfilePath, 'utf8');
    } catch (e) {
        return event.reply('accountSwitcher:importResult', { success: false, error: 'Riot Client not found. Make sure Valorant is running.' });
    }

    const parts = lockfileData.split(':');
    const port = parts[2];
    const password = parts[3];

    const tempClient = axios.create({
        baseURL: `https://127.0.0.1:${port}/`,
        timeout: 5000,
        headers: { common: { 'Authorization': 'Basic ' + Buffer.from(`riot:${password}`).toString('base64'), 'Content-Type': 'application/json' } },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    let userInfo;
    try {
        const entRes = await tempClient.get('entitlements/v1/token');
        const accessTok = entRes.data.accessToken;
        const userRes = await axios.get('https://auth.riotgames.com/userinfo', { headers: { 'Authorization': 'Bearer ' + accessTok } });
        userInfo = userRes.data;
    } catch (e) {
        return event.reply('accountSwitcher:importResult', { success: false, error: 'Could not get account info: ' + e.message });
    }

    // Try to grab the Riot Client exe path while it's still running.
    // WMIC is removed in some Windows 11 builds, so fall back to PowerShell.
    let riotClientExe = '';
    try {
        const wmicOut = execSync('wmic process where "name=\'RiotClientServices.exe\'" get ExecutablePath /format:value', { timeout: 5000 }).toString();
        const match = wmicOut.match(/ExecutablePath=(.+)/i);
        if (match) riotClientExe = match[1].trim();
    } catch (e) {}
    if (!riotClientExe) {
        try {
            const psOut = execSync('powershell -NoProfile -Command "(Get-Process RiotClientServices -ErrorAction SilentlyContinue | Select-Object -First 1).Path"', { timeout: 5000 }).toString();
            const ps = psOut.trim();
            if (ps) riotClientExe = ps;
        } catch (e) {}
    }

    // Derive the Riot Client base directory from the lockfile we already found.
    // The lockfile is always at …/Riot Client/Config/lockfile, so two dirname()
    // calls give us the …/Riot Client root. We verify the directory exists before
    // using it so an unexpected path structure falls through to the other search roots.
    const riotClientDir = path.dirname(path.dirname(lockfilePath));
    const riotClientDirValid = fs.existsSync(riotClientDir);

    const appData = process.env.APPDATA || '';
    const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';

    const candidatePaths = [
        // Paths derived directly from the known Riot Client directory (most reliable).
        ...(riotClientDirValid ? [
            path.join(riotClientDir, 'Data', 'RiotClientPrivateSettings.yaml'),
            path.join(riotClientDir, 'Config', 'RiotClientPrivateSettings.yaml'),
            path.join(riotClientDir, 'RiotClientPrivateSettings.yaml'),
        ] : []),
        // Standard LOCALAPPDATA / APPDATA paths.
        path.join(localAppData, 'Riot Games', 'Riot Client', 'Data', 'RiotClientPrivateSettings.yaml'),
        path.join(appData, 'Riot Games', 'Riot Client', 'Data', 'RiotClientPrivateSettings.yaml'),
        path.join(localAppData, 'Riot Games', 'Riot Client', 'Config', 'RiotClientPrivateSettings.yaml'),
        path.join(appData, 'Riot Games', 'Riot Client', 'Config', 'RiotClientPrivateSettings.yaml'),
        // ProgramData fallback.
        path.join(programData, 'Riot Games', 'Riot Client', 'Data', 'RiotClientPrivateSettings.yaml'),
        path.join(programData, 'Riot Games', 'Riot Client', 'Config', 'RiotClientPrivateSettings.yaml'),
    ];

    // If we found the exe, also search relative to it (handles non-default install drives).
    if (riotClientExe) {
        const exeDir = path.dirname(riotClientExe);
        candidatePaths.push(
            path.join(exeDir, 'Data', 'RiotClientPrivateSettings.yaml'),
            path.join(exeDir, 'Config', 'RiotClientPrivateSettings.yaml'),
        );
    }

    let settingsSrc = candidatePaths.find(p => fs.existsSync(p));
    if (!settingsSrc) {
        // Broad recursive search across all known Riot Games roots.
        const searchRoots = [
            ...(riotClientDirValid ? [riotClientDir] : []),
            path.join(localAppData, 'Riot Games'),
            path.join(appData, 'Riot Games'),
            path.join(programData, 'Riot Games'),
        ];
        if (riotClientExe) searchRoots.push(path.dirname(riotClientExe));
        for (const baseDir of searchRoots) {
            const found = findFileRecursive(baseDir, 'RiotClientPrivateSettings.yaml');
            if (found) { settingsSrc = found; break; }
        }
    }
    if (!settingsSrc) {
        return event.reply('accountSwitcher:importResult', {
            success: false,
            error: 'Could not find RiotClientPrivateSettings.yaml. Make sure Valorant is running and try again.'
        });
    }

    const accountsDataDir = path.join(app.getPath('userData'), 'accounts');
    if (!fs.existsSync(accountsDataDir)) fs.mkdirSync(accountsDataDir, { recursive: true });
    const savedSettingsPath = path.join(accountsDataDir, userInfo.sub + '.yaml');

    try {
        fs.copyFileSync(settingsSrc, savedSettingsPath);
    } catch (e) {
        return event.reply('accountSwitcher:importResult', { success: false, error: 'Failed to copy session data: ' + e.message });
    }

    const accounts = readAccounts();
    const existingIdx = accounts.findIndex(a => a.puuid === userInfo.sub);
    const account = {
        puuid: userInfo.sub,
        gameName: userInfo.acct?.game_name || '',
        tagLine: userInfo.acct?.tag_line || '',
        riotClientExe,
        settingsFile: savedSettingsPath,
        importedAt: new Date().toISOString()
    };
    if (existingIdx >= 0) {
        accounts[existingIdx] = account;
    } else {
        accounts.push(account);
    }
    saveAccountsList(accounts);

    event.reply('accountSwitcher:importResult', { success: true, accounts });
});

ipcMain.on('accountSwitcher:launch', async (event, puuid) => {
    const accounts = readAccounts();
    const account = accounts.find(a => a.puuid === puuid);
    if (!account) return event.reply('accountSwitcher:launchResult', { success: false, error: 'Account not found.' });

    const localAppData = process.env.LOCALAPPDATA;
    const settingsDest = path.join(localAppData, 'Riot Games', 'Riot Client', 'Data', 'RiotClientPrivateSettings.yaml');

    // Kill Riot processes
    for (const proc of ['RiotClientUx.exe', 'RiotClientServices.exe', 'RiotClient.exe', 'VALORANT-Win64-Shipping.exe']) {
        try { execSync(`taskkill /f /im "${proc}"`, { timeout: 5000 }); } catch (e) {}
    }

    // Give the OS time to fully release file locks before restoring the session file
    await new Promise(r => setTimeout(r, 1500));

    try {
        fs.copyFileSync(account.settingsFile, settingsDest);
    } catch (e) {
        return event.reply('accountSwitcher:launchResult', { success: false, error: 'Failed to restore session: ' + e.message });
    }

    const candidates = [
        account.riotClientExe,
        'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
        'C:\\Program Files\\Riot Games\\Riot Client\\RiotClientServices.exe',
        'C:\\Program Files (x86)\\Riot Games\\Riot Client\\RiotClientServices.exe',
    ].filter(Boolean);

    let launched = false;
    for (const exePath of candidates) {
        if (exePath && fs.existsSync(exePath)) {
            exec(`"${exePath}"`);
            launched = true;
            break;
        }
    }

    event.reply('accountSwitcher:launchResult', { success: launched, error: launched ? null : 'Riot Client executable not found.' });
});

ipcMain.on('accountSwitcher:delete', (event, puuid) => {
    const accountsDataDir = path.join(app.getPath('userData'), 'accounts');
    const savedSettingsPath = path.join(accountsDataDir, puuid + '.yaml');
    try { fs.unlinkSync(savedSettingsPath); } catch (e) {}

    const accounts = readAccounts().filter(a => a.puuid !== puuid);
    saveAccountsList(accounts);
    event.reply('accountSwitcher:accounts', accounts);
});

// ── Cosmetics: Sprays ────────────────────────────────────────────────────────

ipcMain.on('equipSprays', async (event, sprayUuids) => {
    if (!axiosClient) return mainWindow.webContents.send('unauthorized');
    if (!playerUrl) return mainWindow.webContents.send('unauthorized');

    const pdHeaders = {
        'Authorization': 'Bearer ' + accessToken,
        'X-Riot-Entitlements-JWT': entitlementsToken,
        'X-Riot-ClientVersion': riotClientVersion,
        'X-Riot-ClientPlatform': 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuNzY4LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
        'Content-Type': 'application/json'
    };

    let loadout = null, loadoutVer = null;
    for (const ver of ['v3', 'v2']) {
        try {
            const r = await axios.get(`${playerUrl}/personalization/${ver}/players/${playerUUid}/playerloadout`, { headers: pdHeaders });
            loadout = r.data; loadoutVer = ver;
            break;
        } catch (e) { console.log(`Spray loadout GET ${ver}:`, e.response?.status, e.message); }
    }
    if (!loadout) return console.log('Could not fetch loadout for sprays');

    const spraysArr = loadout.Sprays || loadout.sprays;
    if (!spraysArr) return console.log('No Sprays array in loadout');

    sprayUuids.forEach((uuid, i) => {
        if (!uuid || !spraysArr[i]) return;
        if ('SprayID' in spraysArr[i]) spraysArr[i].SprayID = uuid;
        if ('sprayId' in spraysArr[i]) spraysArr[i].sprayId = uuid;
        if ('SprayLevelID' in spraysArr[i]) spraysArr[i].SprayLevelID = null;
        if ('sprayLevelId' in spraysArr[i]) spraysArr[i].sprayLevelId = null;
    });

    axios.put(`${playerUrl}/personalization/${loadoutVer}/players/${playerUUid}/playerloadout`, loadout, { headers: pdHeaders })
        .then(() => console.log('Sprays equipped successfully!'))
        .catch(err => console.log('Sprays PUT error:', err.response?.status, err.message));
});

// ── Cosmetics: Gun Buddies ───────────────────────────────────────────────────

ipcMain.on('equipBuddy', async (event, { gunUuid, buddyUuid, buddyLevelUuid }) => {
    if (!axiosClient) return mainWindow.webContents.send('unauthorized');
    if (!playerUrl) return mainWindow.webContents.send('unauthorized');

    const pdHeaders = {
        'Authorization': 'Bearer ' + accessToken,
        'X-Riot-Entitlements-JWT': entitlementsToken,
        'X-Riot-ClientVersion': riotClientVersion,
        'X-Riot-ClientPlatform': 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuNzY4LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
        'Content-Type': 'application/json'
    };

    let loadout = null, loadoutVer = null;
    for (const ver of ['v3', 'v2']) {
        try {
            const r = await axios.get(`${playerUrl}/personalization/${ver}/players/${playerUUid}/playerloadout`, { headers: pdHeaders });
            loadout = r.data; loadoutVer = ver;
            break;
        } catch (e) { console.log(`Buddy loadout GET ${ver}:`, e.response?.status, e.message); }
    }
    if (!loadout) return console.log('Could not fetch loadout for buddy');

    const guns = loadout.Guns || loadout.guns;
    if (!guns) return console.log('No Guns array in loadout');

    const gun = guns.find(g => (g.ID || g.id)?.toLowerCase() === gunUuid.toLowerCase());
    if (!gun) return console.log('Gun not found in loadout:', gunUuid);

    if ('CharmID' in gun || !('charmId' in gun)) gun.CharmID = buddyUuid;
    if ('charmId' in gun) gun.charmId = buddyUuid;
    if (buddyLevelUuid) {
        if ('CharmLevelID' in gun || !('charmLevelId' in gun)) gun.CharmLevelID = buddyLevelUuid;
        if ('charmLevelId' in gun) gun.charmLevelId = buddyLevelUuid;
    }
    gun.CharmInstanceID = gun.CharmInstanceID || null;
    if ('charmInstanceId' in gun) gun.charmInstanceId = gun.charmInstanceId || null;

    axios.put(`${playerUrl}/personalization/${loadoutVer}/players/${playerUUid}/playerloadout`, loadout, { headers: pdHeaders })
        .then(() => console.log('Buddy equipped successfully!'))
        .catch(err => console.log('Buddy PUT error:', err.response?.status, err.message));
});

// ── Agent Locker ─────────────────────────────────────────────────────────────

ipcMain.on('agentLocker:getConfig', (event) => {
    event.reply('agentLocker:config', agentLockerConfig);
});

ipcMain.on('agentLocker:setConfig', (event, cfg) => {
    agentLockerConfig = cfg;
    agentLockerLocked = false;
    saveAgentLockerConfig(cfg);
});
