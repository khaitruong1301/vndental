const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const UNITS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readTriple(n: number, full: boolean): string {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  const parts: string[] = [];

  if (full || hundreds > 0) parts.push(`${DIGITS[hundreds]} trăm`);
  if (tens === 0) {
    if (ones > 0 && (full || hundreds > 0)) parts.push('linh');
  } else if (tens === 1) {
    parts.push('mười');
  } else {
    parts.push(`${DIGITS[tens]} mươi`);
  }
  if (ones > 0) {
    if (ones === 1 && tens > 1) parts.push('mốt');
    else if (ones === 4 && tens > 1) parts.push('tư');
    else if (ones === 5 && tens > 0) parts.push('lăm');
    else parts.push(DIGITS[ones]);
  }
  return parts.join(' ');
}

/** Đọc số tiền VND bằng chữ: 1417500 → "Một triệu bốn trăm mười bảy nghìn năm trăm đồng" */
export function moneyToWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return 'Không đồng';

  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const text = readTriple(groups[i], i < groups.length - 1);
    words.push(UNITS[i] ? `${text} ${UNITS[i]}` : text);
  }
  const sentence = `${words.join(' ')} đồng`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
