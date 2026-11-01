/* Локальный/боевой сервер лендинга: статика + приём заявок в Excel + уведомление на почту */
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data')
const XLSX_FILE = process.env.XLSX_PATH || path.join(DATA_DIR, 'leads.xlsx')
const OUTBOX_FILE = process.env.OUTBOX_PATH || path.join(DATA_DIR, 'outbox.ndjson')
const PORT = Number(process.env.PORT) || 8100

/* ---------- конфиг (.env опционален) ---------- */
function loadEnv() {
  const env = { NOTIFY_EMAIL: 'lsem2010@yandex.ru', SMTP_PORT: '465' }
  const file = path.join(ROOT, '.env')
  if (fs.existsSync(file)) {
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    })
  }
  for (const k of Object.keys(process.env)) if (/^[A-Z0-9_]+$/.test(k) && process.env[k]) env[k] = process.env[k]
  return env
}
const env = loadEnv()

/* ---------- MIME ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}
const DENY = ['/node_modules/', '/data/', '/source/', '/.env', '/.git/']

/* ---------- Excel ---------- */
const ExcelJS = require('exceljs')
const SHEET = 'Заявки'
const COLUMNS = [
  { key: 'created', title: 'Дата заявки', width: 20 },
  { key: 'type', title: 'Тип', width: 14 },
  { key: 'bookId', title: 'Номер брони', width: 14 },
  { key: 'name', title: 'Имя', width: 22 },
  { key: 'phone', title: 'Телефон', width: 20 },
  { key: 'email', title: 'E-mail', width: 26 },
  { key: 'comment', title: 'Комментарий', width: 34 },
  { key: 'dateIn', title: 'Заезд', width: 14 },
  { key: 'dateOut', title: 'Выезд', width: 14 },
  { key: 'nights', title: 'Ночей', width: 8 },
  { key: 'guests', title: 'Гости', width: 18 },
  { key: 'room', title: 'Номер', width: 20 },
  { key: 'total', title: 'Итого, ₽', width: 12 },
  { key: 'prepayPct', title: 'Предоплата, %', width: 14 },
  { key: 'prepaid', title: 'Оплачено сейчас, ₽', width: 18 },
  { key: 'rest', title: 'К доплате при заезде, ₽', width: 22 },
  { key: 'paid', title: 'Способ оплаты', width: 18 },
  { key: 'utm', title: 'Источник (UTM)', width: 26 },
  { key: 'page', title: 'Страница', width: 30 },
  { key: 'mail', title: 'Письмо', width: 22 }
]

let writeChain = Promise.resolve()
function appendLead(row) {
  writeChain = writeChain.then(() => doAppend(row)).catch(err => {
    console.error('[excel] ошибка записи:', err.message)
  })
  return writeChain
}
async function doAppend(row) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  const wb = new ExcelJS.Workbook()
  let ws = null
  if (fs.existsSync(XLSX_FILE)) {
    try {
      await wb.xlsx.readFile(XLSX_FILE)
      ws = wb.getWorksheet(SHEET) || null
    } catch (e) {
      console.warn('[excel] файл не прочитан, создаю новый:', e.message)
    }
  }
  if (!ws) {
    ws = wb.addWorksheet(SHEET)
    ws.columns = COLUMNS.map(c => ({ key: c.key, header: c.title, width: c.width }))
    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } }
    head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    head.height = 28
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  } else {
    /* после чтения файла exceljs теряет ключи колонок — возвращаем их,
       иначе addRow({key: value}) не найдёт колонок и запишет пустую строку */
    COLUMNS.forEach((c, i) => {
      const col = ws.getColumn(i + 1)
      col.key = c.key
      if (!col.width) col.width = c.width
    })
  }
  const r = ws.addRow(row)
  r.alignment = { vertical: 'top', wrapText: true }
  await wb.xlsx.writeFile(XLSX_FILE)
  console.log('[excel] заявка добавлена:', row.type, row.bookId || '-', '→', path.relative(ROOT, XLSX_FILE))
}

/* ---------- письмо (заглушка, пока SMTP не настроен) ---------- */
let nodemailer = null
try { nodemailer = require('nodemailer') } catch (e) { /* опционально */ }

async function notify(lead) {
  const cfg = loadEnv()
  const ready = cfg.SMTP_HOST && cfg.SMTP_USER && cfg.SMTP_PASS && nodemailer
  const subject = lead.type === 'booking'
    ? 'Новая бронь ' + (lead.bookId || '') + ' — «Прайд»'
    : 'Заявка на звонок — «Прайд»'
  const text = [
    'Гостевой дом «Прайд», Тверь',
    '',
    'Тип: ' + (lead.type === 'booking' ? 'бронирование' : 'обратный звонок'),
    lead.bookId ? 'Номер брони: ' + lead.bookId : '',
    'Имя: ' + lead.name,
    'Телефон: ' + lead.phone,
    lead.email ? 'E-mail: ' + lead.email : '',
    lead.room ? 'Номер: ' + lead.room : '',
    lead.dateIn ? 'Даты: ' + lead.dateIn + ' — ' + lead.dateOut + ' (' + lead.nights + ' н.)' : '',
    lead.total ? 'Итого: ' + lead.total + ' ₽' : '',
    lead.prepaid ? 'Оплачено сейчас: ' + lead.prepaid + ' ₽' : '',
    lead.comment ? 'Комментарий: ' + lead.comment : '',
    lead.utm ? 'Источник: ' + lead.utm : '',
    'Страница: ' + lead.page,
    'Время: ' + lead.created
  ].filter(Boolean).join('\n')

  if (!ready) {
    /* заглушка: письмо уходит в outbox-файл, как только появится SMTP — отправится в почту */
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.appendFileSync(OUTBOX_FILE, JSON.stringify({ to: cfg.NOTIFY_EMAIL, subject, text, at: new Date().toISOString() }) + '\n')
    console.log('[mail] SMTP не настроен — заявка сохранена в', path.relative(ROOT, OUTBOX_FILE), '(заглушка)')
    return { sent: false, mode: 'stub', to: cfg.NOTIFY_EMAIL }
  }

  try {
    const transport = nodemailer.createTransport({
      host: cfg.SMTP_HOST,
      port: Number(cfg.SMTP_PORT) || 465,
      secure: String(cfg.SMTP_SECURE) !== 'false',
      auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS }
    })
    await transport.sendMail({ from: cfg.SMTP_USER, to: cfg.NOTIFY_EMAIL, subject, text })
    console.log('[mail] уведомление отправлено на', cfg.NOTIFY_EMAIL)
    return { sent: true, to: cfg.NOTIFY_EMAIL }
  } catch (err) {
    console.error('[mail] ошибка отправки:', err.message)
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.appendFileSync(OUTBOX_FILE, JSON.stringify({ to: cfg.NOTIFY_EMAIL, subject, text, error: err.message, at: new Date().toISOString() }) + '\n')
    return { sent: false, mode: 'error', error: err.message }
  }
}

/* ---------- валидация ---------- */
function str(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '' }
function num(v) { const n = Number(String(v).replace(/[^\d.-]/g, '')); return isFinite(n) ? n : '' }
function digits(v) { return String(v || '').replace(/\D/g, '') }
function e164(v) {
  let p = digits(v)
  if (p.length === 11 && p[0] === '8') p = '7' + p.slice(1)
  else if (p.length === 10) p = '7' + p
  return '+' + (p.length > 11 ? p.slice(-11) : p)
}

function normalize(raw) {
  const type = raw.type === 'callback' ? 'callback' : raw.type === 'booking' ? 'booking' : null
  if (!type) return { error: 'нет типа заявки' }
  const name = str(raw.name, 80)
  const phone = digits(raw.phone)
  if (name.length < 2) return { error: 'не указано имя' }
  if (phone.length < 10) return { error: 'нет телефона' }

  const lead = {
    created: new Date().toLocaleString('ru-RU'),
    type,
    bookId: str(raw.bookId, 20),
    name,
    phone: e164(raw.phone),
    email: str(raw.email, 100),
    comment: str(raw.comment, 500),
    dateIn: str(raw.dateIn, 30),
    dateOut: str(raw.dateOut, 30),
    nights: num(raw.nights),
    guests: str(raw.guests, 40),
    room: str(raw.room, 60),
    total: num(raw.total),
    prepayPct: num(raw.prepayPct),
    prepaid: num(raw.prepaid),
    rest: num(raw.rest),
    paid: str(raw.paid, 40),
    utm: str(raw.utm, 120),
    page: str(raw.page, 200),
    mail: 'ожидает'
  }
  if (type === 'callback') {
    lead.comment = lead.comment || 'Обратный звонок'
  } else if (!lead.bookId) {
    return { error: 'нет номера брони' }
  }
  return { lead }
}

/* ---------- HTTP ---------- */
function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > 100 * 1024) { reject(new Error('слишком большой запрос')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])

  if (req.method === 'POST' && url === '/api/leads') {
    try {
      const raw = JSON.parse((await readBody(req)) || '{}')
      const { lead, error } = normalize(raw)
      if (error) return json(res, 400, { ok: false, error })

      await appendLead(lead)
      const mail = await notify(lead)
      lead.mail = mail.sent ? 'отправлено' : (mail.mode === 'stub' ? 'заглушка (SMTP не настроен)' : 'ошибка: ' + (mail.error || ''))
      await appendMailStatus(lead)

      return json(res, 200, { ok: true, mail })
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message })
    }
  }

  if (req.method === 'GET' && url === '/api/leads.xlsx') {
    const remote = req.socket.remoteAddress || ''
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
    const key = new URL(req.url, 'http://localhost').searchParams.get('key')
    if (!local) {
      /* снаружи таблицу отдаём только по ключу из .env (EXPORT_KEY) */
      if (!env.EXPORT_KEY || key !== env.EXPORT_KEY) {
        return json(res, 403, { ok: false, error: 'скачивание с внешнего адреса закрыто: задайте EXPORT_KEY в .env' })
      }
    }
    if (!fs.existsSync(XLSX_FILE)) return json(res, 404, { ok: false, error: 'таблица пока пуста' })
    res.writeHead(200, {
      'Content-Type': MIME['.xlsx'],
      'Content-Disposition': 'attachment; filename="leads.xlsx"'
    })
    return fs.createReadStream(XLSX_FILE).pipe(res)
  }

  if (req.method === 'GET' && url === '/api/health') return json(res, 200, { ok: true, port: PORT })

  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false, error: 'method not allowed' })

  /* статика */
  if (DENY.some(d => url.startsWith(d))) return json(res, 403, { ok: false, error: 'forbidden' })
  let file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url))
  if (!file.startsWith(ROOT)) return json(res, 403, { ok: false, error: 'forbidden' })
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found') }

  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

/* обновляет колонку «Письмо» в последней строке */
async function appendMailStatus(lead) {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(XLSX_FILE)
    const ws = wb.getWorksheet(SHEET)
    if (!ws) return
    /* при чтении файла ключи колонок теряются — работаем по номерам */
    const col = key => COLUMNS.findIndex(c => c.key === key) + 1
    const cBook = col('bookId'), cCreated = col('created'), cMail = col('mail')
    let target = null
    ws.eachRow({ includeEmpty: false }, (r, rn) => {
      if (rn === 1) return
      if (String(r.getCell(cBook).value || '') === lead.bookId &&
          String(r.getCell(cCreated).value || '') === lead.created) target = r
    })
    if (!target) target = ws.getRow(ws.rowCount)
    target.getCell(cMail).value = lead.mail
    await wb.xlsx.writeFile(XLSX_FILE)
  } catch (err) {
    console.error('[excel] не обновил колонку «Письмо»:', err.message)
  }
}

server.listen(PORT, () => {
  console.log('Лендинг «Прайд»: http://127.0.0.1:' + PORT + '/')
  console.log('Таблица заявок:', path.relative(ROOT, XLSX_FILE))
  console.log('Уведомления:', env.NOTIFY_EMAIL, loadEnv().SMTP_HOST ? '(SMTP настроен)' : '(заглушка — SMTP не настроен)')
})
