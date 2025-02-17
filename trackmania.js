import { fetch } from "bun";

const groupId = process.env.groupid;
const memberFile = Bun.file(".users.json");
const memberMap = await memberFile.json();

async function getAuthToken() {
    const response1 = await fetch('https://public-ubiservices.ubi.com/v3/profiles/sessions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Ubi-AppId': '86263886-327a-4328-ac69-527f0d20a237',
            'Authorization': `Basic ${process.env.userpw}`
        },
        body: JSON.stringify({ "audience": "NadeoLiveServices" })
    });

    const data1 = await response1.json();

    if (data1.httpCode === 429) {
        return new Response("Rate limiting hat gekickt", { status: 429 });
    }

    const response2 = await fetch('https://prod.trackmania.core.nadeo.online/v2/authentication/token/ubiservices', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `ubi_v1 t=${data1.ticket}`
        },
        body: JSON.stringify({ "audience": "NadeoLiveServices" })
    });

    const data2 = await response2.json();
    return { accessToken: data2.accessToken };
}

async function getCompleteMonth(token) {
    const response1 = await fetch('https://live-services.trackmania.nadeo.live/api/token/campaign/month?length=1&offset=0', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `nadeo_v1 t=${token}`
        }
    });

    const data1 = await response1.json();
    const leaderboardPromises = data1.monthList[0].days.map(day => {
        return fetch(`https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/Personal_Best/map/${day.mapUid}/club/${groupId}/top?length=10&offset=0`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `nadeo_v1 t=${token}`
            }
        }).then(response => response.json()).then(data2 => {
            const dayLeaderboard = data2.top?.map(entry => {
                const memberId = entry.accountId;
                const memberName = memberMap[memberId] || memberId;
                return { position: entry.position, name: memberName, score: entry.score / 1000 };
            }) || [];
            return { day: day.day, monthDay: day.monthDay, mapUid: day.mapUid, campaignId: day.campaignId, leaderboard: dayLeaderboard };
        });
    });

    const leaderboardResults = await Promise.all(leaderboardPromises);
    const leaderboard = [];
    leaderboardResults.forEach(result => {
        if (result.mapUid !== "") {
            leaderboard[result.day] = { day: result.day, mapUid: result.mapUid, leaderboard: result.leaderboard };
        }
    });

    const timePromises = leaderboard.map(day => {
        return fetch(`https://live-services.trackmania.nadeo.live/api/token/map/${day.mapUid}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `nadeo_v1 t=${token}`
            }
        }).then(response => response.json()).then(data => {
            const times = {
                gold: data.goldTime / 1000,
                silver: data.silverTime / 1000,
                bronze: data.bronzeTime / 1000
            };
            leaderboard[day.day].times = times;
        });
    });

    await Promise.all(timePromises);

    leaderboard.forEach(day => {
        day.leaderboard.forEach(entry => {
            if (entry.score <= day.times.gold) {
                entry.medal = "🥇";
            } else if (entry.score <= day.times.silver) {
                entry.medal = "🥈";
            } else if (entry.score <= day.times.bronze) {
                entry.medal = "🥉";
            } else {
                entry.medal = "💩";
            }
        });
    });

    return leaderboard;
}

const server = Bun.serve({
    port: 3015,
    async fetch(request) {
        const token = await getAuthToken();
        if (!token.accessToken) {
            return token;
        }

        let allMonth = await getCompleteMonth(token.accessToken);

        let leaderboard = [];
        allMonth.forEach(day => {
            day.leaderboard.forEach(entry => {
                let player = leaderboard.find(player => player.name === entry.name);
                if (!player) {
                    player = { name: entry.name, score: 0 };
                    leaderboard.push(player);
                }
                if (entry.score <= day.times.gold) {
                    player.score += 3;
                } else if (entry.score <= day.times.silver) {
                    player.score += 2;
                } else if (entry.score <= day.times.bronze) {
                    player.score += 1;
                }
            });
        });
        leaderboard.sort((a, b) => b.score - a.score);

        let page = `
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Trackmania Leaderboard</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-900 text-gray-100 font-sans">
            <div class="container w-full md:w-1/2 mx-auto px-4 py-8">
                <h1 class="text-4xl font-bold text-center text-blue-400 mb-8">Trackmania Leaderboard</h1>

                <div class="bg-gray-800 shadow-lg rounded-lg overflow-hidden mb-8 md:w-1/2 mx-auto">
                    <table class="w-full table-auto">
                        <thead class="bg-blue-600 text-white">
                            <tr>
                                <th class="px-4 py-2">Name</th>
                                <th class="px-4 py-2">Points</th>
                            </tr>
                        </thead>
                        <tbody>
                        ${(function fun() {
                let rows = "";
                leaderboard.forEach(entry => {
                    rows += `<tr class="border-b border-gray-700">
                                    <td class="px-4 py-2 text-center">${entry.name}</td>
                                    <td class="px-4 py-2 text-center">${entry.score}</td>
                                </tr>
                                `;
                });
                return rows;
            })()}
                        </tbody>
                    </table>
                </div>

                <br/>

                <div class="bg-gray-800 shadow-lg rounded-lg overflow-hidden md:w-2/3 mx-auto">
                    <table class="w-full table-auto">
                        <thead class="bg-green-600 text-white">
                            <tr>
                                <th class="px-4 py-2 w-2">#</th>
                                <th class="px-4 py-2 text-left">Map Times</th>
                                <th class="px-4 py-2 text-left">Leaderboard</th>
                            </tr>
                        </thead>
                        <tbody>
                        ${(function fun() {
                let rows = "";
                allMonth.forEach(day => {
                    let leaderboard = `<table class="w-full table-auto">`
                    day.leaderboard.forEach(entry => {
                        leaderboard += `<tr><td><span class="w-6 h-6 mr-2 inline-flex items-center justify-center bg-blue-500 rounded-full text-xs font-bold">${entry.position}</span></td> <td class="${entry.medal === '🥇' ? 'font-bold' : ''}">${entry.name}</td><td class="${entry.medal === '🥇' ? 'font-bold' : ''}">${entry.score}s</td><td> (${entry.medal})</td></tr>`;
                    });
                    leaderboard += `</table>`;

                    let times = `<ul class="space-y-1">`;
                    times += `<li class="flex items-center"><span class="w-4 h-4 mr-2 inline-flex items-center justify-center bg-yellow-400 text-yellow-900 rounded-full text-xs font-bold">G</span>${day.times.gold}s</li>`;
                    times += `<li class="flex items-center"><span class="w-4 h-4 mr-2 inline-flex items-center justify-center bg-gray-300 text-gray-800 rounded-full text-xs font-bold">S</span>${day.times.silver}s</li>`;
                    times += `<li class="flex items-center"><span class="w-4 h-4 mr-2 inline-flex items-center justify-center bg-yellow-600 text-yellow-100 rounded-full text-xs font-bold">B</span>${day.times.bronze}s</li>`;
                    times += `</ul>`;

                    rows += `<tr class="border-b border-gray-700">
                                    <td class="px-4 py-2 text-center">${day.day + 1}</td>
                                    <td class="px-4 py-2 text-center">${times}</td>
                                    <td class="px-4 py-2 text-center">${leaderboard}</td>    
                                </tr>
                                `;
                });
                return rows;
            })()}
                        </tbody>
                    </table>
                </div>
            </div>
        </body>
        </html>
        `;

        return new Response(page, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
            }
        });
    },
});