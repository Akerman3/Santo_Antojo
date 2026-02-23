import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  MessageSquare,
  Settings,
  Database,
  Activity,
  Users,
  Bot,
  Terminal,
  QrCode,
  ShieldCheck,
  Cpu,
  Calendar,
  Bell,
  CheckCircle2,
  Clock,
  Search,
  Trash2,
  FileText,
  Video,
  XCircle,
  PhoneOff,
  Plus,
  ShieldBan,
  Phone,
  Image,
  Upload,
  Paperclip,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  Crown,
  Smartphone,
  Eye,
  X,
  Printer,
  Download
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { initPushNotifications } from './lib/pushNotifications';
import { db as firebaseDb, authFirebase } from './lib/firebase';
import { notificationDb } from './lib/firebaseNotifications';
import { onSnapshot, doc, collection, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// Configuración dinámica del servidor: Usa la IP del VPS si está definida, si no, usa localhost
const getBackendUrl = () => {
  // URL SEGURA CON CLOUDFLARE TUNNEL (HTTPS/PM2)
  return 'https://analysis-ppc-jacket-chronicles.trycloudflare.com';
};

const socket = io(getBackendUrl(), {
  transports: ['polling', 'websocket'], // Polling primero es más seguro para redes móviles
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 2000,
  timeout: 60000,           // 60 segundos de paciencia total
});

function App() {
  const [activeTab, setActiveTab] = useState('suscriptores');
  const receiptRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [botStatus, setBotStatus] = useState('offline');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ msg: string, type: string, time: string }[]>([]);
  const [instructions, setInstructions] = useState(() => localStorage.getItem('chatbot_instructions') || '');
  const [businessPlan, setBusinessPlan] = useState(() => localStorage.getItem('chatbot_businessPlan') || '');
  const [leads, setLeads] = useState<any[]>([]);
  const [scheduledMsgs, setScheduledMsgs] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupSettings, setGroupSettings] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [apiKeysStatus, setApiKeysStatus] = useState<any[]>([]);

  // 📊 Stats de AL Calculadora (Firestore - solo lectura)
  const [fbStats, setFbStats] = useState<{
    totalActivos: number;
    numero: number;
    total_cuentas: number;
    totalcencelednumero: number;
    correos: string[];
    correoscanceled: string[];
    updatedAt?: string
  }>({
    totalActivos: 0,
    numero: 0,
    total_cuentas: 0,
    totalcencelednumero: 0,
    correos: [],
    correoscanceled: []
  });
  const [showEmailModal, setShowEmailModal] = useState<{ show: boolean; title: string; emails: string[] }>({
    show: false,
    title: '',
    emails: []
  });
  const [fbAfiliados, setFbAfiliados] = useState<any[]>([]);
  const [fbStatsLoading, setFbStatsLoading] = useState(true);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  // Ref para detectar cambios en los contadores y disparar notificaciones
  const prevStatsRef = useRef<{ totalActivos: number; numero: number } | null>(null);
  // Historial diario para la gráfica
  const [dailyHistory, setDailyHistory] = useState<{ date: string; totalActivos: number; numero: number }[]>([]);
  // 💳 Pagos de afiliados (Supabase)
  const [affiliatePayments, setAffiliatePayments] = useState<Record<string, any>>({});
  const [paymentConfirm, setPaymentConfirm] = useState<{ id: string; step: 1 | 2 } | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<{
    mensualPrice: number;
    anualPrice: number;
    payerName: string;
    payerAddress: string;
    payerRFC: string;
  }>({
    mensualPrice: 0,
    anualPrice: 0,
    payerName: 'Admin BusinessChat',
    payerAddress: 'Av. Revolución 123, Piso 5, CDMX',
    payerRFC: 'ABC123456789'
  });
  const [showPayConfig, setShowPayConfig] = useState(false);
  const [previewData, setPreviewData] = useState<{ afiliado: any; mensualN: number; anualN: number } | null>(null);

  // Blocked numbers states
  const [blockedNumbers, setBlockedNumbers] = useState<any[]>([]);
  const [blockedSearchTerm, setBlockedSearchTerm] = useState('');
  const [newBlockNumber, setNewBlockNumber] = useState('');
  const [newBlockName, setNewBlockName] = useState('');
  const [newBlockReason, setNewBlockReason] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Media library states
  const [mediaLibrary, setMediaLibrary] = useState<any[]>([]);
  const [mediaSearchTerm, setMediaSearchTerm] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaName, setNewMediaName] = useState('');
  const [newMediaDesc, setNewMediaDesc] = useState('');
  const [newMediaType, setNewMediaType] = useState('image');
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Scheduling states
  const [schedNum, setSchedNum] = useState('');
  const [schedMsg, setSchedMsg] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedImage, setSchedImage] = useState<string>('');
  const [schedFileName, setSchedFileName] = useState<string>('');
  const [schedFileType, setSchedFileType] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Save feedback states
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [savingBusinessPlan, setSavingBusinessPlan] = useState(false);
  const [saveSuccessInstructions, setSaveSuccessInstructions] = useState(false);
  const [saveSuccessBusinessPlan, setSaveSuccessBusinessPlan] = useState(false);

  useEffect(() => {
    addLog(`🌐 Iniciando conexión a: ${getBackendUrl()}`, 'blue');

    initPushNotifications((token) => {
      socket.emit('register-push-token', token);
      localStorage.setItem('last_push_token', token);
    });

    socket.on('connect', () => {
      addLog('🚀 Socket conectado al servidor', 'emerald');
    });

    socket.on('connect_error', (error) => {
      addLog(`❌ Error de conexión Socket: ${error.message}`, 'red');
      console.error('Socket connection error:', error);
    });

    socket.on('whatsapp-qr', (qr) => setQrCode(qr));
    socket.on('whatsapp-status', (status) => {
      const isOnline = status === 'ready';
      setBotStatus(isOnline ? 'online' : 'offline');
      addLog(isOnline ? '✅ Bot conectado y listo' : '❌ Bot desconectado', isOnline ? 'emerald' : 'red');
    });
    socket.on('groups-list', (data) => setGroups(data));
    socket.on('group-settings-list', (data) => setGroupSettings(data));
    socket.on('api-keys-status', (data) => setApiKeysStatus(data));
    socket.on('blocked-numbers-list', (data: any[]) => setBlockedNumbers(data || []));
    socket.on('known-contacts-list', (data: any[]) => {
      setBlockedNumbers(data || []);
      setLoadingContacts(false);
    });
    socket.on('media-library-list', (data: any[]) => setMediaLibrary(data || []));
    socket.on('bot-settings', (data) => {
      if (data.instructions) {
        setInstructions(data.instructions);
        localStorage.setItem('chatbot_instructions', data.instructions);
      }
      if (data.businessPlan) {
        setBusinessPlan(data.businessPlan);
        localStorage.setItem('chatbot_businessPlan', data.businessPlan);
      }
    });
    socket.on('new-interaction', (data) => {
      addLog(`📩 Mensaje de ${data.from}: ${data.message}`, 'cyan');
      if (data.isSale) {
        addLog(`🔥 VENTA DETECTADA de ${data.from}`, 'emerald');
        addAlert(`🔥 VENTA: ${data.from}`, 'emerald');
      }
    });
    socket.on('lead-alert', () => {
      addLog('🚀 Nuevo lead registrado en Supabase', 'purple');
      fetchLeads();
    });

    fetchLeads();
    fetchScheduled();
    fetchActivityLog();

    const activityChannel = supabase
      .channel('recent_activity_sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'recent_activity' }, () => {
        fetchActivityLog();
      })
      .subscribe();

    return () => {
      socket.off('api-keys-status');
      socket.off('whatsapp-qr');
      socket.off('whatsapp-status');
      socket.off('groups-list');
      socket.off('new-interaction');
      socket.off('lead-alert');
      socket.off('bot-settings');
      socket.off('blocked-numbers-list');
      socket.off('known-contacts-list');
      socket.off('media-library-list');
      supabase.removeChannel(activityChannel);
    };
  }, []);

  // 📊 Listener Firestore: stats de AL Calculadora — espera auth antes de leer
  useEffect(() => {
    let unsubStats: (() => void) | null = null;
    let unsubAfiliados: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(authFirebase, async (user) => {
      // Mientras no haya sesión (anónima o real), no intentamos leer
      if (!user) return;

      // --- Registro de Token para Notificaciones Push en Firestore (Colección Global) ---
      const storedToken = localStorage.getItem('last_push_token');
      if (storedToken) {
        try {
          // Guardamos en el proyecto secundario (businesschat-admin) para que el push funcione en Android
          const tokenRef = doc(notificationDb, 'adminTokens', storedToken);
          await setDoc(tokenRef, {
            token: storedToken,
            enabled: true,
            updatedAt: new Date().toISOString(),
            label: 'Admin Device'
          }, { merge: true });
          console.log('[Push] Token guardado en adminTokens');
        } catch (e) {
          console.warn('[Push] Error guardando token admin:', e);
        }
      }

      unsubStats = onSnapshot(
        doc(firebaseDb, 'stats', 'totalsuscriptores'),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data() as any;
            setFbStats({
              totalActivos: d.totalActivos ?? 0,
              numero: d.numero ?? 0,
              total_cuentas: d.total_cuentas ?? 0,
              totalcencelednumero: d.totalcencelednumero ?? 0,
              correos: d.correos ?? [],
              correoscanceled: d.correoscanceled ?? [],
              updatedAt: d.updatedAt ?? null,
            });
          }
          setFbStatsLoading(false);
        },
        (err) => {
          console.warn('[Firebase] Error leyendo stats:', err.code);
          setFbStatsLoading(false);
        }
      );

      unsubAfiliados = onSnapshot(
        collection(firebaseDb, 'Afiliados'),
        (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a: any, b: any) => {
            const totalA = (a.mensualActivos ?? 0) + (a.anualActivos ?? 0);
            const totalB = (b.mensualActivos ?? 0) + (b.anualActivos ?? 0);
            return totalB - totalA;
          });
          setFbAfiliados(list);
        },
        (err) => console.warn('[Firebase] Error leyendo Afiliados:', err.code)
      );

    });

    return () => {
      unsubAuth();
      if (unsubStats) unsubStats();
      if (unsubAfiliados) unsubAfiliados();
    };
  }, []);

  // 🔔 Detectar cambios en fbStats y generar eventos locales + notificaciones
  useEffect(() => {
    if (fbStatsLoading) return;
    const prev = prevStatsRef.current;

    if (prev === null) {
      prevStatsRef.current = { totalActivos: fbStats.totalActivos, numero: fbStats.numero };
      return;
    }

    const timeStr = new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    const newEvents: any[] = [];

    const notify = (title: string, body: string) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    };

    // Cambios en totalActivos
    if (fbStats.totalActivos > prev.totalActivos) {
      newEvents.push({ id: `${Date.now()}-a`, eventType: 'subscribed', time: timeStr, msg: 'Un usuario se suscribió', colorClass: 'border-emerald-500/20', dotColor: 'bg-emerald-500' });
      notify('♥️ Nuevo Suscriptor', `Total: ${fbStats.totalActivos}`);
    } else if (fbStats.totalActivos < prev.totalActivos) {
      newEvents.push({ id: `${Date.now()}-b`, eventType: 'subscription_ended', time: timeStr, msg: 'A un usuario se le terminó el período de suscripción', colorClass: 'border-amber-500/20', dotColor: 'bg-amber-500' });
      notify('⛔ Suscripción Terminada', `Total: ${fbStats.totalActivos}`);
    }

    // Cambios en numero (Suscripciones Sin Cancelar)
    if (fbStats.numero > prev.numero) {
      newEvents.push({ id: `${Date.now()}-c`, eventType: 'new_sub', time: timeStr, msg: 'Un usuario tiene una nueva suscripción activa', colorClass: 'border-emerald-500/20', dotColor: 'bg-emerald-500' });
      notify('✅ Nueva Suscripción', `Sin cancelar: ${fbStats.numero}`);
    } else if (fbStats.numero < prev.numero) {
      newEvents.push({ id: `${Date.now()}-d`, eventType: 'cancelled', time: timeStr, msg: 'Un usuario canceló su suscripción', colorClass: 'border-red-500/20', dotColor: 'bg-red-500' });
      notify('❌ Suscripción Cancelada', `Sin cancelar: ${fbStats.numero}`);
    }

    if (newEvents.length > 0) {
      // Guardar en Supabase para persistencia multidispositivo
      const toInsert = newEvents.map(e => ({
        event_type: e.eventType,
        msg: e.msg,
        time: e.time,
        color_class: e.colorClass,
        dot_color: e.dotColor
      }));

      supabase.from('recent_activity').insert(toInsert).then(({ error }) => {
        if (error) console.error('[Supabase] Error al guardar actividad:', error);
      });
    }

    prevStatsRef.current = { totalActivos: fbStats.totalActivos, numero: fbStats.numero };
  }, [fbStats, fbStatsLoading]);

  // 📅 Historial diario — Cargar desde Supabase y sincronizar snapshot
  useEffect(() => {
    if (fbStatsLoading) return;

    const syncDailyStats = async () => {
      const today = new Date().toISOString().split('T')[0];

      // 1. Guardar/Actualizar snapshot de hoy en Supabase
      try {
        await supabase
          .from('daily_stats')
          .upsert({
            date: today,
            total_activos: fbStats.totalActivos,
            numero: fbStats.numero
          }, { onConflict: 'date' });
      } catch (e) {
        console.warn('[Supabase] Error guardando daily_stats:', e);
      }

      // 2. Cargar los últimos 30 días para la gráfica
      const { data, error } = await supabase
        .from('daily_stats')
        .select('date, total_activos, numero')
        .order('date', { ascending: true })
        .limit(30);

      if (!error && data) {
        // Mapear campos de base de datos a los que espera el componente
        const formattedHistory = data.map(d => ({
          date: d.date,
          totalActivos: d.total_activos,
          numero: d.numero
        }));
        setDailyHistory(formattedHistory);
      }
    };

    syncDailyStats();
  }, [fbStats.totalActivos, fbStats.numero, fbStatsLoading]);

  // 💳 Cargar config de pagos desde Supabase
  useEffect(() => {
    const loadConfig = async () => {
      const { data, error } = await supabase
        .from('admin_config')
        .select('value')
        .eq('key', 'payment_config')
        .single();

      if (!error && data?.value) {
        setPaymentConfig(data.value);
      }
    };
    loadConfig();
  }, []);

  // 💳 Guardar config de pagos en Supabase
  const savePaymentConfigToSupabase = async (newConfig: any) => {
    const { error } = await supabase
      .from('admin_config')
      .upsert({ key: 'payment_config', value: newConfig, updated_at: new Date().toISOString() });

    if (error) {
      addAlert('❌ Error al sincronizar precios', 'red');
    } else {
      // También emitir por socket para sincronizar en tiempo real otros clientes abiertos
      if (socket.connected) {
        socket.emit('save-payment-config', newConfig);
      }
    }
  };

  // 💳 Cargar último pago por afiliado desde Supabase
  useEffect(() => {
    if (fbAfiliados.length === 0) return;
    const loadPayments = async () => {
      const ids = fbAfiliados.map((a: any) => a.id);
      const { data } = await supabase
        .from('affiliate_payments')
        .select('*')
        .in('affiliate_id', ids)
        .order('pagado_en', { ascending: false });
      if (data) {
        const last: Record<string, any> = {};
        data.forEach(row => { if (!last[row.affiliate_id]) last[row.affiliate_id] = row; });
        setAffiliatePayments(last);
      }
    };
    loadPayments();
  }, [fbAfiliados]);

  useEffect(() => {
    if (activeTab === 'ai') {
      socket.emit('get-api-keys-status');
    }
  }, [activeTab]);

  const fetchLeads = async () => {
    const { data: leadsData } = await supabase.from('leads').select('*').order('last_interaction', { ascending: false });
    if (leadsData) setLeads(leadsData);
  };

  const fetchActivityLog = async () => {
    const { data, error } = await supabase
      .from('recent_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      const formatted = data.map(item => ({
        id: item.id,
        msg: item.msg,
        time: item.time,
        colorClass: item.color_class,
        dotColor: item.dot_color,
        eventType: item.event_type
      }));
      setActivityLog(formatted);
    }
  };

  const handleRegisterPayment = async (affiliateId: string, affiliateName: string, currentAnual: number, currentMensual: number) => {
    const { data, error } = await supabase
      .from('affiliate_payments')
      .insert({ affiliate_id: affiliateId, affiliate_name: affiliateName, anual_al_pago: currentAnual, mensual_al_pago: currentMensual })
      .select().single();
    if (!error && data) {
      setAffiliatePayments(prev => ({ ...prev, [affiliateId]: data }));
      addAlert(`✅ Pago registrado para ${affiliateName}`, 'emerald');
    } else {
      addAlert(`❌ Error al registrar pago`, 'red');
    }
    setPaymentConfirm(null);
  };

  const generatePDFBlob = async (): Promise<File> => {
    if (!receiptRef.current) throw new Error('No se encontró el recibo');

    // Configuración para alta calidad
    const canvas = await html2canvas(receiptRef.current, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter'
    });

    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    const blob = pdf.output('blob');
    const fileName = `Recibo_${previewData?.afiliado?.name?.replace(/\s+/g, '_') || 'Pago'}.pdf`;

    return new File([blob], fileName, { type: 'application/pdf' });
  };

  const shareWhatsApp = async (affiliateName: string, mensualN: number, anualN: number, afiliadoObj: any) => {
    // Si la vista previa no está abierta, la activamos automáticamente
    if (!previewData) {
      setPreviewData({ afiliado: afiliadoObj, mensualN, anualN });
      // Esperamos un momento a que el DOM se renderice para poder capturarlo
      setTimeout(() => shareWhatsAppPDF(affiliateName), 500);
      return;
    }
    await shareWhatsAppPDF(affiliateName);
  };

  const shareWhatsAppPDF = async (affiliateName: string) => {
    if (!receiptRef.current) return;
    setSharing(true);
    try {
      const file = await generatePDFBlob();

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Recibo de Comisiones',
          text: `Recibo de comisiones para ${affiliateName}`
        });
      } else {
        // Fallback: mostrar link de WhatsApp con el texto si no se puede enviar el archivo
        const date = new Date().toLocaleDateString('es-MX');
        const text = `💳 *RECIBO DE COMISIONES — ${affiliateName}*\n📅 Fecha: ${date}\n\nSe adjunta recibo en PDF.`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');

        // Y además descargar el PDF para que el usuario pueda adjuntarlo manualmente
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        addAlert('PDF generado y descargado. Por favor, adjúntalo manualmente en WhatsApp.', 'blue');
      }
    } catch (err) {
      console.error(err);
      addAlert('Error al generar o compartir el PDF', 'red');
    } finally {
      setSharing(false);
    }
  };

  const handleDownloadPDF = async (afiliado: any, m: number, a: number) => {
    setPreviewData({ afiliado, mensualN: m, anualN: a });
    setTimeout(async () => {
      try {
        setSharing(true);
        const file = await generatePDFBlob();
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Recibo_${afiliado.name?.replace(/\s+/g, '_') || afiliado.id}.pdf`;
        link.click();
      } catch (e) {
        console.error(e);
        addAlert('Error al generar el PDF', 'red');
      } finally {
        setSharing(false);
        setPreviewData(null);
      }
    }, 600);
  };

  const fetchScheduled = async () => {
    const { data } = await supabase.from('scheduled_messages').select('*').order('schedule_at', { ascending: true });
    if (data) setScheduledMsgs(data);
  };

  const addLog = (msg: string, type: string) => {
    setLogs(prev => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  const addAlert = (msg: string, color: string) => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, msg, color }]);
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 5000);
  };

  const handleToggleBot = () => {
    const newState = botStatus === 'online' ? 'offline' : 'online';
    setBotStatus(newState);
    socket.emit('toggle-bot', newState === 'online');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 1. Mostrar preview local inmediatamente
      setSchedFileName(file.name);
      setSchedFileType(file.type);
      setSchedImage(URL.createObjectURL(file)); // Preview instantáneo
      setUploadingImage(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error } = await supabase.storage
        .from('bot-assets')
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('bot-assets')
        .getPublicUrl(filePath);

      // 2. Actualizar con la URL real de internet
      setSchedImage(publicUrl);
      const isVideo = file.type.startsWith('video/');
      const isPdf = file.type === 'application/pdf';
      addLog(`📁 ${isPdf ? 'PDF' : isVideo ? 'Video' : 'Imagen'} preparado para envío`, 'emerald');
    } catch (err: any) {
      console.error('Error subiendo archivo:', err.message);
      addLog('❌ Error subiendo archivo: Asegúrate de crear el bucket "bot-assets" como público', 'red');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSchedule = async () => {
    const { error } = await supabase.from('scheduled_messages').insert([
      {
        to_number: schedNum,
        message: schedMsg,
        schedule_at: new Date(schedDate).toISOString(),
        image_url: schedImage || null
      }
    ]);
    if (!error) {
      setSchedNum(''); setSchedMsg(''); setSchedDate(''); setSchedImage(''); setSchedFileName(''); setSchedFileType('');
      fetchScheduled();
      addLog('📅 Mensaje programado guardado', 'emerald');
    } else {
      console.error('Error programando:', error.message);
      addLog('❌ Error al programar mensaje', 'red');
    }
  };

  const handleDeleteScheduled = async (id: string, messagePreview: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar este mensaje programado?\n\n"${messagePreview.substring(0, 50)}${messagePreview.length > 50 ? '...' : ''}"`)) {
      const { error } = await supabase.from('scheduled_messages').delete().eq('id', id);
      if (!error) {
        addLog('🗑️ Mensaje programado eliminado', 'amber');
        fetchScheduled();
      }
    }
  };

  const handleClearData = async () => {
    const confirm1 = window.confirm("🚨 ¿ESTÁS SEGURO?\n\nEsta acción eliminará TODOS los clientes y el historial de chat permanentemente de la base de datos.");
    if (confirm1) {
      const confirm2 = window.confirm("⚠️ ÚLTIMA ADVERTENCIA\n\nNo podrás recuperar esta información. ¿Deseas continuar con la limpieza absoluta?");
      if (confirm2) {
        try {
          // Eliminar de Supabase (Usamos un filtro que siempre sea cierto para borrar todo)
          await supabase.from('chat_logs').delete().neq('wa_id', '0');
          await supabase.from('leads').delete().neq('wa_id', '0');

          // Limpiar estado local
          setLeads([]);
          setLogs([]);
          addLog('🔥 Base de datos limpiada correctamente', 'red');
          addAlert('Limpieza Completa', 'red');
        } catch (error) {
          console.error('Error al limpiar:', error);
          alert('Hubo un error al intentar limpiar la base de datos.');
        }
      }
    }
  };

  const saveInstructions = () => {
    setSavingInstructions(true);
    socket.emit('update-instructions', instructions);
    localStorage.setItem('chatbot_instructions', instructions);
    setTimeout(() => {
      setSavingInstructions(false);
      setSaveSuccessInstructions(true);
      setTimeout(() => setSaveSuccessInstructions(false), 2000);
    }, 1000);
  };

  const saveBusinessPlan = () => {
    setSavingBusinessPlan(true);
    socket.emit('update-business-plan', businessPlan);
    localStorage.setItem('chatbot_businessPlan', businessPlan);
    setTimeout(() => {
      setSavingBusinessPlan(false);
      setSaveSuccessBusinessPlan(true);
      setTimeout(() => setSaveSuccessBusinessPlan(false), 2000);
    }, 1000);
  };

  const handleToggleGroup = (groupId: string, currentActive: boolean, groupName: string) => {
    const existing = groupSettings.find(s => s.group_id === groupId);
    const newConfig = {
      group_id: groupId,
      group_name: groupName,
      is_active: !currentActive,
      custom_prompt: existing?.custom_prompt || ''
    };
    socket.emit('save-group-config', newConfig);
    setGroupSettings(prev => {
      const filtered = prev.filter(s => s.group_id !== groupId);
      return [...filtered, newConfig];
    });
  };

  const handleSaveGroupPrompt = (groupId: string, prompt: string, groupName: string) => {
    const existing = groupSettings.find(s => s.group_id === groupId);
    const newConfig = {
      group_id: groupId,
      group_name: groupName,
      is_active: existing?.is_active ?? false,
      custom_prompt: prompt
    };
    socket.emit('save-group-config', newConfig);
    setGroupSettings(prev => {
      const filtered = prev.filter(s => s.group_id !== groupId);
      return [...filtered, newConfig];
    });
  };

  const refreshGroups = () => {
    setLoadingGroups(true);
    socket.emit('get-groups');
    socket.emit('get-group-settings');
    setTimeout(() => setLoadingGroups(false), 2000);
  };

  // ============================================
  // 🚫 FUNCIONES DE NÚMEROS BLOQUEADOS
  // ============================================

  const handleToggleBlockNumber = (phoneNumber: string, currentBlocked: boolean, contactName: string) => {
    socket.emit('toggle-block-number', {
      phone_number: phoneNumber,
      contact_name: contactName,
      is_blocked: !currentBlocked,
      reason: ''
    });
    setBlockedNumbers(prev => {
      const filtered = prev.filter(b => b.phone_number !== phoneNumber);
      return [...filtered, { phone_number: phoneNumber, contact_name: contactName, is_blocked: !currentBlocked, reason: '' }];
    });
  };

  const handleAddBlockedNumber = () => {
    if (!newBlockNumber.trim()) return;
    const cleanNumber = newBlockNumber.replace(/[^0-9]/g, '');
    if (!cleanNumber) return;
    socket.emit('toggle-block-number', {
      phone_number: cleanNumber,
      contact_name: newBlockName.trim() || 'Agregado Manualmente',
      is_blocked: true,
      reason: newBlockReason.trim() || ''
    });
    setBlockedNumbers(prev => [
      ...prev.filter(b => b.phone_number !== cleanNumber),
      { phone_number: cleanNumber, contact_name: newBlockName.trim() || 'Agregado Manualmente', is_blocked: true, reason: newBlockReason.trim() || '' }
    ]);
    setNewBlockNumber('');
    setNewBlockName('');
    setNewBlockReason('');
  };

  const handleRemoveBlockedNumber = (phoneNumber: string) => {
    if (window.confirm(`¿Eliminar ${phoneNumber} de la lista de bloqueo?`)) {
      socket.emit('remove-blocked-number', phoneNumber);
      setBlockedNumbers(prev => prev.filter(b => b.phone_number !== phoneNumber));
    }
  };

  const refreshBlockedNumbers = () => {
    setLoadingContacts(true);
    socket.emit('get-known-contacts');
    setTimeout(() => setLoadingContacts(false), 5000); // Fallback timeout
  };

  // ============================================
  // 📎 FUNCIONES DE BIBLIOTECA DE MEDIOS
  // ============================================

  const refreshMediaLibrary = () => {
    socket.emit('get-media-library');
  };

  const handleAddMediaItem = async () => {
    let fileUrl = newMediaUrl.trim();
    if (!fileUrl || !newMediaName.trim()) return;

    socket.emit('add-media-item', {
      file_name: newMediaName.trim(),
      file_url: fileUrl,
      file_type: newMediaType,
      description: newMediaDesc.trim() || ''
    });

    setNewMediaUrl('');
    setNewMediaName('');
    setNewMediaDesc('');
    setNewMediaType('image');
  };

  const handleUploadMediaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      const fileName = `media_${Date.now()}.${fileExt}`;
      const filePath = `media-library/${fileName}`;

      const { error } = await supabase.storage.from('chatbot-media').upload(filePath, file, {
        contentType: file.type,
        upsert: true
      });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('chatbot-media').getPublicUrl(filePath);

      // Detectar tipo
      let detectedType = 'image';
      if (fileExt === 'pdf') detectedType = 'pdf';
      else if (['mp4', 'mov', 'avi', 'webm'].includes(fileExt)) detectedType = 'video';

      setNewMediaUrl(urlData.publicUrl);
      setNewMediaName(file.name);
      setNewMediaType(detectedType);
    } catch (err: any) {
      console.error('Error subiendo archivo:', err);
      alert('Error al subir archivo: ' + err.message);
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleToggleMediaItem = (id: number, currentActive: boolean) => {
    socket.emit('toggle-media-item', { id, is_active: !currentActive });
    setMediaLibrary(prev => prev.map(m => m.id === id ? { ...m, is_active: !currentActive } : m));
  };

  const handleRemoveMediaItem = (id: number, name: string) => {
    if (window.confirm(`¿Eliminar "${name}" de la biblioteca?`)) {
      socket.emit('remove-media-item', id);
      setMediaLibrary(prev => prev.filter(m => m.id !== id));
    }
  };

  return (
    <div className="h-screen bg-[#030712] text-slate-200 font-sans selection:bg-cyan-500/30 overflow-hidden flex">

      {/* Botón del Robotsito - Siempre Fijo en su lugar */}
      <div className="fixed top-0 left-0 z-[100] h-20 w-20 flex items-center justify-center pointer-events-none">
        <button
          onClick={() => setSidebarVisible(!sidebarVisible)}
          className="w-12 h-12 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/20 cursor-pointer hover:scale-110 active:scale-95 transition-all pointer-events-auto"
        >
          <Bot className="w-7 h-7 text-white" />
        </button>
      </div>

      {/* Backdrop para cerrar al hacer clic fuera (Solo visible cuando el sidebar está abierto) */}
      {sidebarVisible && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px] cursor-pointer"
          onClick={() => setSidebarVisible(false)}
        />
      )}

      {/* Sidebar de Iconos - Se desplaza a la izquierda (oculta) o se muestra */}
      <aside
        className={`fixed left-0 top-0 h-full w-20 bg-[#0B0F1A] border-r border-white/5 flex flex-col z-50 transition-transform duration-300 ${sidebarVisible ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-20 flex-shrink-0" />

        <nav className="flex-1 flex flex-col items-center py-6 gap-6 overflow-y-auto custom-scrollbar">
          <IconNavItem icon={<Activity className="w-6 h-6" />} active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <IconNavItem icon={<MessageSquare className="w-6 h-6" />} active={activeTab === 'groups_ai'} onClick={() => { setActiveTab('groups_ai'); refreshGroups(); }} />
          <IconNavItem icon={<PhoneOff className="w-6 h-6" />} active={activeTab === 'blocked_numbers'} onClick={() => { setActiveTab('blocked_numbers'); refreshBlockedNumbers(); }} />
          <IconNavItem icon={<Calendar className="w-6 h-6" />} active={activeTab === 'scheduled'} onClick={() => setActiveTab('scheduled')} />
          <IconNavItem icon={<Users className="w-6 h-6" />} active={activeTab === 'clients'} onClick={() => setActiveTab('clients')} />
          <IconNavItem icon={<Paperclip className="w-6 h-6" />} active={activeTab === 'media_library'} onClick={() => { setActiveTab('media_library'); refreshMediaLibrary(); }} />
          <IconNavItem icon={<Database className="w-6 h-6" />} active={activeTab === 'kb'} onClick={() => setActiveTab('kb')} />
          <IconNavItem icon={<Cpu className="w-6 h-6" />} active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} />
          <IconNavItem icon={<TrendingUp className="w-6 h-6" />} active={activeTab === 'suscriptores'} onClick={() => setActiveTab('suscriptores')} />
        </nav>

        <div className="py-6 border-t border-white/5 mb-2 flex justify-center">
          <IconNavItem icon={<Settings className="w-6 h-6" />} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 h-full overflow-y-auto transition-all duration-300 ${sidebarVisible ? 'md:pl-0' : 'pl-0'}`} style={{ marginLeft: sidebarVisible ? '80px' : '0' }}>
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-4 sm:px-8 bg-[#030712]/50 backdrop-blur-md sticky top-0 z-40">
          <div className={`${sidebarVisible ? 'pl-16 md:pl-0' : 'pl-16'} transition-all duration-300`}>
            <h1 className="text-[10px] sm:text-sm font-medium text-slate-400 capitalize">{activeTab}</h1>
            <h2 className="text-lg sm:text-xl font-semibold text-white truncate max-w-[150px] sm:max-w-none">BusinessChat Admin</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border transition-all ${botStatus === 'online' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
              <div className={`w-2 h-2 rounded-full ${botStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-xs font-bold uppercase tracking-widest">{botStatus === 'online' ? 'Bot Activo' : 'Bot Apagado'}</span>
              <button
                onClick={handleToggleBot}
                className={`ml-2 p-1 rounded-lg transition-colors ${botStatus === 'online' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
              >
                {botStatus === 'online' ? <ShieldCheck className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-8">
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Mensajes Hoy" value={logs.length.toString()} change="+100%" icon={<MessageSquare className="text-cyan-400" />} />
                <StatCard
                  title="Ventas Estimadas"
                  value={`$${(
                    fbAfiliados.reduce((acc, a) => acc + (a.mensualActivos ?? 0), 0) * paymentConfig.mensualPrice +
                    fbAfiliados.reduce((acc, a) => acc + (a.anualActivos ?? 0), 0) * paymentConfig.anualPrice
                  ).toLocaleString('es-MX')} MXN`}
                  change="+Ventas"
                  icon={<TrendingUp className="text-emerald-400" />}
                />
                <StatCard title="Intenciones de Venta" value={leads.filter(l => l.status === 'hot_lead').length.toString()} change="+🔥" icon={<Bell className="text-emerald-400" />} />
                <StatCard title="Bot Status" value={botStatus} change="OK" icon={<CheckCircle2 className="text-amber-400" />} />
              </div>

              {/* Sección de Análisis de Ingresos Rápido */}
              <div className="bg-gradient-to-r from-blue-600/10 to-transparent border border-white/5 rounded-3xl p-6 mb-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-lg shadow-blue-500/5">
                      <TrendingUp className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white leading-tight">Estado de Ventas Proyectado</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Sincronizado con precios de afiliación</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
                    <div className="text-center">
                      <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Activos Mensual</div>
                      <div className="text-xl font-black text-white">{fbAfiliados.reduce((acc, a) => acc + (a.mensualActivos ?? 0), 0)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Activos Anual</div>
                      <div className="text-xl font-black text-white">{fbAfiliados.reduce((acc, a) => acc + (a.anualActivos ?? 0), 0)}</div>
                    </div>
                    <div className="text-center col-span-2 sm:col-span-1 border-t sm:border-t-0 sm:border-l border-white/10 pt-4 sm:pt-0 sm:pl-8">
                      <div className="text-[10px] text-blue-400 font-black uppercase mb-1 tracking-tighter">Ingreso Mensual Proyectado</div>
                      <div className="text-2xl font-black text-emerald-400">
                        ${(
                          fbAfiliados.reduce((acc, a) => acc + (a.mensualActivos ?? 0), 0) * paymentConfig.mensualPrice +
                          (fbAfiliados.reduce((acc, a) => acc + (a.anualActivos ?? 0), 0) * paymentConfig.anualPrice / 12)
                        ).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-[#0B0F1A] border border-white/5 rounded-3xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-cyan-400" />
                    Conexión WhatsApp
                  </h3>
                  <div className="aspect-square bg-white rounded-2xl flex items-center justify-center p-4 mb-6 shadow-inner overflow-hidden">
                    {qrCode ? (
                      <div className="bg-white p-2 rounded-lg">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=300x300`}
                          alt="WhatsApp QR"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400 text-sm text-center px-4">
                        <QrCode className="w-12 h-12 mb-2 opacity-20" />
                        {botStatus === 'online' ? '✅ Conectado' : 'Esperando QR...'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-2 bg-[#0B0F1A] border border-white/5 rounded-3xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-emerald-400" />
                    Consola de Eventos
                  </h3>
                  <div className="bg-black/40 rounded-2xl p-4 font-mono text-[10px] sm:text-xs h-[400px] overflow-y-auto space-y-2 border border-white/5">
                    {logs.length === 0 ? (
                      <div className="text-slate-500 italic">Esperando eventos...</div>
                    ) : (
                      logs.map((log, i) => (
                        <div key={i} className={`text-${log.type}-500/80`}>
                          <span className="opacity-40">[{log.time}]</span> {log.msg}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'clients' && (
            <div className="grid gap-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative group flex-1">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <Search className="w-5 h-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar por cliente o ID de WhatsApp..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#0B0F1A] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all shadow-xl"
                  />
                </div>
                <button
                  onClick={handleClearData}
                  className="px-6 py-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white transition-all shadow-lg active:scale-95"
                  title="Borrar todo el historial y clientes"
                >
                  <Trash2 className="w-5 h-5" />
                  <span className="hidden sm:inline">Limpiar Base de Datos</span>
                </button>
              </div>

              <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left min-w-[600px] sm:min-w-full">
                  <thead className="bg-[#121826] border-b border-white/5">
                    <tr>
                      <th className="px-4 sm:px-8 py-4 text-xs font-bold text-slate-500 uppercase">Cliente</th>
                      <th className="px-4 sm:px-8 py-4 text-xs font-bold text-slate-500 uppercase">ID WhatsApp</th>
                      <th className="px-4 sm:px-8 py-4 text-xs font-bold text-slate-500 uppercase">Estado</th>
                      <th className="hidden lg:table-cell px-8 py-4 text-xs font-bold text-slate-500 uppercase">Última Vez</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads
                      .filter(lead =>
                        lead.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        lead.wa_id?.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map((lead, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors text-sm sm:text-base">
                          <td className="px-4 sm:px-8 py-4 font-medium text-white">{lead.customer_name}</td>
                          <td className="px-4 sm:px-8 py-4 text-slate-400 font-mono text-[10px] sm:text-xs">{lead.wa_id}</td>
                          <td className="px-4 sm:px-8 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${lead.status === 'hot_lead' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                              {lead.status === 'hot_lead' ? '🔥 Venta Potencial' : '👤 Prospecto'}
                            </span>
                          </td>
                          <td className="hidden lg:table-cell px-8 py-4 text-slate-500 text-xs">{new Date(lead.last_interaction).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'scheduled' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-6">
                <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyan-400" /> Nuevo Envío Programado
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Destinatario</label>
                    <input
                      value={schedNum}
                      onChange={e => setSchedNum(e.target.value)}
                      type="text"
                      placeholder="Número o ID de Grupo..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-cyan-500/50 outline-none"
                    />
                  </div>

                  {groups.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase font-bold px-1">O selecciona un grupo</label>
                      <select
                        onChange={(e) => setSchedNum(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-cyan-500/50 outline-none text-slate-300"
                        defaultValue=""
                      >
                        <option value="" disabled>Selecciona un grupo...</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Mensaje</label>
                    <textarea
                      value={schedMsg}
                      onChange={e => setSchedMsg(e.target.value)}
                      placeholder="Escribe el mensaje aquí..."
                      className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-cyan-500/50 outline-none resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Fecha y Hora</label>
                    <input
                      value={schedDate}
                      onChange={e => setSchedDate(e.target.value)}
                      type="datetime-local"
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-cyan-500/50 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Archivo (Opcional - Imagen, Video o PDF)</label>
                    <div className="flex flex-col gap-2">
                      <input
                        type="file"
                        accept="image/*,video/*,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="media-upload"
                      />
                      <label
                        htmlFor="media-upload"
                        className={`w-full p-3 bg-black/40 border border-dashed border-white/10 rounded-xl text-xs text-center cursor-pointer hover:border-cyan-500/50 transition-all ${uploadingImage ? 'opacity-50 cursor-wait' : ''}`}
                      >
                        {uploadingImage ? 'Subiendo...' : schedImage ? '✅ Archivo Listo' : '📁 Seleccionar Archivo'}
                      </label>
                      {schedImage && (
                        <div className="relative w-full p-4 bg-black/20 rounded-xl overflow-hidden border border-white/5 flex items-center gap-3">
                          {schedFileType === 'application/pdf' ? (
                            <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                              <FileText className="w-6 h-6 text-red-500" />
                            </div>
                          ) : schedFileType.startsWith('video/') ? (
                            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                              <Video className="w-6 h-6 text-blue-500" />
                            </div>
                          ) : (
                            <img src={schedImage} className="w-10 h-10 object-cover rounded-lg" alt="Preview" />
                          )}
                          <div className="flex-1 truncate">
                            <div className="text-[10px] text-white font-bold truncate">{schedFileName || 'Archivo seleccionado'}</div>
                            <div className="text-[8px] text-slate-500 truncate">{schedImage}</div>
                          </div>
                          <button
                            onClick={() => {
                              setSchedImage('');
                              setSchedFileName('');
                              setSchedFileType('');
                              const fileInput = document.getElementById('media-upload') as HTMLInputElement;
                              if (fileInput) fileInput.value = '';
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all text-[10px] font-bold"
                            title="Quitar archivo"
                          >
                            <XCircle className="w-3 h-3" />
                            Quitar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleSchedule}
                    className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/10 active:scale-[0.98]"
                  >
                    Programar Mensaje
                  </button>
                </div>
              </div>
              <div className="lg:col-span-2 bg-[#0B0F1A] border border-white/5 rounded-3xl p-6">
                <h3 className="text-white font-bold mb-6">Próximos Envíos</h3>
                <div className="space-y-3">
                  {scheduledMsgs.length === 0 ? (
                    <div className="text-slate-500 text-sm italic text-center py-8">No hay mensajes programados</div>
                  ) : (
                    scheduledMsgs.map((msg, i) => (
                      <div key={i} className="p-4 bg-white/5 rounded-2xl flex justify-between items-center group">
                        <div className="flex-1 mr-4">
                          <div className="text-sm font-bold text-white">{msg.to_number}</div>
                          <div className="text-xs text-slate-500 truncate max-w-xs">{msg.message}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className={`text-[10px] font-bold uppercase ${msg.status === 'sent' ? 'text-emerald-500' : 'text-amber-500'}`}>{msg.status}</div>
                            <div className="text-[10px] text-slate-500">{new Date(msg.schedule_at).toLocaleString()}</div>
                          </div>
                          <button
                            onClick={() => handleDeleteScheduled(msg.id, msg.message)}
                            className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            title="Eliminar programación"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'groups_ai' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0B0F1A] p-6 rounded-3xl border border-white/5">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <MessageSquare className="w-6 h-6 text-cyan-400" />
                    IA en Grupos de WhatsApp
                  </h3>
                  <p className="text-sm text-slate-500">Activa el bot en grupos específicos y dales una personalidad única.</p>
                </div>
                <button
                  onClick={refreshGroups}
                  disabled={loadingGroups}
                  className={`bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-6 rounded-xl transition-all shadow-lg shadow-cyan-500/20 active:scale-95 flex items-center gap-2 ${loadingGroups ? 'opacity-50 cursor-wait' : ''}`}
                >
                  <Activity className={`w-4 h-4 ${loadingGroups ? 'animate-spin' : ''}`} />
                  {loadingGroups ? 'Escaneando...' : 'Escanear Grupos'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {groups.length === 0 ? (
                  <div className="col-span-full bg-[#0B0F1A] border border-white/5 rounded-3xl p-12 text-center text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    Haz clic en "Escanear Grupos" para ver tus conversaciones grupales.
                  </div>
                ) : (
                  groups.map((group) => {
                    const setting = groupSettings.find(s => s.group_id === group.id);
                    const isActive = setting?.is_active ?? false;
                    return (
                      <div key={group.id} className={`bg-[#0B0F1A] border rounded-3xl p-6 transition-all ${isActive ? 'border-cyan-500/30 ring-1 ring-cyan-500/20' : 'border-white/5 opacity-80'}`}>
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 rounded-xl flex items-center justify-center text-cyan-400">
                              <Users className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="font-bold text-white leading-tight">{group.name}</h4>
                              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{group.id.split('@')[0]}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleGroup(group.id, isActive, group.name)}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-white/5 text-slate-500 hover:text-white'}`}
                          >
                            {isActive ? '🤖 IA Activa' : 'Ignorar'}
                          </button>
                        </div>

                        {isActive && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 uppercase font-bold px-1 flex items-center gap-1">
                                <Cpu className="w-3 h-3" /> Prompt para este Grupo
                              </label>
                              <textarea
                                defaultValue={setting?.custom_prompt || ''}
                                onBlur={(e) => handleSaveGroupPrompt(group.id, e.target.value, group.name)}
                                placeholder="Escribe las instrucciones únicas para este grupo..."
                                className="w-full h-24 bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-slate-300 focus:border-cyan-500/50 outline-none resize-none transition-all"
                              />
                            </div>
                            <div className="text-[10px] text-cyan-400 italic">
                              * El bot solo responderá en este grupo usando las instrucciones de arriba.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'blocked_numbers' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0B0F1A] p-6 rounded-3xl border border-white/5">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <ShieldBan className="w-6 h-6 text-red-400" />
                    Números Bloqueados
                  </h3>
                  <p className="text-sm text-slate-500">Controla a qué números NO debe responder el bot.</p>
                </div>
                <button
                  onClick={refreshBlockedNumbers}
                  disabled={loadingContacts}
                  className={`bg-red-500/80 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-xl transition-all shadow-lg shadow-red-500/20 active:scale-95 flex items-center gap-2 ${loadingContacts ? 'opacity-50 cursor-wait' : ''}`}
                >
                  <Activity className={`w-4 h-4 ${loadingContacts ? 'animate-spin' : ''}`} />
                  {loadingContacts ? 'Escaneando...' : '📱 Escanear Contactos'}
                </button>
              </div>

              {/* Agregar Nuevo Número */}
              <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-6">
                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-red-400" />
                  Bloquear Nuevo Número
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Número de Teléfono *</label>
                    <input
                      value={newBlockNumber}
                      onChange={e => setNewBlockNumber(e.target.value)}
                      type="text"
                      placeholder="521234567890"
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-red-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Nombre (opcional)</label>
                    <input
                      value={newBlockName}
                      onChange={e => setNewBlockName(e.target.value)}
                      type="text"
                      placeholder="Spam, Competencia..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-red-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Razón (opcional)</label>
                    <input
                      value={newBlockReason}
                      onChange={e => setNewBlockReason(e.target.value)}
                      type="text"
                      placeholder="Spam, acoso, etc."
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-red-500/50 outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleAddBlockedNumber}
                      disabled={!newBlockNumber.trim()}
                      className="w-full py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-red-500/10 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <ShieldBan className="w-4 h-4" />
                      Bloquear
                    </button>
                  </div>
                </div>
              </div>

              {/* Buscador */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Search className="w-5 h-5 text-slate-500 group-focus-within:text-red-400 transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por número o nombre..."
                  value={blockedSearchTerm}
                  onChange={(e) => setBlockedSearchTerm(e.target.value)}
                  className="w-full bg-[#0B0F1A] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500/50 transition-all shadow-xl"
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-[#0B0F1A] border border-white/5 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">{blockedNumbers.length}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total en Lista</div>
                </div>
                <div className="bg-[#0B0F1A] border border-red-500/20 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">{blockedNumbers.filter(b => b.is_blocked).length}</div>
                  <div className="text-[10px] text-red-400/70 uppercase font-bold tracking-wider">Bloqueados</div>
                </div>
                <div className="bg-[#0B0F1A] border border-emerald-500/20 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{blockedNumbers.filter(b => !b.is_blocked).length}</div>
                  <div className="text-[10px] text-emerald-400/70 uppercase font-bold tracking-wider">Permitidos</div>
                </div>
              </div>

              {/* Lista de Números */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {blockedNumbers.length === 0 ? (
                  <div className="col-span-full bg-[#0B0F1A] border border-white/5 rounded-3xl p-12 text-center text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    Haz clic en "Escanear Contactos" para ver tus conversaciones individuales.
                  </div>
                ) : (
                  blockedNumbers
                    .filter(b =>
                      b.phone_number?.includes(blockedSearchTerm) ||
                      b.contact_name?.toLowerCase().includes(blockedSearchTerm.toLowerCase())
                    )
                    .sort((a: any, b: any) => (a.is_blocked ? 1 : -1) - (b.is_blocked ? 1 : -1))
                    .map((entry: any) => (
                      <div
                        key={entry.phone_number}
                        className={`bg-[#0B0F1A] border rounded-3xl p-6 transition-all ${!entry.is_blocked
                          ? 'border-cyan-500/30 ring-1 ring-cyan-500/20'
                          : 'border-white/5 opacity-80'
                          }`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${!entry.is_blocked
                              ? 'bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 text-cyan-400'
                              : 'bg-white/5 text-slate-500'
                              }`}>
                              <Users className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="font-bold text-white leading-tight">{entry.contact_name || 'Sin Nombre'}</h4>
                              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{entry.phone_number}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleBlockNumber(entry.phone_number, entry.is_blocked, entry.contact_name)}
                              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!entry.is_blocked
                                ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                                : 'bg-white/5 text-slate-500 hover:text-white'
                                }`}
                            >
                              {!entry.is_blocked ? '🤖 IA Activa' : 'Ignorar'}
                            </button>
                            <button
                              onClick={() => handleRemoveBlockedNumber(entry.phone_number)}
                              className="p-2 bg-white/5 text-slate-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                              title="Eliminar de la lista"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {entry.reason && (
                          <div className="text-[10px] text-slate-400 bg-black/20 rounded-lg p-2 border border-white/5 italic">
                            📝 Nota: {entry.reason}
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'media_library' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0B0F1A] p-6 rounded-3xl border border-white/5">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Paperclip className="w-6 h-6 text-orange-400" />
                    Biblioteca de Contenido
                  </h3>
                  <p className="text-sm text-slate-500">Sube archivos que la IA enviará automáticamente cuando sea relevante.</p>
                </div>
                <button
                  onClick={refreshMediaLibrary}
                  className="bg-orange-500/80 hover:bg-orange-600 text-white font-bold py-2 px-6 rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-95 flex items-center gap-2"
                >
                  <Activity className="w-4 h-4" />
                  Actualizar
                </button>
              </div>

              {/* Subir contenido */}
              <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-6">
                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-orange-400" />
                  Agregar Contenido
                </h4>

                {/* Upload de archivo */}
                <div className="mb-4 p-4 border-2 border-dashed border-white/10 rounded-2xl text-center hover:border-orange-500/30 transition-all">
                  <input
                    type="file"
                    id="media-upload"
                    accept="image/*,video/*,.pdf"
                    onChange={handleUploadMediaFile}
                    className="hidden"
                  />
                  <label htmlFor="media-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    {uploadingMedia ? (
                      <div className="flex items-center gap-2 text-orange-400">
                        <Activity className="w-6 h-6 animate-spin" />
                        <span className="font-bold">Subiendo archivo...</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500" />
                        <span className="text-sm text-slate-400">
                          <span className="text-orange-400 font-bold">Haz clic para subir</span> o arrastra un archivo
                        </span>
                        <span className="text-[10px] text-slate-600">Imágenes, Videos y PDFs</span>
                      </>
                    )}
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">URL del Archivo *</label>
                    <input
                      value={newMediaUrl}
                      onChange={e => setNewMediaUrl(e.target.value)}
                      type="text"
                      placeholder="https://..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-orange-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Nombre *</label>
                    <input
                      value={newMediaName}
                      onChange={e => setNewMediaName(e.target.value)}
                      type="text"
                      placeholder="Catálogo de precios"
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-orange-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Descripción / Contexto</label>
                    <input
                      value={newMediaDesc}
                      onChange={e => setNewMediaDesc(e.target.value)}
                      type="text"
                      placeholder="Enviar cuando pregunten por precios"
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-orange-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Tipo</label>
                    <div className="flex gap-2">
                      <select
                        value={newMediaType}
                        onChange={e => setNewMediaType(e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:border-orange-500/50 outline-none"
                      >
                        <option value="image">🖼️ Imagen</option>
                        <option value="video">🎬 Video</option>
                        <option value="pdf">📄 PDF</option>
                      </select>
                      <button
                        onClick={handleAddMediaItem}
                        disabled={!newMediaUrl.trim() || !newMediaName.trim()}
                        className="px-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-orange-500/10 active:scale-[0.98] flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Buscador */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Search className="w-5 h-5 text-slate-500 group-focus-within:text-orange-400 transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por nombre o descripción..."
                  value={mediaSearchTerm}
                  onChange={(e) => setMediaSearchTerm(e.target.value)}
                  className="w-full bg-[#0B0F1A] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50 transition-all shadow-xl"
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-[#0B0F1A] border border-white/5 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">{mediaLibrary.length}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Archivos</div>
                </div>
                <div className="bg-[#0B0F1A] border border-orange-500/20 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold text-orange-400">{mediaLibrary.filter(m => m.is_active).length}</div>
                  <div className="text-[10px] text-orange-400/70 uppercase font-bold tracking-wider">Activos</div>
                </div>
                <div className="bg-[#0B0F1A] border border-slate-500/20 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold text-slate-400">{mediaLibrary.filter(m => !m.is_active).length}</div>
                  <div className="text-[10px] text-slate-400/70 uppercase font-bold tracking-wider">Inactivos</div>
                </div>
              </div>

              {/* Lista de medios */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {mediaLibrary.length === 0 ? (
                  <div className="col-span-full bg-[#0B0F1A] border border-white/5 rounded-3xl p-12 text-center text-slate-500">
                    <Paperclip className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    No hay archivos en la biblioteca. Sube uno arriba.
                  </div>
                ) : (
                  mediaLibrary
                    .filter(m =>
                      m.file_name?.toLowerCase().includes(mediaSearchTerm.toLowerCase()) ||
                      m.description?.toLowerCase().includes(mediaSearchTerm.toLowerCase())
                    )
                    .map((item: any) => (
                      <div
                        key={item.id}
                        className={`bg-[#0B0F1A] border rounded-3xl overflow-hidden transition-all ${item.is_active
                          ? 'border-orange-500/30 ring-1 ring-orange-500/20'
                          : 'border-white/5 opacity-60'
                          }`}
                      >
                        {/* Thumbnail / Preview */}
                        <div className="h-36 bg-gradient-to-br from-orange-500/5 to-amber-500/5 flex items-center justify-center relative">
                          {item.file_type === 'image' && item.file_url ? (
                            <img src={item.file_url} alt={item.file_name} className="w-full h-full object-cover" />
                          ) : item.file_type === 'video' ? (
                            <Video className="w-16 h-16 text-orange-400/40" />
                          ) : (
                            <FileText className="w-16 h-16 text-orange-400/40" />
                          )}
                          <div className="absolute top-2 right-2">
                            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${item.file_type === 'image' ? 'bg-blue-500/20 text-blue-400' :
                              item.file_type === 'video' ? 'bg-purple-500/20 text-purple-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                              {item.file_type === 'image' ? '🖼️' : item.file_type === 'video' ? '🎬' : '📄'} {item.file_type}
                            </span>
                          </div>
                          <div className="absolute top-2 left-2">
                            <span className="px-2 py-1 bg-black/60 rounded-lg text-[9px] font-bold text-slate-300">
                              ID: {item.id}
                            </span>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-4 space-y-3">
                          <h4 className="font-bold text-white text-sm leading-tight truncate">{item.file_name}</h4>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 bg-black/20 rounded-lg p-2 border border-white/5 italic line-clamp-2">
                              📝 {item.description}
                            </p>
                          )}
                          <div className="flex justify-between items-center pt-1">
                            <button
                              onClick={() => handleToggleMediaItem(item.id, item.is_active)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 ${item.is_active
                                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                : 'bg-white/5 text-slate-500 hover:text-white'
                                }`}
                            >
                              {item.is_active ? <><ToggleRight className="w-3 h-3" /> Activo</> : <><ToggleLeft className="w-3 h-3" /> Inactivo</>}
                            </button>
                            <button
                              onClick={() => handleRemoveMediaItem(item.id, item.file_name)}
                              className="p-2 bg-white/5 text-slate-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'kb' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400">
                      <Cpu className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Instrucciones de Comportamiento</h3>
                      <p className="text-sm text-slate-500">Define cómo debe actuar y responder la IA</p>
                    </div>
                  </div>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full h-[300px] bg-black/20 border border-white/10 rounded-2xl p-4 text-slate-300 focus:outline-none focus:border-purple-500/50 transition-colors resize-none mb-4"
                    placeholder="Ej: Eres un asistente de ventas experto. Tu tono es profesional pero cercano..."
                  />
                  <button
                    onClick={saveInstructions}
                    disabled={savingInstructions}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${saveSuccessInstructions
                      ? 'bg-green-600 text-white'
                      : savingInstructions
                        ? 'bg-purple-600/50 text-white/70 cursor-wait'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                  >
                    {savingInstructions ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Guardando...
                      </>
                    ) : saveSuccessInstructions ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        ¡Guardado!
                      </>
                    ) : (
                      'Guardar Personalidad'
                    )}
                  </button>
                </div>

                <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Información del Negocio</h3>
                      <p className="text-sm text-slate-500">Pega aquí tu plan de negocios, precios y FAQs</p>
                    </div>
                  </div>
                  <textarea
                    value={businessPlan}
                    onChange={(e) => setBusinessPlan(e.target.value)}
                    className="w-full h-[300px] bg-black/20 border border-white/10 rounded-2xl p-4 text-slate-300 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none mb-4"
                    placeholder="Pega aquí toda la información que la IA debe conocer..."
                  />
                  <button
                    onClick={saveBusinessPlan}
                    disabled={savingBusinessPlan}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${saveSuccessBusinessPlan
                      ? 'bg-green-600 text-white'
                      : savingBusinessPlan
                        ? 'bg-emerald-600/50 text-white/70 cursor-wait'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                  >
                    {savingBusinessPlan ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Guardando...
                      </>
                    ) : saveSuccessBusinessPlan ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        ¡Guardado!
                      </>
                    ) : (
                      'Actualizar Conocimiento'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Cpu className="w-6 h-6 text-purple-400" />
                      Rendimiento de APIs
                    </h3>
                    <p className="text-sm text-slate-500">Monitoreo en tiempo real de los límites y rotación de llaves.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {apiKeysStatus && apiKeysStatus.length > 0 ? (
                    apiKeysStatus.map((key) => {
                      const sessionPercent = Math.round((key.usedSession / key.totalSession) * 100);
                      const weeklyPercent = Math.round((key.usedWeekly / key.totalWeekly) * 100);
                      return (
                        <div key={key.id} className="bg-black/40 border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                          <div className="flex justify-between items-start mb-6">
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">API Key #{key.id + 1}</div>
                              <div className="text-xs font-mono text-slate-300">{key.keyHash}</div>
                            </div>
                            <div className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase ${key.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' :
                              key.status === 'error' ? 'bg-red-500/20 text-red-500' :
                                'bg-white/5 text-slate-500'
                              }`}>
                              {key.status}
                            </div>
                            <button
                              onClick={() => {
                                const weekly = prompt(`Ajustar mensajes SEMANALES para Key #${key.id + 1}:`, key.usedWeekly);
                                if (weekly !== null) {
                                  socket.emit('set-key-usage', { index: key.id, used_session: key.usedSession, used_weekly: parseInt(weekly) || 0 });
                                }
                              }}
                              className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-cyan-400 mt-0.5 ml-1"
                              title="Sincronizar manualmente con Ollama"
                            >
                              <Settings className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="space-y-6">
                            {/* Session Usage */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-400">Uso de Sesión</span>
                                <span className={sessionPercent > 80 ? 'text-amber-400' : 'text-cyan-400'}>{sessionPercent}% usado</span>
                              </div>
                              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 ${key.status === 'error' ? 'bg-red-500' :
                                    sessionPercent > 80 ? 'bg-amber-500' : 'bg-cyan-500'
                                    }`}
                                  style={{ width: `${sessionPercent}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[7px] text-slate-600 uppercase tracking-tighter">
                                <span>{key.usedSession} mensajes</span>
                                <span>Reinicia en ~2 horas</span>
                              </div>
                            </div>

                            {/* Weekly Usage */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-400">Uso Semanal</span>
                                <span className={weeklyPercent > 80 ? 'text-rose-400' : 'text-indigo-400'}>{weeklyPercent}% usado</span>
                              </div>
                              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 ${key.status === 'error' ? 'bg-red-500' :
                                    weeklyPercent > 80 ? 'bg-rose-500' : 'bg-indigo-500'
                                    }`}
                                  style={{ width: `${weeklyPercent}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[7px] text-slate-600 uppercase tracking-tighter">
                                <span>{key.usedWeekly} mensajes</span>
                                <span>Reinicia en ~6 días</span>
                              </div>
                            </div>
                          </div>

                          {key.lastError && (
                            <div className="mt-4 text-[9px] text-red-400/80 bg-red-400/5 p-2 rounded-lg border border-red-500/10 italic">
                              Error: {key.lastError}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-full py-12 text-center text-slate-500 italic">
                      Conectando con el servidor para obtener el estado de las APIs...
                    </div>
                  )}
                </div>

                <div className="mt-12 pt-8 border-t border-white/5">
                  <h4 className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-6 flex items-center gap-2">
                    <Settings className="w-3 h-3 text-cyan-400" /> DATOS DE SERVICIO
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 group hover:bg-white/[0.04] transition-colors">
                      <div className="text-[8px] text-slate-500 uppercase font-bold mb-1">Servidor Localización</div>
                      <div className="text-[9px] text-slate-400 font-mono leading-tight break-all uppercase">c:\Ackerman3\susefull\chatBot\services</div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 group hover:bg-white/[0.04] transition-colors">
                      <div className="text-[8px] text-slate-500 uppercase font-bold mb-1">Dirección IP</div>
                      <div className="text-[10px] text-cyan-500/80 font-mono font-bold">198.251.79.175</div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 group hover:bg-white/[0.04] transition-colors">
                      <div className="text-[8px] text-slate-500 uppercase font-bold mb-1">Protocolos de Acceso</div>
                      <div className="text-[10px] text-slate-300 font-mono">SSH & SFTP (Encrypted)</div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 group hover:bg-white/[0.04] transition-colors">
                      <div className="text-[8px] text-slate-500 uppercase font-bold mb-1">Proxy Gate</div>
                      <div className="text-[10px] text-amber-500/80 font-mono">AES-256-GCM / 10.0.8.1</div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 group hover:bg-white/[0.04] transition-colors">
                      <div className="text-[8px] text-slate-500 uppercase font-bold mb-1">Base Analytics</div>
                      <div className="text-[10px] text-slate-300">Supabase: Analytics Active</div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 group hover:bg-white/[0.04] transition-colors">
                      <div className="text-[8px] text-slate-500 uppercase font-bold mb-1">Push Engine</div>
                      <div className="text-[10px] text-slate-300">Firebase: Notificaciones FCM</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================
           *  PESTAÑA: SUSCRIPTORES AL CALCULADORA
           * ================================================ */}
          {activeTab === 'suscriptores' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                  <TrendingUp className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">AL Calculadora — Panel de Suscripciones</h2>
                  <p className="text-xs text-slate-500">Datos en tiempo real desde Firebase</p>
                </div>
                {fbStats.updatedAt && (
                  <div className="ml-auto text-[10px] text-slate-600 font-mono">
                    Actualizado: {new Date(fbStats.updatedAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                )}
              </div>

              {/* KPI Cards */}
              {fbStatsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-6 animate-pulse">
                      <div className="h-4 bg-white/5 rounded-lg mb-4 w-1/2" />
                      <div className="h-10 bg-white/5 rounded-lg w-3/4" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {/* Tarjeta 1: Total Activos */}
                  <div className="bg-gradient-to-br from-emerald-900/30 to-[#0B0F1A] border border-emerald-500/20 rounded-3xl p-6 relative overflow-hidden group shadow-lg">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Users className="w-16 h-16 text-emerald-400" />
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                        <Users className="w-5 h-5 text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Total De Suscriptores</span>
                    </div>
                    <div className="text-4xl font-black text-white mb-2">{fbStats.totalActivos.toLocaleString('es-MX')}</div>
                    <p className="text-[10px] text-slate-500">Cuentas con estatus "active" en la App</p>
                  </div>

                  {/* Tarjeta 2: Sin Cancelar (Google Play) */}
                  <div
                    onClick={() => setShowEmailModal({ show: true, title: 'Suscripciones Sin Cancelar', emails: fbStats.correos })}
                    className="bg-gradient-to-br from-cyan-900/30 to-[#0B0F1A] border border-cyan-500/20 rounded-3xl p-6 relative overflow-hidden group cursor-pointer hover:border-cyan-500/40 transition-all active:scale-[0.98] shadow-lg"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <CheckCircle2 className="w-16 h-16 text-cyan-400" />
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                        <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                      </div>
                      <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Suscripciones Sin Cancelar</span>
                    </div>
                    <div className="text-4xl font-black text-white mb-2">{fbStats.numero.toLocaleString('es-MX')}</div>
                    <p className="text-[10px] text-slate-500">Suscripciones activas — Tocar para lista</p>
                  </div>

                  {/* Tarjeta 3: Canceladas (Real) */}
                  <div
                    onClick={() => setShowEmailModal({ show: true, title: 'Suscripciones Canceladas', emails: fbStats.correoscanceled })}
                    className="bg-gradient-to-br from-red-900/30 to-[#0B0F1A] border border-red-500/20 rounded-3xl p-6 relative overflow-hidden group cursor-pointer hover:border-red-500/40 transition-all active:scale-[0.98] shadow-lg"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <XCircle className="w-16 h-16 text-red-400" />
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-red-500/10 rounded-xl border border-red-500/20">
                        <XCircle className="w-5 h-5 text-red-400" />
                      </div>
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Suscripciones Canceladas</span>
                    </div>
                    <div className="text-4xl font-black text-white mb-2">{fbStats.totalcencelednumero.toLocaleString('es-MX')}</div>
                    <p className="text-[10px] text-slate-500">Usuarios cancelados — Tocar para lista</p>
                  </div>

                  {/* Tarjeta 4: Total De Descargas */}
                  <div className="bg-gradient-to-br from-purple-900/30 to-[#0B0F1A] border border-purple-500/20 rounded-3xl p-6 relative overflow-hidden group shadow-lg">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Smartphone className="w-16 h-16 text-purple-400" />
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-purple-500/10 rounded-xl border border-purple-500/20">
                        <Smartphone className="w-5 h-5 text-purple-400" />
                      </div>
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Total De Descargas</span>
                    </div>
                    <div className="text-4xl font-black text-white mb-2">{fbStats.total_cuentas.toLocaleString('es-MX')}</div>
                    <p className="text-[10px] text-slate-500">Suma absoluta de usuarios en la App</p>
                  </div>
                </div>
              )}

              {/* Botón Acceso Directo a Play Console */}
              <div className="flex justify-center -mt-2">
                <a
                  href="https://play.google.com/console/u/1/developers/6272255899833312893/paymentssettings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold uppercase tracking-widest text-slate-300 hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30 transition-all group shadow-lg"
                >
                  <TrendingUp className="w-4 h-4 transition-transform group-hover:scale-110" />
                  Ver ingresos reales en Play Console ↗
                </a>
              </div>

              {/* =============================================
               *  GRÁFICA DE TENDENCIA POR DÍA (SVG puro)
               * ============================================= */}
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  Tendencia por Día
                  <span className="text-[9px] text-slate-600 font-normal normal-case ml-1">(guardado localmente, últimos 30 días)</span>
                </h3>

                {dailyHistory.length < 2 ? (
                  <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-8 text-center">
                    <TrendingUp className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">La gráfica aparecerá cuando haya datos de al menos 2 días.</p>
                    <p className="text-slate-600 text-xs mt-1">Hoy se guardó el primer punto ({dailyHistory[0]?.date ?? '—'}).</p>
                  </div>
                ) : (() => {
                  const W = 620, H = 200;
                  const P = { t: 16, r: 20, b: 38, l: 46 };
                  const cW = W - P.l - P.r;
                  const cH = H - P.t - P.b;
                  const maxVal = Math.max(...dailyHistory.flatMap(d => [d.totalActivos, d.numero]));
                  const minVal = Math.max(0, Math.min(...dailyHistory.flatMap(d => [d.totalActivos, d.numero])) - 2);
                  const range = maxVal - minVal || 1;
                  const px = (i: number) => P.l + (i / (dailyHistory.length - 1)) * cW;
                  const py = (v: number) => P.t + cH - ((v - minVal) / range) * cH;
                  const pathForKey = (k: 'totalActivos' | 'numero') =>
                    dailyHistory.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(d[k]).toFixed(1)}`).join(' ');

                  return (
                    <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-5">
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 200 }}>
                        {/* Grid lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map(t => (
                          <line key={t} x1={P.l} y1={P.t + cH * (1 - t)} x2={W - P.r} y2={P.t + cH * (1 - t)}
                            stroke="#1e293b" strokeWidth="1" />
                        ))}
                        {/* Y axis labels */}
                        {[0, 0.5, 1].map(t => (
                          <text key={t} x={P.l - 6} y={P.t + cH * (1 - t) + 4} textAnchor="end" fill="#475569" fontSize="9">
                            {Math.round(minVal + range * t)}
                          </text>
                        ))}
                        {/* Area fill totalActivos */}
                        <path d={`${pathForKey('totalActivos')} L${px(dailyHistory.length - 1).toFixed(1)},${(P.t + cH).toFixed(1)} L${P.l.toFixed(1)},${(P.t + cH).toFixed(1)} Z`}
                          fill="url(#gEmerald)" opacity="0.15" />
                        {/* Area fill numero */}
                        <path d={`${pathForKey('numero')} L${px(dailyHistory.length - 1).toFixed(1)},${(P.t + cH).toFixed(1)} L${P.l.toFixed(1)},${(P.t + cH).toFixed(1)} Z`}
                          fill="url(#gCyan)" opacity="0.15" />
                        {/* Lines */}
                        <path d={pathForKey('totalActivos')} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d={pathForKey('numero')} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        {/* Dots */}
                        {dailyHistory.map((d, i) => (
                          <g key={i}>
                            <circle cx={px(i)} cy={py(d.totalActivos)} r="3.5" fill="#10b981" />
                            <circle cx={px(i)} cy={py(d.numero)} r="3.5" fill="#06b6d4" />
                            {/* Tooltip-like value on hover — simple title */}
                            <title>{d.date}: Total={d.totalActivos}, Sin cancelar={d.numero}</title>
                          </g>
                        ))}
                        {/* X labels — show max 8 */}
                        {dailyHistory.filter((_, i) => i % Math.max(1, Math.floor(dailyHistory.length / 8)) === 0 || i === dailyHistory.length - 1).map((d, _, arr) => {
                          const origIdx = dailyHistory.indexOf(d);
                          return (
                            <text key={origIdx} x={px(origIdx)} y={H - 4} textAnchor="middle" fill="#475569" fontSize="8.5">
                              {d.date.slice(5)}
                            </text>
                          );
                        })}
                        {/* Gradient defs */}
                        <defs>
                          <linearGradient id="gEmerald" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="gCyan" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" /><stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                      </svg>
                      {/* Legend */}
                      <div className="flex items-center gap-6 justify-center mt-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                          <span className="text-[10px] text-slate-400">Total Suscriptores</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-0.5 bg-cyan-400 rounded" />
                          <span className="text-[10px] text-slate-400">Sin Cancelar</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Sección de Afiliados */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    Rendimiento de Afiliados
                  </h3>
                  <button
                    onClick={() => setShowPayConfig(v => !v)}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 border border-white/10 hover:bg-slate-700 transition-colors"
                  >
                    ⚙️ Configurar precios
                  </button>
                </div>

                {/* Panel de configuración de precios */}
                {showPayConfig && (
                  <div className="bg-[#0B0F1A] border border-white/10 rounded-2xl p-5 mb-5 shadow-inner">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-400" />
                      💰 Configuración de Pago (Supabase)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Comisión mensual (MXN)</label>
                        <input
                          type="number"
                          value={paymentConfig.mensualPrice || ''}
                          onChange={e => {
                            const newConf = { ...paymentConfig, mensualPrice: Number(e.target.value) };
                            setPaymentConfig(newConf);
                            savePaymentConfigToSupabase(newConf);
                          }}
                          className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-blue-500/50 outline-none transition-colors"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Comisión anual (MXN)</label>
                        <input
                          type="number"
                          value={paymentConfig.anualPrice || ''}
                          onChange={e => {
                            const newConf = { ...paymentConfig, anualPrice: Number(e.target.value) };
                            setPaymentConfig(newConf);
                            savePaymentConfigToSupabase(newConf);
                          }}
                          className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500/50 outline-none transition-colors"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Datos del Pagador (Aparecen en PDF)</h5>
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Nombre de Empresa o Persona</label>
                        <input
                          type="text"
                          value={paymentConfig.payerName}
                          onChange={e => {
                            const newConf = { ...paymentConfig, payerName: e.target.value };
                            setPaymentConfig(newConf);
                            savePaymentConfigToSupabase(newConf);
                          }}
                          className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-amber-500/50 outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Dirección Fiscal / Oficina</label>
                          <input
                            type="text"
                            value={paymentConfig.payerAddress}
                            onChange={e => {
                              const newConf = { ...paymentConfig, payerAddress: e.target.value };
                              setPaymentConfig(newConf);
                              savePaymentConfigToSupabase(newConf);
                            }}
                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-amber-500/50 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Identificación / RFC</label>
                          <input
                            type="text"
                            value={paymentConfig.payerRFC}
                            onChange={e => {
                              const newConf = { ...paymentConfig, payerRFC: e.target.value };
                              setPaymentConfig(newConf);
                              savePaymentConfigToSupabase(newConf);
                            }}
                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-amber-500/50 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-3 flex items-center gap-1.5 italic">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Los cambios se sincronizan en la nube automáticamente para todos los dispositivos.
                    </p>
                  </div>
                )}

                {fbAfiliados.length === 0 ? (
                  <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-10 text-center">
                    <Crown className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">Aún no hay datos de afiliados. Los contadores se actualizarán conforme los suscriptores activen o cancelen sus planes.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-8 max-w-[1600px] mx-auto">
                    {fbAfiliados.map((afiliado: any) => {
                      const mensual = afiliado.mensualActivos ?? 0;
                      const anual = afiliado.anualActivos ?? 0;
                      const total = mensual + anual;
                      const lastPay = affiliatePayments[afiliado.id];
                      const anualNuevos = Math.max(0, anual - (lastPay?.anual_al_pago ?? 0));
                      const mensualNuevos = Math.max(0, mensual - (lastPay?.mensual_al_pago ?? 0));
                      const lastDate = lastPay ? new Date(lastPay.pagado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
                      const isConfirming = paymentConfirm === afiliado.id;
                      return (
                        <div key={afiliado.id} className="bg-[#0B0F1A] border border-white/5 rounded-[2.5rem] p-8 lg:p-10 hover:border-amber-500/40 transition-all group shadow-2xl hover:shadow-amber-500/5 min-h-[400px] flex flex-col justify-between">
                          {/* Header */}
                          <div className="flex items-center gap-6 mb-8">
                            <div className="w-16 h-16 bg-amber-500/10 rounded-[1.5rem] flex items-center justify-center border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors shadow-inner">
                              <Crown className="w-8 h-8 text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-white text-xl lg:text-2xl truncate tracking-tight">{afiliado.name ?? afiliado.id}</div>
                              <div className="text-xs lg:text-sm font-mono text-slate-500 mt-1">{afiliado.code ?? '—'}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl lg:text-4xl font-black text-white leading-none">{total}</div>
                              <div className="text-[10px] lg:text-xs text-slate-500 uppercase font-bold tracking-widest mt-1">Suscripciones</div>
                            </div>
                          </div>

                          {/* Contadores actuales */}
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-blue-500/5 border border-blue-500/10 rounded-[1.5rem] p-6 text-center group-hover:bg-blue-500/10 transition-colors">
                              <div className="flex items-center justify-center gap-2 mb-2">
                                <Smartphone className="w-4 h-4 text-blue-400" />
                                <span className="text-[11px] text-blue-400 uppercase font-bold tracking-widest">Plan Mensual</span>
                              </div>
                              <div className="text-3xl font-black text-white">{mensual}</div>
                            </div>
                            <div className="bg-purple-500/5 border border-purple-500/10 rounded-[1.5rem] p-6 text-center group-hover:bg-purple-500/10 transition-colors">
                              <div className="flex items-center justify-center gap-2 mb-2">
                                <Calendar className="w-4 h-4 text-purple-400" />
                                <span className="text-[11px] text-purple-400 uppercase font-bold tracking-widest">Plan Anual</span>
                              </div>
                              <div className="text-3xl font-black text-white">{anual}</div>
                            </div>
                          </div>

                          {/* A pagar este ciclo */}
                          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 mb-3">
                            <div className="text-[9px] text-emerald-400 uppercase font-bold mb-2 flex items-center gap-1">
                              💰 A pagar este ciclo
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center">
                              <div>
                                <div className="text-[9px] text-slate-500 uppercase">Mensual</div>
                                <div className={`text-base font-black ${mensualNuevos > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                                  +{mensualNuevos}
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] text-slate-500 uppercase">Anual</div>
                                <div className={`text-base font-black ${anualNuevos > 0 ? 'text-purple-400' : 'text-slate-600'}`}>
                                  +{anualNuevos}
                                </div>
                              </div>
                            </div>
                            {lastDate && (
                              <div className="text-[9px] text-slate-600 text-center mt-2 font-mono">
                                Último pago: {lastDate}
                              </div>
                            )}
                          </div>

                          {/* Desglose de pago - Ahora se muestra siempre que haya precios configurados para permitir previsualizar */}
                          {(paymentConfig.mensualPrice > 0 || paymentConfig.anualPrice > 0) && (
                            <div className="bg-slate-800/40 border border-white/5 rounded-xl p-3 mb-3 text-[11px]">
                              <div className="text-[9px] text-slate-500 uppercase font-bold mb-2">📊 Desglose</div>
                              {mensualNuevos > 0 && (
                                <div className="flex justify-between text-slate-300 mb-1">
                                  <span>📱 {mensualNuevos} mensual{mensualNuevos !== 1 ? 'es' : ''} × ${paymentConfig.mensualPrice.toLocaleString('es-MX')}</span>
                                  <span className="font-bold text-blue-400">${(mensualNuevos * paymentConfig.mensualPrice).toLocaleString('es-MX')} MXN</span>
                                </div>
                              )}
                              {anualNuevos > 0 && (
                                <div className="flex justify-between text-slate-300 mb-1">
                                  <span>📅 {anualNuevos} anual{anualNuevos !== 1 ? 'es' : ''} × ${paymentConfig.anualPrice.toLocaleString('es-MX')}</span>
                                  <span className="font-bold text-purple-400">${(anualNuevos * paymentConfig.anualPrice).toLocaleString('es-MX')} MXN</span>
                                </div>
                              )}
                              <div className="flex justify-between border-t border-white/5 pt-2 mt-2 font-bold">
                                <span className="text-slate-300">💰 Total</span>
                                <span className="text-emerald-400 text-sm">${((mensualNuevos * paymentConfig.mensualPrice) + (anualNuevos * paymentConfig.anualPrice)).toLocaleString('es-MX')} MXN</span>
                              </div>
                              {/* Botones de compartir */}
                              <div className="grid grid-cols-3 gap-2 mt-3">
                                <button
                                  onClick={() => setPreviewData({ afiliado, mensualN: mensualNuevos, anualN: anualNuevos })}
                                  className="text-[9px] font-bold uppercase py-1.5 rounded-lg bg-slate-700/50 text-slate-300 border border-white/5 hover:bg-slate-700 transition-colors"
                                >
                                  👁️ Vista Previa
                                </button>
                                <button
                                  disabled={sharing}
                                  onClick={() => handleDownloadPDF(afiliado, mensualNuevos, anualNuevos)}
                                  className="text-[9px] font-bold uppercase py-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                                >
                                  📥 Descargar
                                </button>
                                <button
                                  disabled={sharing}
                                  onClick={() => shareWhatsApp(afiliado.name ?? afiliado.id, mensualNuevos, anualNuevos, afiliado)}
                                  className="text-[9px] font-bold uppercase py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                                >
                                  📱 WhatsApp
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Botón registrar pago (triple confirmación) */}
                          {paymentConfirm?.id !== afiliado.id ? (
                            <button
                              onClick={() => setPaymentConfirm({ id: afiliado.id, step: 1 })}
                              className="w-full text-[10px] font-bold uppercase tracking-widest py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-2"
                            >
                              💳 Registrar Pago
                            </button>
                          ) : paymentConfirm.step === 1 ? (
                            <div className="space-y-2">
                              <p className="text-[10px] text-center text-amber-400 font-bold">¿Seguro que quieres registrar el pago?</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => setPaymentConfirm({ id: afiliado.id, step: 2 })}
                                  className="text-[10px] font-bold uppercase py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                                >
                                  ⚠️ Sí, continuar
                                </button>
                                <button
                                  onClick={() => setPaymentConfirm(null)}
                                  className="text-[10px] font-bold uppercase py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                                >
                                  ❌ Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-[10px] text-center text-red-400 font-bold">¿Confirmación final? Los contadores quedarán en cero hasta nuevas suscripciones.</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleRegisterPayment(afiliado.id, afiliado.name ?? afiliado.id, anual, mensual)}
                                  className="text-[10px] font-bold uppercase py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                                >
                                  ✅ Confirmar pago
                                </button>
                                <button
                                  onClick={() => setPaymentConfirm(null)}
                                  className="text-[10px] font-bold uppercase py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                                >
                                  ❌ Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* =============================================
               *  LOG DE ACTIVIDAD
               * ============================================= */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    Actividad Reciente
                  </h3>
                  {/* Botón para activar notificaciones del navegador */}
                  {'Notification' in window && Notification.permission !== 'granted' && (
                    <button
                      onClick={() => Notification.requestPermission()}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                    >
                      <Bell className="w-3 h-3" />
                      Activar Notificaciones
                    </button>
                  )}
                  {('Notification' in window && Notification.permission === 'granted') && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                      <CheckCircle2 className="w-3 h-3" /> Notificaciones activas
                    </span>
                  )}
                </div>

                {activityLog.length === 0 ? (
                  <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-8 text-center">
                    <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">Sin actividad aún en esta sesión.</p>
                    <p className="text-slate-600 text-xs mt-1">Los eventos aparecerán aquí en tiempo real cuando cambien los contadores.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activityLog.map((event: any) => (
                      <div key={event.id} className={`flex items-start gap-3 bg-[#0B0F1A] border ${event.colorClass} rounded-2xl p-4`}>
                        <div className={`w-2 h-2 rounded-full ${event.dotColor} mt-1.5 shrink-0`} />
                        <p className="flex-1 text-sm text-white">{event.msg}</p>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">{event.time}</span>
                      </div>
                    ))}
                  </div>
                )}

              </div>

            </div>
          )}

        </div>
      </main>

      {/* Alertas */}
      <div className="fixed top-24 right-8 z-[100] space-y-3 pointer-events-none">
        {alerts.map(alert => (
          <div key={alert.id} className={`p-4 rounded-2xl bg-[#0B0F1A] border border-${alert.color}-500/30 flex items-center gap-3 shadow-2xl animate-in fade-in`}>
            <div className={`w-2 h-2 rounded-full bg-${alert.color}-500 animate-ping`} />
            <span className="text-white font-medium">{alert.msg}</span>
          </div>
        ))}
      </div>

      {/* ===========================================
       * MODAL: VISTA PREVIA DE RECIBO (PREVIEW)
       * =========================================== */}
      {previewData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onClick={() => setPreviewData(null)} />

          <div className="relative w-full max-w-4xl max-h-[95vh] flex flex-col bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header Modal */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Vista Previa del Recibo</h3>
                  <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Formato Carta • PDF Corporativo</p>
                </div>
              </div>
              <button onClick={() => setPreviewData(null)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Contenido (Simulación del Papel) */}
            <div className="flex-1 overflow-auto p-2 sm:p-10 bg-slate-950/50 flex justify-start sm:justify-center items-start">
              <div
                ref={receiptRef}
                className="bg-white shadow-2xl p-[10mm] sm:p-[15mm] text-slate-900 origin-top-left transition-transform duration-300"
                style={{
                  width: '216mm',
                  minHeight: '279mm',
                  transform: window.innerWidth < 768 ? `scale(${(window.innerWidth - 40) / 816})` : 'none',
                  marginTop: window.innerWidth < 768 ? '0' : '0'
                }}
              >
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center bg-slate-100">
                      <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
                    </div>
                    <div>
                      <h1 className="m-0 text-2xl font-black text-[#012e67] tracking-tighter">AL CALCULADORA</h1>
                      <p className="m-0 text-[10px] text-slate-500 font-bold tracking-[0.15em] uppercase">SISTEMA DE ADMINISTRACIÓN</p>
                    </div>
                  </div>
                  <div className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-black uppercase border border-emerald-600 shadow-sm">PAGO REGISTRADO</div>
                </div>

                <div className="border-b-2 border-slate-100 pb-4 mb-6">
                  <p className="m-0 text-sm font-bold text-slate-700">RECIBO DE COMISIONES #2024-XXXX</p>
                </div>

                <div className="grid grid-cols-2 gap-12 mb-10">
                  <div>
                    <h4 className="text-[10px] uppercase text-slate-400 font-bold border-b-2 border-slate-100 pb-1 mb-3 letter-spacing-1">PAGADOR</h4>
                    <p className="text-sm font-bold mb-1 text-slate-900">{paymentConfig.payerName}</p>
                    <p className="text-[12px] text-slate-600 leading-relaxed">{paymentConfig.payerAddress}</p>
                    <p className="text-[12px] text-slate-600 mt-1 font-semibold uppercase">RFC: {paymentConfig.payerRFC}</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] uppercase text-slate-400 font-bold border-b-2 border-slate-100 pb-1 mb-3 letter-spacing-1">BENEFICIARIO</h4>
                    <p className="text-sm font-bold mb-1 text-slate-900">{previewData.afiliado.name}</p>
                    <p className="text-[12px] text-slate-600"><span className="font-semibold text-slate-400">ID:</span> {previewData.afiliado.id}</p>
                    <p className="text-[12px] text-slate-600 uppercase"><span className="font-semibold text-slate-400">Cód:</span> {previewData.afiliado.code}</p>
                  </div>
                </div>

                <table className="w-full border-collapse mb-10">
                  <thead>
                    <tr className="bg-slate-50 border-b-2 border-slate-200">
                      <th className="text-left p-4 text-[11px] uppercase font-bold text-slate-500">Concepto / Periodo</th>
                      <th className="text-center p-4 text-[11px] uppercase font-bold text-slate-500">Cant.</th>
                      <th className="text-right p-4 text-[11px] uppercase font-bold text-slate-500">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    <tr>
                      <td className="p-4 font-semibold">Suscripción Mensual — Nuevos usuarios</td>
                      <td className="p-4 text-center font-bold">{previewData.mensualN}</td>
                      <td className="p-4 text-right font-black text-slate-900">${(previewData.mensualN * paymentConfig.mensualPrice).toLocaleString('es-MX')} MXN</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-semibold">Suscripción Anual — Nuevos usuarios</td>
                      <td className="p-4 text-center font-bold">{previewData.anualN}</td>
                      <td className="p-4 text-right font-black text-slate-900">${(previewData.anualN * paymentConfig.anualPrice).toLocaleString('es-MX')} MXN</td>
                    </tr>
                  </tbody>
                </table>

                <div className="border-[3px] border-emerald-500 rounded-2xl p-8 bg-emerald-50/50 text-center mb-12 shadow-inner">
                  <p className="text-lg font-black text-emerald-800 mb-1 tracking-tight">MONTO TOTAL A LIQUIDAR</p>
                  <p className="text-6xl font-black text-emerald-700 leading-none tracking-tighter">
                    ${((previewData.mensualN * paymentConfig.mensualPrice) + (previewData.anualN * paymentConfig.anualPrice)).toLocaleString('es-MX')}
                    <span className="text-2xl ml-2 font-bold opacity-40">MXN</span>
                  </p>
                </div>

                <div className="text-[10px] text-slate-400 text-center leading-relaxed mt-20 opacity-80 border-t border-slate-100 pt-6">
                  Este es un recibo digital oficial generado por el sistema administrativo de <strong>AL CALCULADORA</strong>.<br />
                  Gracias por su colaboración comercial.
                </div>
              </div>
            </div>

            {/* Footer Modal Acciones */}
            <div className="p-4 border-t border-white/5 bg-slate-800/50 flex justify-end gap-3 shrink-0">
              <button
                disabled={sharing}
                onClick={() => setPreviewData(null)}
                className="px-6 py-2.5 text-xs font-bold uppercase text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cerrar
              </button>

              <button
                disabled={sharing}
                onClick={() => shareWhatsAppPDF(previewData.afiliado.name ?? previewData.afiliado.id)}
                className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold uppercase flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {sharing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Smartphone className="w-4 h-4" />}
                Compartir WhatsApp
              </button>

              <button
                disabled={sharing}
                onClick={async () => {
                  const file = await generatePDFBlob();
                  const url = URL.createObjectURL(file);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `Recibo_${previewData.afiliado.name.replace(/\s+/g, '_')}.pdf`;
                  link.click();
                  setPreviewData(null);
                }}
                className="px-8 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-extrabold uppercase flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Descargar Recibo
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Correos */}
      {showEmailModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowEmailModal({ show: false, title: '', emails: [] })} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${showEmailModal.title.includes('Canceladas') ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                  {showEmailModal.title.includes('Canceladas') ? <XCircle className="w-5 h-5 text-red-400" /> : <CheckCircle2 className="w-5 h-5 text-blue-400" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{showEmailModal.title}</h3>
                  <p className="text-xs text-zinc-500">{showEmailModal.emails.length} correos encontrados</p>
                </div>
              </div>
              <button
                onClick={() => setShowEmailModal({ show: false, title: '', emails: [] })}
                className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
              {showEmailModal.emails.length > 0 ? (
                <div className="space-y-2">
                  {showEmailModal.emails.map((email: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-zinc-800/30 border border-zinc-800/50 rounded-xl hover:bg-zinc-800/50 transition-colors group">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 group-hover:text-zinc-300">
                        {idx + 1}
                      </div>
                      <span className="text-sm text-zinc-300 font-medium">{email}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(email);
                          addAlert('Copiado al portapapeles', 'blue');
                        }}
                        className="ml-auto p-2 opacity-0 group-hover:opacity-100 hover:bg-zinc-700 rounded-lg transition-all"
                        title="Copiar correo"
                      >
                        <FileText className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="inline-flex p-4 bg-zinc-800/50 rounded-full mb-4">
                    <Search className="w-8 h-8 text-zinc-600" />
                  </div>
                  <p className="text-zinc-500">No hay correos registrados en esta lista</p>
                </div>
              )}
            </div>
            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 text-center">
              <button
                onClick={() => setShowEmailModal({ show: false, title: '', emails: [] })}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-2xl transition-all active:scale-95"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconNavItem({ icon, active, onClick }: { icon: any, active: boolean, onClick: any }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-200 group ${active
        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-lg shadow-cyan-500/5'
        : 'text-slate-500 hover:bg-white/5 hover:text-white border border-transparent'
        }`}
    >
      <div className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110 group-active:scale-95'}`}>
        {icon}
      </div>
    </button>
  );
}

function StatCard({ title, value, change, icon }: any) {
  return (
    <div className="bg-[#0B0F1A] border border-white/5 rounded-3xl p-6">
      <div className="flex justify-between mb-4">
        <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">{icon}</div>
        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${change.startsWith('+') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{change}</span>
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">{title}</div>
    </div>
  );
}

export default App;
