import { weight, type CartItem } from './types';

export function whatsappOrderUrl(number: string | undefined, items: CartItem[]) {
  if (!number || !/^[1-9]\d{7,14}$/.test(number)) return undefined;
  const lines = items.map((item) => {
    const pack = item.weightGrams ? ` (${weight(item.weightGrams)})` : '';
    return `• ${item.quantity} × ${item.name ?? item.sku}${pack}`;
  });
  const message = lines.length
    ? [
        'Hi Ondu Packet! I’d like to request an order for:',
        '',
        ...lines,
        '',
        'Please confirm availability and the total.',
      ].join('\n')
    : 'Hi Ondu Packet! I’d like to place an order. Could you help me choose my packs?';
  const url = new URL(`https://wa.me/${number}`);
  url.searchParams.set('text', message);
  return url.href;
}
