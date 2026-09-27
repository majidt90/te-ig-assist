/**
 * Creative rule-based reply engine using user memory.
 */

export interface IncomingMessage {
  id: string
  text: string
  timestamp: number
}

const GREETINGS = ['سلام', 'salam', 'hi', 'hello', 'درود', 'هی', 'hey']
const PRICE_KEYS = ['قیمت', 'چنده', 'چند', 'price', 'هزینه', 'چقدر', 'چند تومن']
const TIME_KEYS = ['ساعت', 'باز', 'بسته', 'وقت', 'کاری', 'hours', 'open']
const THANKS_KEYS = ['ممنون', 'مرسی', 'تشکر', 'thanks', 'thank', 'دمت']
const NAME_KEYS = ['اسمت', 'اسم شما', 'اسمتون', 'کی هستی', 'your name', 'نامت', 'نام شما']

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[؟?!.،,]/g, ' ')
    .replace(/\s+/g, ' ')
}

function memoryLines(memory: string): string[] {
  return memory
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function findNameLine(lines: string[]): string | null {
  for (const line of lines) {
    const n = normalize(line)
    if (n.includes('اسم') || /^من\s+\S+/.test(n) || n.includes('هستم')) {
      if (line.length < 80) return line
    }
  }
  if (lines[0] && lines[0].length < 60) return lines[0]
  return null
}

function findRelevantLines(memory: string, incoming: string): string[] {
  const lines = memoryLines(memory)
  if (!lines.length) return []

  const q = normalize(incoming)
  const words = q.split(' ').filter((w) => w.length > 1)

  const scored = lines.map((line) => {
    const ln = normalize(line)
    let score = 0
    for (const w of words) {
      if (ln.includes(w)) score += 2
    }
    if (PRICE_KEYS.some((k) => q.includes(k)) && PRICE_KEYS.some((k) => ln.includes(k))) score += 4
    if (TIME_KEYS.some((k) => q.includes(k)) && TIME_KEYS.some((k) => ln.includes(k))) score += 4
    return { line, score }
  })

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.line)
}

function weaveCreative(facts: string[], incoming: string): string {
  if (facts.length === 0) {
    return pick([
      'پیامتون رو دیدم ✅ هر سوالی داشتید بپرسید.',
      'ممنون از پیام‌تون 🌟 در خدمتم.',
      'چشم، پیام‌تون رسید. بیشتر بگید تا دقیق‌تر راهنمایی کنم.'
    ])
  }

  const lead = pick([
    'حتماً 🌿',
    'با کمال میل ✨',
    'ممنون که پرسیدید 💬',
    'در مورد این مورد:',
    'بفرمایید،'
  ])

  const body = facts.slice(0, 2).join('\n')
  const tail = pick([
    '',
    '\nاگر جزئیات بیشتری بخواید بگید.',
    '\nسوال دیگه‌ای هم بود در خدمتم 🌟',
    '\nهر وقت لازم بود پیام بدید.'
  ])

  // Light personalization from their message length
  if (normalize(incoming).length < 12) {
    return `${lead}\n${body}${tail}`
  }
  return `${lead}\n${body}${tail}`
}

/** Generate a creative Persian reply from memory + incoming text. */
export function generateReply(incomingText: string, memory: string): string {
  const text = incomingText.trim()
  const q = normalize(text)
  const lines = memoryLines(memory)

  if (GREETINGS.some((g) => q === g || q.startsWith(g + ' '))) {
    const name = findNameLine(lines)
    return pick([
      name ? `سلام 👋 ${name}` : 'سلام 👋 خوش اومدید!',
      name ? `سلام، خوشحالم که پیام دادید 🌸\n${name}` : 'سلام! چطور می‌تونم کمکتون کنم؟',
      name ? `درود ✨\n${name}\nبفرمایید.` : 'سلام، در خدمتم 🌟'
    ])
  }

  if (NAME_KEYS.some((k) => q.includes(normalize(k))) || /\bاسم/.test(q)) {
    const nameLine = findNameLine(lines)
    if (nameLine) {
      return pick([
        nameLine,
        `${nameLine} 😊`,
        `البته! ${nameLine}`
      ])
    }
    return 'من دستیار همین صفحه هستم 😊'
  }

  if (THANKS_KEYS.some((k) => q.includes(k))) {
    return pick([
      'خواهش می‌کنم 🌟',
      'قابلی نداشت 🌸 هر سوالی بود بپرسید.',
      'مرسی از لطف‌تون ✨'
    ])
  }

  if (lines.length > 0) {
    const relevant = findRelevantLines(memory, text)
    if (relevant.length > 0) return weaveCreative(relevant, text)

    if (PRICE_KEYS.some((k) => q.includes(k))) {
      const priceLine = lines.find((l) => PRICE_KEYS.some((k) => normalize(l).includes(k)))
      if (priceLine) return weaveCreative([priceLine], text)
      return 'برای قیمت دقیق بفرمایید کدوم مورد مدنظرتونه تا کامل بگم 💬'
    }

    if (TIME_KEYS.some((k) => q.includes(k))) {
      const timeLine = lines.find((l) => TIME_KEYS.some((k) => normalize(l).includes(k)))
      if (timeLine) return weaveCreative([timeLine], text)
    }

    return weaveCreative([lines[0]], text)
  }

  return pick(['پیام شما دریافت شد ✅', 'چشم، پیام‌تون رو دیدم 🌟'])
}

/** Shorter creative reply suitable for public comments */
export function generateCommentReply(incomingText: string, memory: string): string {
  const full = generateReply(incomingText, memory)
  // Keep comments shorter
  const parts = full.split('\n').filter(Boolean)
  if (parts.length <= 2) return full.slice(0, 220)
  return parts.slice(0, 2).join(' — ').slice(0, 220)
}
