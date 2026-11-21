import {parseAmountCents} from './csv/parseAmount'

export function expenseAmountRange(minimum:string,maximum:string) {
  const min = parseAmountCents(minimum)
  const max = parseAmountCents(maximum)
  return min !== null && max !== null ? {lo:Math.min(min,max),hi:Math.max(min,max)} : {lo:min,hi:max}
}
