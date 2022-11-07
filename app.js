"use strict";
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, useMultiFileAuthState } = require("@adiwajshing/baileys")
const QRCode = require('qrcode')
const fs = require("fs")
const loge = require('pino')
const express = require("express")
const http = require("http")
let config = JSON.parse(fs.readFileSync('./config.json'))

const port = config.port;
const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(
    express.urlencoded({
        extended: true,
    })
);

app.set('view engine', 'ejs')

const useStore = !process.argv.includes('--no-store')
const store = useStore ? makeInMemoryStore({ logeer: loge().child({ level: config.levelLog, stream: 'store' }) }) : undefined

const connectWa = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('session_' + config.sessionName)
    const { version } = await fetchLatestBaileysVersion()
    console.clear()
    console.log()
    console.log('' + config.name + '',)
    console.log(`WhatsApp v${version.join('.')}`)
    console.log(`App running on http://${config.appUrl}:${port}`);

    const conn = makeWASocket({
        logeer: loge({ level: config.levelLog }),
        auth: state,
        printQRInTerminal: true,
        browser: [config.desc, "MacOS", "3.0"],
    })
    store.bind(conn.ev)
    conn.multi = true
    var qrcodes = ""

    conn.ev.process(
        async (events) => {
            if (events['connection.update']) {
                const update = events['connection.update']
                const { connection, lastDisconnect, qr } = update
                if (connection === 'close') {
                    console.log('Server Ready ✓')
                    // restore session
                    if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.logeedOut) {
                        connectWa()
                    } else {
                        console.log('WhatsApp disconnected...')
                        fs.rmSync('session_' + config.sessionName, { recursive: true, force: true }); 
                        connectWa()
                    }
                }
                if (qr) {
                    var qrcode = await QRCode.toDataURL(qr);
                    qrcodes = qrcode
                    // console.log(qrcodes)
                }
            }
            if (events['creds.update']) {
                saveCreds()
            }

            if (events.call) {
                console.log('recv call event', events.call)
            }
            
            if (events['chats.set']) {
                const { chats, isLatest } = events['chats.set']
                console.log(`recv ${chats.length} chats (is latest: ${isLatest})`)
            }

            if (events['messages.set']) {
                const { messages, isLatest } = events['messages.set']
                console.log(`recv ${messages.length} messages (is latest: ${isLatest})`)
            }

            if (events['contacts.set']) {
                const { contacts, isLatest } = events['contacts.set']
                console.log(`recv ${contacts.length} contacts (is latest: ${isLatest})`)
            }

            if (events['messages.upsert']) {
                const upsert = events['messages.upsert']
                console.log('recv messages ', JSON.stringify(upsert, undefined, 2))
            }

            if (events['messages.update']) {
                console.log('message update ', events['messages.update'])
            }

            if (events['message-receipt.update']) {
                console.log('message receipt update ', events['message-receipt.update'])
            }

            if (events['messages.reaction']) {
                console.log('message reaction ', events['messages.reaction'])
            }

            if (events['presence.update']) {
                console.log('presence update ', events['presence.update'])
            }

            if (events['chats.update']) {
                console.log('chat update ', events['chats.update'])
            }

            if (events['chats.delete']) {
                console.log('chats deleted ', events['chats.delete'])
            }

        })

    app.get("/info", async (req, res) => {
        res.status(200).json({
            status: true,
            response: conn.user,
        });
    });
    app.get("/qr", async (req, res) => {
        res.status(200).render('qrcode', {
            qrcode: qrcodes,
        });
    });

    return conn
}
connectWa().catch(err => console.log(err))
 
server.listen(port, function () {
    console.log(`App running on http://${config.appUrl}:${port}`);
});
