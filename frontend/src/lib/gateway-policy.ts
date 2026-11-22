const rules: [RegExp, string[]][] = [
  [/^admin\/(me|summary|categories|audit)$/, ['GET']],
  [/^admin\/access$/, ['PUT']],
  [/^admin\/products$/, ['GET', 'POST']],
  [/^admin\/products\/[a-f0-9]{24}$/, ['GET', 'PUT']],
  [/^admin\/inventory$/, ['GET']],
  [/^admin\/inventory\/adjustments$/, ['POST']],
  [/^admin\/orders$/, ['GET']],
  [/^admin\/orders\/[a-f0-9-]{36}$/, ['GET']],
  [/^admin\/orders\/[a-f0-9-]{36}\/fulfillment$/, ['PUT']],
  [/^admin\/discounts$/, ['GET', 'POST']],
  [/^admin\/discounts\/[a-f0-9]{24}$/, ['PUT']],
  [/^admin\/images$/, ['POST']],
  [/^categories$/, ['GET']],
  [/^products$/, ['GET']],
  [/^products\/[a-z0-9-]+$/, ['GET']],
  [/^auth\/(login|register)$/, ['POST']],
  [/^auth\/me$/, ['GET']],
  [/^auth\/(logout|logout-all)$/, ['POST']],
  [/^cart$/, ['GET', 'PUT']],
  [/^addresses$/, ['GET', 'POST']],
  [/^addresses\/[a-fA-F0-9]{24}$/, ['PUT', 'DELETE']],
  [/^checkouts$/, ['POST']],
  [/^checkouts\/quote$/, ['POST']],
  [/^checkouts\/active$/, ['GET']],
  [/^checkouts\/[a-f0-9-]{36}$/, ['GET']],
  [/^checkouts\/[a-f0-9-]{36}\/cancel$/, ['POST']],
  [/^orders$/, ['GET']],
  [/^orders\/[a-f0-9-]{36}$/, ['GET']],
  [/^assistant\/chat$/, ['POST']],
];
export function allowedGatewayRoute(path: string, method: string) {
  return rules.some(([pattern, methods]) => pattern.test(path) && methods.includes(method));
}
export function allowedMutationOrigin(method: string, origin: string | null, expected: string) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method) || origin === new URL(expected).origin;
}
