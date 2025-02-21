import {describe, expect, test, jest} from '@jest/globals'
import {getDueOn} from '../src/helper'

describe('helper methods', () => {
  test('getDueOn', () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-09-10'))

    expect(getDueOn(0)).toBe('2024-09-10')
    expect(getDueOn(1)).toBe('2024-09-11')
    expect(getDueOn(2)).toBe('2024-09-12')
    expect(getDueOn(3)).toBe('2024-09-13')
    expect(getDueOn(4)).toBe('2024-09-16')
    expect(getDueOn(5)).toBe('2024-09-17')
    expect(getDueOn(6)).toBe('2024-09-18')
    expect(getDueOn(7)).toBe('2024-09-19')
    expect(getDueOn(8)).toBe('2024-09-20')
    expect(getDueOn(9)).toBe('2024-09-23')
    expect(getDueOn(25)).toBe('2024-10-15')
  })
})