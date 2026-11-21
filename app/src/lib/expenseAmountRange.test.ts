import {it,expect} from 'vitest'
import {expenseAmountRange} from './expenseAmountRange'

it('matches inclusive cent amounts for exact, open and reversed dollar bounds',()=>{
  expect(expenseAmountRange('12.34','12.34')).toEqual({lo:1234,hi:1234})
  expect(expenseAmountRange('','0.29')).toEqual({lo:null,hi:29})
  expect(expenseAmountRange('3','1.01')).toEqual({lo:101,hi:300})
})
