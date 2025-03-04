const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (text.startsWith('ban ')) {
            return sock.sendMessage(from, { text: `@${sender.split('@')[0]} has been banned!` }, { quoted: msg });
        }
        if (text.startsWith('unban ')) {
            return sock.sendMessage(from, { text: `@${sender.split('@')[0]} has been unbanned!` }, { quoted: msg });
        }
        if (text.startsWith('warn ')) {
            return sock.sendMessage(from, { text: `@${sender.split('@')[0]} has been warned!` }, { quoted: msg });
        }
        if (text.startsWith('unwarn ')) {
            return sock.sendMessage(from, { text: `@${sender.split('@')[0]} warning removed!` }, { quoted: msg });
        }
        if (text.startsWith('broadcast ')) {
            const message = text.replace('broadcast ', '');
            return sock.sendMessage(from, { text: `Broadcast: ${message}` });
        }
        if (text.startsWith('restart')) {
            return process.exit(0);
        }
    });
}

startBot();
