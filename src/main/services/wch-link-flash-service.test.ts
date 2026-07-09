import { describe, expect, it } from 'vitest'
import { parseWchLinkProbeOutput } from './wch-link-flash-service'

const successfulProbe = `Open On-Chip Debugger 0.11.0+dev-snapshot (2026-03-12-15:20)
Info : only one transport option; autoselect 'sdi'
Ready for Remote Connections
Info : WCH-LinkE  mode:RV version 2.18
Info : wlink_init ok
Info : clock speed 6000 kHz
Info : [wch_riscv.cpu.0] datacount=2 progbufsize=8
Info : [wch_riscv.cpu.0] Examined RISC-V core; found 1 harts
Info : [wch_riscv.cpu.0]  XLEN=32, misa=0x40901105
[wch_riscv.cpu.0] Target successfully examined.
#0 : wch_riscv.flash (wch_riscv) at 0x00000000, size 0x00000000, buswidth 0, chipwidth 0`

describe('parseWchLinkProbeOutput', () => {
  it('extracts adapter and target information from WCH OpenOCD output', () => {
    expect(parseWchLinkProbeOutput(successfulProbe)).toMatchObject({
      openocdVersion: 'Open On-Chip Debugger 0.11.0+dev-snapshot (2026-03-12-15:20)',
      adapterName: 'WCH-LinkE',
      adapterMode: 'RV',
      adapterVersion: '2.18',
      targetExamined: true,
      xlen: 32,
      misa: '0x40901105',
      flashBanks: [{ name: 'wch_riscv.flash', driver: 'wch_riscv', base: '0x00000000', size: '0x00000000' }]
    })
  })

  it('keeps partial probe output useful when target is not examined', () => {
    expect(parseWchLinkProbeOutput('Info : WCH-LinkE  mode:RV version 2.18\nError: Target not examined')).toMatchObject({
      adapterName: 'WCH-LinkE',
      adapterVersion: '2.18',
      targetExamined: false
    })
  })
})
