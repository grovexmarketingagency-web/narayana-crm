import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { buildXlsx } from '../src/lib/xlsx'

describe('Excel files', () => {
  it('writes sheets with text, numbers and safe names', () => {
    const z = unzipSync(buildXlsx([{ name: 'Bills/Today', rows: [['Bill', 'Total'], ['NT-1 <&>', 1250.5], ['=HYPERLINK("x")', null]] }, { name: 'Bills/Today', rows: [['a']] }]))
    const wb = strFromU8(z['xl/workbook.xml']); const s1 = strFromU8(z['xl/worksheets/sheet1.xml'])
    expect(wb).toContain('name="Bills Today"'); expect(wb).toContain('name="Bills Today 2"')
    expect(s1).toContain('<v>1250.5</v>'); expect(s1).toContain('NT-1 &lt;&amp;&gt;')
    expect(s1).toContain("'=HYPERLINK")          // text that looks like a formula is not run by Excel
  })
})
