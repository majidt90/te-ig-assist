/**
 * Rule-based reply engine using user memory.
 */

export interface IncomingMessage {
  id: string
  text: string
  timestamp: number
}

const GREETINGS = ['سلام', 'salam', 'hi', 'hello', 'درود', 'هی', 'hey', 'سلامت']
const PRICE_KEYS = ['قیمت', 'چنده', 'چند', 'price', 'هزینه', 'چقدر']
const TIME_KEYS = ['ساعت', 'باز', 'بسته', 'وقت', 'کاری', 'hours', 'open']
const THANKS_KEYS = ['ممنون', 'مرسی', 'تشکر', 'thanks', 'thank']
const NAME_KEYS = ['اسمت', 'اسم شما', 'اسمتون', 'کی هستی', 'who are you', 'your name', 'نامت', 'نام شما']

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

function findNameLine(lines: string[]): string | null {
  for (const line of lines) {
    const n = normalize(line)
    // «من مجیدم» / «اسم من مجید است» / «من X هستم»
    if (n.includes('اسم') || /^من\s+\S+/.test(n) || n.includes('هستم') || n.includes('هستم')) {
      // Prefer short identity lines
      if (line.length < 80) return line
    }
  }
  // First line often is identity
  if (lines[0] && lines[0].length < 60) return lines[0]
  return null
}

function findRelevantLines(memory: string, incoming: string): string[] {
  const lines = memoryLines(memory)
  if (lines.length === 0) return []

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

export function generateReply(incomingText: string, memory: string): string {
  const text = incomingText.trim()
  const q = normalize(text)
  const lines = memoryLines(memory)

  // Greeting only
  if (GREETINGS.some((g) => q === g || q === g + ' ' || q.startsWith(g + ' '))) {
    if (lines[0]) return `سلام 👋\n${lines[0]}`
    return 'سلام 👋 خوش اومدید! چطور می‌تونم کمکتون کنم؟'
  }

  // Name question
  if (NAME_KEYS.some((k) => q.includes(normalize(k))) || q.includes('اسم')) {
    const nameLine = findNameLine(lines)
    if (nameLine) return nameLine
    return 'من دستیار این صفحه هستم 😊'
  }

  if (THANKS_KEYS.some((k) => q.includes(k))) {
    return 'خواهش می‌کنم 🌟 اگر سوال دیگه‌ای داشتید در خدمتم.'
  }

  if (lines.length > 0) {
    const relevant = findRelevantLines(memory, text)
    if (relevant.length > 0) return relevant.join('\n')

    if (PRICE_KEYS.some((k) => q.includes(k))) {
      const priceLine = lines.find((l) => PRICE_KEYS.some((k) => normalize(l).includes(k)))
      if (priceLine) return priceLine
      return 'برای اعلام دقیق قیمت بفرمایید کدوم مورد مدنظرتونه؟'
    }

    if (TIME_KEYS.some((k) => q.includes(k))) {
      const timeLine = lines.find((l) => TIME_KEYS.some((k) => normalize(l).includes(k)))
      if (timeLine) return timeLine
    }

    // Default: use first memory line as identity + polite ack
    return `${lines[0]}\nپیامتون رو دیدم ✅ اگر سوال دیگه‌ای دارید بپرسید.`
  }

  return 'پیام شما دریافت شد ✅'
}
