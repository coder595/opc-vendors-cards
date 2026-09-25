export interface ParsedCard {
  company?: string
  phones: string[]
  emails: string[]
  urls: string[]
  wechat?: string
}

const PHONE_RE = /[+\d][\d\s\-()]{6,}/g
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g
const URL_RE = /https?:\/\/[^\s]+/g
const WECHAT_RE = /(?:WeChat|微信)\s*[:：]?\s*(\S+)/i

export function parseCardText(text: string): ParsedCard {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)

  const phones: string[] = []
  const emails: string[] = []
  const urls: string[] = []
  let company: string | undefined
  let wechat: string | undefined

  for (const line of lines) {
    const wechatMatch = line.match(WECHAT_RE)
    if (wechatMatch) {
      wechat = wechatMatch[1]
      continue
    }

    const linePhones = line.match(PHONE_RE)
    if (linePhones) phones.push(...linePhones)

    const lineEmails = line.match(EMAIL_RE)
    if (lineEmails) emails.push(...lineEmails)

    const lineUrls = line.match(URL_RE)
    if (lineUrls) urls.push(...lineUrls)
  }

  for (const line of lines) {
    if (wechat && line === wechat) continue
    if (phones.includes(line)) continue
    if (emails.includes(line)) continue
    if (urls.includes(line)) continue

    const hasChinese = /[\u4e00-\u9fff]/.test(line)
    if (
      line.length >= 2 &&
      !/^[\d+\s\-()]+$/.test(line) &&
      !line.includes('@') &&
      !line.startsWith('http') &&
      (hasChinese || /^[A-Z]/.test(line))
    ) {
      company = line
      break
    }
  }

  return {
    company,
    phones: [...new Set(phones.map((p) => p.trim()))],
    emails: [...new Set(emails.map((e) => e.trim()))],
    urls: [...new Set(urls.map((u) => u.trim()))],
    wechat,
  }
}