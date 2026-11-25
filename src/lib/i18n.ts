/* Screen and bill words in Malayalam and Tamil, picked in Settings → Shop & bill.
   First draft: have a Malayalam and a Tamil speaker at the shop check these before going live.
   Anything not listed stays in English. GST words (TAX INVOICE, CGST, SGST, HSN, GSTIN) always stay in English. */
import type { Shop } from './types'

type Lang = Shop['language']
const ML: Record<string, string> = {
  // menu
  'Home': 'ഹോം', 'Find a bill': 'ബിൽ കണ്ടെത്തുക', 'Return / exchange': 'റിട്ടേൺ / എക്സ്ചേഞ്ച്', 'Collect dues': 'ബാക്കി പിരിക്കുക', 'Stock in': 'സ്റ്റോക്ക് ഇൻ', 'Print labels': 'ലേബൽ പ്രിന്റ്', 'Sales': 'വിൽപ്പന', 'Stock': 'സ്റ്റോക്ക്', 'Money': 'പണം', 'Shop': 'കട', 'Billing': 'ബില്ലിംഗ്', 'Bills': 'ബില്ലുകൾ', 'Customers': 'ഉപഭോക്താക്കൾ', 'Credit & dues': 'കടം & ബാക്കി',
  'Alterations': 'ആൾട്ടറേഷൻ', 'Returns & vouchers': 'റിട്ടേൺ & വൗച്ചർ', 'Products & stock': 'ഉൽപ്പന്നങ്ങൾ & സ്റ്റോക്ക്', 'Barcode labels': 'ബാർകോഡ് ലേബൽ',
  'Purchases': 'വാങ്ങലുകൾ', 'Stock count': 'സ്റ്റോക്ക് എണ്ണൽ', 'Suppliers': 'വിതരണക്കാർ', 'Offers & coupons': 'ഓഫറുകൾ & കൂപ്പൺ', 'Salesmen': 'സെയിൽസ്മാൻ',
  'Accounts': 'കണക്കുകൾ', 'Reports': 'റിപ്പോർട്ടുകൾ', 'Shop tools': 'കടയിലെ ഉപകരണങ്ങൾ', 'Backup & export': 'ബാക്കപ്പ് & എക്സ്പോർട്ട്', 'Settings & staff': 'ക്രമീകരണങ്ങൾ & സ്റ്റാഫ്',
  // login and top bar
  'Counter & customer manager · pick your name to start': 'കൗണ്ടർ & കസ്റ്റമർ മാനേജർ · തുടങ്ങാൻ നിങ്ങളുടെ പേര് തിരഞ്ഞെടുക്കൂ', 'Log out': 'ലോഗൗട്ട്', 'New bill': 'പുതിയ ബിൽ',
  // billing
  'Next customer': 'അടുത്ത ഉപഭോക്താവ്', 'Hold': 'മാറ്റിവയ്ക്കുക', 'Clear': 'മായ്ക്കുക', 'Pay': 'പേയ്‌മെന്റ്', 'Save & print bill': 'സേവ് ചെയ്ത് ബിൽ പ്രിന്റ്', 'Add customer by mobile': 'ഉപഭോക്താവിനെ ചേർക്കുക',
  // bill
  'Tax invoice': 'നികുതി ഇൻവോയ്സ്', 'Bill': 'ബിൽ', 'Customer': 'ഉപഭോക്താവ്', 'Salesman': 'സെയിൽസ്മാൻ', 'Item': 'ഇനം', 'Qty': 'എണ്ണം', 'Rate': 'വില', 'Amt': 'തുക',
  'Gross': 'ആകെ വില', 'Discount': 'കിഴിവ്', 'Round off': 'റൗണ്ട് ഓഫ്', 'TOTAL': 'ആകെ', 'Points earned': 'ലഭിച്ച പോയിന്റ്', 'used': 'ഉപയോഗിച്ചത്', 'Balance': 'ബാക്കി പോയിന്റ്', 'Due': 'അടയ്ക്കാനുള്ളത്',
}
const TA: Record<string, string> = {
  'Home': 'முகப்பு', 'Find a bill': 'பில் தேடு', 'Return / exchange': 'திருப்பம் / மாற்றம்', 'Collect dues': 'நிலுவை வசூல்', 'Stock in': 'இருப்பு சேர்', 'Print labels': 'லேபிள் அச்சிடு', 'Sales': 'விற்பனை', 'Stock': 'இருப்பு', 'Money': 'பணம்', 'Shop': 'கடை', 'Billing': 'பில்லிங்', 'Bills': 'பில்கள்', 'Customers': 'வாடிக்கையாளர்கள்', 'Credit & dues': 'கடன் & நிலுவை',
  'Alterations': 'ஆல்டரேஷன்', 'Returns & vouchers': 'திருப்பம் & வவுச்சர்', 'Products & stock': 'பொருட்கள் & இருப்பு', 'Barcode labels': 'பார்கோடு லேபிள்',
  'Purchases': 'கொள்முதல்', 'Stock count': 'இருப்பு எண்ணிக்கை', 'Suppliers': 'சப்ளையர்கள்', 'Offers & coupons': 'சலுகைகள் & கூப்பன்', 'Salesmen': 'விற்பனையாளர்கள்',
  'Accounts': 'கணக்குகள்', 'Reports': 'அறிக்கைகள்', 'Shop tools': 'கடை கருவிகள்', 'Backup & export': 'காப்பு & ஏற்றுமதி', 'Settings & staff': 'அமைப்புகள் & ஊழியர்கள்',
  'Counter & customer manager · pick your name to start': 'கவுண்டர் & வாடிக்கையாளர் மேலாளர் · தொடங்க உங்கள் பெயரைத் தேர்ந்தெடுக்கவும்', 'Log out': 'வெளியேறு', 'New bill': 'புதிய பில்',
  'Next customer': 'அடுத்த வாடிக்கையாளர்', 'Hold': 'நிறுத்தி வை', 'Clear': 'அழி', 'Pay': 'பணம் பெறு', 'Save & print bill': 'சேமித்து பில் அச்சிடு', 'Add customer by mobile': 'வாடிக்கையாளரைச் சேர்',
  'Tax invoice': 'வரி விலைப்பட்டியல்', 'Bill': 'பில்', 'Customer': 'வாடிக்கையாளர்', 'Salesman': 'விற்பனையாளர்', 'Item': 'பொருள்', 'Qty': 'அளவு', 'Rate': 'விலை', 'Amt': 'தொகை',
  'Gross': 'மொத்த விலை', 'Discount': 'தள்ளுபடி', 'Round off': 'முழுமையாக்கல்', 'TOTAL': 'மொத்தம்', 'Points earned': 'பெற்ற புள்ளிகள்', 'used': 'பயன்படுத்தியது', 'Balance': 'மீதி புள்ளிகள்', 'Due': 'நிலுவை',
}
export const WORDS: Record<Exclude<Lang, 'en'>, Record<string, string>> = { ml: ML, ta: TA }

/** the word in the shop's language, or the English word when there is no translation */
export function tr(lang: Lang | undefined, en: string): string { return lang && lang !== 'en' ? WORDS[lang][en] ?? en : en }
/** "English / local" for printed bills, so both the customer and the accountant can read them */
export function both(lang: Lang | undefined, en: string): string { const l = tr(lang, en); return l === en ? en : `${en} / ${l}` }
