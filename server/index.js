import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { Ollama } from 'ollama';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { Boom } from '@hapi/boom';

dotenv.config();

// Inicializar Firebase Admin
try {
    const serviceAccount = JSON.parse(readFileSync('./firebase-admin-key.json', 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔔 Firebase Admin inicializado correctamente');
} catch (error) {
    console.error('⚠️ Error inicializando Firebase Admin:', error.message);
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

let botActive = true;
let aiInstructions = '';
let businessPlan = '';
let sock = null; // Instancia de Baileys
let pushTokens = new Set();
let blockedNumbers = new Map(); // Map<phoneNumber, {phone_number, contact_name, is_blocked, reason}>
let mediaLibrary = []; // Biblioteca de contenido multimedia

// ============================================
// 🛡️ FUNCIONES ANTI-BAN (Adaptadas a Baileys)
// ============================================

const randomDelay = (minSeconds, maxSeconds) => {
    const ms = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
};

const simulateHumanBehavior = async (key, responseLength) => {
    try {
        await sock.readMessages([key]);
        const initialDelay = Math.random() * 1.5 + 0.5;
        await new Promise(resolve => setTimeout(resolve, initialDelay * 1000));
        await sock.sendPresenceUpdate('composing', key.remoteJid);
        const baseTypingTime = responseLength / 15;
        const typingTimeSeconds = Math.min(Math.max(baseTypingTime, 2), 7);
        await new Promise(resolve => setTimeout(resolve, typingTimeSeconds * 1000));
        await sock.sendPresenceUpdate('paused', key.remoteJid);
    } catch (e) {
        console.log('⚠️ Error en simulación humana:', e.message);
    }
};

// Rate Limiting & Queue
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60000;
let messageTimestamps = [];

const isRateLimited = () => {
    const now = Date.now();
    messageTimestamps = messageTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);
    if (messageTimestamps.length >= RATE_LIMIT_MAX) return true;
    messageTimestamps.push(now);
    return false;
};

let messageQueue = [];
let isProcessingQueue = false;

const addToQueue = (handler) => {
    messageQueue.push(handler);
    processQueue();
};

const processQueue = async () => {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;
    while (messageQueue.length > 0) {
        const handler = messageQueue.shift();
        try { await handler(); } catch (e) { console.error('❌ Error en cola:', e.message); }
        await randomDelay(1, 2);
    }
    isProcessingQueue = false;
};

// ============================================
// 🛠️ CONEXIÓN BAILEYS
// ============================================

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('🔔 NUEVO QR RECIBIDO');
            io.emit('whatsapp-qr', qr);
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode
                : null;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`🔄 Conexión cerrada (Cód: ${statusCode}). Razón: ${lastDisconnect.error?.message}. Reconectando: ${shouldReconnect}`);
            io.emit('whatsapp-status', 'disconnected');
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Conectado y Listo');
            io.emit('whatsapp-status', 'ready');
            fetchAndEmitGroups();
        } else {
            console.log('⏳ Estado de conexión:', connection || 'esperando...');
        }
    });

    async function fetchAndEmitGroups() {
        try {
            const groups = await sock.groupFetchAllParticipating();
            const groupList = Object.values(groups).map(g => ({
                id: g.id,
                name: g.subject
            }));
            io.emit('groups-list', groupList);
        } catch (e) {
            console.error('Error obteniendo grupos:', e.message);
        }
    }

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const m of messages) {
            if (!m.message || m.key.fromMe) continue;
            const jid = m.key.remoteJid;
            const messageBody = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";

            // Lógica para detectar imágenes
            let imageBase64 = null;
            if (m.message.imageMessage) {
                try {
                    console.log('🖼️ Descargando imagen para análisis...');
                    const buffer = await downloadMediaMessage(m, 'buffer', {});
                    imageBase64 = buffer.toString('base64');
                } catch (e) {
                    console.error('❌ Error descargando imagen:', e.message);
                }
            }

            if (jid.endsWith('@g.us')) {
                const { data: config } = await supabase.from('group_configs').select('*').eq('group_id', jid).maybeSingle();
                if (!config || !config.is_active) continue;
                m.customPrompt = config.custom_prompt;
                m.isGroup = true;
            } else {
                // Verificar si el número está bloqueado
                const phoneNumber = jid.replace('@s.whatsapp.net', '');
                const blockedEntry = blockedNumbers.get(phoneNumber);
                if (blockedEntry && blockedEntry.is_blocked) {
                    console.log(`🚫 Mensaje ignorado de número bloqueado: ${phoneNumber}`);
                    continue;
                }
                // Si el bot global está apagado, no procesar
                if (!botActive) continue;
            }

            if (isRateLimited()) continue;
            console.log(`📩 Mensaje de ${jid}: "${messageBody}" ${imageBase64 ? '(con imagen)' : ''}`);
            addToQueue(async () => { await processMessage(m, jid, messageBody, imageBase64); });
        }
    });
}

// ============================================
// 🤖 PROCESAMIENTO CON IA (CON ROTACIÓN DE LLAVES)
// ============================================

const ollamaKeys = [
    process.env.OLLAMA_API_KEY,
    "633035574708423183ccebb96e54ac41.q3fuiDDxkVjWXhn2egGfAg0a",
    "8c8db013aa214c1eaee7a13748b1d239.lPiLdPR45Vr9hujYX3CC7d6o",
    "1c2ea5927c924a3084efb8ce8e4d19f6.7TTPC9HSu-hR2r6rPSg8pzp2",
    "bdc65b254ca04270be7d4dce917f9ad1.ePjcgaPxK0lRYwvano8V5c2y",
    "33dec63271da4b71b67bb4a7700a8e1a.-eWOrGezxnvsHE4h005Tkzz5"
].filter(k => k);

let keyStatus = ollamaKeys.map((key, index) => ({
    id: index,
    keyHash: key.substring(0, 8) + '...',
    usedSession: 0,
    totalSession: 200,
    sessionStart: null,
    usedWeekly: 0,
    totalWeekly: 1000,
    weeklyStart: null,
    status: 'idle',
    lastError: null
}));

async function updateKeyStatus(index, status, isUsage = false) {
    if (!keyStatus[index]) return;
    keyStatus[index].status = status;
    if (isUsage) {
        const now = new Date().toISOString();

        // Si no hay fecha de inicio, la ponemos ahora (primer mensaje del ciclo)
        if (keyStatus[index].usedSession === 0) keyStatus[index].sessionStart = now;
        if (keyStatus[index].usedWeekly === 0) keyStatus[index].weeklyStart = now;

        keyStatus[index].usedSession = Math.min(keyStatus[index].usedSession + 1, keyStatus[index].totalSession);
        keyStatus[index].usedWeekly = Math.min(keyStatus[index].usedWeekly + 1, keyStatus[index].totalWeekly);

        // Guardar en Supabase para persistencia
        try {
            await supabase.from('api_key_usage').upsert([{
                key_hash: keyStatus[index].keyHash,
                used_session: keyStatus[index].usedSession,
                used_weekly: keyStatus[index].usedWeekly,
                session_start: keyStatus[index].sessionStart,
                weekly_start: keyStatus[index].weeklyStart,
                last_updated: now
            }], { onConflict: 'key_hash' });
        } catch (e) { console.error('Error guardando uso de API:', e.message); }
    }
    io.emit('api-keys-status', keyStatus);
}

let currentKeyIndex = 0;

const processMessage = async (rawMessage, jid, messageBody, imageBase64 = null) => {
    try {
        const logContent = imageBase64 ? `[Imagen enviada] ${messageBody}` : messageBody;
        await supabase.from('chat_logs').insert([{ wa_id: jid, message: logContent, role: 'user' }]);

        const { data: history } = await supabase.from('chat_logs').select('role, message').eq('wa_id', jid).order('created_at', { ascending: false }).limit(15);

        const formattedHistory = (history || [])
            .reverse()
            .map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.message
            }));

        let chatResponse = null;
        let attempts = 0;

        while (!chatResponse && attempts < ollamaKeys.length) {
            const currentKey = ollamaKeys[currentKeyIndex];
            const ollamaClient = new Ollama({
                host: process.env.OLLAMA_HOST,
                headers: { 'Authorization': `Bearer ${currentKey}` }
            });

            try {
                updateKeyStatus(currentKeyIndex, 'active');

                // Construir la sección de medios disponibles para el prompt
                const activeMedia = mediaLibrary.filter(m => m.is_active);
                let mediaSection = '';
                if (activeMedia.length > 0) {
                    mediaSection = '\n\n📎 CONTENIDO MULTIMEDIA DISPONIBLE:\nSi consideras que alguno de estos archivos es relevante para la conversación, incluye la etiqueta [ENVIAR_MEDIA:ID] en tu respuesta (reemplaza ID con el número). Puedes enviar varios archivos si es necesario.\n';
                    activeMedia.forEach(m => {
                        mediaSection += `- ID:${m.id} | ${m.file_type.toUpperCase()} | "${m.file_name}" → ${m.description}\n`;
                    });
                }

                const systemPrompt = rawMessage.customPrompt
                    ? `Instrucciones específicas para este GRUPO: ${rawMessage.customPrompt}\nContexto del Negocio: ${businessPlan}${mediaSection}`
                    : `Negocio: ${businessPlan}\nInstrucciones Generales: ${aiInstructions}${mediaSection}\n\nETIQUETAS INTERNAS (son invisibles, NUNCA las muestres al cliente ni escribas "[Tags:]"):\n- [VENTA_DETECTADA]: Usa esta etiqueta cuando detectes que el cliente quiere comprar, pagar o adquirir algo.\n- [NUEVO_LEAD]: Usa esta etiqueta cuando sea la primera interacción de un prospecto interesado.\n- [INTERVENCION_NECESARIA]: Usa esta etiqueta en CUALQUIERA de estos casos:\n  1. El cliente pide hablar con una persona real, humano, agente o asesor\n  2. El cliente está frustrado, molesto, enojado o insatisfecho con la atención\n  3. El cliente hace una pregunta que NO puedes responder con la información que tienes\n  4. El cliente quiere hacer una queja, reclamación o devolución\n  5. El cliente menciona un problema técnico que no puedes resolver\n  6. El cliente expresa urgencia extrema o una emergencia\n  7. El cliente repite la misma pregunta más de 2 veces indicando que no está satisfecho con tu respuesta\nCuando uses [INTERVENCION_NECESARIA], también responde al cliente diciendo que lo conectarás con un asesor humano lo antes posible.`;

                const chatRequest = {
                    model: process.env.OLLAMA_MODEL || 'gemini-3-flash-preview',
                    messages: [{ role: 'system', content: systemPrompt }, ...formattedHistory]
                };

                // Si hay imagen, la añadimos al último mensaje del usuario
                if (imageBase64) {
                    const lastUserMsg = chatRequest.messages[chatRequest.messages.length - 1];
                    if (lastUserMsg && lastUserMsg.role === 'user') {
                        lastUserMsg.images = [imageBase64];
                        lastUserMsg.content = messageBody || "Analiza esta imagen por favor.";
                    }
                }

                chatResponse = await ollamaClient.chat(chatRequest);

                console.log(`🤖 IA respondió usando la llave #${currentKeyIndex + 1}`);
                updateKeyStatus(currentKeyIndex, 'idle', true);

            } catch (error) {
                console.error(`⚠️ Error con llave #${currentKeyIndex + 1}:`, error.message);
                updateKeyStatus(currentKeyIndex, 'error');
                keyStatus[currentKeyIndex].lastError = error.message;
                currentKeyIndex = (currentKeyIndex + 1) % ollamaKeys.length;
                attempts++;
                if (attempts >= ollamaKeys.length) throw new Error("❌ Todas las llaves API de Ollama están agotadas.");
            }
        }

        let aiResponse = chatResponse.message.content;
        const isSale = aiResponse.includes('[VENTA_DETECTADA]');
        const isNewLead = aiResponse.includes('[NUEVO_LEAD]');
        const needsIntervention = aiResponse.includes('[INTERVENCION_NECESARIA]');

        aiResponse = aiResponse.replace('[VENTA_DETECTADA]', '').replace('[NUEVO_LEAD]', '').replace('[INTERVENCION_NECESARIA]', '');
        // Limpiar cualquier variante de [Tags: ] que la IA deja en la respuesta
        aiResponse = aiResponse.replace(/\[Tags?:?\s*\]/gi, '').replace(/\[Tags?:?\s*.*?\]/gi, '').trim();

        // Detectar y enviar medios solicitados por la IA
        const mediaRegex = /\[ENVIAR_MEDIA:(\d+)\]/g;
        let mediaMatch;
        const mediaToSend = [];
        while ((mediaMatch = mediaRegex.exec(aiResponse)) !== null) {
            const mediaId = parseInt(mediaMatch[1]);
            const mediaItem = mediaLibrary.find(m => m.id === mediaId && m.is_active);
            if (mediaItem) mediaToSend.push(mediaItem);
        }
        // Limpiar las etiquetas de media de la respuesta de texto
        aiResponse = aiResponse.replace(/\[ENVIAR_MEDIA:\d+\]/g, '').trim();

        await simulateHumanBehavior(rawMessage.key, aiResponse.length);

        // Enviar respuesta de texto primero (si hay texto)
        if (aiResponse) {
            await sock.sendMessage(jid, { text: aiResponse });
        }

        // Enviar los archivos multimedia
        for (const media of mediaToSend) {
            try {
                await randomDelay(1, 2);
                const url = media.file_url;
                if (media.file_type === 'pdf') {
                    await sock.sendMessage(jid, {
                        document: { url },
                        mimetype: 'application/pdf',
                        fileName: media.file_name,
                        caption: media.description
                    });
                } else if (media.file_type === 'video') {
                    await sock.sendMessage(jid, {
                        video: { url },
                        caption: media.description
                    });
                } else {
                    await sock.sendMessage(jid, {
                        image: { url },
                        caption: media.description
                    });
                }
                console.log(`📎 Archivo multimedia enviado: ${media.file_name}`);
            } catch (e) {
                console.error(`❌ Error enviando archivo ${media.file_name}:`, e.message);
            }
        }

        const customerName = rawMessage.pushName || 'Cliente';
        await supabase.from('chat_logs').insert([{ wa_id: jid, customer_name: customerName, message: aiResponse, role: 'assistant' }]);

        if (isSale || isNewLead || needsIntervention) {
            const status = isSale ? 'hot_lead' : (needsIntervention ? 'needs_intervention' : 'prospect');
            await supabase.from('leads').upsert([{ wa_id: jid, customer_name: customerName, status, last_interaction: new Date().toISOString() }]);
            io.emit('lead-alert', { name: customerName, status });
        }

        io.emit('new-interaction', { from: customerName, message: messageBody, response: aiResponse, isSale });

        // Solo enviar push notification cuando se necesite intervención humana
        if (needsIntervention) {
            sendPushNotification(`� Intervención Necesaria: ${customerName}`, `El cliente solicita hablar con un humano. Último mensaje: "${messageBody}"`);
        }

    } catch (error) {
        console.error('❌ Error procesando mensaje:', error.message);
    }
};

// ============================================
// 🛠️ FUNCIONES DE APOYO
// ============================================

const sendPushNotification = async (title, body, data = {}) => {
    if (pushTokens.size === 0) return;
    try {
        await admin.messaging().sendEachForMulticast({ notification: { title, body }, data, tokens: Array.from(pushTokens) });
    } catch (e) { console.error('Push Error:', e.message); }
};

async function loadConfig() {
    try {
        const { data } = await supabase.from('bot_settings').select('key, value');
        if (data) {
            data.forEach(item => {
                if (item.key === 'is_active') botActive = item.value === 'true';
                if (item.key === 'ai_instructions') aiInstructions = item.value;
                if (item.key === 'business_plan') businessPlan = item.value;
            });
        }
    } catch (e) { console.error('Error cargando config:', e.message); }

    // Cargar números bloqueados
    try {
        const { data: blocked } = await supabase.from('blocked_numbers').select('*');
        if (blocked) {
            blockedNumbers.clear();
            blocked.forEach(entry => {
                blockedNumbers.set(entry.phone_number, entry);
            });
            console.log(`🚫 ${blockedNumbers.size} números bloqueados cargados`);
        }
    } catch (e) { console.error('Error cargando números bloqueados:', e.message); }

    // Cargar biblioteca de medios
    try {
        const { data: media } = await supabase.from('bot_media_library').select('*');
        if (media) {
            mediaLibrary = media;
            console.log(`📎 ${mediaLibrary.length} archivos en biblioteca de medios`);
        }
    } catch (e) { console.error('Error cargando biblioteca de medios:', e.message); }

    // Cargar uso de APIs persistido
    try {
        const { data: usage } = await supabase.from('api_key_usage').select('*');
        if (usage) {
            usage.forEach(record => {
                const keyIdx = keyStatus.findIndex(k => k.keyHash === record.key_hash);
                if (keyIdx !== -1) {
                    keyStatus[keyIdx].usedSession = record.used_session;
                    keyStatus[keyIdx].usedWeekly = record.used_weekly;
                    keyStatus[keyIdx].sessionStart = record.session_start;
                    keyStatus[keyIdx].weeklyStart = record.weekly_start;
                }
            });
            console.log(`🔑 Uso de APIs cargado desde base de datos`);
            io.emit('api-keys-status', keyStatus);
        }
    } catch (e) { console.error('Error cargando uso de APIs:', e.message); }
}

// Mensajes Programados
setInterval(async () => {
    if (!sock) return;
    try {
        const { data } = await supabase.from('scheduled_messages').select('*').eq('status', 'pending');
        if (data) {
            for (const msg of data) {
                if (new Date(msg.schedule_at) <= new Date()) {
                    try {
                        const target = msg.to_number.includes('@') ? msg.to_number : `${msg.to_number}@s.whatsapp.net`;
                        if (msg.image_url) {
                            const url = msg.image_url.toLowerCase();
                            if (url.endsWith('.pdf')) {
                                await sock.sendMessage(target, {
                                    document: { url: msg.image_url },
                                    mimetype: 'application/pdf',
                                    fileName: msg.message || 'Documento.pdf',
                                    caption: msg.message
                                });
                            } else if (url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.avi')) {
                                await sock.sendMessage(target, {
                                    video: { url: msg.image_url },
                                    caption: msg.message
                                });
                            } else {
                                await sock.sendMessage(target, { image: { url: msg.image_url }, caption: msg.message });
                            }
                        } else {
                            await sock.sendMessage(target, { text: msg.message });
                        }
                        await supabase.from('scheduled_messages').update({ status: 'sent' }).eq('id', msg.id);
                        console.log(`✅ Mensaje programado enviado a ${msg.to_number}`);
                    } catch (e) {
                        await supabase.from('scheduled_messages').update({ status: 'failed' }).eq('id', msg.id);
                    }
                }
            }
        }
    } catch (e) { console.error('⚠️ Error en intervalo de programados:', e.message); }
}, 60000);

// ============================================
// 🔄 AUTOMATIZACIÓN DE RESETEO DE APIS (POR LLAVE)
// ============================================
setInterval(async () => {
    const now = new Date();
    let anyChanged = false;

    for (let i = 0; i < keyStatus.length; i++) {
        const key = keyStatus[i];
        let keyChanged = false;

        // Reseteo de Sesión: 2 horas después del primer mensaje
        if (key.sessionStart) {
            const start = new Date(key.sessionStart);
            const diffHours = (now - start) / (1000 * 60 * 60);
            if (diffHours >= 2) {
                console.log(`🔄 Reseteando SESIÓN para Key #${i + 1} (Pasaron 2h desde su primer uso)`);
                keyStatus[i].usedSession = 0;
                keyStatus[i].sessionStart = null;
                keyChanged = true;
            }
        }

        // Reseteo Semanal: 7 días después del primer mensaje
        if (key.weeklyStart) {
            const start = new Date(key.weeklyStart);
            const diffDays = (now - start) / (1000 * 60 * 60 * 24);
            if (diffDays >= 7) {
                console.log(`🔄 Reseteando SEMANA para Key #${i + 1} (Pasaron 7 días desde su primer uso)`);
                keyStatus[i].usedWeekly = 0;
                keyStatus[i].weeklyStart = null;
                keyChanged = true;
            }
        }

        if (keyChanged) {
            anyChanged = true;
            try {
                await supabase.from('api_key_usage').upsert([{
                    key_hash: keyStatus[i].keyHash,
                    used_session: keyStatus[i].usedSession,
                    used_weekly: keyStatus[i].usedWeekly,
                    session_start: keyStatus[i].sessionStart,
                    weekly_start: keyStatus[i].weeklyStart,
                    last_updated: now.toISOString()
                }], { onConflict: 'key_hash' });
            } catch (e) { console.error('Error en reseteo individual:', e.message); }
        }
    }

    if (anyChanged) {
        io.emit('api-keys-status', keyStatus);
    }
}, 60000); // Revisar cada minuto


io.on('connection', (socket) => {
    socket.emit('bot-status-updated', botActive);
    socket.emit('api-keys-status', keyStatus);
    socket.emit('bot-settings', {
        instructions: aiInstructions,
        businessPlan: businessPlan
    });
    socket.on('register-push-token', (token) => pushTokens.add(token));
    socket.on('toggle-bot', async (active) => {
        botActive = active;
        await supabase.from('bot_settings').upsert({ key: 'is_active', value: active.toString() });
        io.emit('bot-status-updated', botActive);
    });
    socket.on('update-instructions', async (text) => {
        aiInstructions = text;
        await supabase.from('bot_settings').upsert({ key: 'ai_instructions', value: text });
        io.emit('bot-settings', { instructions: aiInstructions, businessPlan: businessPlan });
    });
    socket.on('update-business-plan', async (text) => {
        businessPlan = text;
        await supabase.from('bot_settings').upsert({ key: 'business_plan', value: text });
        io.emit('bot-settings', { instructions: aiInstructions, businessPlan: businessPlan });
    });
    socket.on('get-api-keys-status', () => { socket.emit('api-keys-status', keyStatus); });
    socket.on('get-groups', async () => {
        if (sock) {
            const groups = await sock.groupFetchAllParticipating();
            const groupList = Object.values(groups).map(g => ({ id: g.id, name: g.subject }));
            socket.emit('groups-list', groupList);
        }
    });

    socket.on('save-group-config', async (config) => {
        await supabase.from('group_configs').upsert([config]);
        console.log(`💾 Configuración guardada para grupo: ${config.group_name}`);
    });

    socket.on('get-group-settings', async () => {
        const { data } = await supabase.from('group_configs').select('*');
        socket.emit('group-settings-list', data || []);
    });

    // ============================================
    // 🚫 GESTIÓN DE NÚMEROS BLOQUEADOS
    // ============================================

    socket.on('get-blocked-numbers', async () => {
        try {
            const { data } = await supabase.from('blocked_numbers').select('*');
            socket.emit('blocked-numbers-list', data || []);
        } catch (e) { console.error('Error obteniendo bloqueados:', e.message); }
    });

    socket.on('toggle-block-number', async (config) => {
        try {
            await supabase.from('blocked_numbers').upsert([{
                phone_number: config.phone_number,
                contact_name: config.contact_name || 'Desconocido',
                is_blocked: config.is_blocked,
                reason: config.reason || ''
            }], { onConflict: 'phone_number' });

            // Actualizar caché en memoria
            if (config.is_blocked) {
                blockedNumbers.set(config.phone_number, config);
            } else {
                const existing = blockedNumbers.get(config.phone_number);
                if (existing) {
                    existing.is_blocked = false;
                    blockedNumbers.set(config.phone_number, existing);
                }
            }

            console.log(`🚫 Número ${config.phone_number} ${config.is_blocked ? 'BLOQUEADO' : 'DESBLOQUEADO'}`);
            // Emitir lista actualizada a todos
            const { data } = await supabase.from('blocked_numbers').select('*');
            io.emit('blocked-numbers-list', data || []);
        } catch (e) { console.error('Error toggling bloqueo:', e.message); }
    });

    socket.on('get-known-contacts', async () => {
        try {
            // Obtener todos los wa_id únicos de chat_logs (solo chats individuales, no grupos)
            const { data: chatContacts } = await supabase
                .from('chat_logs')
                .select('wa_id, customer_name')
                .not('wa_id', 'like', '%@g.us');

            // Obtener leads también
            const { data: leadsContacts } = await supabase
                .from('leads')
                .select('wa_id, customer_name');

            // Obtener los números ya bloqueados
            const { data: blocked } = await supabase.from('blocked_numbers').select('*');
            const blockedMap = new Map((blocked || []).map(b => [b.phone_number, b]));

            // Combinar y deduplicar
            const contactsMap = new Map();

            (chatContacts || []).forEach(c => {
                const phone = c.wa_id.replace('@s.whatsapp.net', '');
                if (!phone.includes('@') && !contactsMap.has(phone)) {
                    contactsMap.set(phone, {
                        phone_number: phone,
                        contact_name: c.customer_name || 'Sin Nombre',
                        is_blocked: blockedMap.has(phone) ? blockedMap.get(phone).is_blocked : false,
                        reason: blockedMap.has(phone) ? blockedMap.get(phone).reason : ''
                    });
                }
            });

            (leadsContacts || []).forEach(c => {
                const phone = c.wa_id.replace('@s.whatsapp.net', '');
                if (!phone.includes('@')) {
                    if (contactsMap.has(phone)) {
                        // Actualizar nombre si el lead tiene uno mejor
                        if (c.customer_name && c.customer_name !== 'Cliente') {
                            contactsMap.get(phone).contact_name = c.customer_name;
                        }
                    } else {
                        contactsMap.set(phone, {
                            phone_number: phone,
                            contact_name: c.customer_name || 'Sin Nombre',
                            is_blocked: blockedMap.has(phone) ? blockedMap.get(phone).is_blocked : false,
                            reason: blockedMap.has(phone) ? blockedMap.get(phone).reason : ''
                        });
                    }
                }
            });

            // También incluir bloqueados manuales que no hayan chateado
            (blocked || []).forEach(b => {
                if (!contactsMap.has(b.phone_number)) {
                    contactsMap.set(b.phone_number, b);
                }
            });

            const allContacts = Array.from(contactsMap.values());
            console.log(`📱 ${allContacts.length} contactos encontrados`);
            socket.emit('known-contacts-list', allContacts);
        } catch (e) {
            console.error('Error obteniendo contactos:', e.message);
            socket.emit('known-contacts-list', []);
        }
    });

    socket.on('remove-blocked-number', async (phoneNumber) => {
        try {
            await supabase.from('blocked_numbers').delete().eq('phone_number', phoneNumber);
            blockedNumbers.delete(phoneNumber);
            console.log(`✅ Número ${phoneNumber} eliminado de la lista de bloqueo`);
            const { data } = await supabase.from('blocked_numbers').select('*');
            io.emit('blocked-numbers-list', data || []);
        } catch (e) { console.error('Error eliminando bloqueo:', e.message); }
    });

    // ============================================
    // 📎 GESTIÓN DE BIBLIOTECA DE MEDIOS
    // ============================================

    socket.on('get-media-library', async () => {
        try {
            const { data } = await supabase.from('bot_media_library').select('*').order('created_at', { ascending: false });
            mediaLibrary = data || [];
            socket.emit('media-library-list', mediaLibrary);
        } catch (e) {
            console.error('Error obteniendo biblioteca:', e.message);
            socket.emit('media-library-list', []);
        }
    });

    socket.on('add-media-item', async (item) => {
        try {
            const { data, error } = await supabase.from('bot_media_library').insert([{
                file_name: item.file_name,
                file_url: item.file_url,
                file_type: item.file_type,
                description: item.description || '',
                is_active: true
            }]).select();

            if (error) throw error;
            console.log(`📎 Archivo añadido a biblioteca: ${item.file_name}`);

            // Recargar biblioteca en memoria
            const { data: allMedia } = await supabase.from('bot_media_library').select('*').order('created_at', { ascending: false });
            mediaLibrary = allMedia || [];
            io.emit('media-library-list', mediaLibrary);
        } catch (e) {
            console.error('Error añadiendo medio:', e.message);
            socket.emit('media-error', e.message);
        }
    });

    socket.on('toggle-media-item', async ({ id, is_active }) => {
        try {
            await supabase.from('bot_media_library').update({ is_active }).eq('id', id);
            console.log(`📎 Medio ID:${id} ${is_active ? 'ACTIVADO' : 'DESACTIVADO'}`);

            const { data } = await supabase.from('bot_media_library').select('*').order('created_at', { ascending: false });
            mediaLibrary = data || [];
            io.emit('media-library-list', mediaLibrary);
        } catch (e) { console.error('Error toggling medio:', e.message); }
    });

    socket.on('remove-media-item', async (id) => {
        try {
            await supabase.from('bot_media_library').delete().eq('id', id);
            console.log(`🗑️ Medio ID:${id} eliminado de la biblioteca`);

            const { data } = await supabase.from('bot_media_library').select('*').order('created_at', { ascending: false });
            mediaLibrary = data || [];
            io.emit('media-library-list', mediaLibrary);
        } catch (e) { console.error('Error eliminando medio:', e.message); }
    });

    socket.on('set-key-usage', async ({ index, used_session, used_weekly }) => {
        if (!keyStatus[index]) return;
        keyStatus[index].usedSession = used_session;
        keyStatus[index].usedWeekly = used_weekly;

        try {
            await supabase.from('api_key_usage').upsert([{
                key_hash: keyStatus[index].keyHash,
                used_session: used_session,
                used_weekly: used_weekly,
                last_updated: new Date().toISOString()
            }], { onConflict: 'key_hash' });
            io.emit('api-keys-status', keyStatus);
        } catch (e) { console.error('Error ajustando uso manual:', e.message); }
    });
});

// ============================================
// 🛡️ MANEJO DE CIERRE Y ERRORES
// ============================================

const gracefulShutdown = async () => {
    console.log('\n🛑 Cerrando servidor de forma segura...');
    if (sock) {
        await sock.logout();
        await sock.end();
    }
    httpServer.close(() => {
        console.log('✅ Servidor HTTP cerrado');
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

loadConfig().then(() => {
    connectToWhatsApp();
    httpServer.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor Baileys en puerto ${PORT}`));
});
